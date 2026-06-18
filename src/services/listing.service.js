'use strict';

const { listingRepository, subscriptionRepository } = require('../repositories');
const cloudinaryService = require('./cloudinary.service');
const notificationService = require('./notification.service');
const ApiError = require('../utils/ApiError');
const {
  LISTING_STATUS,
  PLAN_LISTING_LIMITS,
  SUBSCRIPTION_PLANS,
  NOTIFICATION_TYPES,
} = require('../constants');

class ListingService {
  /** Active listing count counts everything except draft/expired/rejected. */
  async assertWithinPlanLimit(userId) {
    const sub = await subscriptionRepository.findOne({ user: userId, status: 'active' });
    const plan = sub?.plan || SUBSCRIPTION_PLANS.FREE;
    const limit = PLAN_LISTING_LIMITS[plan];
    const used = await listingRepository.count({
      owner: userId,
      status: { $in: [LISTING_STATUS.PENDING, LISTING_STATUS.APPROVED] },
    });
    if (used >= limit) {
      throw ApiError.forbidden(
        `Your ${plan} plan allows ${limit} active listings. Upgrade to add more.`,
        { code: 'PLAN_LIMIT_REACHED' },
      );
    }
    return { plan, limit, used };
  }

  buildGeo(data) {
    if (data.latitude != null && data.longitude != null) {
      return { type: 'Point', coordinates: [data.longitude, data.latitude] };
    }
    return undefined;
  }

  async create(userId, data, files = []) {
    if (data.status !== LISTING_STATUS.DRAFT) {
      await this.assertWithinPlanLimit(userId);
    }

    const images = await this.uploadImages(files);
    const geo = this.buildGeo(data);

    const listing = await listingRepository.create({
      ...data,
      owner: userId,
      geo,
      images,
      // New listings (non-draft) go to moderation queue.
      status: data.status === LISTING_STATUS.DRAFT ? LISTING_STATUS.DRAFT : LISTING_STATUS.PENDING,
    });
    return listing;
  }

  async uploadImages(files = []) {
    if (!files.length) return [];
    if (files.length > 10) throw ApiError.badRequest('Maximum 10 images allowed');
    return Promise.all(files.map((f) => cloudinaryService.uploadBuffer(f.buffer, { mimetype: f.mimetype })));
  }

  /** Resolve a listing by Mongo id or by URL slug. */
  async getById(idOrSlug, { incrementView = false } = {}) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const query = isObjectId
      ? listingRepository.findById(idOrSlug, undefined, {})
      : listingRepository.findOne({ slug: idOrSlug });
    const listing = await query.populate(
      'owner',
      'fullName profileImage isLandlordVerified mobile',
    );
    if (!listing) throw ApiError.notFound('Listing not found');
    if (incrementView) {
      listingRepository.updateById(listing._id, { $inc: { viewsCount: 1 } }).catch(() => {});
    }
    return listing;
  }

  async assertOwner(id, userId) {
    const listing = await listingRepository.findById(id);
    if (!listing) throw ApiError.notFound('Listing not found');
    if (String(listing.owner) !== String(userId)) {
      throw ApiError.forbidden('You do not own this listing');
    }
    return listing;
  }

  async update(id, userId, data, files = []) {
    const listing = await this.assertOwner(id, userId);
    Object.assign(listing, data);
    const geo = this.buildGeo(data);
    if (geo) listing.geo = geo;
    if (files.length) {
      const uploaded = await this.uploadImages(files);
      listing.images = [...listing.images, ...uploaded].slice(0, 10);
    }
    // Edited approved listings re-enter moderation.
    if (listing.status === LISTING_STATUS.APPROVED) listing.status = LISTING_STATUS.PENDING;
    await listing.save();
    return listing;
  }

  async remove(id, userId) {
    const listing = await this.assertOwner(id, userId);
    await Promise.allSettled((listing.images || []).map((img) => cloudinaryService.destroy(img.publicId)));
    await listingRepository.deleteById(id);
  }

  /**
   * Public search/browse. Supports keyword text search, the Bangladesh
   * location hierarchy, rent range, type, and optional geo-radius search.
   */
  async search(query) {
    const {
      keyword, type, division, district, upazila, area,
      minRent, maxRent, bedrooms, furnishedStatus,
      lat, lng, radiusKm,
      page = 1, limit = 20, sort = 'newest',
    } = query;

    const filter = { status: LISTING_STATUS.APPROVED };
    if (type) filter.type = type;
    if (division) filter['location.division'] = division;
    if (district) filter['location.district'] = district;
    if (upazila) filter['location.upazila'] = upazila;
    if (area) filter['location.area'] = area;
    if (furnishedStatus) filter['details.furnishedStatus'] = furnishedStatus;
    if (bedrooms) filter['details.bedrooms'] = { $gte: Number(bedrooms) };
    if (minRent || maxRent) {
      filter.monthlyRent = {};
      if (minRent) filter.monthlyRent.$gte = Number(minRent);
      if (maxRent) filter.monthlyRent.$lte = Number(maxRent);
    }
    if (keyword) filter.$text = { $search: keyword };
    if (lat && lng) {
      filter.geo = {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: (Number(radiusKm) || 5) * 1000,
        },
      };
    }

    const sortMap = {
      newest: { isFeatured: -1, createdAt: -1 },
      rent_asc: { monthlyRent: 1 },
      rent_desc: { monthlyRent: -1 },
    };

    return listingRepository.paginate(filter, {
      page: Number(page),
      limit: Math.min(Number(limit), 50),
      sort: filter.geo ? undefined : sortMap[sort] || sortMap.newest,
    });
  }

  async listMine(userId, { status, page = 1, limit = 20 } = {}) {
    const filter = { owner: userId };
    if (status) filter.status = status;
    return listingRepository.paginate(filter, { page, limit });
  }

  // ---- Moderation ----

  async moderate(id, moderatorId, { approve, reason }) {
    const listing = await listingRepository.findById(id);
    if (!listing) throw ApiError.notFound('Listing not found');

    listing.status = approve ? LISTING_STATUS.APPROVED : LISTING_STATUS.REJECTED;
    listing.reviewedBy = moderatorId;
    listing.reviewedAt = new Date();
    if (!approve) listing.rejectionReason = reason;
    if (approve) listing.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await listing.save();

    await notificationService.notify(listing.owner, {
      title: approve ? 'Listing approved' : 'Listing rejected',
      description: approve
        ? `"${listing.title}" is now live.`
        : `"${listing.title}" was rejected: ${reason || 'policy violation'}`,
      type: approve ? NOTIFICATION_TYPES.LISTING_APPROVED : NOTIFICATION_TYPES.LISTING_REJECTED,
      reference: { model: 'Listing', id: listing._id },
    });
    return listing;
  }

  async listForModeration({ status, type, keyword, sort = 'newest', page = 1, limit = 20 } = {}) {
    const filter = {};
    // `status` omitted or 'all' => every listing; otherwise filter by it.
    if (status && status !== 'all') filter.status = status;
    if (type) filter.type = type;
    if (keyword) filter.$text = { $search: keyword };

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      rent_asc: { monthlyRent: 1 },
      rent_desc: { monthlyRent: -1 },
      most_viewed: { viewsCount: -1 },
      most_reported: { reportsCount: -1 },
    };

    return listingRepository.paginate(filter, {
      page: Number(page),
      limit: Math.min(Number(limit) || 20, 100),
      sort: sortMap[sort] || sortMap.newest,
      populate: { path: 'owner', select: 'fullName mobile' },
    });
  }
}

module.exports = new ListingService();

'use strict';

const { listingRepository, subscriptionRepository } = require('../repositories');
const cloudinaryService = require('./cloudinary.service');
const notificationService = require('./notification.service');
const settingsService = require('./settings.service');
const ApiError = require('../utils/ApiError');
const {
  LISTING_STATUS,
  PLAN_LISTING_LIMITS,
  SUBSCRIPTION_PLANS,
  NOTIFICATION_TYPES,
  STAFF_ROLES,
} = require('../constants');

// Maps amenity query-param names to the boolean field path on the document.
// Shared by browse search and the map endpoint.
const AMENITY_PATHS = {
  parking: 'details.parkingAvailable',
  lift: 'details.liftAvailable',
  generator: 'details.generatorAvailable',
  ac: 'details.airConditioning',
  gym: 'details.gym',
  pool: 'details.swimmingPool',
  petFriendly: 'details.petFriendly',
  wifi: 'utilities.internet',
  gas: 'utilities.gas',
  security: 'utilities.securityGuard',
  cctv: 'utilities.cctv',
};

// Treats both real booleans and the string 'true'/'1' as enabled.
const isOn = (v) => v === true || v === 'true' || v === '1';

// Add `path: true` to `filter` for every amenity flag that is enabled in query.
function applyAmenityFilters(filter, query) {
  Object.entries(AMENITY_PATHS).forEach(([param, path]) => {
    if (isOn(query[param])) filter[path] = true;
  });
}

// Escape regex metacharacters so user input is matched literally.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply a keyword search to the filter. Uses a case-insensitive regex across
 * the key fields so partial/prefix matches work (e.g. "veri" matches
 * "Veritatis nisi") — MongoDB's $text index only matches whole words.
 */
function applyKeyword(filter, keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return;
  const rx = new RegExp(escapeRegex(kw), 'i');
  filter.$or = [
    { title: rx },
    { description: rx },
    { 'location.area': rx },
    { 'location.district': rx },
  ];
}

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

  async create(userId, data, files = [], creatorRole = null) {
    const isStaff = STAFF_ROLES.includes(creatorRole);
    const wantsDraft = data.status === LISTING_STATUS.DRAFT;
    // Only staff may publish directly; a publish request from anyone else
    // falls back to the normal review queue.
    const publish = data.status === LISTING_STATUS.APPROVED && isStaff;

    // Staff bypass the plan limit; everyone else is checked unless drafting.
    if (!wantsDraft && !isStaff) {
      await this.assertWithinPlanLimit(userId);
    }

    const images = await this.uploadImages(files);
    const geo = this.buildGeo(data);

    // Drafts stay drafts; staff who chose Publish go live; everyone else goes
    // to the moderation queue.
    let status = LISTING_STATUS.PENDING;
    if (wantsDraft) status = LISTING_STATUS.DRAFT;
    else if (publish) status = LISTING_STATUS.APPROVED;

    const payload = { ...data, owner: userId, geo, images, status };
    if (status === LISTING_STATUS.APPROVED) {
      // Mirror the moderation path: set the active period and stamp the review.
      payload.expiresAt = await this.computeExpiry();
      payload.reviewedBy = userId;
      payload.reviewedAt = new Date();
    }

    const listing = await listingRepository.create(payload);
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
      minRent, maxRent, bedrooms, bathrooms, balconies,
      lat, lng, radiusKm,
      page = 1, limit = 20, sort = 'newest',
    } = query;

    const filter = { status: LISTING_STATUS.APPROVED };
    if (type) filter.type = type;
    if (division) filter['location.division'] = division;
    if (district) filter['location.district'] = district;
    if (upazila) filter['location.upazila'] = upazila;
    if (area) filter['location.area'] = area;
    if (bedrooms) filter['details.bedrooms'] = { $gte: Number(bedrooms) };
    if (bathrooms) filter['details.bathrooms'] = { $gte: Number(bathrooms) };
    if (balconies) filter['details.balconies'] = { $gte: Number(balconies) };
    applyAmenityFilters(filter, query);
    if (minRent || maxRent) {
      filter.monthlyRent = {};
      if (minRent) filter.monthlyRent.$gte = Number(minRent);
      if (maxRent) filter.monthlyRent.$lte = Number(maxRent);
    }
    applyKeyword(filter, keyword);
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

  /**
   * Lightweight set of geo-located approved listings for the map view.
   * Supports the same basic filters as search; capped to keep payloads sane.
   */
  async mapPoints(query = {}) {
    const {
      keyword, type, division, district, area,
      minRent, maxRent, bedrooms, bathrooms, balconies, limit = 1000,
    } = query;

    const filter = {
      status: LISTING_STATUS.APPROVED,
      'geo.coordinates': { $exists: true, $ne: null },
    };
    if (type) filter.type = type;
    if (division) filter['location.division'] = division;
    if (district) filter['location.district'] = district;
    if (area) filter['location.area'] = area;
    if (bedrooms) filter['details.bedrooms'] = { $gte: Number(bedrooms) };
    if (bathrooms) filter['details.bathrooms'] = { $gte: Number(bathrooms) };
    if (balconies) filter['details.balconies'] = { $gte: Number(balconies) };
    applyAmenityFilters(filter, query);
    if (minRent || maxRent) {
      filter.monthlyRent = {};
      if (minRent) filter.monthlyRent.$gte = Number(minRent);
      if (maxRent) filter.monthlyRent.$lte = Number(maxRent);
    }
    applyKeyword(filter, keyword);

    return listingRepository.find(filter, {
      projection: 'title slug type monthlyRent location geo images',
      limit: Math.min(Number(limit) || 1000, 2000),
      sort: { createdAt: -1 },
    });
  }

  /** Lightweight {slug, updatedAt} list of approved listings for the sitemap. */
  async sitemapEntries(limit = 5000) {
    return listingRepository.find(
      { status: LISTING_STATUS.APPROVED },
      { projection: 'slug updatedAt', limit: Math.min(Number(limit) || 5000, 50000), sort: { updatedAt: -1 } },
    );
  }

  async listMine(userId, { status, page = 1, limit = 20 } = {}) {
    const filter = { owner: userId };
    if (status) filter.status = status;
    return listingRepository.paginate(filter, { page, limit });
  }

  /** Per-status listing counts for the owner's dashboard. */
  async statsFor(userId) {
    const rows = await listingRepository.model.aggregate([
      { $match: { owner: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Start every known status at 0 so the dashboard always has a full set.
    const byStatus = Object.fromEntries(
      Object.values(LISTING_STATUS).map((s) => [s, 0]),
    );
    let total = 0;
    rows.forEach(({ _id, count }) => {
      if (_id in byStatus) byStatus[_id] = count;
      total += count;
    });

    return {
      total,
      byStatus,
      // "Active" = visible to renters (approved) or awaiting review.
      active: byStatus[LISTING_STATUS.APPROVED] + byStatus[LISTING_STATUS.PENDING],
    };
  }

  // ---- Moderation ----

  /**
   * Compute when a freshly-approved listing should expire, based on the
   * admin-configured listingExpiry setting. Returns undefined (never expire)
   * when the configured value is 0.
   */
  async computeExpiry(from = new Date()) {
    const { value, unit } = (await settingsService.get()).listingExpiry || {};
    if (!value || value <= 0) return undefined;
    const expiry = new Date(from);
    if (unit === 'months') expiry.setMonth(expiry.getMonth() + value);
    else expiry.setDate(expiry.getDate() + value);
    return expiry;
  }

  /**
   * Notify owners whose approved listings expire within `withinDays` and that
   * haven't been warned yet for the current active period. Returns the number
   * of warnings sent. Called periodically by the background jobs.
   */
  async warnExpiring(withinDays = 3) {
    const now = new Date();
    const soon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    const due = await listingRepository.find(
      {
        status: LISTING_STATUS.APPROVED,
        expiresAt: { $gt: now, $lte: soon },
        expiryWarnedAt: null,
      },
      { projection: '_id owner title expiresAt', limit: 500 },
    );

    for (const listing of due) {
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify(listing.owner, {
        title: 'Listing expiring soon',
        description: `"${listing.title}" will be deactivated on ${listing.expiresAt.toDateString()}. Renew it to keep it live.`,
        type: NOTIFICATION_TYPES.LISTING_EXPIRING,
        reference: { model: 'Listing', id: listing._id },
      });
    }

    if (due.length) {
      await listingRepository.model.updateMany(
        { _id: { $in: due.map((l) => l._id) } },
        { expiryWarnedAt: now },
      );
    }
    return due.length;
  }

  /**
   * Owner-triggered renewal: extends the active period from now using the
   * current admin expiry setting and reactivates a listing that had expired.
   */
  async renew(id, userId) {
    const listing = await listingRepository.findById(id);
    if (!listing) throw ApiError.notFound('Listing not found');
    if (String(listing.owner) !== String(userId)) {
      throw ApiError.forbidden('You can only renew your own listings');
    }
    if (![LISTING_STATUS.APPROVED, LISTING_STATUS.EXPIRED].includes(listing.status)) {
      throw ApiError.badRequest('Only approved or expired listings can be renewed');
    }

    // Reactivating an expired listing counts against the plan's active limit.
    if (listing.status === LISTING_STATUS.EXPIRED) {
      await this.assertWithinPlanLimit(userId);
      listing.status = LISTING_STATUS.APPROVED;
    }

    listing.expiresAt = await this.computeExpiry();
    listing.expiryWarnedAt = undefined;
    await listing.save();
    return listing;
  }

  async moderate(id, moderatorId, { approve, reason }) {
    const listing = await listingRepository.findById(id);
    if (!listing) throw ApiError.notFound('Listing not found');

    listing.status = approve ? LISTING_STATUS.APPROVED : LISTING_STATUS.REJECTED;
    listing.reviewedBy = moderatorId;
    listing.reviewedAt = new Date();
    if (!approve) listing.rejectionReason = reason;
    // On approval the listing stays active for the admin-configured duration,
    // after which the hourly expireListings job deactivates it. 0 = never.
    if (approve) {
      listing.expiresAt = await this.computeExpiry();
      listing.expiryWarnedAt = undefined; // fresh active period, allow a new warning
    }
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

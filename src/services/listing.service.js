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
 * Parse a "west,south,east,north" bounding-box string into a closed GeoJSON
 * polygon ring (counter-clockwise exterior). Returns null when malformed.
 */
function parseBbox(bbox) {
  if (!bbox) return null;
  const p = String(bbox).split(',').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = p;
  if (w >= e || s >= n) return null;
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
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

    // Images can arrive two ways: freshly uploaded files, and/or items the user
    // picked from their media library (already-hosted { url, publicId }).
    const picked = this.normalizePickedMedia(data.mediaImages);
    await this.assertWithinImageLimit(picked.length + files.length);
    const uploaded = await this.uploadImages(files, { existingCount: picked.length });
    const images = [...picked, ...uploaded];
    const geo = this.buildGeo(data);

    // Drafts stay drafts; staff who chose Publish go live; everyone else goes
    // to the moderation queue.
    let status = LISTING_STATUS.PENDING;
    if (wantsDraft) status = LISTING_STATUS.DRAFT;
    else if (publish) status = LISTING_STATUS.APPROVED;

    const { mediaImages, ...rest } = data;
    const payload = { ...rest, owner: userId, geo, images, status };
    if (status === LISTING_STATUS.APPROVED) {
      // Mirror the moderation path: set the active period and stamp the review.
      payload.expiresAt = await this.computeExpiry();
      payload.reviewedBy = userId;
      payload.reviewedAt = new Date();
    }

    const listing = await listingRepository.create(payload);
    return listing;
  }

  /**
   * Upload listing images, enforcing the admin-configured per-listing limits
   * (image count and total size). `existingCount` is the number of images the
   * listing already has, so edits can't push the total past the cap.
   */
  async uploadImages(files = [], { existingCount = 0 } = {}) {
    if (!files.length) return [];

    const { uploadLimits } = await settingsService.get();
    const maxImages = uploadLimits?.maxImagesPerListing ?? 5;
    const maxTotalKb = uploadLimits?.maxTotalKb ?? 0;

    if (existingCount + files.length > maxImages) {
      throw ApiError.badRequest(`You can upload at most ${maxImages} image(s) per listing`);
    }
    if (maxTotalKb > 0) {
      const totalBytes = files.reduce((sum, f) => sum + (f.size ?? f.buffer.length), 0);
      if (totalBytes > maxTotalKb * 1024) {
        throw ApiError.badRequest(`Total image size must not exceed ${maxTotalKb} KB`);
      }
    }

    return Promise.all(files.map((f) => cloudinaryService.uploadBuffer(f.buffer, { mimetype: f.mimetype })));
  }

  /**
   * Keep only well-formed { url, publicId } pairs from the picked-media payload,
   * dropping anything a client might tack on. Returns a clean array.
   */
  normalizePickedMedia(input) {
    if (!Array.isArray(input)) return [];
    return input
      .filter((m) => m && typeof m.url === 'string' && typeof m.publicId === 'string')
      .map((m) => ({ url: m.url, publicId: m.publicId }));
  }

  /** Throw if `count` exceeds the admin-configured per-listing image limit. */
  async assertWithinImageLimit(count) {
    const { uploadLimits } = await settingsService.get();
    const maxImages = uploadLimits?.maxImagesPerListing ?? 5;
    if (count > maxImages) {
      throw ApiError.badRequest(`You can upload at most ${maxImages} image(s) per listing`);
    }
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
    const { mediaImages, ...rest } = data;
    Object.assign(listing, rest);
    const geo = this.buildGeo(rest);
    if (geo) listing.geo = geo;

    // Append both library-picked and freshly-uploaded images to what's there,
    // enforcing the per-listing cap across the combined total.
    const picked = this.normalizePickedMedia(mediaImages);
    if (picked.length || files.length) {
      await this.assertWithinImageLimit(listing.images.length + picked.length + files.length);
      const uploaded = await this.uploadImages(files, {
        existingCount: listing.images.length + picked.length,
      });
      listing.images = [...listing.images, ...picked, ...uploaded];
    }
    // Edited approved listings re-enter moderation.
    if (listing.status === LISTING_STATUS.APPROVED) listing.status = LISTING_STATUS.PENDING;
    await listing.save();
    return listing;
  }

  /** Delete one listing document and best-effort remove all of its images. */
  async destroyListing(listing) {
    await Promise.allSettled((listing.images || []).map((img) => cloudinaryService.destroy(img.publicId)));
    await listingRepository.deleteById(listing._id);
  }

  /** Owner deletes a single listing of their own. */
  async remove(id, userId) {
    const listing = await this.assertOwner(id, userId);
    await this.destroyListing(listing);
  }

  /**
   * Owner deletes several of their own listings at once. Silently ignores ids
   * that don't exist or aren't theirs, so a stale selection can't delete
   * someone else's data. Returns how many were actually removed.
   */
  async removeMany(ids, userId) {
    const listings = await listingRepository.find({ _id: { $in: ids }, owner: userId });
    await Promise.all(listings.map((l) => this.destroyListing(l)));
    return { requested: ids.length, deleted: listings.length };
  }

  /**
   * Staff delete one or more listings regardless of owner (e.g. policy
   * violations). Each affected owner is notified. Returns the delete count.
   */
  async adminRemoveMany(ids) {
    const listings = await listingRepository.find({ _id: { $in: ids } });
    await Promise.all(listings.map((l) => this.destroyListing(l)));

    await Promise.allSettled(
      listings.map((l) => notificationService.notify(l.owner, {
        title: 'Listing removed',
        description: `"${l.title}" was removed by an administrator.`,
        type: NOTIFICATION_TYPES.LISTING_REMOVED,
        reference: { model: 'Listing', id: l._id },
      })),
    );
    return { requested: ids.length, deleted: listings.length };
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
      // Browse cards only need summary fields + the first image, so we avoid
      // shipping the full images[] array and long description for every result.
      projection: {
        title: 1,
        slug: 1,
        type: 1,
        monthlyRent: 1,
        location: 1,
        isFeatured: 1,
        createdAt: 1,
        images: { $slice: 1 },
      },
    });
  }

  /**
   * Lightweight set of geo-located approved listings for the map view.
   * Supports the same basic filters as search; capped to keep payloads sane.
   */
  async mapPoints(query = {}) {
    const {
      keyword, type, division, district, area,
      minRent, maxRent, bedrooms, bathrooms, balconies,
      lat, lng, radiusKm, bbox, limit = 1000,
    } = query;

    const filter = { status: LISTING_STATUS.APPROVED };
    // Geo scoping, in priority order:
    //   1. bbox  -> only listings inside the user-drawn rectangle.
    //   2. centre point -> listings near the viewer; with radiusKm capped to it,
    //      without radiusKm all listings ordered by distance ("All").
    //   3. neither -> every geo-tagged listing.
    const box = parseBbox(bbox);
    const hasCenter = lat != null && lng != null && lat !== '' && lng !== '';
    let nearSorted = false; // $near self-sorts by distance; don't add a sort.
    if (box) {
      filter.geo = { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [box] } } };
    } else if (hasCenter) {
      const near = { $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] } };
      const r = Number(radiusKm);
      if (Number.isFinite(r) && r > 0) near.$maxDistance = r * 1000;
      filter.geo = { $near: near };
      nearSorted = true;
    } else {
      filter['geo.coordinates'] = { $exists: true, $ne: null };
    }
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
      // $near already sorts by distance; a manual sort would conflict.
      sort: nearSorted ? undefined : { createdAt: -1 },
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

  /**
   * Mark a listing as rented (deactivated) or available again. Allowed for the
   * listing's owner or any staff member. Toggling is constrained so it can't be
   * used to bypass moderation: only an approved listing can become rented, and
   * only a rented listing can be reactivated (back to approved). When staff act
   * on someone else's listing, the owner is notified.
   */
  async setRentedStatus(id, actor, rented) {
    const listing = await listingRepository.findById(id);
    if (!listing) throw ApiError.notFound('Listing not found');

    const isOwner = String(listing.owner) === String(actor._id);
    const isStaff = STAFF_ROLES.includes(actor.role);
    if (!isOwner && !isStaff) {
      throw ApiError.forbidden('You can only update your own listings');
    }

    if (rented) {
      if (listing.status === LISTING_STATUS.RENTED) return listing; // idempotent
      if (listing.status !== LISTING_STATUS.APPROVED) {
        throw ApiError.badRequest('Only an active (approved) listing can be marked as rented');
      }
      listing.status = LISTING_STATUS.RENTED;
    } else {
      if (listing.status !== LISTING_STATUS.RENTED) {
        throw ApiError.badRequest('Only a rented listing can be marked available again');
      }
      listing.status = LISTING_STATUS.APPROVED;
      listing.expiresAt = await this.computeExpiry();
      listing.expiryWarnedAt = undefined;
    }
    await listing.save();

    if (!isOwner) {
      await notificationService.notify(listing.owner, {
        title: rented ? 'Listing marked as rented' : 'Listing reactivated',
        description: rented
          ? `"${listing.title}" was marked as rented and is no longer publicly visible.`
          : `"${listing.title}" is live again.`,
        type: rented ? NOTIFICATION_TYPES.LISTING_RENTED : NOTIFICATION_TYPES.LISTING_REACTIVATED,
        reference: { model: 'Listing', id: listing._id },
      });
    }
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

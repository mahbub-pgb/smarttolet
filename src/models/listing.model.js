'use strict';

const mongoose = require('mongoose');
const {
  LISTING_TYPES,
  LISTING_STATUS,
} = require('../constants');

const { Schema } = mongoose;

const listingSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: LISTING_TYPES, required: true, index: true },

    // Basic information
    title: { type: String, required: true, trim: true, maxlength: 150 },
    // URL-friendly identifier derived from the title (+ a short stable suffix
    // for uniqueness). Used for public listing URLs instead of the raw id.
    slug: { type: String, index: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    monthlyRent: { type: Number, required: true, min: 0, index: true },
    advanceAmount: { type: Number, min: 0, default: 0 },
    serviceCharge: { type: Number, min: 0, default: 0 },
    availableFrom: { type: Date },

    // Property details
    details: {
      bedrooms: { type: Number, min: 0, default: 0 },
      bathrooms: { type: Number, min: 0, default: 0 },
      balconies: { type: Number, min: 0, default: 0 },
      floorNumber: { type: Number, min: 0 },
      buildingFloors: { type: Number, min: 0 },
      areaSqft: { type: Number, min: 0 },
      parkingAvailable: { type: Boolean, default: false },
      liftAvailable: { type: Boolean, default: false },
      generatorAvailable: { type: Boolean, default: false },
      airConditioning: { type: Boolean, default: false },
      gym: { type: Boolean, default: false },
      swimmingPool: { type: Boolean, default: false },
      petFriendly: { type: Boolean, default: false },
    },

    // Utilities
    utilities: {
      electricity: { type: Boolean, default: true },
      gas: { type: Boolean, default: false },
      water: { type: Boolean, default: true },
      internet: { type: Boolean, default: false },
      securityGuard: { type: Boolean, default: false },
      cctv: { type: Boolean, default: false },
    },

    // Occupancy / tenant preferences. Primarily relevant for shared housing
    // (type === 'mess'); the listing form only surfaces these for that type.
    occupancy: {
      familyOnly: { type: Boolean, default: false },
      bachelorAllowed: { type: Boolean, default: false },
      femaleOnly: { type: Boolean, default: false },
      maleOnly: { type: Boolean, default: false },
      smokingAllowed: { type: Boolean, default: false },
      petsAllowed: { type: Boolean, default: false },
    },

    // Location (Bangladesh hierarchy)
    // Location is captured from a map pin; the hierarchy fields are filled by
    // reverse geocoding when available (kept for search/filtering) and are
    // therefore optional. `formattedAddress` is the human-readable label.
    location: {
      division: { type: String, trim: true, index: true },
      district: { type: String, trim: true, index: true },
      upazila: { type: String, trim: true },
      area: { type: String, trim: true, index: true },
      road: { type: String, trim: true },
      houseNumber: { type: String, trim: true },
      formattedAddress: { type: String, trim: true },
    },
    // No default on `type`: a half-formed { type: 'Point' } without coordinates
    // breaks the 2dsphere index. Set together with coordinates when geo-tagged.
    geo: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    // Media
    images: {
      type: [{ url: String, publicId: String }],
      // Hard ceiling matching the upload middleware. The real, admin-tunable
      // per-listing limit is enforced in listing.service against Settings.
      validate: [(v) => v.length <= 30, 'Too many images'],
      default: [],
    },
    videoTourUrl: { type: String },
    tour360Url: { type: String },

    // Contact
    contact: {
      person: { type: String, trim: true },
      phone: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
    },

    status: {
      type: String,
      enum: Object.values(LISTING_STATUS),
      default: LISTING_STATUS.PENDING,
      index: true,
    },
    rejectionReason: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },

    isFeatured: { type: Boolean, default: false, index: true },
    expiresAt: { type: Date },
    // Set when the owner has been notified of an upcoming expiry, so the
    // warning job sends the reminder only once per active period.
    expiryWarnedAt: { type: Date },
    viewsCount: { type: Number, default: 0 },
    reportsCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/** Turn a title into a URL-safe slug base. */
function slugifyTitle(title = '') {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-') // keep latin + Bangla, collapse rest to '-'
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'listing';
}

/**
 * Produce a slug that is unique among listings. Uses the bare title slug when
 * free; otherwise appends -2, -3, … (WordPress-style) so URLs stay clean.
 */
async function generateUniqueSlug(Model, base, currentId) {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug, _id: { $ne: currentId } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

// Keep the slug in sync with the title.
listingSchema.pre('save', async function setSlug() {
  if (this.isModified('title') || !this.slug) {
    this.slug = await generateUniqueSlug(this.constructor, slugifyTitle(this.title), this._id);
  }
});

listingSchema.index({ geo: '2dsphere' });
// Full-text search over the most relevant fields.
listingSchema.index({ title: 'text', description: 'text', 'location.area': 'text' });
// Common composite filter for browse/search.
listingSchema.index({ status: 1, 'location.district': 1, monthlyRent: 1 });

listingSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Listing', listingSchema);

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A single image in a user's personal media library. Uploaded once, then reused
 * across listings (and anywhere else a picker is wired up) without re-uploading.
 * Ownership is per-user; staff can browse everyone's via the `all` scope.
 */
const mediaSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Mirrors the listing image shape so picked items drop straight into
    // listing.images[] ({ url, publicId }).
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    filename: { type: String, trim: true },
    mimetype: { type: String },
    size: { type: Number, min: 0 }, // bytes, after server-side compression
  },
  { timestamps: true },
);

mediaSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Media', mediaSchema);

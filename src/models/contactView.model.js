'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Records that a user revealed a listing's owner contact details. One row per
 * (listing, viewer) pair so the count reflects distinct people; repeat reveals
 * by the same user don't inflate it. Powers the owner's per-listing "who viewed
 * my contact" analytics.
 */
const contactViewSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
    viewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

contactViewSchema.index({ listing: 1, viewer: 1 }, { unique: true });

module.exports = mongoose.model('ContactView', contactViewSchema);

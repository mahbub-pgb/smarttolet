'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const advertisementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true },
    targetUrl: { type: String, trim: true },
    // Where the ad renders: home_banner, sidebar, listing_inline, etc.
    placement: { type: String, default: 'home_banner', index: true },
    isActive: { type: Boolean, default: true, index: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Advertisement', advertisementSchema);

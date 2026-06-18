'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const savedSearchSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true }, // e.g. "2 Bedroom, Dhaka, under 15k"
    // Free-form filter object mirroring the listing search query params.
    filters: {
      type: { type: String },
      division: String,
      district: String,
      area: String,
      minRent: Number,
      maxRent: Number,
      bedrooms: Number,
      keyword: String,
    },
    // Whether to alert the user when new matching listings appear.
    notify: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SavedSearch', savedSearchSchema);

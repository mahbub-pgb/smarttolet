'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const favoriteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
  },
  { timestamps: true },
);

// A user can favorite a listing only once.
favoriteSchema.index({ user: 1, listing: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);

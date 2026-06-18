'use strict';

const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../constants');

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    // Optional deep-link target, e.g. { model: 'Listing', id: '...' }
    reference: { model: String, id: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

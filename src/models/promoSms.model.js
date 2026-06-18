'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Log of promotional SMS sends. Powers the report view and the cooldown check
 * (a number that received a 'sent' promo within the configured window is not
 * messaged again).
 */
const promoSmsSchema = new Schema(
  {
    mobile: { type: String, required: true, index: true },
    title: { type: String },
    message: { type: String, required: true },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent', index: true },
    reason: { type: String }, // gateway message when failed
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Fast lookup for the cooldown check and the report ordering.
promoSmsSchema.index({ mobile: 1, createdAt: -1 });

module.exports = mongoose.model('PromoSms', promoSmsSchema);

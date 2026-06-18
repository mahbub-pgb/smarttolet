'use strict';

const mongoose = require('mongoose');
const { PAYMENT_METHODS, PAYMENT_STATUS, SUBSCRIPTION_PLANS } = require('../constants');

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT' },
    method: { type: String, enum: Object.values(PAYMENT_METHODS), required: true },
    // Gateway transaction id (trxID for bKash, etc.). Unique when present.
    transactionId: { type: String, trim: true, index: true },
    // Our internal idempotency / invoice reference sent to the gateway.
    paymentRef: { type: String, trim: true, unique: true },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    plan: { type: String, enum: Object.values(SUBSCRIPTION_PLANS) },
    // Raw gateway payload for audit/debugging.
    gatewayResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Payment', paymentSchema);

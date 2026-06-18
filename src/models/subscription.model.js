'use strict';

const mongoose = require('mongoose');
const { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } = require('../constants');

const { Schema } = mongoose;

const subscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLANS),
      default: SUBSCRIPTION_PLANS.FREE,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.ACTIVE,
      index: true,
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, index: true },
    // Link to the payment that activated this subscription.
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    autoRenew: { type: Boolean, default: false },
  },
  { timestamps: true },
);

subscriptionSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);

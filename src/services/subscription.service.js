'use strict';

const { subscriptionRepository } = require('../repositories');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_PLANS } = require('../constants');

const PLAN_DURATION_DAYS = 30;

class SubscriptionService {
  getActive(userId) {
    return subscriptionRepository.findOne({ user: userId, status: SUBSCRIPTION_STATUS.ACTIVE });
  }

  /** Activate/upgrade a plan, typically after a successful payment. */
  async activate(userId, plan, paymentId) {
    // Expire the user's existing active subscription.
    await subscriptionRepository.model.updateMany(
      { user: userId, status: SUBSCRIPTION_STATUS.ACTIVE },
      { status: SUBSCRIPTION_STATUS.EXPIRED },
    );
    const now = new Date();
    const endDate =
      plan === SUBSCRIPTION_PLANS.FREE
        ? null
        : new Date(now.getTime() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000);

    return subscriptionRepository.create({
      user: userId,
      plan,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      startDate: now,
      endDate,
      payment: paymentId,
    });
  }

  /** Job hook: expire subscriptions whose endDate has passed. */
  async expireDue() {
    const res = await subscriptionRepository.model.updateMany(
      { status: SUBSCRIPTION_STATUS.ACTIVE, endDate: { $ne: null, $lt: new Date() } },
      { status: SUBSCRIPTION_STATUS.EXPIRED },
    );
    return res.modifiedCount;
  }
}

module.exports = new SubscriptionService();

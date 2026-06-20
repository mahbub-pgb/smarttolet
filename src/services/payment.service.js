'use strict';

const crypto = require('crypto');
const { paymentRepository } = require('../repositories');
const subscriptionService = require('./subscription.service');
const notificationService = require('./notification.service');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { PAYMENT_STATUS, PAYMENT_METHODS, NOTIFICATION_TYPES, SUBSCRIPTION_PLANS } = require('../constants');

// Indicative BDT pricing per plan.
const PLAN_PRICES = {
  [SUBSCRIPTION_PLANS.PREMIUM]: 499,
  [SUBSCRIPTION_PLANS.FEATURED]: 1499,
};

/**
 * Payment orchestration for Bangladeshi gateways (bKash / Nagad / Rocket).
 *
 * Real integration is a two-phase flow: initiate -> redirect/PIN -> gateway
 * callback (execute/verify). Here we model that with a pending Payment record
 * and a verify() step. Plug a concrete gateway client into createCharge() and
 * verifyWithGateway() to go live; the surrounding bookkeeping stays the same.
 */
class PaymentService {
  async initiate(userId, { plan, method }) {
    if (!PLAN_PRICES[plan]) throw ApiError.badRequest('Plan is not purchasable');
    if (!Object.values(PAYMENT_METHODS).includes(method)) {
      throw ApiError.badRequest('Unsupported payment method');
    }
    const paymentRef = `STL-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payment = await paymentRepository.create({
      user: userId,
      amount: PLAN_PRICES[plan],
      method,
      plan,
      paymentRef,
      status: PAYMENT_STATUS.PENDING,
    });

    // const gateway = await this.createCharge(method, payment);  // real call
    return {
      payment,
      // Front-end redirects the user here to complete payment with the gateway.
      checkout: { paymentRef, amount: payment.amount, method },
    };
  }

  /**
   * Verify the payment with the gateway before trusting it. This MUST confirm
   * with the gateway's API that the transaction completed AND that the charged
   * amount equals the expected amount.
   *
   * No concrete gateway client is wired in yet, so this fails closed in
   * production: a forged callback cannot mark a payment successful. In
   * non-production (mock provider) a transactionId is accepted so local and
   * staging flows can be exercised without a live gateway.
   */
  async verifyWithGateway(payment, { transactionId }) {
    // TODO: replace with a real bKash/Nagad/Rocket execute+query call:
    //   const res = await gatewayClient.query(payment.paymentRef);
    //   return res.status === 'Completed' && Number(res.amount) === payment.amount;
    if (config.isProd) {
      throw ApiError.serviceUnavailable('Payment verification is not available', {
        code: 'GATEWAY_NOT_CONFIGURED',
      });
    }
    return Boolean(transactionId);
  }

  /**
   * Confirm a payment after the gateway callback. Trust is established by
   * verifyWithGateway(), never by the presence of a client-supplied field.
   */
  async verify({ paymentRef, transactionId, gatewayResponse }) {
    const payment = await paymentRepository.findOne({ paymentRef });
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status === PAYMENT_STATUS.SUCCESS) return payment; // idempotent

    const ok = await this.verifyWithGateway(payment, { transactionId });
    payment.transactionId = transactionId;
    payment.gatewayResponse = gatewayResponse;
    payment.status = ok ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.FAILED;
    await payment.save();

    if (ok) {
      await subscriptionService.activate(payment.user, payment.plan, payment._id);
      await notificationService.notify(payment.user, {
        title: 'Payment successful',
        description: `Your ${payment.plan} subscription is now active.`,
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        reference: { model: 'Payment', id: payment._id },
      });
    }
    return payment;
  }

  list({ status, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (status) filter.status = status;
    return paymentRepository.paginate(filter, {
      page,
      limit,
      populate: { path: 'user', select: 'fullName mobile' },
    });
  }
}

module.exports = new PaymentService();

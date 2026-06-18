'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const paymentService = require('../services/payment.service');
const subscriptionService = require('../services/subscription.service');

exports.initiate = asyncHandler(async (req, res) => {
  const result = await paymentService.initiate(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Payment initiated', data: result });
});

// Gateway callback / client confirmation.
exports.verify = asyncHandler(async (req, res) => {
  const payment = await paymentService.verify(req.body);
  sendSuccess(res, { message: 'Payment processed', data: { payment } });
});

exports.mySubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.getActive(req.user._id);
  sendSuccess(res, { data: { subscription } });
});

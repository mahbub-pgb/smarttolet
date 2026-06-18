'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');
const adminService = require('../services/admin.service');
const listingService = require('../services/listing.service');
const paymentService = require('../services/payment.service');
const settingsService = require('../services/settings.service');
const ApiError = require('../utils/ApiError');
const { roleRank } = require('../constants');

const meta = (req, total) => paginate({ page: req.query.page, limit: req.query.limit, total });

// ---- Dashboard / analytics ----
exports.dashboard = asyncHandler(async (req, res) => {
  const cards = await adminService.dashboardCards();
  sendSuccess(res, { data: { cards } });
});

exports.charts = asyncHandler(async (req, res) => {
  const charts = await adminService.growthCharts(Number(req.query.months) || 6);
  sendSuccess(res, { data: { charts } });
});

// ---- Users / staff ----
exports.listUsers = asyncHandler(async (req, res) => {
  const { items, total } = await adminService.listUsers(req.query);
  sendSuccess(res, { data: { users: items }, meta: meta(req, total) });
});

exports.createUser = asyncHandler(async (req, res) => {
  const user = await adminService.createUser(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'User created', data: { user } });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const user = await adminService.updateUser(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'User updated', data: { user } });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const target = await adminService.setStatus(req.params.id, req.body.status);
  sendSuccess(res, { message: 'Status updated', data: { user: target } });
});

exports.setUserRole = asyncHandler(async (req, res) => {
  // Cannot assign a role at or above your own rank.
  if (roleRank(req.body.role) >= roleRank(req.user.role)) {
    throw ApiError.forbidden('Cannot assign a role equal to or above your own');
  }
  const target = await adminService.setRole(req.params.id, req.body.role);
  sendSuccess(res, { message: 'Role updated', data: { user: target } });
});

exports.verifyLandlord = asyncHandler(async (req, res) => {
  const target = await adminService.verifyLandlord(req.params.id, req.body.verified !== false);
  sendSuccess(res, { message: 'Landlord verification updated', data: { user: target } });
});

// ---- Listing moderation ----
exports.moderationQueue = asyncHandler(async (req, res) => {
  const { items, total } = await listingService.listForModeration(req.query);
  sendSuccess(res, { data: { listings: items }, meta: meta(req, total) });
});

exports.moderateListing = asyncHandler(async (req, res) => {
  const listing = await listingService.moderate(req.params.id, req.user._id, req.body);
  sendSuccess(res, { message: 'Listing reviewed', data: { listing } });
});

// ---- Payments ----
exports.listPayments = asyncHandler(async (req, res) => {
  const { items, total } = await paymentService.list(req.query);
  sendSuccess(res, { data: { payments: items }, meta: meta(req, total) });
});

// ---- Settings ----
exports.getSettings = asyncHandler(async (req, res) => {
  // Admin view excludes raw secrets but indicates which are configured.
  const s = await settingsService.get();
  const masked = {
    ...s,
    sms: { ...s.sms, apiKey: s.sms.apiKey ? '***configured***' : null },
    cloudinary: {
      cloudName: s.cloudinary.cloudName,
      apiKey: s.cloudinary.apiKey ? '***configured***' : null,
      apiSecret: s.cloudinary.apiSecret ? '***configured***' : null,
    },
  };
  sendSuccess(res, { data: { settings: masked } });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  await settingsService.update(req.body, req.user._id);
  sendSuccess(res, { message: 'Settings updated' });
});

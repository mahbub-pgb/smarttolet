'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');
const adminService = require('../services/admin.service');
const listingService = require('../services/listing.service');
const paymentService = require('../services/payment.service');
const settingsService = require('../services/settings.service');

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
  const target = await adminService.setStatus(req.params.id, req.body.status, req.user);
  sendSuccess(res, { message: 'Status updated', data: { user: target } });
});

exports.setUserRole = asyncHandler(async (req, res) => {
  // Rank guards (target rank + assigned-role rank) are enforced in the service.
  const target = await adminService.setRole(req.params.id, req.body.role, req.user);
  sendSuccess(res, { message: 'Role updated', data: { user: target } });
});

exports.verifyLandlord = asyncHandler(async (req, res) => {
  const target = await adminService.verifyLandlord(
    req.params.id,
    req.body.verified !== false,
    req.user,
  );
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

exports.deleteListing = asyncHandler(async (req, res) => {
  await listingService.adminRemoveMany([req.params.id]);
  sendSuccess(res, { message: 'Listing deleted' });
});

exports.bulkDeleteListings = asyncHandler(async (req, res) => {
  const result = await listingService.adminRemoveMany(req.body.ids);
  sendSuccess(res, { message: `${result.deleted} listing(s) deleted`, data: result });
});

// ---- Payments ----
exports.listPayments = asyncHandler(async (req, res) => {
  const { items, total } = await paymentService.list(req.query);
  sendSuccess(res, { data: { payments: items }, meta: meta(req, total) });
});

// ---- Promotional SMS ----
exports.smsBalance = asyncHandler(async (req, res) => {
  const data = await adminService.smsBalance();
  sendSuccess(res, { data });
});

exports.sendPromotion = asyncHandler(async (req, res) => {
  const result = await adminService.sendPromotion(
    req.body.numbers,
    req.body.message,
    req.user._id,
    req.body.title,
  );
  sendSuccess(res, { message: 'Promotional SMS sent', data: result });
});

exports.promotionLog = asyncHandler(async (req, res) => {
  const { items, total } = await adminService.promotionLog(req.query);
  sendSuccess(res, { data: { items }, meta: meta(req, total) });
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

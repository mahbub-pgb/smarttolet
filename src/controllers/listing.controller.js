'use strict';

const listingService = require('../services/listing.service');
const placesService = require('../services/places.service');
const contactViewService = require('../services/contactView.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');

// Short, shared cache window for public read endpoints. `stale-while-revalidate`
// lets a CDN/browser serve a slightly stale copy while refreshing in the
// background, cutting repeat bandwidth without making data look frozen.
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

exports.create = asyncHandler(async (req, res) => {
  const listing = await listingService.create(req.user._id, req.body, req.files, req.user.role);
  const message = listing.status === 'approved'
    ? 'Listing published'
    : listing.status === 'draft'
      ? 'Draft saved'
      : 'Listing submitted for review';
  sendSuccess(res, { statusCode: 201, message, data: { listing } });
});

exports.update = asyncHandler(async (req, res) => {
  const listing = await listingService.update(req.params.id, req.user._id, req.body, req.files);
  sendSuccess(res, { message: 'Listing updated', data: { listing } });
});

exports.remove = asyncHandler(async (req, res) => {
  await listingService.remove(req.params.id, req.user._id);
  sendSuccess(res, { message: 'Listing deleted' });
});

exports.removeMany = asyncHandler(async (req, res) => {
  const result = await listingService.removeMany(req.body.ids, req.user._id);
  sendSuccess(res, { message: `${result.deleted} listing(s) deleted`, data: result });
});

exports.renew = asyncHandler(async (req, res) => {
  const listing = await listingService.renew(req.params.id, req.user._id);
  sendSuccess(res, { message: 'Listing renewed', data: { listing } });
});

exports.markRented = asyncHandler(async (req, res) => {
  const listing = await listingService.setRentedStatus(req.params.id, req.user, true);
  sendSuccess(res, { message: 'Listing marked as rented', data: { listing } });
});

exports.markAvailable = asyncHandler(async (req, res) => {
  const listing = await listingService.setRentedStatus(req.params.id, req.user, false);
  sendSuccess(res, { message: 'Listing marked as available', data: { listing } });
});

// Whether the current user already revealed this listing's contact (and the
// details if so) — lets the client skip the prompt on return visits.
exports.contactViewStatus = asyncHandler(async (req, res) => {
  const data = await contactViewService.statusFor(req.params.id, req.user);
  sendSuccess(res, { data });
});

// Reveal owner contact + record the view (for the owner's analytics).
exports.recordContactView = asyncHandler(async (req, res) => {
  const data = await contactViewService.record(req.params.id, req.user);
  sendSuccess(res, { message: 'Contact revealed', data });
});

// Owner/staff: who viewed this listing's contact, and how many.
exports.contactViews = asyncHandler(async (req, res) => {
  const data = await contactViewService.listViewers(req.params.id, req.user);
  sendSuccess(res, { data });
});

exports.getOne = asyncHandler(async (req, res) => {
  const listing = await listingService.getById(req.params.id, { incrementView: true });
  res.set('Cache-Control', PUBLIC_CACHE);
  sendSuccess(res, { data: { listing } });
});

exports.search = asyncHandler(async (req, res) => {
  const { items, total } = await listingService.search(req.query);
  res.set('Cache-Control', PUBLIC_CACHE);
  sendSuccess(res, {
    data: { listings: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
});

exports.mapPoints = asyncHandler(async (req, res) => {
  const listings = await listingService.mapPoints(req.query);
  res.set('Cache-Control', PUBLIC_CACHE);
  sendSuccess(res, { data: { listings } });
});

exports.mine = asyncHandler(async (req, res) => {
  const { items, total } = await listingService.listMine(req.user._id, req.query);
  sendSuccess(res, {
    data: { listings: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
});

exports.sitemap = asyncHandler(async (req, res) => {
  const listings = await listingService.sitemapEntries(req.query.limit);
  sendSuccess(res, { data: { listings } });
});

exports.myStats = asyncHandler(async (req, res) => {
  const stats = await listingService.statsFor(req.user._id);
  sendSuccess(res, { data: { stats } });
});

/** Smart "what's nearby" for a listing. */
exports.nearby = asyncHandler(async (req, res) => {
  const listing = await listingService.getById(req.params.id);
  const coords = listing.geo?.coordinates;
  if (!coords) return sendSuccess(res, { data: { nearby: {} } });
  const categories = req.query.categories ? req.query.categories.split(',') : undefined;
  const nearby = await placesService.nearby(coords[1], coords[0], categories);
  sendSuccess(res, { data: { nearby } });
});

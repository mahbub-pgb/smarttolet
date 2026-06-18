'use strict';

const listingService = require('../services/listing.service');
const placesService = require('../services/places.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');

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

exports.renew = asyncHandler(async (req, res) => {
  const listing = await listingService.renew(req.params.id, req.user._id);
  sendSuccess(res, { message: 'Listing renewed', data: { listing } });
});

exports.getOne = asyncHandler(async (req, res) => {
  const listing = await listingService.getById(req.params.id, { incrementView: true });
  sendSuccess(res, { data: { listing } });
});

exports.search = asyncHandler(async (req, res) => {
  const { items, total } = await listingService.search(req.query);
  sendSuccess(res, {
    data: { listings: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
});

exports.mapPoints = asyncHandler(async (req, res) => {
  const listings = await listingService.mapPoints(req.query);
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

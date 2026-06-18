'use strict';

const listingService = require('../services/listing.service');
const placesService = require('../services/places.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');

exports.create = asyncHandler(async (req, res) => {
  const listing = await listingService.create(req.user._id, req.body, req.files);
  sendSuccess(res, { statusCode: 201, message: 'Listing submitted', data: { listing } });
});

exports.update = asyncHandler(async (req, res) => {
  const listing = await listingService.update(req.params.id, req.user._id, req.body, req.files);
  sendSuccess(res, { message: 'Listing updated', data: { listing } });
});

exports.remove = asyncHandler(async (req, res) => {
  await listingService.remove(req.params.id, req.user._id);
  sendSuccess(res, { message: 'Listing deleted' });
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

exports.mine = asyncHandler(async (req, res) => {
  const { items, total } = await listingService.listMine(req.user._id, req.query);
  sendSuccess(res, {
    data: { listings: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
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

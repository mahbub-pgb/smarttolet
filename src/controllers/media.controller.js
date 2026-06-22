'use strict';

const mediaService = require('../services/media.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');

exports.upload = asyncHandler(async (req, res) => {
  const media = await mediaService.upload(req.user._id, req.files);
  sendSuccess(res, { statusCode: 201, message: 'Image(s) uploaded', data: { media } });
});

exports.list = asyncHandler(async (req, res) => {
  const { items, total } = await mediaService.list(req.user._id, req.user.role, req.query);
  sendSuccess(res, {
    data: { media: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
});

exports.remove = asyncHandler(async (req, res) => {
  await mediaService.remove(req.user._id, req.user.role, req.params.id);
  sendSuccess(res, { message: 'Image deleted' });
});

exports.removeMany = asyncHandler(async (req, res) => {
  const result = await mediaService.removeMany(req.user._id, req.user.role, req.body.ids);
  sendSuccess(res, { message: `${result.deleted} image(s) deleted`, data: result });
});

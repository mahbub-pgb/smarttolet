'use strict';

const blogService = require('../services/blog.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');

// ---- Posts ----

exports.create = asyncHandler(async (req, res) => {
  const post = await blogService.create(req.user._id, req.body);
  const message = post.status === 'published' ? 'Post published' : 'Draft saved';
  sendSuccess(res, { statusCode: 201, message, data: { post } });
});

exports.update = asyncHandler(async (req, res) => {
  const post = await blogService.update(req.params.id, req.body);
  sendSuccess(res, { message: 'Post updated', data: { post } });
});

exports.remove = asyncHandler(async (req, res) => {
  await blogService.remove(req.params.id);
  sendSuccess(res, { message: 'Post deleted' });
});

exports.removeMany = asyncHandler(async (req, res) => {
  const result = await blogService.removeMany(req.body.ids);
  sendSuccess(res, { message: `${result.deleted} post(s) deleted`, data: result });
});

/** Public, published-only fetch by slug (or id). Increments the view count. */
exports.getPublicOne = asyncHandler(async (req, res) => {
  const post = await blogService.getById(req.params.slug, { incrementView: true });
  sendSuccess(res, { data: { post } });
});

/** Admin fetch by id; includes drafts so the editor can load them. */
exports.getAdminOne = asyncHandler(async (req, res) => {
  const post = await blogService.getById(req.params.id, { admin: true });
  sendSuccess(res, { data: { post } });
});

exports.listPublic = asyncHandler(async (req, res) => {
  const { items, total } = await blogService.listPublic(req.query);
  sendSuccess(res, {
    data: { posts: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
});

exports.listAdmin = asyncHandler(async (req, res) => {
  const { items, total } = await blogService.listAdmin(req.query);
  sendSuccess(res, {
    data: { posts: items },
    meta: paginate({ page: req.query.page, limit: req.query.limit, total }),
  });
});

exports.uploadImage = asyncHandler(async (req, res) => {
  const image = await blogService.uploadImage(req.file);
  sendSuccess(res, { statusCode: 201, message: 'Image uploaded', data: { image } });
});

// ---- Categories ----

exports.listCategories = asyncHandler(async (req, res) => {
  const categories = await blogService.listCategories();
  sendSuccess(res, { data: { categories } });
});

exports.createCategory = asyncHandler(async (req, res) => {
  const category = await blogService.createCategory(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Category created', data: { category } });
});

exports.removeCategory = asyncHandler(async (req, res) => {
  await blogService.removeCategory(req.params.id);
  sendSuccess(res, { message: 'Category deleted' });
});

// ---- Tags ----

exports.listTags = asyncHandler(async (req, res) => {
  const tags = await blogService.listTags();
  sendSuccess(res, { data: { tags } });
});

exports.createTag = asyncHandler(async (req, res) => {
  const tag = await blogService.createTag(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Tag created', data: { tag } });
});

exports.removeTag = asyncHandler(async (req, res) => {
  await blogService.removeTag(req.params.id);
  sendSuccess(res, { message: 'Tag deleted' });
});

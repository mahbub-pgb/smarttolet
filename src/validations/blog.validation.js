'use strict';

const { z, objectId, idParam, pagination } = require('./common.validation');
const { BLOG_STATUS } = require('../constants');

// A single content block. Validated loosely here; the service strips empty
// blocks and re-derives YouTube ids before saving.
const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().max(20000).default(''),
  }),
  z.object({
    type: z.literal('image'),
    url: z.string().url('Image block needs a valid url'),
    publicId: z.string().optional(),
    caption: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal('youtube'),
    url: z.string().url('YouTube block needs a valid url'),
    videoId: z.string().optional(),
  }),
]);

// Nullable so the editor can clear a cover image by sending null.
const imageRef = z
  .object({
    url: z.string().url(),
    publicId: z.string().optional(),
  })
  .optional()
  .nullable();

const create = {
  body: z.object({
    title: z
      .string()
      .min(3, 'Title must be at least 3 characters')
      .max(180, 'Title must be at most 180 characters'),
    excerpt: z.string().max(500).optional(),
    coverImage: imageRef,
    blocks: z.array(blockSchema).max(200).default([]),
    category: objectId.optional().nullable(),
    tags: z.array(objectId).max(30).optional(),
    status: z.enum([BLOG_STATUS.DRAFT, BLOG_STATUS.PUBLISHED]).optional(),
  }),
};

const update = {
  params: idParam,
  body: create.body.partial(),
};

const search = {
  query: pagination.extend({
    keyword: z.string().optional(),
    category: z.string().optional(), // slug
    tag: z.string().optional(), // slug
    sort: z.enum(['newest', 'oldest', 'most_viewed']).optional(),
  }),
};

// Admin list also allows filtering by status (drafts included).
const adminSearch = {
  query: pagination.extend({
    keyword: z.string().optional(),
    status: z.enum([BLOG_STATUS.DRAFT, BLOG_STATUS.PUBLISHED, 'all']).optional(),
    category: z.string().optional(),
    sort: z.enum(['newest', 'oldest', 'most_viewed']).optional(),
  }),
};

const slugParam = { params: z.object({ slug: z.string().min(1) }) };

const taxonomy = {
  body: z.object({
    name: z.string().min(1).max(60),
    description: z.string().max(300).optional(),
  }),
};

const bulkDelete = {
  body: z.object({
    ids: z.array(objectId).min(1, 'Select at least one post').max(100),
  }),
};

module.exports = {
  create, update, search, adminSearch, slugParam, taxonomy, bulkDelete, idParam, objectId,
};

'use strict';

const mongoose = require('mongoose');
const {
  blogPostRepository,
  blogCategoryRepository,
  blogTagRepository,
} = require('../repositories');
const cloudinaryService = require('./cloudinary.service');
const ApiError = require('../utils/ApiError');
const { BLOG_STATUS } = require('../constants');

const POPULATE = [
  { path: 'author', select: 'fullName profileImage' },
  { path: 'category', select: 'name slug' },
  { path: 'tags', select: 'name slug' },
];

// Escape regex metacharacters so user input is matched literally.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pull the 11-char video id out of the common YouTube URL shapes. */
function youtubeId(url = '') {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = String(url).match(re);
    if (m) return m[1];
  }
  return '';
}

/**
 * Clean the editor's blocks before persisting: drop empty text blocks and
 * re-derive YouTube ids so the renderer can embed without re-parsing.
 */
function normalizeBlocks(blocks = []) {
  return blocks
    .map((b) => {
      if (b.type === 'text') return { type: 'text', text: (b.text || '').trim() };
      if (b.type === 'image') {
        return { type: 'image', url: b.url, publicId: b.publicId, caption: (b.caption || '').trim() };
      }
      if (b.type === 'youtube') {
        return { type: 'youtube', url: b.url, videoId: youtubeId(b.url) };
      }
      return null;
    })
    .filter((b) => b && !(b.type === 'text' && !b.text));
}

/** Collect every stored image publicId referenced by a post (cover + blocks). */
function imagePublicIds(post) {
  const ids = [];
  if (post.coverImage?.publicId) ids.push(post.coverImage.publicId);
  (post.blocks || []).forEach((b) => {
    if (b.type === 'image' && b.publicId) ids.push(b.publicId);
  });
  return ids;
}

/**
 * Build a plain-text summary from the post's rich HTML, used for cards and the
 * SEO meta description. Strips tags, decodes the common entities, collapses
 * whitespace, and trims to a word boundary.
 */
function deriveExcerpt(html = '', max = 180) {
  const text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

class BlogService {
  // ---- Posts ----

  async create(authorId, data) {
    const status = data.status === BLOG_STATUS.PUBLISHED ? BLOG_STATUS.PUBLISHED : BLOG_STATUS.DRAFT;
    const payload = {
      author: authorId,
      title: data.title,
      // Auto-derived from the content when not explicitly supplied.
      excerpt: data.excerpt || deriveExcerpt(data.contentHtml),
      coverImage: data.coverImage,
      contentHtml: data.contentHtml || '',
      blocks: normalizeBlocks(data.blocks),
      category: data.category || undefined,
      tags: data.tags || [],
      status,
      publishedAt: status === BLOG_STATUS.PUBLISHED ? new Date() : undefined,
    };
    const post = await blogPostRepository.create(payload);
    return this.getById(post._id, { admin: true });
  }

  async update(id, data) {
    const post = await blogPostRepository.findById(id);
    if (!post) throw ApiError.notFound('Post not found');

    const before = imagePublicIds(post);

    if (data.title !== undefined) post.title = data.title;
    if (data.coverImage !== undefined) post.coverImage = data.coverImage || undefined;
    if (data.contentHtml !== undefined) {
      post.contentHtml = data.contentHtml;
      // Keep the excerpt in sync with the content unless one is given.
      if (data.excerpt === undefined) post.excerpt = deriveExcerpt(data.contentHtml);
    }
    if (data.excerpt !== undefined) post.excerpt = data.excerpt;
    if (data.blocks !== undefined) post.blocks = normalizeBlocks(data.blocks);
    if (data.category !== undefined) post.category = data.category || undefined;
    if (data.tags !== undefined) post.tags = data.tags;

    if (data.status !== undefined && data.status !== post.status) {
      post.status = data.status;
      // Stamp the publish time the first time it goes live.
      if (data.status === BLOG_STATUS.PUBLISHED && !post.publishedAt) post.publishedAt = new Date();
    }

    await post.save();

    // Best-effort cleanup of images dropped during the edit.
    const after = new Set(imagePublicIds(post));
    const removed = before.filter((pid) => !after.has(pid));
    await Promise.allSettled(removed.map((pid) => cloudinaryService.destroy(pid)));

    return this.getById(post._id, { admin: true });
  }

  /** Resolve by Mongo id or slug. Public callers only see published posts. */
  async getById(idOrSlug, { admin = false, incrementView = false } = {}) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const filter = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug };
    if (!admin) filter.status = BLOG_STATUS.PUBLISHED;

    const post = await blogPostRepository.findOne(filter).populate(POPULATE);
    if (!post) throw ApiError.notFound('Post not found');
    if (incrementView) {
      blogPostRepository.updateById(post._id, { $inc: { viewsCount: 1 } }).catch(() => {});
    }
    return post;
  }

  async destroyPost(post) {
    await Promise.allSettled(imagePublicIds(post).map((pid) => cloudinaryService.destroy(pid)));
    await blogPostRepository.deleteById(post._id);
  }

  async remove(id) {
    const post = await blogPostRepository.findById(id);
    if (!post) throw ApiError.notFound('Post not found');
    await this.destroyPost(post);
  }

  async removeMany(ids) {
    const posts = await blogPostRepository.find({ _id: { $in: ids } });
    await Promise.all(posts.map((p) => this.destroyPost(p)));
    return { requested: ids.length, deleted: posts.length };
  }

  buildSort(sort) {
    const map = {
      newest: { publishedAt: -1, createdAt: -1 },
      oldest: { publishedAt: 1, createdAt: 1 },
      most_viewed: { viewsCount: -1 },
    };
    return map[sort] || map.newest;
  }

  /** Public, published-only listing with category/tag/keyword filters. */
  async listPublic(query) {
    const { keyword, category, tag, sort = 'newest', page = 1, limit = 20 } = query;
    const filter = { status: BLOG_STATUS.PUBLISHED };

    if (category) {
      const cat = await blogCategoryRepository.findOne({ slug: category });
      // A missing slug must yield no results — use an id that can't match
      // rather than null (which would match uncategorised posts).
      filter.category = cat ? cat._id : new mongoose.Types.ObjectId();
    }
    if (tag) {
      const t = await blogTagRepository.findOne({ slug: tag });
      filter.tags = t ? t._id : new mongoose.Types.ObjectId();
    }
    if (keyword) {
      const rx = new RegExp(escapeRegex(keyword), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }];
    }

    return blogPostRepository.paginate(filter, {
      page: Number(page),
      limit: Math.min(Number(limit), 50),
      sort: this.buildSort(sort),
      populate: POPULATE,
    });
  }

  /** Admin listing: all statuses, drafts included. */
  async listAdmin(query) {
    const { keyword, status, category, sort = 'newest', page = 1, limit = 20 } = query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (category) {
      const cat = await blogCategoryRepository.findOne({ slug: category });
      filter.category = cat ? cat._id : new mongoose.Types.ObjectId();
    }
    if (keyword) {
      const rx = new RegExp(escapeRegex(keyword), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }];
    }
    return blogPostRepository.paginate(filter, {
      page: Number(page),
      limit: Math.min(Number(limit) || 20, 100),
      sort: this.buildSort(sort),
      populate: POPULATE,
    });
  }

  /** {slug, updatedAt} list of published posts for the sitemap. */
  async sitemapEntries(limit = 5000) {
    return blogPostRepository.find(
      { status: BLOG_STATUS.PUBLISHED },
      { projection: 'slug updatedAt', limit: Math.min(Number(limit) || 5000, 50000), sort: { updatedAt: -1 } },
    );
  }

  // ---- Image upload (one buffer at a time, from the block editor) ----

  async uploadImage(file) {
    if (!file) throw ApiError.badRequest('No image provided');
    return cloudinaryService.uploadBuffer(file.buffer, { folder: 'smart-tolet/blog', mimetype: file.mimetype });
  }

  // ---- Categories ----

  listCategories() {
    return blogCategoryRepository.find({}, { sort: { name: 1 } });
  }

  async createCategory(data) {
    const category = await blogCategoryRepository.create({ name: data.name, description: data.description });
    return category;
  }

  async removeCategory(id) {
    const category = await blogCategoryRepository.findById(id);
    if (!category) throw ApiError.notFound('Category not found');
    await blogCategoryRepository.deleteById(id);
    // Detach the category from any posts that used it.
    await blogPostRepository.model.updateMany({ category: id }, { $unset: { category: '' } });
  }

  // ---- Tags ----

  listTags() {
    return blogTagRepository.find({}, { sort: { name: 1 } });
  }

  async createTag(data) {
    return blogTagRepository.create({ name: data.name });
  }

  async removeTag(id) {
    const tag = await blogTagRepository.findById(id);
    if (!tag) throw ApiError.notFound('Tag not found');
    await blogTagRepository.deleteById(id);
    await blogPostRepository.model.updateMany({ tags: id }, { $pull: { tags: id } });
  }
}

module.exports = new BlogService();

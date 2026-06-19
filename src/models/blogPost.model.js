'use strict';

const mongoose = require('mongoose');
const { BLOG_STATUS } = require('../constants');
const { slugifyText, generateUniqueSlug } = require('../utils/slugify');

const { Schema } = mongoose;

/**
 * One ordered piece of post body. The "simple block editor" emits these in
 * sequence:
 *   - text    -> { type: 'text', text }
 *   - image   -> { type: 'image', url, publicId, caption }
 *   - youtube -> { type: 'youtube', url, videoId }
 */
const blockSchema = new Schema(
  {
    type: { type: String, enum: ['text', 'image', 'youtube'], required: true },
    // text
    text: { type: String, trim: true, maxlength: 20000 },
    // image
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    caption: { type: String, trim: true, maxlength: 300 },
    // youtube
    videoId: { type: String, trim: true },
  },
  { _id: false },
);

const blogPostSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 180 },
    // URL-friendly identifier derived from the title (+ a short suffix for
    // uniqueness). Used for public blog URLs instead of the raw id.
    slug: { type: String, index: true },
    excerpt: { type: String, trim: true, maxlength: 500 },

    coverImage: {
      url: { type: String, trim: true },
      publicId: { type: String, trim: true },
    },

    // Primary body: rich HTML produced by the CKEditor 5 editor.
    contentHtml: { type: String, default: '' },

    // Legacy/alternate body: the simple block editor's ordered blocks. Kept so
    // older posts (and the block renderer) still work as a fallback.
    blocks: { type: [blockSchema], default: [] },

    category: { type: Schema.Types.ObjectId, ref: 'BlogCategory', index: true },
    tags: [{ type: Schema.Types.ObjectId, ref: 'BlogTag', index: true }],

    status: {
      type: String,
      enum: Object.values(BLOG_STATUS),
      default: BLOG_STATUS.DRAFT,
      index: true,
    },
    publishedAt: { type: Date },
    viewsCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Keep the slug in sync with the title.
blogPostSchema.pre('save', async function setSlug() {
  if (this.isModified('title') || !this.slug) {
    this.slug = await generateUniqueSlug(
      this.constructor,
      slugifyText(this.title, { fallback: 'post', maxLength: 100 }),
      this._id,
    );
  }
});

// Full-text search over title/excerpt for the admin/public lists.
blogPostSchema.index({ title: 'text', excerpt: 'text' });
blogPostSchema.index({ status: 1, publishedAt: -1 });

blogPostSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('BlogPost', blogPostSchema);

'use strict';

const mongoose = require('mongoose');
const { slugifyText, generateUniqueSlug } = require('../utils/slugify');

const { Schema } = mongoose;

const blogTagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slug: { type: String, index: true, unique: true },
  },
  { timestamps: true },
);

blogTagSchema.pre('save', async function setSlug() {
  if (this.isModified('name') || !this.slug) {
    this.slug = await generateUniqueSlug(
      this.constructor,
      slugifyText(this.name, { fallback: 'tag', maxLength: 40 }),
      this._id,
    );
  }
});

blogTagSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('BlogTag', blogTagSchema);

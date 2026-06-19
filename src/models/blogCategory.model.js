'use strict';

const mongoose = require('mongoose');
const { slugifyText, generateUniqueSlug } = require('../utils/slugify');

const { Schema } = mongoose;

const blogCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, index: true, unique: true },
    description: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

blogCategorySchema.pre('save', async function setSlug() {
  if (this.isModified('name') || !this.slug) {
    this.slug = await generateUniqueSlug(
      this.constructor,
      slugifyText(this.name, { fallback: 'category', maxLength: 60 }),
      this._id,
    );
  }
});

blogCategorySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('BlogCategory', blogCategorySchema);

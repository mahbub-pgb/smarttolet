'use strict';

/**
 * Turn arbitrary text into a URL-safe slug base. Keeps Latin + Bangla
 * characters and collapses everything else to single hyphens. Mirrors the
 * behaviour used for listing slugs so blog URLs stay consistent.
 */
function slugifyText(text = '', { fallback = 'item', maxLength = 80 } = {}) {
  return (
    String(text)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9ঀ-৿]+/g, '-') // keep latin + Bangla, collapse rest to '-'
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength) || fallback
  );
}

/**
 * Produce a slug unique among documents of `Model`. Uses the bare base when
 * free; otherwise appends -2, -3, … (WordPress-style) so URLs stay clean.
 * `currentId` is excluded so updates don't collide with themselves.
 */
async function generateUniqueSlug(Model, base, currentId) {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug, _id: { $ne: currentId } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

module.exports = { slugifyText, generateUniqueSlug };

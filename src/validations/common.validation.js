'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/**
 * Canonicalise a Bangladesh mobile number to +8801XXXXXXXXX. Accepts the common
 * shapes users actually type so they don't have to enter the +88 prefix:
 *   01712345678, 8801712345678, +8801712345678, 1712345678 (spaces/dashes ok).
 */
function normalizeBdMobile(v) {
  if (typeof v !== 'string') return v;
  let s = v.replace(/[\s-]/g, '');
  if (s.startsWith('+88')) s = s.slice(3);
  else if (s.startsWith('88')) s = s.slice(2);
  if (s.startsWith('0')) s = s.slice(1); // drop the local leading 0
  return `+880${s}`;
}

// Normalises first, then enforces the canonical format.
const bdMobile = z.preprocess(
  normalizeBdMobile,
  z.string().regex(/^\+8801[3-9]\d{8}$/, 'Invalid Bangladesh mobile number'),
);

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const idParam = z.object({ id: objectId });

module.exports = { objectId, bdMobile, normalizeBdMobile, pagination, idParam, z };

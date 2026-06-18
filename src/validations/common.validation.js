'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const bdMobile = z.string().regex(/^\+8801[3-9]\d{8}$/, 'Invalid Bangladesh mobile number');

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const idParam = z.object({ id: objectId });

module.exports = { objectId, bdMobile, pagination, idParam, z };

'use strict';

/**
 * Standard success envelope so every endpoint returns a predictable shape:
 * { success, message, data, meta }
 */
function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function paginate({ page = 1, limit = 20, total = 0 }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page: Number(page),
    limit: Number(limit),
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = { sendSuccess, paginate };

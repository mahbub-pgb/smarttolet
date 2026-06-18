'use strict';

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const config = require('../config');

/** 404 handler for unmatched routes. */
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Translate common library errors into ApiError, then render a clean body. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    // Mongoose / Mongo specific translations.
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((e) => ({ path: e.path, message: e.message }));
      error = ApiError.badRequest('Validation failed', { code: 'VALIDATION_ERROR', details });
    } else if (error.name === 'CastError') {
      error = ApiError.badRequest(`Invalid ${error.path}`, { code: 'CAST_ERROR' });
    } else if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0];
      error = ApiError.conflict(`Duplicate value for ${field}`, { code: 'DUPLICATE_KEY' });
    } else {
      error = ApiError.internal(error.message);
    }
  }

  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(`${error.statusCode} ${error.message}\n${err.stack}`);
  }

  const body = {
    success: false,
    message: error.message,
    code: error.code,
    details: error.details,
  };
  if (!config.isProd && error.statusCode >= 500) body.stack = err.stack;

  res.status(error.statusCode || 500).json(body);
}

module.exports = { notFound, errorHandler };

'use strict';

/**
 * Operational error carrying an HTTP status. Anything thrown that is NOT an
 * ApiError is treated as a programmer error (500) by the error middleware.
 */
class ApiError extends Error {
  constructor(statusCode, message, { code, details, isOperational = true } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || undefined;
    this.details = details || undefined;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', opts) {
    return new ApiError(400, msg, opts);
  }
  static unauthorized(msg = 'Unauthorized', opts) {
    return new ApiError(401, msg, opts);
  }
  static forbidden(msg = 'Forbidden', opts) {
    return new ApiError(403, msg, opts);
  }
  static notFound(msg = 'Resource not found', opts) {
    return new ApiError(404, msg, opts);
  }
  static conflict(msg = 'Conflict', opts) {
    return new ApiError(409, msg, opts);
  }
  static tooMany(msg = 'Too many requests', opts) {
    return new ApiError(429, msg, opts);
  }
  static internal(msg = 'Internal server error', opts) {
    return new ApiError(500, msg, { ...opts, isOperational: false });
  }
  static serviceUnavailable(msg = 'Service unavailable', opts) {
    return new ApiError(503, msg, opts);
  }
}

module.exports = ApiError;

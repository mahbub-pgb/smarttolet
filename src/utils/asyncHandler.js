'use strict';

/**
 * Wraps an async route handler so rejected promises flow to the Express error
 * middleware instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;

'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Validate req against a Zod schema shaped as { body?, query?, params? }.
 * Parsed (and coerced) values replace the originals so downstream handlers get
 * clean, typed data.
 */
function validate(schema) {
  return (req, _res, next) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.query) req.query = schema.query.parse(req.query);
      if (schema.params) req.params = schema.params.parse(req.params);
      next();
    } catch (err) {
      if (err.issues) {
        const details = err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        return next(ApiError.badRequest('Validation failed', { code: 'VALIDATION_ERROR', details }));
      }
      next(err);
    }
  };
}

module.exports = validate;

'use strict';

const { z, pagination, objectId } = require('./common.validation');

// Listing the library. Staff may pass scope=all to browse everyone's media;
// for everyone else the service forces the owner filter regardless of scope.
const list = {
  query: pagination.extend({
    scope: z.enum(['mine', 'all']).optional(),
  }),
};

// Bulk delete: a non-empty, capped list of media ids.
const bulkDelete = {
  body: z.object({
    ids: z.array(objectId).min(1, 'Select at least one image').max(100),
  }),
};

module.exports = { list, bulkDelete };

'use strict';

/**
 * Thin data-access wrapper around a Mongoose model. Services depend on
 * repositories (not models directly) so storage concerns stay isolated and the
 * model is easy to mock in tests.
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  create(data) {
    return this.model.create(data);
  }

  findById(id, projection, options) {
    return this.model.findById(id, projection, options);
  }

  findOne(filter, projection, options) {
    return this.model.findOne(filter, projection, options);
  }

  find(filter = {}, options = {}) {
    const { sort, skip, limit, projection, populate } = options;
    let q = this.model.find(filter, projection);
    if (sort) q = q.sort(sort);
    if (typeof skip === 'number') q = q.skip(skip);
    if (typeof limit === 'number') q = q.limit(limit);
    if (populate) q = q.populate(populate);
    return q;
  }

  count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  updateById(id, update, options = { new: true }) {
    return this.model.findByIdAndUpdate(id, update, options);
  }

  updateOne(filter, update, options = { new: true }) {
    return this.model.findOneAndUpdate(filter, update, options);
  }

  deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  /** Standard offset pagination returning { items, total }. */
  async paginate(filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 }, populate, projection } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.find(filter, { sort, skip, limit, populate, projection }),
      this.count(filter),
    ]);
    return { items, total };
  }
}

module.exports = BaseRepository;

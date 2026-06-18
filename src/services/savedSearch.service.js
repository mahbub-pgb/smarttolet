'use strict';

const { savedSearchRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');

class SavedSearchService {
  create(userId, { name, filters, notify }) {
    return savedSearchRepository.create({ user: userId, name, filters, notify });
  }

  list(userId) {
    return savedSearchRepository.find({ user: userId }, { sort: { createdAt: -1 } });
  }

  async remove(userId, id) {
    const doc = await savedSearchRepository.findOne({ _id: id, user: userId });
    if (!doc) throw ApiError.notFound('Saved search not found');
    await savedSearchRepository.deleteById(id);
  }
}

module.exports = new SavedSearchService();

'use strict';

const { favoriteRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');

class FavoriteService {
  async add(userId, listingId) {
    try {
      return await favoriteRepository.create({ user: userId, listing: listingId });
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('Already in favorites');
      throw err;
    }
  }

  async remove(userId, listingId) {
    await favoriteRepository.model.deleteOne({ user: userId, listing: listingId });
  }

  async list(userId, { page = 1, limit = 20 } = {}) {
    return favoriteRepository.paginate(
      { user: userId },
      { page, limit, populate: { path: 'listing' } },
    );
  }
}

module.exports = new FavoriteService();

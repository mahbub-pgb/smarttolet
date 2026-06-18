'use strict';

const BaseRepository = require('./base.repository');
const models = require('../models');

class UserRepository extends BaseRepository {
  findByMobile(mobile, projection) {
    return this.findOne({ mobile }, projection);
  }
  findByEmail(email, projection) {
    return this.findOne({ email: String(email).toLowerCase() }, projection);
  }
  /** Includes the normally-hidden password field for auth flows. */
  findForAuth(filter) {
    return this.model.findOne(filter).select('+password');
  }
}

class ListingRepository extends BaseRepository {}
class FavoriteRepository extends BaseRepository {}
class SavedSearchRepository extends BaseRepository {}
class ConversationRepository extends BaseRepository {}
class MessageRepository extends BaseRepository {}
class NotificationRepository extends BaseRepository {}
class ReportRepository extends BaseRepository {}
class SubscriptionRepository extends BaseRepository {}
class PaymentRepository extends BaseRepository {}
class AdvertisementRepository extends BaseRepository {}

module.exports = {
  userRepository: new UserRepository(models.User),
  listingRepository: new ListingRepository(models.Listing),
  favoriteRepository: new FavoriteRepository(models.Favorite),
  savedSearchRepository: new SavedSearchRepository(models.SavedSearch),
  conversationRepository: new ConversationRepository(models.Conversation),
  messageRepository: new MessageRepository(models.Message),
  notificationRepository: new NotificationRepository(models.Notification),
  reportRepository: new ReportRepository(models.Report),
  subscriptionRepository: new SubscriptionRepository(models.Subscription),
  paymentRepository: new PaymentRepository(models.Payment),
  advertisementRepository: new AdvertisementRepository(models.Advertisement),
};

'use strict';

const { notificationRepository } = require('../repositories');

/**
 * Persists notifications and (when the realtime layer is registered) pushes
 * them to the user's socket room. The emitter is injected by the socket setup
 * to avoid a circular dependency.
 */
class NotificationService {
  constructor() {
    this.emitter = null;
  }

  /** Called by sockets/index.js once io is ready. */
  registerEmitter(fn) {
    this.emitter = fn;
  }

  async notify(userId, { title, description, type, reference }) {
    const notification = await notificationRepository.create({
      user: userId,
      title,
      description,
      type,
      reference,
    });
    if (this.emitter) this.emitter(String(userId), 'notification:new', notification);
    return notification;
  }

  async list(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const filter = { user: userId };
    if (unreadOnly) filter.isRead = false;
    return notificationRepository.paginate(filter, { page, limit });
  }

  async markRead(userId, id) {
    return notificationRepository.updateOne({ _id: id, user: userId }, { isRead: true });
  }

  async markAllRead(userId) {
    await notificationRepository.model.updateMany(
      { user: userId, isRead: false },
      { isRead: true },
    );
  }

  unreadCount(userId) {
    return notificationRepository.count({ user: userId, isRead: false });
  }
}

module.exports = new NotificationService();

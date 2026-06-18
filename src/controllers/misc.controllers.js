'use strict';

/**
 * Compact controllers for the smaller modules (favorites, saved searches,
 * notifications, reports, chat, places). Each stays thin and delegates to a
 * service; grouped here to keep the file count manageable.
 */

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, paginate } = require('../utils/ApiResponse');

const favoriteService = require('../services/favorite.service');
const savedSearchService = require('../services/savedSearch.service');
const notificationService = require('../services/notification.service');
const reportService = require('../services/report.service');
const chatService = require('../services/chat.service');
const placesService = require('../services/places.service');

const meta = (req, total) => paginate({ page: req.query.page, limit: req.query.limit, total });

// ---- Favorites ----
exports.favorites = {
  add: asyncHandler(async (req, res) => {
    const fav = await favoriteService.add(req.user._id, req.params.id);
    sendSuccess(res, { statusCode: 201, message: 'Added to favorites', data: { fav } });
  }),
  remove: asyncHandler(async (req, res) => {
    await favoriteService.remove(req.user._id, req.params.id);
    sendSuccess(res, { message: 'Removed from favorites' });
  }),
  list: asyncHandler(async (req, res) => {
    const { items, total } = await favoriteService.list(req.user._id, req.query);
    sendSuccess(res, { data: { favorites: items }, meta: meta(req, total) });
  }),
};

// ---- Saved searches ----
exports.savedSearches = {
  create: asyncHandler(async (req, res) => {
    const s = await savedSearchService.create(req.user._id, req.body);
    sendSuccess(res, { statusCode: 201, message: 'Search saved', data: { savedSearch: s } });
  }),
  list: asyncHandler(async (req, res) => {
    const items = await savedSearchService.list(req.user._id);
    sendSuccess(res, { data: { savedSearches: items } });
  }),
  remove: asyncHandler(async (req, res) => {
    await savedSearchService.remove(req.user._id, req.params.id);
    sendSuccess(res, { message: 'Saved search removed' });
  }),
};

// ---- Notifications ----
exports.notifications = {
  list: asyncHandler(async (req, res) => {
    const { items, total } = await notificationService.list(req.user._id, {
      ...req.query,
      unreadOnly: req.query.unreadOnly === 'true',
    });
    sendSuccess(res, { data: { notifications: items }, meta: meta(req, total) });
  }),
  unreadCount: asyncHandler(async (req, res) => {
    const count = await notificationService.unreadCount(req.user._id);
    sendSuccess(res, { data: { count } });
  }),
  markRead: asyncHandler(async (req, res) => {
    await notificationService.markRead(req.user._id, req.params.id);
    sendSuccess(res, { message: 'Marked as read' });
  }),
  markAllRead: asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.user._id);
    sendSuccess(res, { message: 'All marked as read' });
  }),
};

// ---- Reports ----
exports.reports = {
  create: asyncHandler(async (req, res) => {
    const report = await reportService.create(req.user._id, req.params.id, req.body);
    sendSuccess(res, { statusCode: 201, message: 'Report submitted', data: { report } });
  }),
  list: asyncHandler(async (req, res) => {
    const { items, total } = await reportService.list(req.query);
    sendSuccess(res, { data: { reports: items }, meta: meta(req, total) });
  }),
  resolve: asyncHandler(async (req, res) => {
    const report = await reportService.resolve(req.params.id, req.user._id, req.body);
    sendSuccess(res, { message: 'Report resolved', data: { report } });
  }),
};

// ---- Chat (REST side; realtime handled in sockets) ----
exports.chat = {
  start: asyncHandler(async (req, res) => {
    const convo = await chatService.getOrCreateConversation(
      req.user._id,
      req.body.peerId,
      req.body.listingId,
    );
    sendSuccess(res, { message: 'Conversation ready', data: { conversation: convo } });
  }),
  listConversations: asyncHandler(async (req, res) => {
    const { items, total } = await chatService.listConversations(req.user._id, req.query);
    sendSuccess(res, { data: { conversations: items }, meta: meta(req, total) });
  }),
  getMessages: asyncHandler(async (req, res) => {
    const { items, total } = await chatService.getMessages(req.params.id, req.user._id, req.query);
    sendSuccess(res, { data: { messages: items }, meta: meta(req, total) });
  }),
  sendMessage: asyncHandler(async (req, res) => {
    const { message } = await chatService.sendMessage({
      conversationId: req.params.id,
      senderId: req.user._id,
      body: req.body.body,
      attachments: req.body.attachments,
    });
    sendSuccess(res, { statusCode: 201, message: 'Sent', data: { message } });
  }),
  markRead: asyncHandler(async (req, res) => {
    await chatService.markRead(req.params.id, req.user._id);
    sendSuccess(res, { message: 'Marked read' });
  }),
};

// ---- Places ----
exports.places = {
  nearby: asyncHandler(async (req, res) => {
    const categories = req.query.categories ? req.query.categories.split(',') : undefined;
    const nearby = await placesService.nearby(req.query.lat, req.query.lng, categories);
    sendSuccess(res, { data: { nearby } });
  }),
};

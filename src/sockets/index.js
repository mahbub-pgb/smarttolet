'use strict';

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/token');
const chatService = require('../services/chat.service');
const notificationService = require('../services/notification.service');
const { NOTIFICATION_TYPES } = require('../constants');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Realtime layer. Each authenticated socket joins a personal room `user:<id>`
 * so we can target a specific user for messages and notifications. Chat rooms
 * are keyed `conversation:<id>`.
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientUrl, credentials: true },
  });

  // JWT handshake auth.
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Lets the notification service push to a user's room.
  notificationService.registerEmitter((userId, event, payload) => {
    io.to(`user:${userId}`).emit(event, payload);
  });

  io.on('connection', (socket) => {
    const room = `user:${socket.userId}`;
    socket.join(room);
    logger.debug(`Socket connected: ${socket.id} (user ${socket.userId})`);

    // Join a conversation room to receive live messages.
    socket.on('conversation:join', async (conversationId, ack) => {
      try {
        await chatService.assertParticipant(conversationId, socket.userId);
        socket.join(`conversation:${conversationId}`);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Send a message in real time (also persisted).
    socket.on('message:send', async ({ conversationId, body, attachments }, ack) => {
      try {
        const { message, recipientId } = await chatService.sendMessage({
          conversationId,
          senderId: socket.userId,
          body,
          attachments,
        });

        io.to(`conversation:${conversationId}`).emit('message:new', message);
        // Notify recipient even if they aren't in the conversation room.
        io.to(`user:${recipientId}`).emit('conversation:updated', {
          conversationId,
          lastMessage: message,
        });
        await notificationService.notify(recipientId, {
          title: 'New message',
          description: body.slice(0, 80),
          type: NOTIFICATION_TYPES.NEW_MESSAGE,
          reference: { model: 'Conversation', id: conversationId },
        });
        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Delivery / read receipts.
    socket.on('message:delivered', async ({ messageId }) => {
      const msg = await chatService.markDelivered(messageId);
      if (msg) io.to(`user:${msg.sender}`).emit('message:status', { messageId, status: 'delivered' });
    });

    socket.on('conversation:read', async ({ conversationId }) => {
      await chatService.markRead(conversationId, socket.userId);
      socket.to(`conversation:${conversationId}`).emit('conversation:read', {
        conversationId,
        by: socket.userId,
      });
    });

    // Typing indicator.
    socket.on('typing', ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit('typing', {
        conversationId,
        userId: socket.userId,
        isTyping,
      });
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = { initSocket };

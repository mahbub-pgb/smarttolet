'use strict';

const { conversationRepository, messageRepository } = require('../repositories');
const { Conversation } = require('../models');
const ApiError = require('../utils/ApiError');
const { MESSAGE_STATUS } = require('../constants');

class ChatService {
  /** Find or create the 1:1 conversation between two users for a listing. */
  async getOrCreateConversation(userId, peerId, listingId) {
    if (String(userId) === String(peerId)) {
      throw ApiError.badRequest('Cannot start a conversation with yourself');
    }
    const participants = [userId, peerId];
    let convo = await conversationRepository.findOne({
      participants: { $all: participants, $size: 2 },
      listing: listingId || null,
    });
    if (!convo) {
      convo = await Conversation.create({ participants, listing: listingId });
    }
    return convo;
  }

  async assertParticipant(conversationId, userId) {
    const convo = await conversationRepository.findById(conversationId);
    if (!convo) throw ApiError.notFound('Conversation not found');
    if (!convo.participants.map(String).includes(String(userId))) {
      throw ApiError.forbidden('Not a participant of this conversation');
    }
    return convo;
  }

  async sendMessage({ conversationId, senderId, body, attachments }) {
    const convo = await this.assertParticipant(conversationId, senderId);
    const recipientId = convo.participants.map(String).find((p) => p !== String(senderId));

    const message = await messageRepository.create({
      conversation: conversationId,
      sender: senderId,
      recipient: recipientId,
      body,
      attachments,
      status: MESSAGE_STATUS.SENT,
    });

    convo.lastMessage = message._id;
    convo.lastMessageAt = new Date();
    const prev = convo.unread.get(String(recipientId)) || 0;
    convo.unread.set(String(recipientId), prev + 1);
    await convo.save();

    return { message, recipientId };
  }

  async listConversations(userId, { page = 1, limit = 20 } = {}) {
    return conversationRepository.paginate(
      { participants: userId },
      {
        page,
        limit,
        sort: { lastMessageAt: -1 },
        populate: [
          { path: 'participants', select: 'fullName profileImage' },
          { path: 'lastMessage' },
          { path: 'listing', select: 'title images' },
        ],
      },
    );
  }

  async getMessages(conversationId, userId, { page = 1, limit = 30 } = {}) {
    await this.assertParticipant(conversationId, userId);
    return messageRepository.paginate(
      { conversation: conversationId },
      { page, limit, sort: { createdAt: -1 } },
    );
  }

  /** Mark all messages in a conversation as read for the given user. */
  async markRead(conversationId, userId) {
    const convo = await this.assertParticipant(conversationId, userId);
    await messageRepository.model.updateMany(
      { conversation: conversationId, recipient: userId, status: { $ne: MESSAGE_STATUS.READ } },
      { status: MESSAGE_STATUS.READ, readAt: new Date() },
    );
    convo.unread.set(String(userId), 0);
    await convo.save();
    return true;
  }

  async markDelivered(messageId) {
    return messageRepository.updateOne(
      { _id: messageId, status: MESSAGE_STATUS.SENT },
      { status: MESSAGE_STATUS.DELIVERED },
    );
  }
}

module.exports = new ChatService();

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    // Exactly two participants for 1:1 chat.
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    // Conversations are scoped to a property when started from a listing.
    listing: { type: Schema.Types.ObjectId, ref: 'Listing' },

    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: { type: Date, index: true },

    // Per-user unread counters: { "<userId>": 3 }
    unread: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
);

// One conversation per participant-pair per listing. Participants are sorted
// before save so the pair key is stable regardless of who initiated.
conversationSchema.index(
  { participants: 1, listing: 1 },
  { unique: true },
);
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.pre('save', function sortParticipants(next) {
  if (this.isModified('participants')) {
    this.participants = [...this.participants]
      .map(String)
      .sort()
      .map((id) => new mongoose.Types.ObjectId(id));
  }
  next();
});

module.exports = mongoose.model('Conversation', conversationSchema);

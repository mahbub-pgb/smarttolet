'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Single-document collection (singleton) holding editable platform settings.
 * Secret-bearing fields are select:false so they are never returned to
 * clients by accident; the Settings service reads them explicitly.
 */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true, immutable: true },

    siteName: { type: String, default: 'Smart To-Let' },
    siteLogo: { type: String },
    supportEmail: { type: String },
    supportPhone: { type: String },

    googleMapsApiKey: { type: String, select: false },

    sms: {
      provider: { type: String, default: 'mock' },
      apiKey: { type: String, select: false },
      senderId: { type: String, default: 'SmartToLet' },
    },

    cloudinary: {
      cloudName: { type: String },
      apiKey: { type: String, select: false },
      apiSecret: { type: String, select: false },
    },

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Settings', settingsSchema);

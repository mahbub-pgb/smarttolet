'use strict';

const mongoose = require('mongoose');
const { REPORT_REASONS, REPORT_STATUS } = require('../constants');

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.OPEN,
      index: true,
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionNote: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

// A user can report a given listing only once.
reportSchema.index({ listing: 1, reporter: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);

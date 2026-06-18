'use strict';

const { reportRepository, listingRepository } = require('../repositories');
const notificationService = require('./notification.service');
const ApiError = require('../utils/ApiError');
const { REPORT_STATUS, LISTING_STATUS, NOTIFICATION_TYPES } = require('../constants');

class ReportService {
  async create(userId, listingId, { reason, description }) {
    const listing = await listingRepository.findById(listingId);
    if (!listing) throw ApiError.notFound('Listing not found');
    try {
      const report = await reportRepository.create({
        listing: listingId,
        reporter: userId,
        reason,
        description,
      });
      await listingRepository.updateById(listingId, { $inc: { reportsCount: 1 } });
      await notificationService.notify(listing.owner, {
        title: 'Your listing was reported',
        description: `"${listing.title}" received a report and may be reviewed.`,
        type: NOTIFICATION_TYPES.PROPERTY_REPORTED,
        reference: { model: 'Listing', id: listing._id },
      });
      return report;
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('You already reported this listing');
      throw err;
    }
  }

  list({ status, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (status) filter.status = status;
    return reportRepository.paginate(filter, {
      page,
      limit,
      populate: [
        { path: 'listing', select: 'title status owner' },
        { path: 'reporter', select: 'fullName mobile' },
      ],
    });
  }

  /** Resolve a report; optionally suspend the underlying listing. */
  async resolve(reportId, moderatorId, { status, note, suspendListing }) {
    const report = await reportRepository.findById(reportId);
    if (!report) throw ApiError.notFound('Report not found');

    report.status = status || REPORT_STATUS.RESOLVED;
    report.resolutionNote = note;
    report.resolvedBy = moderatorId;
    report.resolvedAt = new Date();
    await report.save();

    if (suspendListing) {
      await listingRepository.updateById(report.listing, { status: LISTING_STATUS.REJECTED });
    }
    return report;
  }
}

module.exports = new ReportService();

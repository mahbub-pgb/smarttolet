'use strict';

const { reportRepository, listingRepository, userRepository } = require('../repositories');
const notificationService = require('./notification.service');
const ApiError = require('../utils/ApiError');
const { REPORT_STATUS, LISTING_STATUS, NOTIFICATION_TYPES, ROLES } = require('../constants');

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
      await this.notifyAdminsOfReport(listing, reason);
      return report;
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('You already reported this listing');
      throw err;
    }
  }

  /**
   * Alert admins about a new report so it surfaces in their panel. An
   * "already_rented" report is phrased as a request to deactivate the listing.
   */
  async notifyAdminsOfReport(listing, reason) {
    const admins = await userRepository.find(
      { role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } },
      { projection: '_id' },
    );
    const isRented = reason === 'already_rented';
    await Promise.allSettled(
      admins.map((a) => notificationService.notify(a._id, {
        title: isRented ? 'Request: mark as rented' : 'New listing report',
        description: isRented
          ? `A user reported "${listing.title}" as already rented. Review it under Reports to approve.`
          : `"${listing.title}" was reported (${String(reason).replace(/_/g, ' ')}). See Reports.`,
        type: NOTIFICATION_TYPES.PROPERTY_REPORTED,
        reference: { model: 'Listing', id: listing._id },
      })),
    );
  }

  list({ status, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (status) filter.status = status;
    return reportRepository.paginate(filter, {
      page,
      limit,
      populate: [
        { path: 'listing', select: 'title slug status owner' },
        { path: 'reporter', select: 'fullName mobile' },
      ],
    });
  }

  /**
   * Resolve a report; optionally suspend (reject) or mark-rented the underlying
   * listing. `markRented` deactivates an approved listing in response to an
   * "already_rented" request and notifies the owner.
   */
  async resolve(reportId, moderatorId, { status, note, suspendListing, markRented }) {
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

    if (markRented) {
      const listing = await listingRepository.findById(report.listing);
      // Admin explicitly approved the request — deactivate any listing that
      // isn't already rented (or deleted).
      if (listing && listing.status !== LISTING_STATUS.RENTED) {
        listing.status = LISTING_STATUS.RENTED;
        await listing.save();
        await notificationService.notify(listing.owner, {
          title: 'Listing marked as rented',
          description: `"${listing.title}" was marked as rented following a report and is no longer publicly visible.`,
          type: NOTIFICATION_TYPES.LISTING_RENTED,
          reference: { model: 'Listing', id: listing._id },
        });
      }
    }
    return report;
  }
}

module.exports = new ReportService();

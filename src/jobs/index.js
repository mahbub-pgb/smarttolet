'use strict';

const subscriptionService = require('../services/subscription.service');
const listingService = require('../services/listing.service');
const { Listing } = require('../models');
const { LISTING_STATUS } = require('../constants');
const logger = require('../config/logger');

/**
 * Lightweight in-process scheduler using setInterval. For multi-instance
 * deployments, move these to a dedicated worker with a distributed lock (e.g.
 * BullMQ + Redis) so a job runs once cluster-wide.
 */
const timers = [];

function every(ms, fn, name) {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`Job "${name}" failed: ${err.message}`);
    }
  };
  timers.push(setInterval(run, ms));
}

function startJobs() {
  const HOUR = 60 * 60 * 1000;

  // Expire subscriptions whose endDate passed.
  every(HOUR, async () => {
    const n = await subscriptionService.expireDue();
    if (n) logger.info(`Expired ${n} subscriptions`);
  }, 'expireSubscriptions');

  // Expire approved listings past their expiresAt.
  every(HOUR, async () => {
    const res = await Listing.updateMany(
      { status: LISTING_STATUS.APPROVED, expiresAt: { $lt: new Date() } },
      { status: LISTING_STATUS.EXPIRED },
    );
    if (res.modifiedCount) logger.info(`Expired ${res.modifiedCount} listings`);
  }, 'expireListings');

  // Warn owners whose approved listings expire within the next few days.
  every(HOUR, async () => {
    const n = await listingService.warnExpiring(3);
    if (n) logger.info(`Sent ${n} listing-expiry warnings`);
  }, 'warnExpiringListings');

  logger.info('Background jobs scheduled');
}

function stopJobs() {
  timers.forEach(clearInterval);
}

module.exports = { startJobs, stopJobs };

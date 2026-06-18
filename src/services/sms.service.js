'use strict';

const settingsService = require('./settings.service');
const logger = require('../config/logger');

/**
 * SMS abstraction. The provider + API key are resolved from settings (DB ->
 * env). The 'mock' provider just logs, which is what runs in development.
 *
 * To add a real Bangladeshi gateway (e.g. SSL Wireless, Twilio, BulkSMSBD),
 * implement a sender keyed by provider name below.
 */
async function sendSms(to, message) {
  const { sms } = await settingsService.get();

  switch (sms.provider) {
    case 'mock':
    default:
      logger.info(`[SMS:mock -> ${to}] ${message}`);
      return { provider: 'mock', delivered: true };

    // Example wiring for a real provider:
    // case 'bulksmsbd': return bulkSmsBd.send({ apiKey: sms.apiKey, senderId: sms.senderId, to, message });
  }
}

module.exports = { sendSms };

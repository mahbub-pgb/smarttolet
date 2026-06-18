'use strict';

const settingsService = require('./settings.service');
const bulksmsbd = require('./bulksmsbd.service');
const logger = require('../config/logger');

/**
 * SMS abstraction. The provider + API key + sender id are resolved from
 * settings (DB -> env). 'mock' just logs (development default); 'bulksmsbd'
 * sends through the bulksmsbd.net gateway.
 */
async function sendSms(to, message) {
  const { sms } = await settingsService.get();

  switch (sms.provider) {
    case 'bulksmsbd':
      if (!sms.apiKey || !sms.senderId) {
        logger.error('[SMS] bulksmsbd selected but API key / sender id is not configured');
        return { provider: 'bulksmsbd', delivered: false };
      }
      return bulksmsbd.send({ apiKey: sms.apiKey, senderId: sms.senderId, to, message });

    case 'mock':
    default:
      logger.info(`[SMS:mock -> ${to}] ${message}`);
      return { provider: 'mock', delivered: true };
  }
}

/**
 * Send distinct messages to many recipients in a single request.
 * @param {Array<{to: string, message: string}>} messages
 */
async function sendManySms(messages = []) {
  if (!messages.length) return { delivered: true, count: 0 };
  const { sms } = await settingsService.get();

  if (sms.provider === 'bulksmsbd') {
    if (!sms.apiKey || !sms.senderId) {
      logger.error('[SMS] bulksmsbd selected but API key / sender id is not configured');
      return { provider: 'bulksmsbd', delivered: false };
    }
    return bulksmsbd.sendMany({ apiKey: sms.apiKey, senderId: sms.senderId, messages });
  }

  messages.forEach((m) => logger.info(`[SMS:mock -> ${m.to}] ${m.message}`));
  return { provider: 'mock', delivered: true, count: messages.length };
}

module.exports = { sendSms, sendManySms };

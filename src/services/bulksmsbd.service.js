'use strict';

const logger = require('../config/logger');

/**
 * BulkSMSBD (bulksmsbd.net) gateway client.
 *
 *  - single/broadcast: POST /api/smsapi    { api_key, senderid, number, message }
 *  - per-recipient:    POST /api/smsapimany { api_key, senderid, messages: [{to,message}] }
 *
 * Numbers must be in 8801XXXXXXXXX form (no leading +), so we strip it. A
 * successful submission returns response_code 202.
 */
const SINGLE_URL = 'http://bulksmsbd.net/api/smsapi';
const MANY_URL = 'http://bulksmsbd.net/api/smsapimany';

const fmt = (n) => String(n).replace(/^\+/, '');
const isAccepted = (data) => Number(data?.response_code) === 202;

async function post(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch (err) {
    // Network/gateway failure — never throw into the OTP flow.
    logger.error(`[SMS:bulksmsbd] request failed: ${err.message}`);
    return { error: err.message };
  }
}

/** Send one message (or a broadcast if `to` is an array of numbers). */
async function send({ apiKey, senderId, to, message }) {
  const number = Array.isArray(to) ? to.map(fmt).join(',') : fmt(to);
  const data = await post(SINGLE_URL, {
    api_key: apiKey,
    senderid: senderId,
    number,
    message,
  });
  const delivered = isAccepted(data);
  if (!delivered) logger.warn(`[SMS:bulksmsbd] not accepted: ${JSON.stringify(data)}`);
  return { provider: 'bulksmsbd', delivered, response: data };
}

/** Send different messages to different recipients in one call. */
async function sendMany({ apiKey, senderId, messages }) {
  const data = await post(MANY_URL, {
    api_key: apiKey,
    senderid: senderId,
    messages: messages.map((m) => ({ to: fmt(m.to), message: m.message })),
  });
  const delivered = isAccepted(data);
  if (!delivered) logger.warn(`[SMS:bulksmsbd many] not accepted: ${JSON.stringify(data)}`);
  return { provider: 'bulksmsbd', delivered, response: data };
}

module.exports = { send, sendMany };

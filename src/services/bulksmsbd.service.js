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
const BALANCE_URL = 'http://bulksmsbd.net/api/getBalance';

const fmt = (n) => String(n).replace(/^\+/, '');
const isAccepted = (data) => Number(data?.response_code) === 202;

// Gateway response_code -> human-readable meaning (per BulkSMSBD docs).
const RESPONSE_CODES = {
  202: 'SMS submitted successfully',
  1001: 'Invalid number',
  1002: 'Sender ID is not correct or is disabled',
  1003: 'Required fields missing — contact your system administrator',
  1005: 'Internal gateway error',
  1006: 'Balance validity not available',
  1007: 'Insufficient balance',
  1011: 'User ID not found',
  1012: 'Masking SMS must be sent in Bengali',
  1013: 'Sender ID has no gateway for this API key',
  1014: 'Sender type name not found for this sender/API key',
  1015: 'Sender ID has no valid gateway for this API key',
  1016: 'Sender type active price info not found for this sender ID',
  1017: 'Sender type price info not found for this sender ID',
  1018: 'The owner of this account is disabled',
  1019: 'The price of this account is disabled',
  1020: 'The parent of this account was not found',
  1021: 'The parent active price of this account was not found',
  1031: 'Account not verified — contact administrator',
  1032: 'IP not whitelisted for this API key',
};

/** Map a gateway payload to { code, message }. */
function describe(data) {
  const code = Number(data?.response_code);
  if (Number.isFinite(code)) {
    return { code, message: RESPONSE_CODES[code] || `Gateway returned code ${code}` };
  }
  return { code: null, message: data?.error || 'Unknown gateway response' };
}

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
  const { code, message: reason } = describe(data);
  if (!delivered) logger.warn(`[SMS:bulksmsbd] not accepted (${code}): ${reason}`);
  return { provider: 'bulksmsbd', delivered, code, message: reason, response: data };
}

/** Send different messages to different recipients in one call. */
async function sendMany({ apiKey, senderId, messages }) {
  const data = await post(MANY_URL, {
    api_key: apiKey,
    senderid: senderId,
    messages: messages.map((m) => ({ to: fmt(m.to), message: m.message })),
  });
  const delivered = isAccepted(data);
  const { code, message: reason } = describe(data);
  if (!delivered) logger.warn(`[SMS:bulksmsbd many] not accepted (${code}): ${reason}`);
  return { provider: 'bulksmsbd', delivered, code, message: reason, response: data };
}

/** Query the remaining account balance. Returns { balance: Number|null }. */
async function getBalance({ apiKey }) {
  try {
    const res = await fetch(`${BALANCE_URL}?api_key=${encodeURIComponent(apiKey)}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    const balance = data?.balance != null ? Number(data.balance) : null;
    return { balance: Number.isFinite(balance) ? balance : null, response: data };
  } catch (err) {
    logger.error(`[SMS:bulksmsbd] balance request failed: ${err.message}`);
    return { balance: null, error: err.message };
  }
}

module.exports = { send, sendMany, getBalance };

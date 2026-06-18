'use strict';

const crypto = require('crypto');
const config = require('../config');

/**
 * Cryptographically-random numeric OTP of configured length.
 */
function generateOtp(length = config.otp.length) {
  const max = 10 ** length;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(length, '0');
}

/**
 * Hash an OTP before storing in Redis so a Redis dump never leaks live codes.
 */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function verifyOtpHash(otp, hash) {
  const a = Buffer.from(hashOtp(otp));
  const b = Buffer.from(hash || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { generateOtp, hashOtp, verifyOtpHash };

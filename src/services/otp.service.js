'use strict';

const { redis } = require('../config/redis');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { generateOtp, hashOtp, verifyOtpHash } = require('../utils/otp');
const { sendSms } = require('./sms.service');
const logger = require('../config/logger');

const otpKey = (purpose, identifier) => `otp:${purpose}:${identifier}`;
const cooldownKey = (purpose, identifier) => `otp:cd:${purpose}:${identifier}`;

/**
 * OTP lifecycle backed entirely by Redis with TTL expiry. We store only the
 * SHA-256 hash of the code plus an attempt counter so brute-forcing is bounded.
 */
class OtpService {
  /**
   * Generate + send an OTP. Enforces a resend cooldown per identifier.
   * @param {string} purpose e.g. 'phone_verify'
   * @param {string} identifier e.g. a mobile number
   */
  async requestOtp(purpose, identifier) {
    const cd = await redis.ttl(cooldownKey(purpose, identifier));
    if (cd > 0) {
      throw ApiError.tooMany(`Please wait ${cd}s before requesting another code`, {
        code: 'OTP_COOLDOWN',
        details: { retryAfter: cd },
      });
    }

    const otp = generateOtp();
    const payload = JSON.stringify({ hash: hashOtp(otp), attempts: 0 });

    await redis
      .multi()
      .set(otpKey(purpose, identifier), payload, 'EX', config.otp.expirySeconds)
      .set(cooldownKey(purpose, identifier), '1', 'EX', config.otp.resendCooldownSeconds)
      .exec();

    await sendSms(identifier, `Your Smart To-Let verification code is ${otp}. It expires in ${
      config.otp.expirySeconds / 60
    } minutes.`);

    // Surface OTP in dev so testing doesn't require a real SMS gateway.
    const debug = config.isProd ? undefined : otp;
    if (debug) logger.debug(`[OTP] ${purpose} ${identifier} => ${otp}`);

    return { expiresIn: config.otp.expirySeconds, devOtp: debug };
  }

  /**
   * Verify a submitted code. Consumes the OTP on success; counts attempts and
   * locks out after the configured maximum on failure.
   */
  async verifyOtp(purpose, identifier, code) {
    const key = otpKey(purpose, identifier);
    const raw = await redis.get(key);
    if (!raw) {
      throw ApiError.badRequest('Code expired or not requested', { code: 'OTP_EXPIRED' });
    }

    const data = JSON.parse(raw);
    if (data.attempts >= config.otp.maxAttempts) {
      await redis.del(key);
      throw ApiError.tooMany('Too many attempts. Request a new code.', {
        code: 'OTP_LOCKED',
      });
    }

    if (!verifyOtpHash(code, data.hash)) {
      data.attempts += 1;
      const ttl = await redis.ttl(key);
      await redis.set(key, JSON.stringify(data), 'EX', Math.max(ttl, 1));
      throw ApiError.badRequest('Invalid verification code', {
        code: 'OTP_INVALID',
        details: { attemptsLeft: config.otp.maxAttempts - data.attempts },
      });
    }

    await redis.del(key);
    return true;
  }
}

module.exports = new OtpService();

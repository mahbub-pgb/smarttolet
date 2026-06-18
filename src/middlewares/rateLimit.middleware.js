'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

function makeLimiter({ windowMs, max, prefix, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: message || 'Too many requests, slow down.' },
    store: new RedisStore({
      // ioredis call signature
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${prefix}:`,
    }),
  });
}

// Generous global limiter applied to all API traffic.
const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  prefix: 'global',
});

// Tight limiter for auth + OTP endpoints to deter brute force / SMS abuse.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: 'auth',
  message: 'Too many attempts. Please try again later.',
});

const otpLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  prefix: 'otp',
  message: 'OTP request limit reached. Try again later.',
});

module.exports = { globalLimiter, authLimiter, otpLimiter, makeLimiter };

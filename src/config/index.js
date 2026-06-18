'use strict';

require('dotenv').config();

function required(key, fallback) {
  const val = process.env[key] ?? fallback;
  if (val === undefined || val === '') {
    // Secrets must exist outside development.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
  return val;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  // Public base URL of this server (used to build local upload URLs in dev).
  serverUrl: process.env.SERVER_URL || `http://localhost:${Number(process.env.PORT || 5000)}`,

  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/smart_tolet'),
  redisUrl: required('REDIS_URL', 'redis://127.0.0.1:6379'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  otp: {
    expirySeconds: Number(process.env.OTP_EXPIRY_SECONDS || 300),
    length: Number(process.env.OTP_LENGTH || 6),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    // Min seconds between OTP requests for the same number.
    resendCooldownSeconds: 60,
    // Fixed code used in non-production so testing needs no live SMS gateway.
    testCode: process.env.OTP_TEST_CODE || '123456',
  },

  bcryptRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12),

  // Fallbacks only. Live values are read from the Settings collection.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  sms: {
    provider: process.env.SMS_PROVIDER || 'mock',
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID || 'SmartToLet',
  },

  superAdmin: {
    mobile: process.env.SUPER_ADMIN_MOBILE || '+8801700000000',
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@smarttolet.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!',
  },
};

module.exports = config;

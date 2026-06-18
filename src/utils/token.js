'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

const TOKEN_TYPES = { ACCESS: 'access', REFRESH: 'refresh' };

function signAccessToken(payload) {
  return jwt.sign({ ...payload, type: TOKEN_TYPES.ACCESS }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
}

function signRefreshToken(payload) {
  return jwt.sign({ ...payload, type: TOKEN_TYPES.REFRESH }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

/**
 * Issue both tokens for a user document.
 */
function issueTokenPair(user) {
  const payload = { sub: String(user._id), role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

module.exports = {
  TOKEN_TYPES,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  issueTokenPair,
};

'use strict';

const { verifyAccessToken } = require('../utils/token');
const { userRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ACCOUNT_STATUS } = require('../constants');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

/** Require a valid access token; attaches req.user. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required', { code: 'NO_TOKEN' });

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token', { code: 'TOKEN_INVALID' });
  }

  const user = await userRepository.findById(decoded.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status === ACCOUNT_STATUS.SUSPENDED) {
    throw ApiError.forbidden('Account suspended', { code: 'ACCOUNT_SUSPENDED' });
  }
  req.user = user;
  req.token = token;
  next();
});

/** Attach req.user when a token is present, but don't fail if it's missing. */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = verifyAccessToken(token);
    req.user = await userRepository.findById(decoded.sub);
  } catch {
    /* ignore — treat as anonymous */
  }
  next();
});

module.exports = { authenticate, optionalAuth };

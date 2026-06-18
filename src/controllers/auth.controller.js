'use strict';

const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const config = require('../config');

const refreshCookieOpts = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

function setAuthCookies(res, tokens) {
  res.cookie('refreshToken', tokens.refreshToken, refreshCookieOpts);
}

exports.requestOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestPhoneOtp(req.body.mobile);
  sendSuccess(res, { message: 'OTP sent', data: result });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { mobile, code } = req.body;
  const { user, tokens, profileComplete } = await authService.verifyPhoneOtp(mobile, code);
  setAuthCookies(res, tokens);
  sendSuccess(res, {
    message: 'Phone verified',
    data: { user, tokens, profileComplete },
  });
});

exports.completeProfile = asyncHandler(async (req, res) => {
  const user = await authService.completeProfile(req.user._id, req.body);
  sendSuccess(res, { message: 'Profile updated', data: { user } });
});

exports.uploadAvatar = asyncHandler(async (req, res) => {
  const user = await authService.updateAvatar(req.user._id, req.file);
  sendSuccess(res, { message: 'Profile image updated', data: { user } });
});

exports.login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body);
  setAuthCookies(res, tokens);
  sendSuccess(res, { message: 'Logged in', data: { user, tokens } });
});

exports.refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  const tokens = await authService.refresh(token);
  setAuthCookies(res, tokens);
  sendSuccess(res, { message: 'Token refreshed', data: { tokens } });
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id);
  res.clearCookie('refreshToken', { path: '/' });
  sendSuccess(res, { message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { user: req.user } });
});

exports.changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  sendSuccess(res, { message: 'Password changed' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body.mobile);
  sendSuccess(res, {
    message: 'If that mobile is registered, a reset code has been sent.',
    data: result,
  });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  sendSuccess(res, { message: 'Password reset. You can now sign in.' });
});

exports.requestEmailOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestEmailOtp(req.user._id);
  sendSuccess(res, { message: 'Email OTP sent', data: result });
});

exports.verifyEmailOtp = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmailOtp(req.user._id, req.body.code);
  sendSuccess(res, { message: 'Email verified', data: { user } });
});

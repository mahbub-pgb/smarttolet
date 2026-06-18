'use strict';

const { z, bdMobile, normalizeBdMobile } = require('./common.validation');
const { GENDER } = require('../constants');

const requestOtp = { body: z.object({ mobile: bdMobile }) };

const verifyOtp = {
  body: z.object({
    mobile: bdMobile,
    code: z.string().regex(/^\d{4,8}$/, 'Invalid code'),
  }),
};

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/\d/, 'Must include a number');

const completeProfile = {
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().optional(),
    profileImage: z.string().url().optional(),
    dateOfBirth: z.coerce.date().optional(),
    gender: z.enum(Object.values(GENDER)).optional(),
    occupation: z.string().max(100).optional(),
    nationalId: z.string().max(40).optional(),
    address: z.string().max(300).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    preferredDivision: z.string().optional(),
    preferredDistrict: z.string().optional(),
    preferredArea: z.string().optional(),
    password: password.optional(),
  }),
};

const login = {
  body: z.object({
    // mobile or email — a mobile is canonicalised so users can omit +88.
    identifier: z
      .string()
      .min(3)
      .transform((v) => (v.includes('@') ? v : normalizeBdMobile(v))),
    password: z.string().min(1),
  }),
};

const refresh = {
  body: z.object({ refreshToken: z.string().optional() }),
};

const verifyEmail = {
  body: z.object({ code: z.string().regex(/^\d{4,8}$/) }),
};

// Authenticated user changing their own password. currentPassword is optional
// because OTP-only accounts may not have one set yet.
const changePassword = {
  body: z.object({
    currentPassword: z.string().min(1).optional(),
    newPassword: password,
  }),
};

// Forgot-password via phone OTP.
const forgotPassword = { body: z.object({ mobile: bdMobile }) };

const resetPassword = {
  body: z.object({
    mobile: bdMobile,
    code: z.string().regex(/^\d{4,8}$/, 'Invalid code'),
    newPassword: password,
  }),
};

module.exports = {
  requestOtp, verifyOtp, completeProfile, login, refresh, verifyEmail,
  changePassword, forgotPassword, resetPassword,
};

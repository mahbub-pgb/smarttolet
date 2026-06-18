'use strict';

const { z, bdMobile } = require('./common.validation');
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
    identifier: z.string().min(3), // mobile or email
    password: z.string().min(1),
  }),
};

const refresh = {
  body: z.object({ refreshToken: z.string().optional() }),
};

const verifyEmail = {
  body: z.object({ code: z.string().regex(/^\d{4,8}$/) }),
};

module.exports = { requestOtp, verifyOtp, completeProfile, login, refresh, verifyEmail };

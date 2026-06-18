'use strict';

const { z, objectId, idParam, pagination, bdMobile } = require('./common.validation');
const {
  SUBSCRIPTION_PLANS, PAYMENT_METHODS, REPORT_STATUS, ROLES, ACCOUNT_STATUS, GENDER,
} = require('../constants');

// Shared strong-password rule (min 8, with upper, lower and a number).
const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/\d/, 'Must include a number');

const savedSearch = {
  create: {
    body: z.object({
      name: z.string().max(120).optional(),
      filters: z.record(z.any()).default({}),
      notify: z.boolean().optional(),
    }),
  },
};

const chat = {
  startConversation: {
    body: z.object({
      peerId: objectId,
      listingId: objectId.optional(),
    }),
  },
  sendMessage: {
    params: z.object({ id: objectId }),
    body: z.object({
      body: z.string().min(1).max(4000),
      attachments: z.array(z.object({ url: z.string().url(), type: z.string() })).optional(),
    }),
  },
};

const payment = {
  initiate: {
    body: z.object({
      plan: z.enum([SUBSCRIPTION_PLANS.PREMIUM, SUBSCRIPTION_PLANS.FEATURED]),
      method: z.enum(Object.values(PAYMENT_METHODS)),
    }),
  },
  verify: {
    body: z.object({
      paymentRef: z.string(),
      transactionId: z.string(),
      gatewayResponse: z.any().optional(),
    }),
  },
};

const settings = {
  update: {
    body: z.object({
      siteName: z.string().optional(),
      siteLogo: z.string().url().optional(),
      supportEmail: z.string().email().optional(),
      supportPhone: z.string().optional(),
      googleMapsApiKey: z.string().optional(),
      mapDefaultZoom: z.coerce.number().int().min(1).max(20).optional(),
      listingExpiry: z
        .object({
          value: z.coerce.number().int().min(0).max(3650),
          unit: z.enum(['days', 'months']),
        })
        .partial()
        .optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      sms: z
        .object({ provider: z.string(), apiKey: z.string(), senderId: z.string() })
        .partial()
        .optional(),
      passwordChangeSms: z
        .object({ enabled: z.boolean(), template: z.string().max(480) })
        .partial()
        .optional(),
      cloudinary: z
        .object({ cloudName: z.string(), apiKey: z.string(), apiSecret: z.string() })
        .partial()
        .optional(),
    }),
  },
};

const user = {
  create: {
    body: z.object({
      fullName: z.string().min(2).max(120),
      mobile: bdMobile,
      email: z.string().email().optional(),
      password: passwordRule,
      role: z.enum(Object.values(ROLES)).optional(),
    }),
  },
  // Admin editing an existing account. Every field is optional; password is
  // only changed when a non-empty value is supplied.
  update: {
    params: idParam,
    body: z.object({
      fullName: z.string().min(2).max(120).optional(),
      mobile: bdMobile.optional(),
      email: z.string().email().optional(),
      password: passwordRule.optional(),
      role: z.enum(Object.values(ROLES)).optional(),
      status: z.enum(Object.values(ACCOUNT_STATUS)).optional(),
      isLandlordVerified: z.boolean().optional(),
      occupation: z.string().max(100).optional(),
      address: z.string().max(300).optional(),
      gender: z.enum(Object.values(GENDER)).optional(),
      dateOfBirth: z.coerce.date().optional(),
    }),
  },
};

const report = {
  resolve: {
    params: idParam,
    body: z.object({
      status: z.enum(Object.values(REPORT_STATUS)).optional(),
      note: z.string().max(1000).optional(),
      suspendListing: z.boolean().optional(),
    }),
  },
};

const nearby = {
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    categories: z.string().optional(), // comma-separated
  }),
};

module.exports = { savedSearch, chat, payment, settings, user, report, nearby, pagination, idParam };

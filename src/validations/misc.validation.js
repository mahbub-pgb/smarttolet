'use strict';

const { z, objectId, idParam, pagination } = require('./common.validation');
const { SUBSCRIPTION_PLANS, PAYMENT_METHODS, REPORT_STATUS } = require('../constants');

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
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      sms: z
        .object({ provider: z.string(), apiKey: z.string(), senderId: z.string() })
        .partial()
        .optional(),
      cloudinary: z
        .object({ cloudName: z.string(), apiKey: z.string(), apiSecret: z.string() })
        .partial()
        .optional(),
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

module.exports = { savedSearch, chat, payment, settings, report, nearby, pagination, idParam };

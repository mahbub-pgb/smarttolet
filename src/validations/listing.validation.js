'use strict';

const { z, objectId, idParam, pagination } = require('./common.validation');
const {
  LISTING_TYPES, LISTING_STATUS, FURNISHED_STATUS, REPORT_REASONS,
} = require('../constants');

// multipart/form-data sends everything as strings; coerce booleans/numbers.
const boolish = z.preprocess((v) => {
  if (typeof v === 'string') return v === 'true' || v === '1';
  return v;
}, z.boolean());

// multipart/form-data cannot carry nested objects, so the client sends them as
// JSON strings. Parse those back into objects before the object schema runs.
const jsonObject = (schema) =>
  z.preprocess((v) => {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  }, schema);

const detailsSchema = z
  .object({
    bedrooms: z.coerce.number().int().min(0).optional(),
    bathrooms: z.coerce.number().int().min(0).optional(),
    balconies: z.coerce.number().int().min(0).optional(),
    floorNumber: z.coerce.number().int().min(0).optional(),
    buildingFloors: z.coerce.number().int().min(0).optional(),
    areaSqft: z.coerce.number().min(0).optional(),
    parkingAvailable: boolish.optional(),
    liftAvailable: boolish.optional(),
    generatorAvailable: boolish.optional(),
    furnishedStatus: z.enum(Object.values(FURNISHED_STATUS)).optional(),
  })
  .optional();

const utilitiesSchema = z
  .object({
    electricity: boolish.optional(),
    gas: boolish.optional(),
    water: boolish.optional(),
    internet: boolish.optional(),
    securityGuard: boolish.optional(),
    cctv: boolish.optional(),
  })
  .optional();

const locationSchema = z.object({
  division: z.string().optional(),
  district: z.string().optional(),
  upazila: z.string().optional(),
  area: z.string().optional(),
  road: z.string().optional(),
  houseNumber: z.string().optional(),
  formattedAddress: z.string().optional(),
});

const create = {
  body: z.object({
    type: z.enum(LISTING_TYPES),
    title: z.string().min(5).max(150),
    description: z.string().min(20).max(5000),
    monthlyRent: z.coerce.number().min(0),
    advanceAmount: z.coerce.number().min(0).optional(),
    serviceCharge: z.coerce.number().min(0).optional(),
    availableFrom: z.coerce.date().optional(),
    details: jsonObject(detailsSchema),
    utilities: jsonObject(utilitiesSchema),
    location: jsonObject(locationSchema),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    videoTourUrl: z.string().url().optional(),
    tour360Url: z.string().url().optional(),
    contact: jsonObject(
      z
        .object({
          person: z.string().optional(),
          phone: z.string().optional(),
          whatsapp: z.string().optional(),
        })
        .optional(),
    ),
    status: z.enum([LISTING_STATUS.DRAFT, LISTING_STATUS.PENDING]).optional(),
  }),
};

const update = {
  params: idParam,
  body: create.body.partial(),
};

const search = {
  query: pagination.extend({
    keyword: z.string().optional(),
    type: z.enum(LISTING_TYPES).optional(),
    division: z.string().optional(),
    district: z.string().optional(),
    upazila: z.string().optional(),
    area: z.string().optional(),
    minRent: z.coerce.number().optional(),
    maxRent: z.coerce.number().optional(),
    bedrooms: z.coerce.number().optional(),
    furnishedStatus: z.enum(Object.values(FURNISHED_STATUS)).optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    radiusKm: z.coerce.number().optional(),
    sort: z.enum(['newest', 'rent_asc', 'rent_desc']).optional(),
  }),
};

const moderate = {
  params: idParam,
  body: z.object({
    approve: z.boolean(),
    reason: z.string().max(500).optional(),
  }),
};

const report = {
  params: idParam,
  body: z.object({
    reason: z.enum(REPORT_REASONS),
    description: z.string().max(1000).optional(),
  }),
};

module.exports = { create, update, search, moderate, report, idParam, objectId };

'use strict';

const roles = require('./roles');

const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
  DELETED: 'deleted',
});

const GENDER = Object.freeze({
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
});

const LISTING_TYPES = Object.freeze([
  'apartment',
  'flat',
  'family_house',
  'bachelor_room',
  'sublet',
  'hostel',
  'mess',
  'office',
  'shop',
  'commercial_space',
]);

const FURNISHED_STATUS = Object.freeze({
  FURNISHED: 'furnished',
  SEMI_FURNISHED: 'semi_furnished',
  UNFURNISHED: 'unfurnished',
});

const LISTING_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RENTED: 'rented',
  EXPIRED: 'expired',
});

const REPORT_REASONS = Object.freeze([
  'fake_listing',
  'wrong_information',
  'scam',
  'duplicate_listing',
  'other',
]);

const REPORT_STATUS = Object.freeze({
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
});

const SUBSCRIPTION_PLANS = Object.freeze({
  FREE: 'free',
  PREMIUM: 'premium',
  FEATURED: 'featured',
});

const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
});

const PAYMENT_METHODS = Object.freeze({
  BKASH: 'bkash',
  NAGAD: 'nagad',
  ROCKET: 'rocket',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

const NOTIFICATION_TYPES = Object.freeze({
  LISTING_APPROVED: 'listing_approved',
  LISTING_REJECTED: 'listing_rejected',
  LISTING_EXPIRING: 'listing_expiring',
  NEW_MESSAGE: 'new_message',
  PROPERTY_REPORTED: 'property_reported',
  SUBSCRIPTION_EXPIRY: 'subscription_expiry',
  PAYMENT_SUCCESS: 'payment_success',
});

const MESSAGE_STATUS = Object.freeze({
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
});

// Plan -> max active (non-draft) listings allowed.
const PLAN_LISTING_LIMITS = Object.freeze({
  [SUBSCRIPTION_PLANS.FREE]: 3,
  [SUBSCRIPTION_PLANS.PREMIUM]: 25,
  [SUBSCRIPTION_PLANS.FEATURED]: 100,
});

module.exports = {
  ...roles,
  ACCOUNT_STATUS,
  GENDER,
  LISTING_TYPES,
  FURNISHED_STATUS,
  LISTING_STATUS,
  REPORT_REASONS,
  REPORT_STATUS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  NOTIFICATION_TYPES,
  MESSAGE_STATUS,
  PLAN_LISTING_LIMITS,
};

'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { reports } = require('../controllers/misc.controllers');
const { authenticate } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { PERMISSIONS } = require('../constants');
const v = require('../validations/listing.validation');
const m = require('../validations/misc.validation');
const { idParam } = require('../validations/common.validation');

// All admin routes require an authenticated staff member.
router.use(authenticate);

// Analytics
router.get('/dashboard', requirePermission(PERMISSIONS.VIEW_ANALYTICS), ctrl.dashboard);
router.get('/charts', requirePermission(PERMISSIONS.VIEW_ANALYTICS), ctrl.charts);

// User & staff management
router.get('/users', requirePermission(PERMISSIONS.MANAGE_USERS), ctrl.listUsers);
router.patch(
  '/users/:id/status',
  requirePermission(PERMISSIONS.SUSPEND_ACCOUNTS),
  validate({ params: idParam }),
  ctrl.setUserStatus,
);
router.patch(
  '/users/:id/role',
  requirePermission(PERMISSIONS.MANAGE_MODERATORS),
  validate({ params: idParam }),
  ctrl.setUserRole,
);
router.patch(
  '/users/:id/verify-landlord',
  requirePermission(PERMISSIONS.VERIFY_LANDLORDS),
  validate({ params: idParam }),
  ctrl.verifyLandlord,
);

// Listing moderation
router.get('/listings/queue', requirePermission(PERMISSIONS.REVIEW_LISTINGS), ctrl.moderationQueue);
router.patch(
  '/listings/:id/moderate',
  requirePermission(PERMISSIONS.APPROVE_LISTINGS),
  validate(v.moderate),
  ctrl.moderateListing,
);

// Reports
router.get('/reports', requirePermission(PERMISSIONS.MANAGE_REPORTS), reports.list);
router.patch(
  '/reports/:id/resolve',
  requirePermission(PERMISSIONS.RESOLVE_REPORTS),
  validate(m.report.resolve),
  reports.resolve,
);

// Payments
router.get('/payments', requirePermission(PERMISSIONS.MANAGE_PAYMENTS), ctrl.listPayments);

// Settings (Google Maps key, SMS, Cloudinary, maintenance, etc.)
router.get('/settings', requirePermission(PERMISSIONS.MANAGE_SETTINGS), ctrl.getSettings);
router.put(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(m.settings.update),
  ctrl.updateSettings,
);

module.exports = router;

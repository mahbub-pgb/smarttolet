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

/**
 * @openapi
 * /admin/dashboard:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard analytics summary
 *     responses:
 *       200: { description: Dashboard metrics, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/dashboard', requirePermission(PERMISSIONS.VIEW_ANALYTICS), ctrl.dashboard);

/**
 * @openapi
 * /admin/charts:
 *   get:
 *     tags: [Admin]
 *     summary: Time-series chart data
 *     responses:
 *       200: { description: Chart data, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/charts', requirePermission(PERMISSIONS.VIEW_ANALYTICS), ctrl.charts);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users
 *     responses:
 *       200: { description: Users, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/users', requirePermission(PERMISSIONS.MANAGE_USERS), ctrl.listUsers);

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new user account
 *     responses:
 *       201: { description: User created, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Mobile or email already in use, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.post('/users', requirePermission(PERMISSIONS.MANAGE_USERS), validate(m.user.create), ctrl.createUser);

/**
 * @openapi
 * /admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update any field of a user account (including password)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: User updated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Mobile or email already in use, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.patch('/users/:id', requirePermission(PERMISSIONS.MANAGE_USERS), validate(m.user.update), ctrl.updateUser);

/**
 * @openapi
 * /admin/users/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Suspend or reactivate a user
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Status updated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/users/:id/status',
  requirePermission(PERMISSIONS.SUSPEND_ACCOUNTS),
  validate(m.user.setStatus),
  ctrl.setUserStatus,
);

/**
 * @openapi
 * /admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Change a user's role
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Role updated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/users/:id/role',
  requirePermission(PERMISSIONS.MANAGE_MODERATORS),
  validate(m.user.setRole),
  ctrl.setUserRole,
);

/**
 * @openapi
 * /admin/users/{id}/verify-landlord:
 *   patch:
 *     tags: [Admin]
 *     summary: Verify a landlord account
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Landlord verified, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/users/:id/verify-landlord',
  requirePermission(PERMISSIONS.VERIFY_LANDLORDS),
  validate({ params: idParam }),
  ctrl.verifyLandlord,
);

/**
 * @openapi
 * /admin/listings/queue:
 *   get:
 *     tags: [Admin]
 *     summary: Listings pending moderation
 *     responses:
 *       200: { description: Moderation queue, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/listings/queue', requirePermission(PERMISSIONS.REVIEW_LISTINGS), ctrl.moderationQueue);

/**
 * @openapi
 * /admin/listings/{id}/moderate:
 *   patch:
 *     tags: [Admin]
 *     summary: Approve or reject a listing
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing moderated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/listings/:id/moderate',
  requirePermission(PERMISSIONS.APPROVE_LISTINGS),
  validate(v.moderate),
  ctrl.moderateListing,
);

/**
 * @openapi
 * /admin/listings/bulk-delete:
 *   post:
 *     tags: [Admin]
 *     summary: Delete several listings at once (any owner)
 *     responses:
 *       200: { description: Listings deleted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/listings/bulk-delete',
  requirePermission(PERMISSIONS.MANAGE_LISTINGS),
  validate(v.bulkDelete),
  ctrl.bulkDeleteListings,
);

/**
 * @openapi
 * /admin/listings/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete any listing (and its images); notifies the owner
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing deleted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.delete(
  '/listings/:id',
  requirePermission(PERMISSIONS.MANAGE_LISTINGS),
  validate({ params: idParam }),
  ctrl.deleteListing,
);

/**
 * @openapi
 * /admin/reports:
 *   get:
 *     tags: [Admin]
 *     summary: List user-submitted reports
 *     responses:
 *       200: { description: Reports, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/reports', requirePermission(PERMISSIONS.MANAGE_REPORTS), reports.list);

/**
 * @openapi
 * /admin/reports/{id}/resolve:
 *   patch:
 *     tags: [Admin]
 *     summary: Resolve a report
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Report resolved, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/reports/:id/resolve',
  requirePermission(PERMISSIONS.RESOLVE_REPORTS),
  validate(m.report.resolve),
  reports.resolve,
);

/**
 * @openapi
 * /admin/payments:
 *   get:
 *     tags: [Admin]
 *     summary: List payments
 *     responses:
 *       200: { description: Payments, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/payments', requirePermission(PERMISSIONS.MANAGE_PAYMENTS), ctrl.listPayments);

/**
 * @openapi
 * /admin/sms/balance:
 *   get:
 *     tags: [Admin]
 *     summary: Remaining SMS gateway balance
 *     responses:
 *       200: { description: Balance, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/sms/balance', requirePermission(PERMISSIONS.MANAGE_SETTINGS), ctrl.smsBalance);

/**
 * @openapi
 * /admin/sms/promotion:
 *   post:
 *     tags: [Admin]
 *     summary: Send a promotional SMS to one or more numbers
 *     responses:
 *       200: { description: Sent, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/sms/promotion',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(m.sms.promotion),
  ctrl.sendPromotion,
);

/**
 * @openapi
 * /admin/sms/promotions:
 *   get:
 *     tags: [Admin]
 *     summary: Promotional SMS send history (report)
 *     responses:
 *       200: { description: History, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/sms/promotions', requirePermission(PERMISSIONS.MANAGE_SETTINGS), ctrl.promotionLog);

/**
 * @openapi
 * /admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Get platform settings (Maps key, SMS, Cloudinary, maintenance...)
 *     responses:
 *       200: { description: Settings, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   put:
 *     tags: [Admin]
 *     summary: Update platform settings
 *     responses:
 *       200: { description: Settings updated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/settings', requirePermission(PERMISSIONS.MANAGE_SETTINGS), ctrl.getSettings);
router.put(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(m.settings.update),
  ctrl.updateSettings,
);

module.exports = router;

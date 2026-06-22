'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/listing.controller');
const { reports } = require('../controllers/misc.controllers');
const validate = require('../middlewares/validate.middleware');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const { uploadListingImages } = require('../middlewares/upload.middleware');
const v = require('../validations/listing.validation');

/**
 * @openapi
 * /listings:
 *   get:
 *     tags: [Listings]
 *     summary: Browse and search listings
 *     security: []
 *     parameters:
 *       - { in: query, name: q, schema: { type: string }, description: Free-text search }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Paginated listings, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *   post:
 *     tags: [Listings]
 *     summary: Create a new listing (with images)
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Listing created, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', validate(v.search), ctrl.search);

/**
 * @openapi
 * /listings/map:
 *   get:
 *     tags: [Listings]
 *     summary: Geo-located approved listings for the map view
 *     security: []
 *     responses:
 *       200: { description: Listings with coordinates, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
// Defined before '/:id' so "map" is not interpreted as a listing id.
router.get('/map', validate(v.mapQuery), ctrl.mapPoints);

// Public sitemap source: approved listing slugs + timestamps.
router.get('/sitemap', ctrl.sitemap);

/**
 * @openapi
 * /listings/{id}:
 *   get:
 *     tags: [Listings]
 *     summary: Get a single listing by id
 *     security: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       404: { description: Not found, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 *   put:
 *     tags: [Listings]
 *     summary: Update a listing you own
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing updated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   delete:
 *     tags: [Listings]
 *     summary: Delete a listing you own
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing deleted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
// Accepts either a Mongo id or a URL slug (resolved in the service).
router.get('/:id', optionalAuth, ctrl.getOne);

/**
 * @openapi
 * /listings/{id}/nearby:
 *   get:
 *     tags: [Listings]
 *     summary: Get places/listings near a given listing
 *     security: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Nearby results, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/:id/nearby', validate({ params: v.idParam }), ctrl.nearby);

router.post('/', authenticate, uploadListingImages, validate(v.create), ctrl.create);

/**
 * @openapi
 * /listings/me/list:
 *   get:
 *     tags: [Listings]
 *     summary: List the authenticated owner's listings
 *     responses:
 *       200: { description: Owner listings, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me/list', authenticate, ctrl.mine);

/**
 * @openapi
 * /listings/me/stats:
 *   get:
 *     tags: [Listings]
 *     summary: Listing counts for the authenticated owner's dashboard
 *     responses:
 *       200: { description: Owner stats, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me/stats', authenticate, ctrl.myStats);

/**
 * @openapi
 * /listings/me/bulk-delete:
 *   post:
 *     tags: [Listings]
 *     summary: Delete several of the authenticated owner's listings at once
 *     responses:
 *       200: { description: Listings deleted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/me/bulk-delete', authenticate, validate(v.bulkDelete), ctrl.removeMany);

router.put('/:id', authenticate, uploadListingImages, validate(v.update), ctrl.update);
router.delete('/:id', authenticate, validate({ params: v.idParam }), ctrl.remove);

/**
 * @openapi
 * /listings/{id}/renew:
 *   post:
 *     tags: [Listings]
 *     summary: Renew (extend the active period of) a listing you own
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing renewed, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/:id/renew', authenticate, validate({ params: v.idParam }), ctrl.renew);

/**
 * @openapi
 * /listings/{id}/mark-rented:
 *   post:
 *     tags: [Listings]
 *     summary: Mark a listing as rented (deactivate). Allowed for the owner or staff.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing marked rented, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /listings/{id}/mark-available:
 *   post:
 *     tags: [Listings]
 *     summary: Mark a rented listing as available again. Allowed for the owner or staff.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Listing reactivated, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/:id/mark-rented', authenticate, validate({ params: v.idParam }), ctrl.markRented);
router.post('/:id/mark-available', authenticate, validate({ params: v.idParam }), ctrl.markAvailable);

/**
 * @openapi
 * /listings/{id}/report:
 *   post:
 *     tags: [Listings]
 *     summary: Report a listing
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: Report submitted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/:id/report', authenticate, validate(v.report), reports.create);

module.exports = router;

'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/media.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { uploadMedia } = require('../middlewares/upload.middleware');
const v = require('../validations/media.validation');
const { idParam } = require('../validations/common.validation');

// The media library is per-user; every endpoint requires a signed-in account.
router.use(authenticate);

/**
 * @openapi
 * /media:
 *   get:
 *     tags: [Media]
 *     summary: List the authenticated user's media library
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: scope, schema: { type: string, enum: [mine, all] }, description: "Staff-only: 'all' browses every user's media" }
 *     responses:
 *       200: { description: Paginated media, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     tags: [Media]
 *     summary: Upload one or more images into the library
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Image(s) uploaded, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
/**
 * @openapi
 * /media/{id}:
 *   delete:
 *     tags: [Media]
 *     summary: Permanently delete an image from the library
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Image deleted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Not found }
 */
router.get('/', validate(v.list), ctrl.list);
router.post('/', uploadMedia, ctrl.upload);
// Specific path before '/:id' so "bulk-delete" isn't read as an id.
router.post('/bulk-delete', validate(v.bulkDelete), ctrl.removeMany);
router.delete('/:id', validate({ params: idParam }), ctrl.remove);

module.exports = router;

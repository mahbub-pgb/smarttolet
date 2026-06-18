'use strict';

const router = require('express').Router();
const validate = require('../middlewares/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { places } = require('../controllers/misc.controllers');
const settingsService = require('../services/settings.service');
const m = require('../validations/misc.validation');

/**
 * @openapi
 * /public/settings:
 *   get:
 *     tags: [Public]
 *     summary: Public, secret-free settings for the frontend
 *     security: []
 *     responses:
 *       200: { description: Public settings, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.getPublic();
    sendSuccess(res, { data: { settings } });
  }),
);

/**
 * @openapi
 * /public/places/nearby:
 *   get:
 *     tags: [Public]
 *     summary: Nearby places for arbitrary coordinates
 *     security: []
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number } }
 *       - { in: query, name: lng, required: true, schema: { type: number } }
 *     responses:
 *       200: { description: Nearby places, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/places/nearby', validate(m.nearby), places.nearby);

module.exports = router;

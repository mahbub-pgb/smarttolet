'use strict';

const router = require('express').Router();
const validate = require('../middlewares/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { places } = require('../controllers/misc.controllers');
const settingsService = require('../services/settings.service');
const m = require('../validations/misc.validation');

// Public, secret-free settings for the frontend (site name, logo, maps key...).
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.getPublic();
    sendSuccess(res, { data: { settings } });
  }),
);

// Nearby places for arbitrary coordinates (used while creating a listing).
router.get('/places/nearby', validate(m.nearby), places.nearby);

module.exports = router;

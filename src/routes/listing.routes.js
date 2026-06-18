'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/listing.controller');
const { reports } = require('../controllers/misc.controllers');
const validate = require('../middlewares/validate.middleware');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const { uploadListingImages } = require('../middlewares/upload.middleware');
const v = require('../validations/listing.validation');

// Public browse/search
router.get('/', validate(v.search), ctrl.search);
router.get('/:id', validate({ params: v.idParam }), optionalAuth, ctrl.getOne);
router.get('/:id/nearby', validate({ params: v.idParam }), ctrl.nearby);

// Owner actions
router.post('/', authenticate, uploadListingImages, validate(v.create), ctrl.create);
router.get('/me/list', authenticate, ctrl.mine);
router.put('/:id', authenticate, uploadListingImages, validate(v.update), ctrl.update);
router.delete('/:id', authenticate, validate({ params: v.idParam }), ctrl.remove);

// Report a listing
router.post('/:id/report', authenticate, validate(v.report), reports.create);

module.exports = router;

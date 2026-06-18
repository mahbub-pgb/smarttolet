'use strict';

const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const ctrl = require('../controllers/payment.controller');
const m = require('../validations/misc.validation');

router.post('/initiate', authenticate, validate(m.payment.initiate), ctrl.initiate);
// Gateway callbacks may be unauthenticated; the paymentRef + gateway signature
// is what authenticates them in production.
router.post('/verify', validate(m.payment.verify), ctrl.verify);
router.get('/subscription', authenticate, ctrl.mySubscription);

module.exports = router;

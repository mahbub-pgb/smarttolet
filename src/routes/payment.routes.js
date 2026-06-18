'use strict';

const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const ctrl = require('../controllers/payment.controller');
const m = require('../validations/misc.validation');

/**
 * @openapi
 * /payments/initiate:
 *   post:
 *     tags: [Payments]
 *     summary: Initiate a subscription payment
 *     responses:
 *       200: { description: Payment initiated (gateway redirect/ref), content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/initiate', authenticate, validate(m.payment.initiate), ctrl.initiate);

/**
 * @openapi
 * /payments/verify:
 *   post:
 *     tags: [Payments]
 *     summary: Verify a payment (gateway callback)
 *     description: >-
 *       Called by the payment gateway. Authenticated by the paymentRef and the
 *       gateway signature rather than a bearer token.
 *     security: []
 *     responses:
 *       200: { description: Payment verified, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       400: { description: Verification failed, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.post('/verify', validate(m.payment.verify), ctrl.verify);

/**
 * @openapi
 * /payments/subscription:
 *   get:
 *     tags: [Payments]
 *     summary: Get the authenticated user's current subscription
 *     responses:
 *       200: { description: Subscription, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/subscription', authenticate, ctrl.mySubscription);

module.exports = router;

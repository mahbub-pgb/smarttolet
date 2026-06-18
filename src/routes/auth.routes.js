'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { authLimiter, otpLimiter } = require('../middlewares/rateLimit.middleware');
const v = require('../validations/auth.validation');

/**
 * @openapi
 * /auth/otp/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request an OTP for phone verification (registration step 1)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: '+8801712345678' }
 *     responses:
 *       200: { description: OTP sent, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.post('/otp/request', otpLimiter, validate(v.requestOtp), ctrl.requestOtp);

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the phone OTP and receive a short-lived token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, code]
 *             properties:
 *               phone: { type: string, example: '+8801712345678' }
 *               code: { type: string, example: '123456' }
 *     responses:
 *       200: { description: OTP verified, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       400: { description: Invalid or expired OTP, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.post('/otp/verify', authLimiter, validate(v.verifyOtp), ctrl.verifyOtp);

/**
 * @openapi
 * /auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Complete profile after OTP verification (registration step 2)
 *     responses:
 *       200: { description: Profile completed, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.put('/profile', authenticate, validate(v.completeProfile), ctrl.completeProfile);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with credentials and receive access + refresh tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone: { type: string, example: '+8801712345678' }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Logged in, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { description: Invalid credentials, content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.post('/login', authLimiter, validate(v.login), ctrl.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new access token
 *     security: []
 *     responses:
 *       200: { description: New access token issued, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/refresh', validate(v.refresh), ctrl.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out and invalidate the current session
 *     responses:
 *       200: { description: Logged out, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout', authenticate, ctrl.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     responses:
 *       200: { description: Current user, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', authenticate, ctrl.me);

/**
 * @openapi
 * /auth/email/otp/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request an OTP to verify the account email
 *     responses:
 *       200: { description: Email OTP sent, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/email/otp/request', authenticate, otpLimiter, ctrl.requestEmailOtp);

/**
 * @openapi
 * /auth/email/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the email OTP
 *     responses:
 *       200: { description: Email verified, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/email/otp/verify', authenticate, validate(v.verifyEmail), ctrl.verifyEmailOtp);

module.exports = router;

'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { authLimiter, otpLimiter } = require('../middlewares/rateLimit.middleware');
const v = require('../validations/auth.validation');

// Registration step 1: phone verification
router.post('/otp/request', otpLimiter, validate(v.requestOtp), ctrl.requestOtp);
router.post('/otp/verify', authLimiter, validate(v.verifyOtp), ctrl.verifyOtp);

// Registration step 2: complete profile (requires the token from step 1)
router.put('/profile', authenticate, validate(v.completeProfile), ctrl.completeProfile);

// Session
router.post('/login', authLimiter, validate(v.login), ctrl.login);
router.post('/refresh', validate(v.refresh), ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);

// Optional email verification
router.post('/email/otp/request', authenticate, otpLimiter, ctrl.requestEmailOtp);
router.post('/email/otp/verify', authenticate, validate(v.verifyEmail), ctrl.verifyEmailOtp);

module.exports = router;

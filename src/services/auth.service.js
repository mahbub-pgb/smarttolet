'use strict';

const { userRepository } = require('../repositories');
const { Subscription } = require('../models');
const otpService = require('./otp.service');
const notificationService = require('./notification.service');
const ApiError = require('../utils/ApiError');
const {
  issueTokenPair,
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} = require('../utils/token');
const { ACCOUNT_STATUS, ROLES, SUBSCRIPTION_PLANS } = require('../constants');

const OTP_PURPOSE = 'phone_verify';

class AuthService {
  /** Registration step 1a: send OTP to a mobile number. */
  async requestPhoneOtp(mobile) {
    const existing = await userRepository.findByMobile(mobile);
    if (existing && existing.isPhoneVerified && existing.password) {
      throw ApiError.conflict('An account with this mobile already exists', {
        code: 'MOBILE_TAKEN',
      });
    }
    return otpService.requestOtp(OTP_PURPOSE, mobile);
  }

  /**
   * Registration step 1b: verify OTP. Creates a phone-verified account if one
   * doesn't exist yet, then returns tokens so the client can complete profile.
   */
  async verifyPhoneOtp(mobile, code) {
    await otpService.verifyOtp(OTP_PURPOSE, mobile, code);

    let user = await userRepository.findByMobile(mobile);
    if (!user) {
      user = await userRepository.create({
        mobile,
        isPhoneVerified: true,
        role: ROLES.USER,
        status: ACCOUNT_STATUS.ACTIVE,
      });
      // Every new user starts on the Free plan.
      await Subscription.create({ user: user._id, plan: SUBSCRIPTION_PLANS.FREE });
    } else if (!user.isPhoneVerified) {
      user.isPhoneVerified = true;
      await user.save();
    }

    const tokens = issueTokenPair(user);
    return { user, tokens, profileComplete: !!user.fullName };
  }

  /** Registration step 2: complete profile (and optionally set password). */
  async completeProfile(userId, data) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    const fields = [
      'fullName',
      'email',
      'profileImage',
      'dateOfBirth',
      'gender',
      'occupation',
      'nationalId',
      'address',
    ];
    for (const f of fields) if (data[f] !== undefined) user[f] = data[f];

    if (data.latitude !== undefined && data.longitude !== undefined) {
      user.location = { type: 'Point', coordinates: [data.longitude, data.latitude] };
    }
    if (data.preferredDivision !== undefined) user.preferences.preferredDivision = data.preferredDivision;
    if (data.preferredDistrict !== undefined) user.preferences.preferredDistrict = data.preferredDistrict;
    if (data.preferredArea !== undefined) user.preferences.preferredArea = data.preferredArea;

    if (data.password) user.password = data.password; // hashed by pre-save hook

    if (data.email) {
      const dup = await userRepository.findByEmail(data.email);
      if (dup && String(dup._id) !== String(user._id)) {
        throw ApiError.conflict('Email already in use', { code: 'EMAIL_TAKEN' });
      }
    }

    await user.save();
    return user;
  }

  /** Password login by mobile or email. */
  async login({ identifier, password }) {
    const filter = identifier.includes('@')
      ? { email: String(identifier).toLowerCase() }
      : { mobile: identifier };

    const user = await userRepository.findForAuth(filter);
    if (!user || !(await user.comparePassword(password))) {
      throw ApiError.unauthorized('Invalid credentials', { code: 'BAD_CREDENTIALS' });
    }
    if (user.status === ACCOUNT_STATUS.SUSPENDED) {
      throw ApiError.forbidden('Account suspended', { code: 'ACCOUNT_SUSPENDED' });
    }
    if (user.status === ACCOUNT_STATUS.DELETED) {
      throw ApiError.unauthorized('Account no longer exists', { code: 'ACCOUNT_DELETED' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return { user, tokens: issueTokenPair(user) };
  }

  /**
   * Rotate refresh token. tokenVersion is embedded so a logout/revoke (which
   * bumps the version) invalidates all previously-issued refresh tokens.
   */
  async refresh(refreshToken) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid refresh token', { code: 'REFRESH_INVALID' });
    }
    const user = await userRepository.findById(decoded.sub);
    if (!user || user.status !== ACCOUNT_STATUS.ACTIVE) {
      throw ApiError.unauthorized('Session is no longer valid');
    }
    const payload = { sub: String(user._id), role: user.role };
    return {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };
  }

  async logout(userId) {
    await userRepository.updateById(userId, { $inc: { tokenVersion: 1 } });
  }

  /** Email verification OTP (optional second factor). */
  async requestEmailOtp(userId) {
    const user = await userRepository.findById(userId);
    if (!user?.email) throw ApiError.badRequest('No email on profile');
    return otpService.requestOtp('email_verify', user.email);
  }

  async verifyEmailOtp(userId, code) {
    const user = await userRepository.findById(userId);
    if (!user?.email) throw ApiError.badRequest('No email on profile');
    await otpService.verifyOtp('email_verify', user.email, code);
    user.isEmailVerified = true;
    await user.save();
    return user;
  }
}

module.exports = new AuthService();

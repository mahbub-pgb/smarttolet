'use strict';

const {
  User, Listing, Subscription, Payment,
} = require('../models');
const {
  ROLES, LISTING_STATUS, SUBSCRIPTION_STATUS, PAYMENT_STATUS, ACCOUNT_STATUS,
  SUBSCRIPTION_PLANS, roleRank,
} = require('../constants');
const ApiError = require('../utils/ApiError');
const settingsService = require('./settings.service');
const smsService = require('./sms.service');
const logger = require('../config/logger');

class AdminService {
  /** Dashboard summary cards. */
  async dashboardCards() {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [
      totalUsers, totalLandlords, totalModerators,
      totalListings, pendingListings, approvedListings, rejectedListings,
      activeSubscriptions, monthlyRevenueAgg,
    ] = await Promise.all([
      User.countDocuments({ role: ROLES.USER }),
      User.countDocuments({ isLandlordVerified: true }),
      User.countDocuments({ role: ROLES.MODERATOR }),
      Listing.countDocuments(),
      Listing.countDocuments({ status: LISTING_STATUS.PENDING }),
      Listing.countDocuments({ status: LISTING_STATUS.APPROVED }),
      Listing.countDocuments({ status: LISTING_STATUS.REJECTED }),
      Subscription.countDocuments({ status: SUBSCRIPTION_STATUS.ACTIVE }),
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.SUCCESS, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      totalUsers,
      totalLandlords,
      totalModerators,
      totalListings,
      pendingListings,
      approvedListings,
      rejectedListings,
      activeSubscriptions,
      monthlyRevenue: monthlyRevenueAgg[0]?.total || 0,
    };
  }

  /** Time-series growth for charts (last `months` months). */
  async growthCharts(months = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const groupByMonth = (dateField = '$createdAt') => ({
      $dateToString: { format: '%Y-%m', date: dateField },
    });

    const [userGrowth, listingGrowth, revenueGrowth, popularAreas] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: groupByMonth(), count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Listing.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: groupByMonth(), count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.SUCCESS, createdAt: { $gte: since } } },
        { $group: { _id: groupByMonth(), total: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
      Listing.aggregate([
        { $match: { status: LISTING_STATUS.APPROVED } },
        { $group: { _id: '$location.area', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return { userGrowth, listingGrowth, revenueGrowth, popularAreas };
  }

  // ---- User / staff management ----

  listUsers({ role, status, search, page = 1, limit = 20 }) {
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { fullName: new RegExp(search, 'i') },
        { mobile: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }
    const skip = (page - 1) * limit;
    return Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]).then(([items, total]) => ({ items, total }));
  }

  /**
   * Create a user account from the admin dashboard. Admin-created accounts are
   * trusted (phone pre-verified, active). The creator cannot assign a role at
   * or above their own rank, mirroring the setRole guard.
   */
  async createUser({ fullName, mobile, email, password, role }, creator) {
    const targetRole = role || ROLES.USER;
    if (roleRank(targetRole) >= roleRank(creator.role)) {
      throw ApiError.forbidden('Cannot create a user with a role equal to or above your own');
    }

    if (await User.findOne({ mobile })) {
      throw ApiError.conflict('A user with this mobile already exists', { code: 'MOBILE_TAKEN' });
    }
    if (email && (await User.findOne({ email: email.toLowerCase() }))) {
      throw ApiError.conflict('A user with this email already exists', { code: 'EMAIL_TAKEN' });
    }

    const created = await User.create({
      fullName,
      mobile,
      email,
      password, // hashed by the model's pre-save hook
      role: targetRole,
      isPhoneVerified: true,
      status: ACCOUNT_STATUS.ACTIVE,
    });

    // Mirror the normal signup flow: regular users start on the Free plan.
    if (targetRole === ROLES.USER) {
      await Subscription.create({ user: created._id, plan: SUBSCRIPTION_PLANS.FREE });
    }
    return created;
  }

  /**
   * Admin edit of any account field, including password. Guards:
   *  - cannot modify an account at or above your own rank (your own is fine);
   *  - cannot assign a role at or above your own rank.
   */
  async updateUser(targetId, data, actor) {
    const target = await User.findById(targetId);
    if (!target) throw ApiError.notFound('User not found');

    const isSelf = String(target._id) === String(actor._id);
    if (!isSelf && roleRank(target.role) >= roleRank(actor.role)) {
      throw ApiError.forbidden('You cannot modify an account at or above your role');
    }

    if (data.role && data.role !== target.role) {
      if (roleRank(data.role) >= roleRank(actor.role)) {
        throw ApiError.forbidden('Cannot assign a role equal to or above your own');
      }
      target.role = data.role;
    }

    if (data.mobile && data.mobile !== target.mobile) {
      if (await User.findOne({ mobile: data.mobile, _id: { $ne: target._id } })) {
        throw ApiError.conflict('A user with this mobile already exists', { code: 'MOBILE_TAKEN' });
      }
      target.mobile = data.mobile;
    }
    if (data.email && data.email.toLowerCase() !== target.email) {
      if (await User.findOne({ email: data.email.toLowerCase(), _id: { $ne: target._id } })) {
        throw ApiError.conflict('A user with this email already exists', { code: 'EMAIL_TAKEN' });
      }
      target.email = data.email;
    }

    const direct = ['fullName', 'status', 'isLandlordVerified', 'occupation', 'address', 'gender', 'dateOfBirth'];
    for (const f of direct) if (data[f] !== undefined) target[f] = data[f];

    // Changing the password invalidates existing refresh tokens.
    if (data.password) {
      target.password = data.password; // hashed by the model's pre-save hook
      target.tokenVersion += 1;
    }

    await target.save();

    // Optionally SMS the new password to the user (best-effort; never blocks).
    if (data.password) {
      this.notifyPasswordChange(target.mobile, data.password).catch((err) =>
        logger.error(`Password-change SMS failed: ${err.message}`),
      );
    }
    return target;
  }

  /** Send the new password to the user by SMS when the admin enabled it. */
  async notifyPasswordChange(mobile, newPassword) {
    if (!mobile) return;
    const { passwordChangeSms } = await settingsService.get();
    if (!passwordChangeSms?.enabled) return;
    const message = (passwordChangeSms.template || '').replace(/\{password\}/g, newPassword);
    if (!message.trim()) return;
    await smsService.sendSms(mobile, message);
  }

  setStatus(userId, status) {
    return User.findByIdAndUpdate(userId, { status }, { new: true });
  }

  setRole(userId, role) {
    return User.findByIdAndUpdate(userId, { role }, { new: true });
  }

  verifyLandlord(userId, verified = true) {
    return User.findByIdAndUpdate(userId, { isLandlordVerified: verified }, { new: true });
  }
}

module.exports = new AdminService();

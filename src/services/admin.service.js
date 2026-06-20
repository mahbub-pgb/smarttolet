'use strict';

const {
  User, Listing, Subscription, Payment, PromoSms,
} = require('../models');
const {
  ROLES, LISTING_STATUS, SUBSCRIPTION_STATUS, PAYMENT_STATUS, ACCOUNT_STATUS,
  SUBSCRIPTION_PLANS, roleRank,
} = require('../constants');
const ApiError = require('../utils/ApiError');
const settingsService = require('./settings.service');
const smsService = require('./sms.service');
const logger = require('../config/logger');

// Escape regex metacharacters so user-supplied search input is matched
// literally and cannot trigger catastrophic backtracking (ReDoS).
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ fullName: rx }, { mobile: rx }, { email: rx }];
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

  /** Remaining SMS gateway balance (null for the mock provider). */
  smsBalance() {
    return smsService.getBalance();
  }

  /**
   * Broadcast a promotional SMS. Numbers are de-duplicated, registered users
   * are rejected, and numbers messaged within the cooldown window are skipped.
   * Each recipient is logged for the report. Returns a send summary.
   */
  async sendPromotion(numbers, message, actorId, title) {
    const unique = [...new Set(numbers)];

    // Promotions target non-users only. If any number already belongs to a
    // registered user, stop and report them so the admin can remove them.
    const existing = await User.find({ mobile: { $in: unique } }).select('mobile');
    if (existing.length) {
      const taken = existing.map((u) => u.mobile);
      throw ApiError.badRequest(
        `${taken.length} number(s) already belong to registered users: ${taken.join(', ')}. No SMS was sent.`,
        { code: 'EXISTING_USERS' },
      );
    }

    // Skip numbers already messaged within the cooldown window. A missing
    // value (e.g. from an older cached settings object) falls back to the
    // 30-day default; only an explicit 0 disables the cooldown.
    const settings = await settingsService.get();
    const cooldownDays = settings.promoCooldownDays ?? 30;
    let toSend = unique;
    let skipped = [];
    if (cooldownDays > 0) {
      const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
      const recent = await PromoSms.find({
        mobile: { $in: unique },
        status: 'sent',
        createdAt: { $gte: since },
      }).select('mobile');
      const recentSet = new Set(recent.map((r) => r.mobile));
      skipped = unique.filter((n) => recentSet.has(n));
      toSend = unique.filter((n) => !recentSet.has(n));
    }

    if (!toSend.length) {
      const { balance } = await smsService.getBalance().catch(() => ({ balance: null }));
      return {
        provider: null,
        delivered: false,
        reason: `All ${skipped.length} number(s) were already messaged within the last ${cooldownDays} day(s).`,
        recipients: 0,
        skipped: skipped.length,
        balance,
      };
    }

    const result = await smsService.sendSms(toSend, message);
    const status = result.delivered !== false ? 'sent' : 'failed';

    await PromoSms.insertMany(
      toSend.map((mobile) => ({
        mobile,
        title: title || undefined,
        message,
        status,
        reason: status === 'failed' ? result.message || null : undefined,
        sentBy: actorId,
      })),
    );

    const { balance } = await smsService.getBalance().catch(() => ({ balance: null }));
    return {
      provider: result.provider,
      delivered: status === 'sent',
      reason: result.message || null,
      recipients: toSend.length,
      skipped: skipped.length,
      balance,
    };
  }

  /** Paginated promotional-SMS history for the report view. */
  promotionLog({ page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      PromoSms.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('sentBy', 'fullName mobile'),
      PromoSms.countDocuments(),
    ]).then(([items, total]) => ({ items, total }));
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

  /**
   * Load the target and refuse to act on an account of equal-or-higher rank
   * than the actor (e.g. an admin cannot suspend/demote a super_admin). Acting
   * on your own account is allowed.
   */
  async loadManageableTarget(userId, actor) {
    const target = await User.findById(userId);
    if (!target) throw ApiError.notFound('User not found');
    const isSelf = String(target._id) === String(actor._id);
    if (!isSelf && roleRank(target.role) >= roleRank(actor.role)) {
      throw ApiError.forbidden('You cannot manage an account at or above your role', {
        code: 'RANK_FORBIDDEN',
      });
    }
    return target;
  }

  async setStatus(userId, status, actor) {
    const target = await this.loadManageableTarget(userId, actor);
    target.status = status;
    // Suspending an account retires its active sessions.
    if (status === ACCOUNT_STATUS.SUSPENDED) target.tokenVersion = (target.tokenVersion ?? 0) + 1;
    await target.save();
    return target;
  }

  async setRole(userId, role, actor) {
    const target = await this.loadManageableTarget(userId, actor);
    if (roleRank(role) >= roleRank(actor.role)) {
      throw ApiError.forbidden('Cannot assign a role equal to or above your own', {
        code: 'RANK_FORBIDDEN',
      });
    }
    target.role = role;
    await target.save();
    return target;
  }

  async verifyLandlord(userId, verified = true, actor) {
    const target = await this.loadManageableTarget(userId, actor);
    target.isLandlordVerified = verified;
    await target.save();
    return target;
  }
}

module.exports = new AdminService();

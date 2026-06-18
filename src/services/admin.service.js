'use strict';

const {
  User, Listing, Subscription, Payment,
} = require('../models');
const {
  ROLES, LISTING_STATUS, SUBSCRIPTION_STATUS, PAYMENT_STATUS, ACCOUNT_STATUS,
  SUBSCRIPTION_PLANS, roleRank,
} = require('../constants');
const ApiError = require('../utils/ApiError');

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

'use strict';

const {
  User, Listing, Subscription, Payment,
} = require('../models');
const {
  ROLES, LISTING_STATUS, SUBSCRIPTION_STATUS, PAYMENT_STATUS, ACCOUNT_STATUS,
} = require('../constants');

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

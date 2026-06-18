'use strict';

/**
 * One-off seeder: creates the initial super admin from env vars.
 * Run with: npm run seed:admin
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const { User } = require('../models');
const { ROLES, ACCOUNT_STATUS } = require('../constants');
const config = require('../config');
const logger = require('../config/logger');

async function seed() {
  await connectDB();
  const existing = await User.findOne({ role: ROLES.SUPER_ADMIN });
  if (existing) {
    logger.info(`Super admin already exists: ${existing.mobile}`);
    return;
  }
  const admin = await User.create({
    fullName: 'Super Admin',
    mobile: config.superAdmin.mobile,
    email: config.superAdmin.email,
    password: config.superAdmin.password, // hashed by pre-save hook
    role: ROLES.SUPER_ADMIN,
    isPhoneVerified: true,
    isEmailVerified: true,
    status: ACCOUNT_STATUS.ACTIVE,
  });
  logger.info(`Super admin created: ${admin.mobile} (${admin.email})`);
}

seed()
  .catch((err) => logger.error(err.message))
  .finally(async () => {
    await disconnectDB();
    await mongoose.disconnect();
    process.exit(0);
  });

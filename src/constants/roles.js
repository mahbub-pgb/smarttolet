'use strict';

/**
 * System roles. Order matters for hierarchy checks (higher index = more power).
 */
const ROLES = Object.freeze({
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

const ROLE_HIERARCHY = Object.freeze([
  ROLES.USER,
  ROLES.MODERATOR,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
]);

/**
 * Granular permissions. Controllers/routes guard on these rather than on raw
 * role strings, so capabilities can be re-mapped without touching handlers.
 */
const PERMISSIONS = Object.freeze({
  // Account / users
  MANAGE_USERS: 'manage_users',
  SUSPEND_ACCOUNTS: 'suspend_accounts',
  DELETE_ACCOUNTS: 'delete_accounts',
  VERIFY_LANDLORDS: 'verify_landlords',

  // Staff
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_MODERATORS: 'manage_moderators',

  // Listings
  MANAGE_LISTINGS: 'manage_listings',
  REVIEW_LISTINGS: 'review_listings',
  APPROVE_LISTINGS: 'approve_listings',

  // Reports
  MANAGE_REPORTS: 'manage_reports',
  RESOLVE_REPORTS: 'resolve_reports',

  // Commerce
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  MANAGE_PAYMENTS: 'manage_payments',
  MANAGE_ADVERTISEMENTS: 'manage_advertisements',

  // Platform
  MANAGE_SETTINGS: 'manage_settings',
  VIEW_ANALYTICS: 'view_analytics',
});

const MODERATOR_PERMS = [
  PERMISSIONS.REVIEW_LISTINGS,
  PERMISSIONS.APPROVE_LISTINGS,
  PERMISSIONS.VERIFY_LANDLORDS,
  PERMISSIONS.RESOLVE_REPORTS,
  PERMISSIONS.MANAGE_REPORTS,
  PERMISSIONS.MANAGE_USERS,
];

const ADMIN_PERMS = [
  ...MODERATOR_PERMS,
  PERMISSIONS.MANAGE_MODERATORS,
  PERMISSIONS.MANAGE_LISTINGS,
  PERMISSIONS.MANAGE_ADVERTISEMENTS,
  PERMISSIONS.MANAGE_SUBSCRIPTIONS,
  PERMISSIONS.MANAGE_SETTINGS,
  PERMISSIONS.VIEW_ANALYTICS,
  PERMISSIONS.SUSPEND_ACCOUNTS,
];

const SUPER_ADMIN_PERMS = [
  ...ADMIN_PERMS,
  PERMISSIONS.MANAGE_ADMINS,
  PERMISSIONS.MANAGE_PAYMENTS,
  PERMISSIONS.DELETE_ACCOUNTS,
];

/**
 * Role -> permission set. De-duplicated.
 */
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.USER]: [],
  [ROLES.MODERATOR]: [...new Set(MODERATOR_PERMS)],
  [ROLES.ADMIN]: [...new Set(ADMIN_PERMS)],
  [ROLES.SUPER_ADMIN]: [...new Set(SUPER_ADMIN_PERMS)],
});

const STAFF_ROLES = [ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN];

function hasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function roleRank(role) {
  return ROLE_HIERARCHY.indexOf(role);
}

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  hasPermission,
  roleRank,
};

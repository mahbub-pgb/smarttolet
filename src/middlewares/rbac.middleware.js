'use strict';

const ApiError = require('../utils/ApiError');
const { hasPermission, ROLE_HIERARCHY, roleRank } = require('../constants');

/** Allow only the listed roles. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient role', { code: 'ROLE_FORBIDDEN' }));
    }
    next();
  };
}

/** Allow only roles holding ALL of the listed permissions. */
function requirePermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const ok = permissions.every((p) => hasPermission(req.user.role, p));
    if (!ok) {
      return next(ApiError.forbidden('Insufficient permissions', { code: 'PERM_FORBIDDEN' }));
    }
    next();
  };
}

/**
 * Prevent acting on a target user of equal-or-higher rank (e.g. an admin can't
 * suspend a super_admin). Target role is read from res.locals.targetRole, set
 * by the controller after loading the target user.
 */
function requireHigherRankThan(getTargetRole) {
  return (req, _res, next) => {
    const targetRole = getTargetRole(req);
    if (targetRole && roleRank(req.user.role) <= roleRank(targetRole)) {
      return next(ApiError.forbidden('Cannot manage a user of equal or higher rank'));
    }
    next();
  };
}

module.exports = { requireRole, requirePermission, requireHigherRankThan, ROLE_HIERARCHY };

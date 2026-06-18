'use strict';

const settingsService = require('../services/settings.service');
const { STAFF_ROLES } = require('../constants');

/**
 * When maintenance mode is enabled in settings, block non-staff traffic with
 * 503 while still allowing admins/moderators to operate.
 */
async function maintenanceGuard(req, res, next) {
  try {
    const { maintenanceMode, maintenanceMessage } = await settingsService.get();
    if (!maintenanceMode) return next();
    if (req.user && STAFF_ROLES.includes(req.user.role)) return next();
    return res.status(503).json({
      success: false,
      message: maintenanceMessage || 'Service temporarily unavailable for maintenance.',
      code: 'MAINTENANCE_MODE',
    });
  } catch {
    next();
  }
}

module.exports = maintenanceGuard;

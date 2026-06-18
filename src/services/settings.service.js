'use strict';

const { Settings } = require('../models');
const { redis } = require('../config/redis');
const config = require('../config');
const logger = require('../config/logger');

const CACHE_KEY = 'settings:global';
const CACHE_TTL = 600; // 10 minutes

/**
 * SettingsService resolves platform configuration with a clear precedence:
 *   1. Settings document in MongoDB (admin-editable)
 *   2. Value from .env (config) as fallback
 *
 * Reads are served from Redis to avoid hitting Mongo on every request; the
 * cache is invalidated on every write. Secret fields (api keys/secrets) are
 * select:false on the schema, so we fetch them explicitly here and cache the
 * resolved object server-side only (never returned by the public endpoint).
 */
class SettingsService {
  /** Load the singleton settings doc including secret fields. */
  async loadDoc() {
    let doc = await Settings.findOne({ key: 'global' }).select(
      '+googleMapsApiKey +sms.apiKey +cloudinary.apiKey +cloudinary.apiSecret',
    );
    if (!doc) {
      doc = await Settings.create({ key: 'global' });
    }
    return doc;
  }

  /**
   * Resolved settings (DB value or env fallback). Cached in Redis.
   * @param {boolean} fresh skip cache
   */
  async get(fresh = false) {
    if (!fresh) {
      try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn(`Settings cache read failed: ${err.message}`);
      }
    }

    const doc = await this.loadDoc();
    const resolved = {
      siteName: doc.siteName || config.env,
      siteLogo: doc.siteLogo || null,
      supportEmail: doc.supportEmail || null,
      supportPhone: doc.supportPhone || null,
      googleMapsApiKey: doc.googleMapsApiKey || config.googleMapsApiKey || null,
      mapDefaultZoom: doc.mapDefaultZoom ?? 7,
      sms: {
        provider: doc.sms?.provider || config.sms.provider,
        apiKey: doc.sms?.apiKey || config.sms.apiKey || null,
        senderId: doc.sms?.senderId || config.sms.senderId,
      },
      passwordChangeSms: {
        enabled: !!doc.passwordChangeSms?.enabled,
        template:
          doc.passwordChangeSms?.template
          || 'Your Smart To-Let password has been reset by an administrator. New password: {password}',
      },
      cloudinary: {
        cloudName: doc.cloudinary?.cloudName || config.cloudinary.cloudName || null,
        apiKey: doc.cloudinary?.apiKey || config.cloudinary.apiKey || null,
        apiSecret: doc.cloudinary?.apiSecret || config.cloudinary.apiSecret || null,
      },
      listingExpiry: {
        value: doc.listingExpiry?.value ?? 30,
        unit: doc.listingExpiry?.unit || 'days',
      },
      promoMessages: (doc.promoMessages || []).map((m) => ({ title: m.title, message: m.message })),
      maintenanceMode: !!doc.maintenanceMode,
      maintenanceMessage: doc.maintenanceMessage || null,
    };

    try {
      await redis.set(CACHE_KEY, JSON.stringify(resolved), 'EX', CACHE_TTL);
    } catch (err) {
      logger.warn(`Settings cache write failed: ${err.message}`);
    }
    return resolved;
  }

  /** Public-safe view: strips all secret values. */
  async getPublic() {
    const s = await this.get();
    return {
      siteName: s.siteName,
      siteLogo: s.siteLogo,
      supportEmail: s.supportEmail,
      supportPhone: s.supportPhone,
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
      // Maps key IS exposed publicly — the browser SDK needs it. Restrict it by
      // HTTP referrer in the Google Cloud console rather than hiding it.
      googleMapsApiKey: s.googleMapsApiKey,
      mapDefaultZoom: s.mapDefaultZoom,
    };
  }

  async update(patch, userId) {
    const doc = await this.loadDoc();
    const assignable = [
      'siteName',
      'siteLogo',
      'supportEmail',
      'supportPhone',
      'googleMapsApiKey',
      'mapDefaultZoom',
      'promoMessages',
      'maintenanceMode',
      'maintenanceMessage',
    ];
    for (const key of assignable) {
      if (patch[key] !== undefined) doc[key] = patch[key];
    }
    if (patch.listingExpiry) {
      doc.listingExpiry = { ...doc.listingExpiry?.toObject?.(), ...patch.listingExpiry };
    }
    if (patch.passwordChangeSms) {
      doc.passwordChangeSms = {
        ...doc.passwordChangeSms?.toObject?.(),
        ...patch.passwordChangeSms,
      };
    }
    if (patch.sms) doc.sms = { ...doc.sms?.toObject?.(), ...patch.sms };
    if (patch.cloudinary) {
      doc.cloudinary = { ...doc.cloudinary?.toObject?.(), ...patch.cloudinary };
    }
    doc.updatedBy = userId;
    await doc.save();
    await this.invalidate();
    return this.get(true);
  }

  async invalidate() {
    try {
      await redis.del(CACHE_KEY);
    } catch (err) {
      logger.warn(`Settings cache invalidate failed: ${err.message}`);
    }
  }
}

module.exports = new SettingsService();

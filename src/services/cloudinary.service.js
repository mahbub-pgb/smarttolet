'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const settingsService = require('./settings.service');
const config = require('../config');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

let configuredFor = null; // remembers which cloudName we configured for

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Read Cloudinary creds from settings (DB -> env). Returns null if incomplete. */
async function getCloudinaryConfig() {
  const { cloudinary: c } = await settingsService.get();
  if (!c.cloudName || !c.apiKey || !c.apiSecret) return null;
  return c;
}

function applyConfig(c) {
  if (configuredFor !== c.cloudName) {
    cloudinary.config({
      cloud_name: c.cloudName,
      api_key: c.apiKey,
      api_secret: c.apiSecret,
      secure: true,
    });
    configuredFor = c.cloudName;
  }
}

/** Dev fallback: persist the image to local disk and return a served URL. */
function saveLocally(buffer, mimetype) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = MIME_EXT[mimetype] || 'jpg';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return { url: `${config.serverUrl}/uploads/${name}`, publicId: `local:${name}` };
}

/**
 * Upload an in-memory buffer (from multer memoryStorage).
 * Uses Cloudinary when configured; otherwise falls back to local disk in
 * non-production so image upload works without external credentials.
 */
async function uploadBuffer(buffer, { folder = 'smart-tolet', resourceType = 'image', mimetype } = {}) {
  const c = await getCloudinaryConfig();
  if (!c) {
    if (config.isProd) {
      throw ApiError.internal('Cloudinary is not configured', { code: 'CLOUDINARY_UNCONFIGURED' });
    }
    logger.warn('Cloudinary not configured — storing image on local disk (development only)');
    return saveLocally(buffer, mimetype);
  }

  applyConfig(c);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => {
        if (err) return reject(ApiError.internal(`Upload failed: ${err.message}`));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

async function destroy(publicId) {
  if (!publicId) return;

  // Locally-stored images carry a `local:` prefix.
  if (publicId.startsWith('local:')) {
    const name = publicId.slice('local:'.length);
    fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
    return;
  }

  const c = await getCloudinaryConfig();
  if (!c) return; // nothing we can do; never block deletes on missing config
  applyConfig(c);
  await cloudinary.uploader.destroy(publicId);
}

module.exports = { uploadBuffer, destroy, UPLOAD_DIR };

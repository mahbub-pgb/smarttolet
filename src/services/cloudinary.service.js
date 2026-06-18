'use strict';

const cloudinary = require('cloudinary').v2;
const settingsService = require('./settings.service');
const ApiError = require('../utils/ApiError');

let configuredFor = null; // remembers which cloudName we configured for

/** Lazily configure the SDK from settings (DB -> env). */
async function ensureConfigured() {
  const { cloudinary: c } = await settingsService.get();
  if (!c.cloudName || !c.apiKey || !c.apiSecret) {
    throw ApiError.internal('Cloudinary is not configured', { code: 'CLOUDINARY_UNCONFIGURED' });
  }
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

/** Upload an in-memory buffer (from multer memoryStorage). */
async function uploadBuffer(buffer, { folder = 'smart-tolet', resourceType = 'image' } = {}) {
  await ensureConfigured();
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
  await ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}

module.exports = { uploadBuffer, destroy };

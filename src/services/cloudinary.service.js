'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
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

/**
 * Sniff the real file type from magic bytes. The client-declared MIME (checked
 * by multer) is spoofable, so we confirm the bytes actually are one of the
 * allowed image formats before doing anything with the buffer. Rejects
 * polyglots / renamed scripts that merely claim to be images.
 */
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

function assertRealImage(buffer) {
  if (!detectImageType(buffer)) {
    throw ApiError.badRequest('Uploaded file is not a valid image', { code: 'INVALID_IMAGE' });
  }
}

// Cap the longest edge so huge phone photos shrink before they ever leave the
// server. Listing/profile images never need more than this.
const MAX_EDGE = 1920;

/**
 * Re-encode an image buffer at a sensible quality and bounded dimensions to
 * cut storage and bandwidth. Format is preserved. Animated GIFs are returned
 * untouched (compressing them would flatten the animation), and we keep the
 * original whenever compression doesn't actually make it smaller.
 */
async function compressImage(buffer, mimetype) {
  if (mimetype === 'image/gif') return buffer;
  try {
    const pipeline = sharp(buffer)
      .rotate() // bake in EXIF orientation before stripping metadata
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });

    if (mimetype === 'image/png') pipeline.png({ compressionLevel: 9, palette: true });
    else if (mimetype === 'image/webp') pipeline.webp({ quality: 80 });
    else pipeline.jpeg({ quality: 80, mozjpeg: true });

    const out = await pipeline.toBuffer();
    return out.length < buffer.length ? out : buffer;
  } catch (err) {
    logger.warn(`Image compression failed, using original: ${err.message}`);
    return buffer;
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
  if (resourceType === 'image') {
    assertRealImage(buffer); // reject anything whose bytes aren't a real image
    buffer = await compressImage(buffer, mimetype);
  }
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

/**
 * Best-effort removal of a stored image. Never throws: a failed image cleanup
 * must not block deleting its parent listing. Failures are logged so orphaned
 * images can be spotted instead of disappearing silently.
 */
async function destroy(publicId) {
  if (!publicId) return;

  // Locally-stored images carry a `local:` prefix.
  if (publicId.startsWith('local:')) {
    const name = publicId.slice('local:'.length);
    try {
      await fs.promises.unlink(path.join(UPLOAD_DIR, name));
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn(`Failed to delete local image ${name}: ${err.message}`);
    }
    return;
  }

  const c = await getCloudinaryConfig();
  if (!c) {
    logger.warn(`Cannot delete Cloudinary image ${publicId}: Cloudinary is not configured`);
    return; // never block deletes on missing config
  }
  applyConfig(c);
  try {
    const res = await cloudinary.uploader.destroy(publicId);
    // Cloudinary returns { result: 'ok' | 'not found' } rather than throwing.
    if (res?.result !== 'ok' && res?.result !== 'not found') {
      logger.warn(`Cloudinary did not delete image ${publicId}: ${res?.result}`);
    }
  } catch (err) {
    logger.warn(`Failed to delete Cloudinary image ${publicId}: ${err.message}`);
  }
}

module.exports = { uploadBuffer, destroy, UPLOAD_DIR };

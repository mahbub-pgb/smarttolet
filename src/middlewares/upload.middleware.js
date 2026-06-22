'use strict';

const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per image (hard ceiling)
// Hard upper bound on file count. The real, admin-configurable per-listing
// limit is enforced in listing.service against the Settings document; this is
// just a safety ceiling that must be >= the highest configurable value (30).
const MAX_FILES = 30;

/**
 * In-memory storage so files stream straight to Cloudinary without touching
 * disk. File type + size are validated here (defence-in-depth).
 */
const storage = multer.memoryStorage();

function imageFileFilter(_req, file, cb) {
  if (!ALLOWED_IMAGE.includes(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
  cb(null, true);
}

const uploadImages = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

module.exports = {
  uploadListingImages: uploadImages.array('images', MAX_FILES),
  uploadMedia: uploadImages.array('images', MAX_FILES),
  uploadAvatar: uploadImages.single('profileImage'),
  uploadSingle: uploadImages.single('image'),
};

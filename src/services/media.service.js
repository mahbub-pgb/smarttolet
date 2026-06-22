'use strict';

const { mediaRepository } = require('../repositories');
const cloudinaryService = require('./cloudinary.service');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants');

// Only admins (and super admins) may reach across owners — to browse the whole
// library or delete someone else's image. Moderators are limited to their own.
const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];
const isAdmin = (role) => ADMIN_ROLES.includes(role);

class MediaService {
  /**
   * Upload one or more in-memory image buffers (multer memoryStorage) into the
   * caller's personal library. Each image is compressed + stored via Cloudinary
   * (or local disk in dev) and recorded as a Media document.
   */
  async upload(userId, files = []) {
    if (!files.length) throw ApiError.badRequest('No image provided');

    const stored = await Promise.all(
      files.map(async (f) => {
        const { url, publicId } = await cloudinaryService.uploadBuffer(f.buffer, {
          folder: 'smart-tolet/media',
          mimetype: f.mimetype,
        });
        return mediaRepository.create({
          owner: userId,
          url,
          publicId,
          filename: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
        });
      }),
    );

    return stored;
  }

  /**
   * Paginated library list. Always scoped to the caller's own media, unless the
   * caller is staff and explicitly asks for scope=all.
   */
  async list(userId, role, { page = 1, limit = 20, scope = 'mine' } = {}) {
    // Non-admins always see only their own media, whatever scope they ask for.
    const filter = isAdmin(role) && scope === 'all' ? {} : { owner: userId };
    return mediaRepository.paginate(filter, { page: Number(page), limit: Number(limit) });
  }

  /**
   * Permanently delete a library image: removes the underlying stored asset
   * (Cloudinary / local disk) and the Media record. Owners can delete their own;
   * staff can delete anyone's. Note: this does NOT touch listings that already
   * embedded a copy of the image — those keep their own { url, publicId }.
   */
  async remove(userId, role, id) {
    const media = await mediaRepository.findById(id);
    if (!media) throw ApiError.notFound('Image not found');

    if (!isAdmin(role) && String(media.owner) !== String(userId)) {
      throw ApiError.forbidden('You can only delete your own media');
    }

    await cloudinaryService.destroy(media.publicId); // best-effort, never throws
    await mediaRepository.deleteById(media._id);
    return { id: media._id };
  }

  /**
   * Delete several library images at once. Non-admins can only delete their own;
   * ids that don't exist or aren't theirs are silently skipped, so a stale
   * selection can't remove someone else's data. Returns how many were removed.
   */
  async removeMany(userId, role, ids) {
    const filter = { _id: { $in: ids } };
    if (!isAdmin(role)) filter.owner = userId;

    const docs = await mediaRepository.find(filter);
    await Promise.allSettled(docs.map((m) => cloudinaryService.destroy(m.publicId)));
    await Promise.all(docs.map((m) => mediaRepository.deleteById(m._id)));
    return { requested: ids.length, deleted: docs.length };
  }
}

module.exports = new MediaService();

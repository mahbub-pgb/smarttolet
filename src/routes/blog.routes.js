'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/blog.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { uploadSingle } = require('../middlewares/upload.middleware');
const { PERMISSIONS } = require('../constants');
const v = require('../validations/blog.validation');

// All write operations require the blog-management permission, which every
// staff role (moderator/admin/super_admin) holds.
const canManage = [authenticate, requirePermission(PERMISSIONS.MANAGE_BLOG)];

/**
 * @openapi
 * /blog:
 *   get:
 *     tags: [Blog]
 *     summary: List published blog posts
 *     security: []
 *     responses:
 *       200: { description: Paginated posts, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/', validate(v.search), ctrl.listPublic);

// Public taxonomy lists. Defined before '/:slug' so they aren't read as slugs.
router.get('/categories', ctrl.listCategories);
router.get('/tags', ctrl.listTags);

// ---- Staff management (specific paths before '/:slug') ----
router.get('/admin/list', ...canManage, validate(v.adminSearch), ctrl.listAdmin);
router.get('/admin/:id', ...canManage, validate({ params: v.idParam }), ctrl.getAdminOne);
router.post('/admin/bulk-delete', ...canManage, validate(v.bulkDelete), ctrl.removeMany);
router.post('/upload-image', ...canManage, uploadSingle, ctrl.uploadImage);

router.post('/categories', ...canManage, validate(v.taxonomy), ctrl.createCategory);
router.delete('/categories/:id', ...canManage, validate({ params: v.idParam }), ctrl.removeCategory);
router.post('/tags', ...canManage, validate(v.taxonomy), ctrl.createTag);
router.delete('/tags/:id', ...canManage, validate({ params: v.idParam }), ctrl.removeTag);

router.post('/', ...canManage, validate(v.create), ctrl.create);
router.put('/:id', ...canManage, validate(v.update), ctrl.update);
router.delete('/:id', ...canManage, validate({ params: v.idParam }), ctrl.remove);

/**
 * @openapi
 * /blog/{slug}:
 *   get:
 *     tags: [Blog]
 *     summary: Get a single published post by slug (or id)
 *     security: []
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Post, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       404: { description: Not found }
 */
// Catch-all single-segment GET — must stay last.
router.get('/:slug', validate(v.slugParam), ctrl.getPublicOne);

module.exports = router;

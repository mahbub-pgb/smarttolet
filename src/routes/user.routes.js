'use strict';

const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { favorites, savedSearches, notifications } = require('../controllers/misc.controllers');
const m = require('../validations/misc.validation');
const { idParam } = require('../validations/common.validation');

router.use(authenticate);

/**
 * @openapi
 * /me/favorites:
 *   get:
 *     tags: [Me]
 *     summary: List favorite listings
 *     responses:
 *       200: { description: Favorites, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/favorites', favorites.list);

/**
 * @openapi
 * /me/favorites/{id}:
 *   post:
 *     tags: [Me]
 *     summary: Add a listing to favorites
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Added, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   delete:
 *     tags: [Me]
 *     summary: Remove a listing from favorites
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Removed, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/favorites/:id', validate({ params: idParam }), favorites.add);
router.delete('/favorites/:id', validate({ params: idParam }), favorites.remove);

/**
 * @openapi
 * /me/saved-searches:
 *   get:
 *     tags: [Me]
 *     summary: List saved searches
 *     responses:
 *       200: { description: Saved searches, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     tags: [Me]
 *     summary: Create a saved search
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/saved-searches', savedSearches.list);
router.post('/saved-searches', validate(m.savedSearch.create), savedSearches.create);

/**
 * @openapi
 * /me/saved-searches/{id}:
 *   delete:
 *     tags: [Me]
 *     summary: Delete a saved search
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.delete('/saved-searches/:id', validate({ params: idParam }), savedSearches.remove);

/**
 * @openapi
 * /me/notifications:
 *   get:
 *     tags: [Me]
 *     summary: List notifications
 *     responses:
 *       200: { description: Notifications, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/notifications', notifications.list);

/**
 * @openapi
 * /me/notifications/unread-count:
 *   get:
 *     tags: [Me]
 *     summary: Get the count of unread notifications
 *     responses:
 *       200: { description: Unread count, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/notifications/unread-count', notifications.unreadCount);

/**
 * @openapi
 * /me/notifications/read-all:
 *   patch:
 *     tags: [Me]
 *     summary: Mark all notifications as read
 *     responses:
 *       200: { description: All marked read, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch('/notifications/read-all', notifications.markAllRead);

/**
 * @openapi
 * /me/notifications/{id}/read:
 *   patch:
 *     tags: [Me]
 *     summary: Mark a single notification as read
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Marked read, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch('/notifications/:id/read', validate({ params: idParam }), notifications.markRead);

module.exports = router;

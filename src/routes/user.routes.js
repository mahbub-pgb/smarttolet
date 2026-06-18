'use strict';

const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { favorites, savedSearches, notifications } = require('../controllers/misc.controllers');
const m = require('../validations/misc.validation');
const { idParam } = require('../validations/common.validation');

router.use(authenticate);

// Favorites
router.get('/favorites', favorites.list);
router.post('/favorites/:id', validate({ params: idParam }), favorites.add);
router.delete('/favorites/:id', validate({ params: idParam }), favorites.remove);

// Saved searches
router.get('/saved-searches', savedSearches.list);
router.post('/saved-searches', validate(m.savedSearch.create), savedSearches.create);
router.delete('/saved-searches/:id', validate({ params: idParam }), savedSearches.remove);

// Notifications
router.get('/notifications', notifications.list);
router.get('/notifications/unread-count', notifications.unreadCount);
router.patch('/notifications/read-all', notifications.markAllRead);
router.patch('/notifications/:id/read', validate({ params: idParam }), notifications.markRead);

module.exports = router;

'use strict';

const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { chat } = require('../controllers/misc.controllers');
const m = require('../validations/misc.validation');
const { idParam } = require('../validations/common.validation');

router.use(authenticate);

router.get('/conversations', chat.listConversations);
router.post('/conversations', validate(m.chat.startConversation), chat.start);
router.get('/conversations/:id/messages', validate({ params: idParam }), chat.getMessages);
router.post('/conversations/:id/messages', validate(m.chat.sendMessage), chat.sendMessage);
router.patch('/conversations/:id/read', validate({ params: idParam }), chat.markRead);

module.exports = router;

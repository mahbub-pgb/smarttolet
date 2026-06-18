'use strict';

const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { chat } = require('../controllers/misc.controllers');
const m = require('../validations/misc.validation');
const { idParam } = require('../validations/common.validation');

router.use(authenticate);

/**
 * @openapi
 * /chat/conversations:
 *   get:
 *     tags: [Chat]
 *     summary: List the user's conversations
 *     responses:
 *       200: { description: Conversations, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     tags: [Chat]
 *     summary: Start a new conversation
 *     responses:
 *       201: { description: Conversation started, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/conversations', chat.listConversations);
router.post('/conversations', validate(m.chat.startConversation), chat.start);

/**
 * @openapi
 * /chat/conversations/{id}/messages:
 *   get:
 *     tags: [Chat]
 *     summary: Get messages in a conversation
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Messages, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     tags: [Chat]
 *     summary: Send a message in a conversation
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: Message sent, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/conversations/:id/messages', validate({ params: idParam }), chat.getMessages);
router.post('/conversations/:id/messages', validate(m.chat.sendMessage), chat.sendMessage);

/**
 * @openapi
 * /chat/conversations/{id}/read:
 *   patch:
 *     tags: [Chat]
 *     summary: Mark a conversation as read
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Marked read, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch('/conversations/:id/read', validate({ params: idParam }), chat.markRead);

module.exports = router;

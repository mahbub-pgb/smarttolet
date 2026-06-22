'use strict';

const router = require('express').Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Public]
 *     summary: Service health check
 *     security: []
 *     responses:
 *       200: { description: Service is up, content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/health', (_req, res) =>
  res.json({ success: true, status: 'ok', uptime: process.uptime() }),
);

router.use('/auth', require('./auth.routes'));
router.use('/listings', require('./listing.routes'));
router.use('/blog', require('./blog.routes'));
router.use('/media', require('./media.routes'));
router.use('/me', require('./user.routes'));
router.use('/chat', require('./chat.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/public', require('./public.routes'));

module.exports = router;

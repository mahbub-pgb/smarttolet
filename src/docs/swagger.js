'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');

/**
 * OpenAPI definition. Path-level docs live in JSDoc @openapi blocks across the
 * route files; the high-level info, security scheme, and shared schemas live
 * here. Served at `${API_PREFIX}/docs`.
 */
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Smart To-Let API',
    version: '1.0.0',
    description:
      'Rental marketplace platform for Bangladesh. JWT-secured REST API with ' +
      'role-based access control, OTP auth, listings, chat, subscriptions and payments.',
  },
  servers: [{ url: config.apiPrefix, description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          code: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
      ApiSuccess: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' },
          meta: { type: 'object' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Registration, OTP, login, sessions' },
    { name: 'Listings', description: 'Property listings & search' },
    { name: 'Me', description: 'Favorites, saved searches, notifications' },
    { name: 'Chat', description: 'Conversations & messages' },
    { name: 'Payments', description: 'Subscriptions & payments' },
    { name: 'Admin', description: 'Dashboard, moderation, settings' },
    { name: 'Public', description: 'Public settings & nearby places' },
  ],
};

const swaggerSpec = swaggerJsdoc({
  definition,
  // Pick up @openapi JSDoc blocks placed in route files.
  apis: ['./src/routes/*.js', './src/docs/*.yaml'],
});

module.exports = swaggerSpec;

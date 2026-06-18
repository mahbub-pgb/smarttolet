'use strict';

const Redis = require('ioredis');
const config = require('./index');
const logger = require('./logger');

/**
 * Single shared ioredis client. A separate duplicate is created where a
 * blocking/subscriber connection is needed (e.g. socket.io adapter).
 */
const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));

async function connectRedis() {
  if (redis.status === 'ready' || redis.status === 'connecting') return redis;
  await redis.connect();
  return redis;
}

module.exports = { redis, connectRedis };

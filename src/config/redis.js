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
  if (redis.status === 'ready') return redis;
  // Only the idle states accept an explicit connect(); a command issued at
  // module load (e.g. rate-limit-redis) can auto-connect first, leaving the
  // client in 'connecting'/'connect'. In that case just wait for ready.
  if (redis.status === 'wait' || redis.status === 'end' || redis.status === 'close') {
    await redis.connect();
    return redis;
  }
  await new Promise((resolve, reject) => {
    redis.once('ready', resolve);
    redis.once('error', reject);
  });
  return redis;
}

module.exports = { redis, connectRedis };

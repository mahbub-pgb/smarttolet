'use strict';

const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { connectRedis, redis } = require('./config/redis');
const { initSocket } = require('./sockets');
const { startJobs, stopJobs } = require('./jobs');

let server;

async function bootstrap() {
  await connectDB();
  await connectRedis();

  server = http.createServer(app);
  initSocket(server);
  startJobs();

  server.listen(config.port, () => {
    logger.info(`Smart To-Let API listening on :${config.port} (${config.env})`);
    logger.info(`Docs at http://localhost:${config.port}${config.apiPrefix}/docs`);
  });
}

async function shutdown(signal) {
  logger.warn(`${signal} received, shutting down...`);
  stopJobs();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDB();
  await redis.quit().catch(() => {});
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err?.message}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err?.message}\n${err?.stack}`);
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error(`Startup failed: ${err.message}`);
  process.exit(1);
});

'use strict';

const winston = require('winston');
const config = require('./index');

const logger = winston.createLogger({
  level: config.isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.isProd
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ level, message, timestamp, stack }) =>
              `${timestamp} ${level}: ${stack || message}`,
          ),
        ),
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

module.exports = logger;

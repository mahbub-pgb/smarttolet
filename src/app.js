'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const logger = require('./config/logger');
const routes = require('./routes');
const swaggerSpec = require('./docs/swagger');
const { globalLimiter } = require('./middlewares/rateLimit.middleware');
const maintenanceGuard = require('./middlewares/maintenance.middleware');
const { optionalAuth } = require('./middlewares/auth.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.set('trust proxy', 1); // correct client IPs behind a reverse proxy

// ---- Security & parsing ----
app.use(helmet());
// In development allow any localhost origin (the client + admin run on
// different Vite ports); in production only the configured client URL(s).
const allowedOrigins = config.clientUrl.split(',').map((o) => o.trim());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl / mobile apps
      if (!config.isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize()); // strip $ / . from keys -> NoSQL injection defence
app.use(hpp()); // protect against HTTP parameter pollution
app.use(compression());

if (!config.isProd) {
  app.use(morgan('dev'));
}

// ---- Docs ----
app.use(`${config.apiPrefix}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get(`${config.apiPrefix}/docs.json`, (_req, res) => res.json(swaggerSpec));

// ---- Rate limit + maintenance gate, then routes ----
// optionalAuth runs first so the maintenance gate can let staff through.
app.use(config.apiPrefix, globalLimiter, optionalAuth, maintenanceGuard, routes);

app.get('/', (_req, res) =>
  res.json({ name: 'Smart To-Let API', docs: `${config.apiPrefix}/docs` }),
);

// ---- Errors ----
app.use(notFound);
app.use(errorHandler);

logger.debug('Express app configured');

module.exports = app;

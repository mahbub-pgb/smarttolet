# Smart To-Let — Rental Marketplace (Bangladesh)

Production-grade backend for a rental marketplace, built with **Node.js, Express, MongoDB/Mongoose, Redis, Socket.io, JWT, Cloudinary and Google Maps**, following clean (layered) architecture and RBAC.

> Status: the core platform is implemented end-to-end (auth/OTP/RBAC, listings + moderation, favorites, saved searches, chat, notifications, reports, subscriptions, payments orchestration, settings with caching, admin analytics, smart "nearby" places, Swagger). Live SMS and bKash/Nagad/Rocket gateways are wired as pluggable adapters with a working mock/sandbox path — drop in provider credentials to go live.

---

## Architecture

Layered, dependency flows downward only:

```
Route → Middleware (auth, rbac, validate) → Controller → Service → Repository → Model (Mongoose)
```

- **Routes** declare endpoints + which middleware/validation applies.
- **Controllers** are thin: parse `req`, call a service, send the response envelope.
- **Services** hold business logic and orchestration (the only layer that knows "how the platform works").
- **Repositories** wrap Mongoose models so storage is swappable and mockable.
- **Models** define schema, indexes, hooks.

### Folder structure

```
src/
├── config/          # env, db, redis, cloudinary bootstrap, logger
├── constants/       # roles, permissions, enums (single source of truth)
├── controllers/     # thin HTTP handlers
├── services/        # business logic (auth, listing, settings, chat, payment, ...)
├── repositories/    # data-access wrappers over models
├── middlewares/     # auth, rbac, validate, error, rateLimit, upload, maintenance
├── models/          # Mongoose schemas
├── validations/     # Zod request schemas
├── routes/          # Express routers, mounted under API_PREFIX
├── sockets/         # Socket.io realtime (chat, notifications)
├── jobs/            # scheduled jobs + seeders
├── utils/           # ApiError, ApiResponse, token, otp, geo, asyncHandler
├── docs/            # OpenAPI/Swagger definition
├── app.js           # express app (middleware + routes)
└── server.js        # http + socket + jobs bootstrap, graceful shutdown
```

---

## Getting started

```bash
cp .env.example .env       # fill in secrets
npm install
# Requires a running MongoDB and Redis (see .env)
npm run seed:admin         # create the initial super admin
npm run dev                # nodemon
# or
npm start
```

- API base: `http://localhost:5000/api/v1`
- Swagger UI: `http://localhost:5000/api/v1/docs`
- Health: `GET /api/v1/health`

> MongoDB and Redis are required at runtime. Without Redis, OTP, caching and rate limiting will not function.

---

## Registration & authentication flow

Two-step registration backed by OTP in Redis:

1. **`POST /auth/otp/request`** `{ mobile }` → OTP generated, hashed (SHA-256) and stored in Redis with TTL (`OTP_EXPIRY_SECONDS`), sent via SMS provider. A per-number resend cooldown applies. In non-production the OTP is returned as `devOtp`.
2. **`POST /auth/otp/verify`** `{ mobile, code }` → on success a phone-verified account is created (defaulting to the Free subscription) and an **access + refresh token pair** is returned. Attempts are counted; lockout after `OTP_MAX_ATTEMPTS`.
3. **`PUT /auth/profile`** (Bearer access token) → completes the profile (name, email, photo, DOB, gender, occupation, NID, address, geo location, area preferences) and optionally sets a password.

Sessions:
- **Access token** (`JWT_ACCESS_EXPIRES_IN`, default 15m) — sent as `Authorization: Bearer <token>`.
- **Refresh token** (default 30d) — set as an httpOnly cookie and accepted by `POST /auth/refresh`. `tokenVersion` on the user invalidates old refresh tokens on logout/revoke.
- **`POST /auth/login`** `{ identifier, password }` — login by mobile or email.

### Authorization (RBAC)

Roles: `user → moderator → admin → super_admin` (ascending power). Routes guard on **granular permissions** (`src/constants/roles.js`), not raw roles, so capabilities can be re-mapped centrally. `requirePermission(...)` and `requireRole(...)` middleware enforce access; role-assignment is bounded so no one can grant a role ≥ their own.

---

## Settings service (Google Maps key, SMS, Cloudinary, maintenance)

`src/services/settings.service.js` resolves each setting with precedence **DB document → `.env` fallback**, caches the resolved object in **Redis (10-min TTL)**, and invalidates on write. Secret fields are `select:false` and never returned by the public endpoint.

- `GET /public/settings` — secret-free settings for the frontend (incl. the Maps key, which the browser SDK legitimately needs; restrict it by HTTP referrer in Google Cloud).
- `GET /admin/settings` — masked admin view (shows which secrets are configured).
- `PUT /admin/settings` — update site name/logo, support contacts, **Google Maps API key**, SMS provider/key, Cloudinary config, and maintenance mode.

---

## API endpoints (summary)

All under `/api/v1`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/otp/request` | – | Send phone OTP |
| POST | `/auth/otp/verify` | – | Verify OTP, create account, issue tokens |
| PUT | `/auth/profile` | user | Complete/update profile |
| POST | `/auth/login` | – | Password login |
| POST | `/auth/refresh` | – | Rotate tokens |
| POST | `/auth/logout` | user | Revoke refresh tokens |
| GET | `/auth/me` | user | Current user |
| POST | `/auth/email/otp/request` · `/verify` | user | Email verification |
| GET | `/listings` | – | Search/browse (keyword, location, rent, geo radius) |
| GET | `/listings/:id` | – | Listing detail (+view count) |
| GET | `/listings/:id/nearby` | – | Smart nearby places (schools, hospitals, ...) |
| POST | `/listings` | user | Create listing (multipart, up to 10 images) |
| GET | `/listings/me/list` | user | My listings |
| PUT/DELETE | `/listings/:id` | owner | Edit / delete |
| POST | `/listings/:id/report` | user | Report a listing |
| GET/POST/DELETE | `/me/favorites...` | user | Favorites |
| GET/POST/DELETE | `/me/saved-searches...` | user | Saved searches |
| GET/PATCH | `/me/notifications...` | user | Notifications |
| GET/POST | `/chat/conversations...` | user | Conversations & messages (REST mirror of socket) |
| POST | `/payments/initiate` · `/verify` | user/– | Subscription payment (bKash/Nagad/Rocket) |
| GET | `/payments/subscription` | user | Active subscription |
| GET | `/admin/dashboard` · `/charts` | staff | Analytics cards & growth charts |
| GET/PATCH | `/admin/users...` | staff | User & staff management |
| GET/PATCH | `/admin/listings/queue` · `/:id/moderate` | staff | Moderation |
| GET/PATCH | `/admin/reports...` | staff | Report resolution |
| GET | `/admin/payments` | super_admin | Payment ledger |
| GET/PUT | `/admin/settings` | staff | Platform settings |
| GET | `/public/settings` · `/public/places/nearby` | – | Public config & geo |

Full request/response schemas: **Swagger UI at `/api/v1/docs`** (`/api/v1/docs.json` for the raw spec).

---

## Realtime chat (Socket.io)

Authenticated via JWT handshake (`socket.handshake.auth.token`). Each user joins `user:<id>`; conversations use `conversation:<id>` rooms.

Events: `conversation:join` / `leave`, `message:send` → `message:new`, `message:delivered` / `conversation:read` → `message:status`, `typing`, plus `notification:new` pushed by the notification service.

---

## Data models

`User`, `Listing`, `Favorite`, `SavedSearch`, `Conversation`, `Message`, `Notification`, `Report`, `Subscription`, `Payment`, `Advertisement`, `Settings`. Notable design points:

- **Geospatial**: `User.location` and `Listing.geo` are GeoJSON `Point` with `2dsphere` indexes for `$near` radius search.
- **Text search**: `Listing` has a text index on title/description/area.
- **Listing limits** enforced by subscription plan (`PLAN_LISTING_LIMITS`).
- **Uniqueness**: one favorite/report per (user, listing); one conversation per participant-pair+listing.

---

## Security

Helmet, CORS (credentialed), `express-mongo-sanitize` (NoSQL injection), `hpp`, request size limits, **Zod** input validation, **bcrypt** password hashing, JWT access/refresh with rotation + `tokenVersion` revocation, **Redis-backed rate limiting** (global + tight auth/OTP limiters), OTP hashing + TTL + attempt lockout, secure file uploads (memory storage, MIME + size limits), httpOnly secure cookies in production, and secret fields hidden via `select:false`.

---

## Production notes

- Run multiple stateless app instances behind a load balancer; sticky sessions or the **socket.io Redis adapter** for multi-node websockets.
- Move `src/jobs` to a dedicated worker with a distributed lock (e.g. BullMQ) so scheduled jobs run once cluster-wide.
- Set strong `JWT_*` secrets, real `MONGO_URI`/`REDIS_URL`, configure Cloudinary + Maps + SMS (preferably via the admin Settings UI).
- Put a reverse proxy (Nginx) in front; `trust proxy` is already enabled for correct client IPs.
- Restrict the Google Maps browser key by HTTP referrer; keep server-side keys (SMS, Cloudinary secret) out of public responses.
```

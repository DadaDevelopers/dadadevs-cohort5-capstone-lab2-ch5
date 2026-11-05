# CommunitySafe backend

Node.js, Express, PostgreSQL and Prisma backend for authentication, community management and Regtest multisignature wallets.

Install the locked dependencies with `npm ci`, configure `.env` from `.env.example`, apply migrations with `npx prisma migrate deploy`, and start the API with `npm start`. Run unit tests with `npm test`.

For wallet creation, watch-only Bitcoin Core setup, the external PSBT signing workflow, API routes, key rotation limits and opt-in Regtest verification, read [WALLET_MANAGEMENT.md](WALLET_MANAGEMENT.md).

For the presentation workflow from user registration through a confirmed spend, including Swagger and PowerShell steps, use [MVP_WALLET_DEMO.md](MVP_WALLET_DEMO.md). The development signer utility is available through `npm run regtest:signer -- --help`.

## Rate limiting

Rate limits use `express-rate-limit`'s in-memory store, so counters belong to one backend process and are not shared through Redis. Public authentication and refresh requests are keyed by client IP. Authenticated session, community, and financial-operation limits are keyed by user ID. Five failed logins for the same normalized email and IP still cause a 15-minute lockout.

Production keeps conservative defaults (30 public-auth, 10 login, 120 refresh/session, 300 community, and 30 financial requests per 15 minutes). Development defaults are higher for page composition and integration testing (300, 50, 1000, 2000, 5000, and 120 respectively). `NODE_ENV=test` uses isolated high defaults so unrelated tests do not exhaust a shared bucket; focused limiter tests supply their own small window and threshold.

All thresholds can be changed with `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_REFRESH_MAX`, `RATE_LIMIT_SESSION_MAX`, `RATE_LIMIT_COMMUNITY_MAX`, `RATE_LIMIT_FINANCIAL_MAX`, or `RATE_LIMIT_DISCUSSION_MAX`. Failed-login protection is configured separately with `LOGIN_FAILED_ATTEMPT_LIMIT` and `LOGIN_LOCKOUT_MS`. Invalid or missing positive integers fall back to the defaults for the current environment; development values therefore cannot leak into `NODE_ENV=production` unless explicitly configured.

When deployed behind a reverse proxy, set `TRUST_PROXY` to the exact proxy-hop count so IP-based authentication buckets use the real client IP. Leave it unset for direct local connections. Rate-limited responses include `Retry-After` and standard `RateLimit` headers, which CORS exposes to the frontend. The browser client displays the wait time and does not automatically retry HTTP 429 responses.

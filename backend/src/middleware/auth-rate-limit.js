const { rateLimit } = require("express-rate-limit");
const { normalizeEmail, isNonEmptyString } = require("../lib/auth-validation");

// In-memory limits are per server process; use a shared store for multiple replicas.
const MINUTE_MS = 60 * 1000;
const ENVIRONMENT_DEFAULTS = {
  production: { auth: 30, login: 10, refresh: 120, session: 120, community: 300, financial: 30, discussion: 60 },
  development: { auth: 300, login: 50, refresh: 1000, session: 2000, community: 5000, financial: 120, discussion: 300 },
  test: { auth: 10000, login: 10000, refresh: 10000, session: 10000, community: 10000, financial: 10000, discussion: 10000 },
};

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getRateLimitConfig(env = process.env) {
  const environment = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";
  const defaults = ENVIRONMENT_DEFAULTS[environment];
  return {
    environment,
    windowMs: positiveInteger(env.RATE_LIMIT_WINDOW_MS, 15 * MINUTE_MS),
    authMax: positiveInteger(env.RATE_LIMIT_AUTH_MAX, defaults.auth),
    loginMax: positiveInteger(env.RATE_LIMIT_LOGIN_MAX, defaults.login),
    refreshMax: positiveInteger(env.RATE_LIMIT_REFRESH_MAX, defaults.refresh),
    sessionMax: positiveInteger(env.RATE_LIMIT_SESSION_MAX, defaults.session),
    communityMax: positiveInteger(env.RATE_LIMIT_COMMUNITY_MAX, defaults.community),
    financialMax: positiveInteger(env.RATE_LIMIT_FINANCIAL_MAX, defaults.financial),
    discussionMax: positiveInteger(env.RATE_LIMIT_DISCUSSION_MAX, defaults.discussion),
    failedAttemptLimit: positiveInteger(env.LOGIN_FAILED_ATTEMPT_LIMIT, 5),
    lockoutMs: positiveInteger(env.LOGIN_LOCKOUT_MS, 15 * MINUTE_MS),
  };
}

const config = getRateLimitConfig();

function rateLimited(req, res) {
  return res.status(429).json({ error: "Too many requests" });
}

function createRateLimiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: rateLimited,
  });
}

// Public credential and recovery operations share a conservative IP bucket.
// Routine authenticated reads deliberately do not consume this bucket.
const authLimiter = createRateLimiter({ windowMs: config.windowMs, limit: config.authMax });

const loginLimiter = createRateLimiter({ windowMs: config.windowMs, limit: config.loginMax });

// Session restoration/refresh and ordinary application navigation need room for
// page composition and multiple tabs. Community requests are keyed by the
// authenticated user so people behind one proxy do not exhaust each other.
const refreshLimiter = createRateLimiter({ windowMs: config.windowMs, limit: config.refreshMax });
const sessionLimiter = createRateLimiter({
  windowMs: config.windowMs,
  limit: config.sessionMax,
  keyGenerator: (req) => `user:${req.userId}`,
});
const communityLimiter = createRateLimiter({
  windowMs: config.windowMs,
  limit: config.communityMax,
  keyGenerator: (req) => `user:${req.userId}`,
});
const financialLimiter = createRateLimiter({
  windowMs: config.windowMs,
  limit: config.financialMax,
  keyGenerator: (req) => `user:${req.userId}`,
});
const discussionLimiter = createRateLimiter({
  windowMs: config.windowMs,
  limit: config.discussionMax,
  keyGenerator: (req) => `user:${req.userId}`,
});

const failures = new Map();
const failureKey = (req, email) => `${req.ip}:${normalizeEmail(email)}`;

function loginLockout(req, res, next) {
  if (!isNonEmptyString(req.body?.email)) return next();
  const key = failureKey(req, req.body.email);
  const state = failures.get(key);
  if (state && state.count >= config.failedAttemptLimit && state.until > Date.now()) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((state.until - Date.now()) / 1000))));
    return res.status(429).json({ error: "Too many login attempts" });
  }
  if (state && state.until <= Date.now()) failures.delete(key);
  return next();
}

function recordLoginFailure(req, email) {
  const key = failureKey(req, email);
  const state = failures.get(key) || { count: 0, until: Date.now() + config.lockoutMs };
  state.count += 1;
  if (state.count >= config.failedAttemptLimit) state.until = Date.now() + config.lockoutMs;
  failures.set(key, state);
}

function clearLoginFailures(req, email) {
  failures.delete(failureKey(req, email));
}

// Discard inactive entries so attempts against random emails cannot grow the map forever.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of failures) {
    if (state.until <= now) failures.delete(key);
  }
}, config.lockoutMs);
cleanup.unref();

module.exports = {
  authLimiter,
  loginLimiter,
  sessionLimiter,
  refreshLimiter,
  communityLimiter,
  financialLimiter,
  discussionLimiter,
  createRateLimiter,
  getRateLimitConfig,
  loginLockout,
  recordLoginFailure,
  clearLoginFailures,
};

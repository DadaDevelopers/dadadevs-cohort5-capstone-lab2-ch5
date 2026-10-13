const { rateLimit } = require("express-rate-limit");
const { normalizeEmail, isNonEmptyString } = require("../lib/auth-validation");

// In-memory limits are per server process; use a shared store for multiple replicas.
const WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_REQUESTS = 30;
const LOGIN_MAX_REQUESTS = 10;
const FAILED_ATTEMPT_LIMIT = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: AUTH_MAX_REQUESTS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many requests" }),
});

const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LOGIN_MAX_REQUESTS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many requests" }),
});

const failures = new Map();
const failureKey = (req, email) => `${req.ip}:${normalizeEmail(email)}`;

function loginLockout(req, res, next) {
  if (!isNonEmptyString(req.body?.email)) return next();
  const key = failureKey(req, req.body.email);
  const state = failures.get(key);
  if (state && state.count >= FAILED_ATTEMPT_LIMIT && state.until > Date.now()) {
    return res.status(429).json({ error: "Too many login attempts" });
  }
  if (state && state.until <= Date.now()) failures.delete(key);
  return next();
}

function recordLoginFailure(req, email) {
  const key = failureKey(req, email);
  const state = failures.get(key) || { count: 0, until: Date.now() + LOCKOUT_MS };
  state.count += 1;
  if (state.count >= FAILED_ATTEMPT_LIMIT) state.until = Date.now() + LOCKOUT_MS;
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
}, LOCKOUT_MS);
cleanup.unref();

module.exports = {
  authLimiter,
  loginLimiter,
  loginLockout,
  recordLoginFailure,
  clearLoginFailures,
};

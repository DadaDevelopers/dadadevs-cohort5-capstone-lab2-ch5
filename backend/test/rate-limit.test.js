const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createRateLimiter, getRateLimitConfig } = require("../src/middleware/auth-rate-limit");

test("development is roomy while production keeps conservative rate-limit defaults", () => {
  const development = getRateLimitConfig({ NODE_ENV: "development" });
  const production = getRateLimitConfig({ NODE_ENV: "production" });
  const automated = getRateLimitConfig({ NODE_ENV: "test" });

  assert.equal(production.authMax, 30);
  assert.equal(production.loginMax, 10);
  assert.equal(production.communityMax, 300);
  assert.equal(production.financialMax, 30);
  assert.equal(production.discussionMax, 60);
  assert.ok(development.communityMax > production.communityMax);
  assert.ok(development.discussionMax > production.discussionMax);
  assert.ok(development.sessionMax > production.sessionMax);
  assert.equal(development.failedAttemptLimit, production.failedAttemptLimit);
  assert.ok(automated.communityMax > development.communityMax);
});

test("explicit positive environment values override defaults and invalid values do not", () => {
  const configured = getRateLimitConfig({
    NODE_ENV: "production",
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_COMMUNITY_MAX: "444",
    RATE_LIMIT_FINANCIAL_MAX: "0",
  });
  assert.equal(configured.windowMs, 60000);
  assert.equal(configured.communityMax, 444);
  assert.equal(configured.financialMax, 30);
});

test("rate limits expose Retry-After, isolate identities, and recover after the window", async () => {
  const app = express();
  app.use((req, res, next) => { req.userId = req.headers["x-test-user"] || "anonymous"; next(); });
  app.use(createRateLimiter({ windowMs: 500, limit: 2, keyGenerator: (req) => `test:${req.userId}` }));
  app.get("/", (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const hit = (user) => fetch(base, { headers: { "X-Test-User": user } });

  try {
    assert.equal((await hit("tab-owner")).status, 200);
    assert.equal((await hit("tab-owner")).status, 200);
    const limited = await hit("tab-owner");
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.deepEqual(await limited.json(), { error: "Too many requests" });

    // A different authenticated identity behind the same IP has its own bucket.
    assert.equal((await hit("other-user")).status, 200);

    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal((await hit("tab-owner")).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

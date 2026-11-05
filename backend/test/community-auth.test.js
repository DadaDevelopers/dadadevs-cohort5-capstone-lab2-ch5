const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "validation-test-secret";
process.env.REFRESH_TOKEN_SECRET = "validation-refresh-secret";
const prismaPath = require.resolve("../src/lib/prisma");
let queries = 0;
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  user: { async findUnique() { queries++; throw new Error("secret-password private-key SQL /internal/path"); } },
} };
const rateLimitPath = require.resolve("../src/middleware/auth-rate-limit");
require.cache[rateLimitPath] = { id: rateLimitPath, filename: rateLimitPath, loaded: true, exports: {
  authLimiter: (req, res, next) => next(), loginLimiter: (req, res, next) => next(),
  loginLockout: (req, res, next) => next(), recordLoginFailure() {}, clearLoginFailures() {},
} };
const app = require("../src/app");

test("invalid inputs and unexpected errors stay safe at the HTTP boundary", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, token) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const registration = { firstName: "Ada", lastName: "Test", email: "ada@example.com", password: "password123" };
    for (const change of [{ firstName: "x".repeat(101) }, { lastName: "x".repeat(101) }, { email: "x".repeat(250) + "@example.com" }, { password: "x".repeat(73) }, { password: "é".repeat(37) }]) {
      assert.equal((await request("/auth/register", { ...registration, ...change })).status, 400);
    }
    for (const body of [{ token: "ok", newPassword: "é".repeat(37) }, { token: "x".repeat(257), newPassword: "password123" }, { token: [], newPassword: "password123" }]) {
      assert.equal((await request("/auth/reset-password", body)).status, 400);
    }
    assert.equal((await request("/auth/login", { email: "ada@example.com", password: "x".repeat(73) })).status, 401);
    for (const userId of [0, -1, "1", 1.5, 2147483648]) {
      assert.equal((await request("/auth/me", undefined, jwt.sign({ userId }, process.env.JWT_SECRET))).status, 401);
      assert.equal((await request("/auth/refresh", { refreshToken: jwt.sign({ userId, type: "refresh" }, process.env.REFRESH_TOKEN_SECRET) })).status, 401);
    }
    assert.equal((await request("/auth/me", undefined, jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { algorithm: "HS384" }))).status, 401);
    assert.equal(queries, 0);
    assert.deepEqual(await request("/auth/me", undefined, jwt.sign({ userId: 1 }, process.env.JWT_SECRET)), {
      status: 500, body: { error: "Internal server error" },
    });
    assert.deepEqual(logs, [["Authentication request failed", "UNEXPECTED_ERROR"]]);
    const malformed = await fetch(base + "/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"password":"secret",' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "Invalid JSON" });
    const oversized = await fetch(base + "/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "x".repeat(110000) }) });
    assert.equal(oversized.status, 413);
    assert.equal((await fetch(base + "/communities/%E0%A4%A")).status, 400);
    assert.equal(logs.length, 1);
    for (const permission of ["member", "admin", "signer"]) {
      assert.equal((await fetch(base + `/communities/1/test/${permission}`)).status, 404);
      assert.equal(require("../src/openapi").paths[`/communities/{communityId}/test/${permission}`], undefined);
    }
    const spec = require("../src/openapi");
    for (const [prefix, router] of [["/auth", require("../src/routes/auth.routes")], ["/communities", require("../src/routes/community.routes")]]) {
      const documented = new Set();
      for (const layer of router.stack.filter((layer) => layer.route)) {
        const path = prefix + (layer.route.path === "/" ? "" : layer.route.path.replace(/:([A-Za-z]+)/g, "{$1}"));
        for (const method of Object.keys(layer.route.methods)) {
          const operation = spec.paths[path]?.[method];
          assert.ok(operation, `${method} ${path} needs documentation`);
          if (prefix === "/communities" || path === "/auth/me") assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
          documented.add(`${method} ${path}`);
        }
      }
      for (const [path, item] of Object.entries(spec.paths).filter(([path]) => path.startsWith(prefix))) {
        for (const method of Object.keys(item)) assert.ok(documented.has(`${method} ${path}`), `stale docs: ${method} ${path}`);
      }
    }
    const { validatePublicInfo } = require("../src/lib/signer-public-info-validation");
    for (const publicKey of [`9${"1".repeat(50)}`, `c${"1".repeat(51)}`, "xpriv-private", "-----BEGIN PRIVATE KEY-----"]) {
      assert.equal(validatePublicInfo({ publicKey }).error, "Private key material must never be submitted to the server");
    }
  } finally {
    console.error = originalError;
    await new Promise((resolve) => server.close(resolve));
  }
});

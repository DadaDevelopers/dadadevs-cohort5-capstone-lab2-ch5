const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
process.env.REFRESH_TOKEN_EXPIRES_IN = "7d";
process.env.NODE_ENV = "development";

let user;
const resetTokens = [];
const select = (record, fields) => record && fields
  ? Object.fromEntries(Object.entries(record).filter(([key]) => fields[key]))
  : record;

const prisma = {
  user: {
    async findUnique({ where, select: fields }) {
      const found = where.email ? user?.email === where.email : user?.id === where.id;
      return select(found ? user : null, fields);
    },
    async create({ data, select: fields }) {
      user = { id: 1, ...data, createdAt: new Date(), updatedAt: new Date() };
      return select(user, fields);
    },
    async update({ data }) {
      user = { ...user, ...data, updatedAt: new Date() };
      return user;
    },
  },
  passwordResetToken: {
    async create({ data }) {
      const record = { id: resetTokens.length + 1, ...data, usedAt: null };
      resetTokens.push(record);
      return record;
    },
    async findUnique({ where, select: fields }) {
      return select(resetTokens.find((record) => record.tokenHash === where.tokenHash) || null, fields);
    },
    async updateMany({ where, data }) {
      const record = resetTokens.find((item) => item.id === where.id && item.usedAt === null && item.expiresAt > where.expiresAt.gt);
      if (!record) return { count: 0 };
      Object.assign(record, data);
      return { count: 1 };
    },
  },
  async $transaction(callback) { return callback(prisma); },
  async $queryRaw() { return [1]; },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const app = require("../src/app");

test("authentication, authorization, reset, rate limits and docs", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body, headers = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };

  try {
    assert.equal((await request("/health")).status, 200);
    const registration = { firstName: " Ada ", lastName: " Lovelace ", email: " ADA@Example.com ", password: "password123" };
    assert.equal((await request("/auth/register", "POST", { ...registration, email: "invalid" })).status, 400);
    assert.equal((await request("/auth/register", "POST", { ...registration, firstName: "   " })).status, 400);
    assert.equal((await request("/auth/register", "POST", { ...registration, firstName: [] })).status, 400);
    assert.equal((await request("/auth/register", "POST", { ...registration, password: "short" })).status, 400);
    let result = await request("/auth/register", "POST", registration);
    assert.equal(result.status, 201);
    assert.equal(result.body.user.email, "ada@example.com");
    assert.equal(result.body.user.firstName, "Ada");
    assert.equal(result.body.user.passwordHash, undefined);
    assert.equal(await bcrypt.compare("password123", user.passwordHash), true);
    assert.equal((await request("/auth/register", "POST", registration)).status, 409);

    result = await request("/auth/login", "POST", { email: " ADA@example.com ", password: "password123" });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.passwordHash, undefined);
    assert.ok(result.body.token);
    assert.ok(result.body.refreshToken);
    const { token, refreshToken } = result.body;
    assert.equal((await request("/auth/me")).status, 401);
    assert.equal((await request("/auth/me", "GET", undefined, { Authorization: `Bearer ${refreshToken}` })).status, 401);
    const expiredAccess = jwt.sign({ userId: 1, exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET);
    assert.equal((await request("/auth/me", "GET", undefined, { Authorization: `Bearer ${expiredAccess}` })).status, 401);
    result = await request("/auth/me", "GET", undefined, { Authorization: `Bearer ${token}` });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.passwordHash, undefined);
    assert.equal((await request("/auth/refresh", "POST", { refreshToken: "invalid" })).status, 401);
    const expiredRefresh = jwt.sign({ userId: 1, type: "refresh", exp: Math.floor(Date.now() / 1000) - 1 }, process.env.REFRESH_TOKEN_SECRET);
    assert.equal((await request("/auth/refresh", "POST", { refreshToken: expiredRefresh })).status, 401);
    result = await request("/auth/refresh", "POST", { refreshToken });
    assert.equal(result.status, 200);
    assert.ok(result.body.token);
    const resetToken = "a".repeat(64);
    const originalLog = console.log;
    const originalRandomBytes = crypto.randomBytes;
    const logs = [];
    crypto.randomBytes = () => Buffer.from(resetToken, "hex");
    console.log = (...values) => logs.push(values);
    try {
      result = await request("/auth/forgot-password", "POST", { email: "ada@example.com" });
      assert.equal(result.status, 200);
    } finally {
      console.log = originalLog;
      crypto.randomBytes = originalRandomBytes;
    }
    assert.deepEqual(logs, []);
    const unknown = await request("/auth/forgot-password", "POST", { email: "nobody@example.com" });
    assert.deepEqual(unknown.body, result.body);
    result = await request("/auth/reset-password", "POST", { token: resetToken, newPassword: "newpassword123" });
    assert.equal(result.status, 200);
    assert.equal(await bcrypt.compare("newpassword123", user.passwordHash), true);
    assert.equal((await request("/auth/reset-password", "POST", { token: resetToken, newPassword: "anotherpassword" })).status, 401);
    const expiredToken = "expired-reset-token";
    resetTokens.push({ id: 999, userId: 1, tokenHash: crypto.createHash("sha256").update(expiredToken).digest("hex"), expiresAt: new Date(Date.now() - 1), usedAt: null });
    assert.equal((await request("/auth/reset-password", "POST", { token: expiredToken, newPassword: "anotherpassword" })).status, 401);
    assert.equal((await request("/auth/login", "POST", { email: "ada@example.com", password: "password123" })).status, 401);
    assert.equal((await request("/auth/login", "POST", { email: "ada@example.com", password: "newpassword123" })).status, 200);

    const docs = await fetch(base + "/api-docs/");
    assert.equal(docs.status, 200);
    const corsResponse = await request("/auth/me", "GET", undefined, { Origin: "http://localhost:5173" });
    assert.equal(corsResponse.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const preflight = await fetch(base + "/auth/me", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization,Content-Type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);

    for (let i = 0; i < 5; i += 1) {
      assert.equal((await request("/auth/login", "POST", { email: "locked@example.com", password: "wrong" })).status, 401);
    }
    assert.equal((await request("/auth/login", "POST", { email: "locked@example.com", password: "wrong" })).status, 429);
    let rateLimited = false;
    for (let i = 0; i < 35; i += 1) {
      if ((await request("/auth/me")).status === 429) rateLimited = true;
    }
    assert.equal(rateLimited, true);
  } finally {
    server.close();
  }
});

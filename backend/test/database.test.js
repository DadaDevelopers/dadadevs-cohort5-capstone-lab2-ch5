const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

test("PostgreSQL migrations, HTTP behavior, and concurrent business rules", {
  skip: process.env.RUN_DB_TESTS !== "1" && "Set RUN_DB_TESTS=1 to test an isolated schema in DATABASE_URL",
}, async (t) => {
  require("dotenv").config({ quiet: true });
  const { Pool } = require("pg");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("@prisma/client");
  const schema = `communitysafe_test_${crypto.randomBytes(8).toString("hex")}`;
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL, options: `-c search_path=${schema}`, max: 10 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  let created = false;
  let server;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const migrations = path.join(__dirname, "../prisma/migrations");
    for (const entry of (await fs.readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await pool.query(await fs.readFile(path.join(migrations, entry.name, "migration.sql"), "utf8"));
    }
    // Keep every fixture and migration inside a disposable schema, away from application data.
    const prismaPath = require.resolve("../src/lib/prisma");
    require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
    const rateLimitPath = require.resolve("../src/middleware/auth-rate-limit");
    const limits = require(rateLimitPath);
    require.cache[rateLimitPath].exports = { ...limits, authLimiter: (req, res, next) => next() };
    process.env.JWT_SECRET = "database-test-secret";
    const jwt = require("jsonwebtoken");
    const communities = require("../src/services/community.service");
    const members = require("../src/services/community-members.service");
    const signers = require("../src/services/community-signers.service");
    const auth = require("../src/services/auth.service");
    server = require("../src/app").listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const users = [];
    for (let i = 0; i < 4; i++) users.push(await prisma.user.create({ data: { firstName: "Test", lastName: "User", email: `test${i}@example.com`, passwordHash: "unused" } }));
    const request = async (url, userId = users[0].id, method = "GET", body) => {
      const response = await fetch(base + url, {
        method, headers: { Authorization: `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };
    let fixtureNumber = 0;
    const fixture = async (signerCount = 0) => {
      const community = await communities.createCommunity(users[0].id, `Fixture ${++fixtureNumber}`, "Test description");
      for (const user of users.slice(1)) await members.addMember(users[0].id, community.id, user.email);
      for (const user of users.slice(0, signerCount)) await signers.selectSigner(users[0].id, community.id, user.id);
      return community;
    };
    const expectOneConflict = (results) => {
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
    };

    await t.test("real HTTP reads and database name uniqueness", async () => {
      assert.equal((await fetch(base + "/health")).status, 200);
      assert.equal((await fetch(base + "/api-docs/")).status, 200);
      const results = await Promise.all(["Database Race", "  database race  "].map((name) => request("/communities", users[0].id, "POST", { name, description: "Test description" })));
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.deepEqual(results.find((r) => r.status === 409).body, { error: "Community name already exists" });
      const community = results.find((r) => r.status === 201).body.community;
      const joins = await Promise.all([communities.joinCommunity(users[1].id, community.joinCode), communities.joinCommunity(users[1].id, community.joinCode)]);
      assert.equal(joins.filter((r) => r.conflict).length, 1);
      const lookup = await request(`/communities/${encodeURIComponent("  DATABASE RACE  ")}`, users[1].id);
      assert.equal(lookup.status, 200);
      assert.equal(lookup.body.community.joinCode, undefined);
      assert.equal((await request(`/communities/${community.id}`, users[2].id)).status, 403);
      await assert.rejects(prisma.community.create({ data: { name: "DATABASE RACE", description: "Test", joinCode: "DADA-000000000000" } }), { code: "P2002" });
      await assert.rejects(communities.createCommunity(2147483647, "Rollback community", "Test"), { code: "P2003" });
      assert.equal(await prisma.community.count({ where: { name: "Rollback community" } }), 0);
    });

    await t.test("concurrent self-demotions retain an admin", async () => {
      const c = await fixture();
      await members.changeRole(users[0].id, c.id, users[1].id, "COMMUNITY_ADMIN");
      expectOneConflict(await Promise.allSettled(users.slice(0, 2).map((u) => members.changeRole(u.id, c.id, u.id, "COMMUNITY_MEMBER"))));
      assert.equal(await prisma.communityMembership.count({ where: { communityId: c.id, role: "COMMUNITY_ADMIN" } }), 1);
      const demoted = await prisma.communityMembership.findFirst({ where: { communityId: c.id, userId: { in: users.slice(0, 2).map((u) => u.id) }, role: "COMMUNITY_MEMBER" } });
      assert.equal((await request(`/communities/${c.id}/members/${users[3].id}/role`, demoted.userId, "PATCH", { role: "COMMUNITY_ADMIN" })).status, 403);
    });

    await t.test("duplicate registration and signer selection handle real unique races", async () => {
      const registered = await Promise.all([
        auth.register("Test", "User", "registration-race@example.com", "password123"),
        auth.register("Test", "User", "registration-race@example.com", "password123"),
      ]);
      assert.equal(registered.filter(Boolean).length, 1);
      const c = await fixture();
      expectOneConflict(await Promise.allSettled([
        signers.selectSigner(users[0].id, c.id, users[1].id),
        signers.selectSigner(users[0].id, c.id, users[1].id),
      ]));
      assert.equal(await prisma.authorizedSigner.count({ where: { membership: { communityId: c.id } } }), 1);
    });

    await t.test("concurrent admin removals retain an admin", async () => {
      const c = await fixture();
      await members.changeRole(users[0].id, c.id, users[1].id, "COMMUNITY_ADMIN");
      expectOneConflict(await Promise.allSettled(users.slice(0, 2).map((u) => members.removeMember(u.id, c.id, u.id))));
      assert.equal(await prisma.communityMembership.count({ where: { communityId: c.id, role: "COMMUNITY_ADMIN" } }), 1);
    });

    await t.test("signer selection cannot race membership deletion", async () => {
      const c = await fixture();
      expectOneConflict(await Promise.allSettled([
        signers.selectSigner(users[0].id, c.id, users[1].id),
        members.removeMember(users[0].id, c.id, users[1].id),
      ]));
      assert.equal(await prisma.authorizedSigner.count({ where: { membership: { communityId: c.id } } }),
        await prisma.communityMembership.count({ where: { communityId: c.id, userId: users[1].id } }));
    });

    await t.test("threshold changes and concurrent signer removals preserve M-of-N", async () => {
      const c = await fixture(2);
      expectOneConflict(await Promise.allSettled([
        signers.setSigningThreshold(users[0].id, c.id, 2),
        signers.removeSigner(users[0].id, c.id, users[1].id),
      ]));
      const d = await fixture(3);
      await signers.setSigningThreshold(users[0].id, d.id, 2);
      expectOneConflict(await Promise.allSettled(users.slice(1, 3).map((u) => signers.removeSigner(users[0].id, d.id, u.id))));
      assert.deepEqual(await signers.getSigningThreshold(users[0].id, d.id), { requiredSignatures: 2, authorizedSignerCount: 2 });
      const membership = await prisma.communityMembership.findFirst({ where: { communityId: d.id, userId: users[0].id } });
      await assert.rejects(prisma.communityMembership.delete({ where: { id: membership.id } }), { code: "P2003" });
    });

    await t.test("threshold reads use a consistent snapshot during changes", async () => {
      const c = await fixture(3);
      await signers.setSigningThreshold(users[0].id, c.id, 3);
      const transaction = prisma.$transaction.bind(prisma);
      let releaseRead;
      let signalRead;
      const paused = new Promise((resolve) => { signalRead = resolve; });
      const resume = new Promise((resolve) => { releaseRead = resolve; });
      prisma.$transaction = (callback, options) => transaction(async (tx) => {
        if (options?.isolationLevel === "RepeatableRead") {
          const findUnique = tx.community.findUnique.bind(tx.community);
          tx.community.findUnique = async (args) => {
            const result = await findUnique(args);
            signalRead();
            await resume;
            return result;
          };
        }
        return callback(tx);
      }, options);
      const reading = signers.getSigningThreshold(users[0].id, c.id);
      try {
        await paused;
        await signers.setSigningThreshold(users[0].id, c.id, 2);
        await signers.removeSigner(users[0].id, c.id, users[2].id);
        releaseRead();
        assert.deepEqual(await reading, { requiredSignatures: 3, authorizedSignerCount: 3 });
      } finally {
        releaseRead();
        prisma.$transaction = transaction;
      }
    });

    await t.test("a reset token can be consumed only once", async () => {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({ data: { userId: users[0].id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60000) } });
      assert.deepEqual((await Promise.all([auth.resetPassword(token, "newpassword123"), auth.resetPassword(token, "otherpassword123")])).sort(), [false, true]);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    // The generated name is the only schema this test may remove.
    if (created && /^communitysafe_test_[a-f0-9]{16}$/.test(schema)) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});

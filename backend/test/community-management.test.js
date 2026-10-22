const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = "community-management-test-secret";
const communities = [];
const memberships = [];
let nextId = 1;
let skipNextNameLookup = false;
let forceJoinCodeCollision = false;
let collidingJoinCode;
const prisma = {
  community: {
    async create({ data }) {
      if (forceJoinCodeCollision) {
        forceJoinCodeCollision = false;
        collidingJoinCode = data.joinCode;
        throw { code: "P2002" };
      }
      if (communities.some((item) => item.name.trim().toLowerCase() === data.name.trim().toLowerCase())) {
        throw { code: "P2002", meta: { target: "Community_name_normalized_key" } };
      }
      if (communities.some((item) => item.joinCode === data.joinCode)) {
        throw { code: "P2002", meta: { target: ["joinCode"] } };
      }
      const record = { id: nextId++, ...data, createdAt: new Date(), updatedAt: new Date() };
      communities.push(record);
      return record;
    },
    async findUnique({ where }) {
      if (where.joinCode && where.joinCode === collidingJoinCode) return { id: -1 };
      return communities.find((item) => item.id === where.id || item.joinCode === where.joinCode) || null;
    },
  },
  communityMembership: {
    async create({ data }) {
      if (memberships.some((item) => item.userId === data.userId && item.communityId === data.communityId)) {
        throw { code: "P2002", meta: { target: ["userId", "communityId"] } };
      }
      const record = { ...data, createdAt: new Date(), user: { id: data.userId, firstName: `User${data.userId}`, lastName: "Test", email: `user${data.userId}@example.com`, passwordHash: "secret" } };
      memberships.push(record);
      return record;
    },
    async findUnique({ where }) {
      const { userId, communityId } = where.userId_communityId;
      return memberships.find((item) => item.userId === userId && item.communityId === communityId) || null;
    },
    async findMany({ where }) {
      return memberships.filter((item) => Object.entries(where).every(([key, value]) => item[key] === value))
        .map((item) => ({ ...item, community: communities.find((community) => community.id === item.communityId) }));
    },
  },
  async $transaction(callback) {
    const communityLength = communities.length;
    const membershipLength = memberships.length;
    try { return await callback(prisma); }
    catch (error) { communities.length = communityLength; memberships.length = membershipLength; throw error; }
  },
  async $queryRaw(strings, ...values) {
    if (!strings.join("").includes('FROM "Community"')) return [1];
    if (skipNextNameLookup) { skipNextNameLookup = false; return []; }
    return communities.filter((item) => item.name.trim().toLowerCase() === values[0].trim().toLowerCase()).map(({ id }) => ({ id }));
  },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
// This endpoint matrix exceeds the production 30-request window; rate limiting
// is covered by auth.test.js, so disable it only in this test process.
const rateLimitPath = require.resolve("../src/middleware/auth-rate-limit");
const rateLimits = require(rateLimitPath);
require.cache[rateLimitPath].exports = { ...rateLimits, authLimiter: (req, res, next) => next() };
const app = require("../src/app");

test("community MVP endpoints and safe projections", async () => {
  const description = "A community savings group for shared Bitcoin contributions.";
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
  const request = async (method, url, body, userId) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request("GET", "/health")).status, 200);
    assert.equal((await fetch(base + "/api-docs/")).status, 200);
    assert.equal((await request("POST", "/communities", { name: "Test" })).status, 401);
    for (const name of [undefined, "", "  ", 123, [], "x".repeat(101)]) {
      assert.equal((await request("POST", "/communities", { name }, 1)).status, 400);
    }
    for (const invalidDescription of [undefined, "", "   ", 42, [], "x".repeat(501)]) {
      assert.equal((await request("POST", "/communities", { name: "Valid name", description: invalidDescription }, 1)).status, 400);
    }
    const created = await request("POST", "/communities", { name: " Dada Community Fund ", description: ` ${description} `, joinCode: "ATTACK" }, 1);
    assert.equal(created.status, 201);
    assert.equal(created.body.community.name, "Dada Community Fund");
    assert.equal(created.body.community.description, description);
    assert.match(created.body.community.joinCode, /^DADA-[A-F0-9]{12}$/);
    assert.equal(created.body.community.role, "COMMUNITY_ADMIN");
    assert.equal(memberships[0].role, "COMMUNITY_ADMIN");
    for (const name of ["Dada Community Fund", "dada community fund", "  Dada Community Fund  "]) {
      assert.deepEqual(await request("POST", "/communities", { name, description }, 3), {
        status: 409, body: { error: "Community name already exists" },
      });
    }
    skipNextNameLookup = true;
    assert.deepEqual(await request("POST", "/communities", { name: "DADA COMMUNITY FUND", description }, 3), {
      status: 409, body: { error: "Community name already exists" },
    });
    assert.equal(communities.length, 1);
    assert.equal(memberships.length, 1);
    forceJoinCodeCollision = true;
    const retried = await request("POST", "/communities", { name: "Collision Retry", description }, 3);
    assert.equal(retried.status, 201);
    assert.notEqual(retried.body.community.joinCode, collidingJoinCode);
    const id = created.body.community.id;
    const joinCode = created.body.community.joinCode;
    assert.equal((await request("POST", "/communities/join", { joinCode })).status, 401);
    assert.equal((await request("POST", "/communities/join", { joinCode: 5 }, 2)).status, 400);
    assert.equal((await request("POST", "/communities/join", { joinCode: "DADA-000000000000" }, 2)).status, 404);
    const joined = await request("POST", "/communities/join", { joinCode: ` ${joinCode.toLowerCase()} ` }, 2);
    assert.equal(joined.status, 201);
    assert.equal(joined.body.community.role, "COMMUNITY_MEMBER");
    assert.equal(memberships.find((membership) => membership.userId === 2 && membership.communityId === id).role, "COMMUNITY_MEMBER");
    assert.equal((await request("POST", "/communities/join", { joinCode }, 2)).status, 409);
    assert.equal((await request("POST", "/communities/join", { joinCode }, 1)).status, 409);
    const second = await request("POST", "/communities", { name: "Other", description }, 3);
    assert.equal(second.status, 201);
    assert.notEqual(second.body.community.joinCode, joinCode);
    const list = await request("GET", "/communities", undefined, 2);
    assert.deepEqual(list.body.communities, [{ id, name: "Dada Community Fund", description, role: "COMMUNITY_MEMBER" }]);
    const memberView = await request("GET", `/communities/${id}`, undefined, 2);
    assert.equal(memberView.body.community.role, "COMMUNITY_MEMBER");
    assert.equal(memberView.body.community.description, description);
    assert.equal(memberView.body.community.joinCode, undefined);
    assert.equal((await request("GET", `/communities/${id}`, undefined, 1)).body.community.joinCode, joinCode);
    assert.equal((await request("GET", "/communities/Dada%20Community%20Fund", undefined, 2)).body.community.description, description);
    const caseLookup = await request("GET", "/communities/dAdA%20cOmMuNiTy%20fUnD", undefined, 1);
    assert.equal(caseLookup.status, 200);
    assert.equal(caseLookup.body.community.joinCode, joinCode);
    const spacedLookup = await request("GET", "/communities/%20%20Dada%20Community%20Fund%20%20", undefined, 2);
    assert.equal(spacedLookup.status, 200);
    assert.equal(spacedLookup.body.community.joinCode, undefined);
    assert.equal((await request("GET", "/communities/Unknown", undefined, 1)).status, 404);
    assert.equal((await request("GET", "/communities/Dada%20Community%20Fund", undefined, 3)).status, 403);
    assert.equal((await request("GET", "/communities/Dada%20Community%20Fund")).status, 401);
    assert.equal((await fetch(base + "/communities/by-name/Dada%20Community%20Fund")).status, 404);
    const numericName = await request("POST", "/communities", { name: "12345", description }, 3);
    assert.equal(numericName.status, 201);
    assert.equal((await request("GET", "/communities/12345?by=name", undefined, 3)).body.community.name, "12345");
    assert.equal((await request("GET", "/communities/12345?by=id", undefined, 3)).status, 404);
    assert.equal((await request("GET", `/communities/${id}`, undefined, 3)).status, 403);
    assert.equal((await request("GET", "/communities/0", undefined, 1)).status, 400);
    assert.equal((await request("GET", "/communities/nope?by=id", undefined, 1)).status, 400);
    assert.equal((await request("GET", "/communities/999", undefined, 1)).status, 404);
    const members = await request("GET", `/communities/${id}/members`, undefined, 1);
    assert.equal(members.status, 200);
    assert.equal(members.body.members.length, 2);
    assert.equal(JSON.stringify(members.body).includes("passwordHash"), false);
    assert.equal((await request("GET", `/communities/${id}/members`, undefined, 3)).status, 403);
    assert.equal((await request("GET", "/communities/nope/members", undefined, 1)).status, 400);
    const spec = require("../src/openapi");
    for (const endpoint of ["/communities", "/communities/join", "/communities/{identifier}", "/communities/{communityId}/members"]) {
      assert.ok(spec.paths[endpoint]);
    }
    assert.equal(spec.paths["/communities/by-name/{name}"], undefined);
    const schema = fs.readFileSync(path.join(__dirname, "../prisma/schema.prisma"), "utf8");
    assert.match(schema, /joinCode\s+String\s+@unique/);
    assert.match(schema, /description\s+String/);
    const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261008150000_unique_community_name/migration.sql"), "utf8");
    assert.match(migration, /CREATE UNIQUE INDEX "Community_name_normalized_key" ON "Community" \(lower\(btrim\("name"\)\)\)/);
    assert.deepEqual(spec.paths["/communities"].post.responses[409].content["application/json"].example, { error: "Community name already exists" });
    const descriptionMigration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261008170000_community_description/migration.sql"), "utf8");
    assert.match(descriptionMigration, /ALTER COLUMN "description" SET NOT NULL/);
  } finally { server.close(); }
});

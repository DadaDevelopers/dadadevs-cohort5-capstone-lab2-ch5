const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "community-members-test-secret";

const users = [1, 2, 3, 4, 5].map((id) => ({ id, email: `user${id}@example.com` }));
const communities = [{ id: 1 }, { id: 2 }];
const memberships = [
  { id: 1, userId: 1, communityId: 1, role: "COMMUNITY_ADMIN", authorizedSigner: null },
  { id: 2, userId: 2, communityId: 1, role: "COMMUNITY_MEMBER", authorizedSigner: null },
  { id: 3, userId: 1, communityId: 2, role: "COMMUNITY_MEMBER", authorizedSigner: null },
  { id: 4, userId: 3, communityId: 2, role: "COMMUNITY_ADMIN", authorizedSigner: null },
];
let nextMembershipId = 5;
let forceUniqueRace = false;

const prisma = {
  user: {
    async findUnique({ where }) { return users.find((user) => user.email === where.email) || null; },
  },
  communityMembership: {
    async findUnique({ where }) {
      const { userId, communityId } = where.userId_communityId;
      return memberships.find((member) => member.userId === userId && member.communityId === communityId) || null;
    },
    async count({ where }) {
      return memberships.filter((member) => member.communityId === where.communityId && member.role === where.role).length;
    },
    async create({ data, select }) {
      if (forceUniqueRace) { forceUniqueRace = false; throw { code: "P2002" }; }
      if (memberships.some((member) => member.userId === data.userId && member.communityId === data.communityId)) {
        throw { code: "P2002" };
      }
      const member = { id: nextMembershipId++, ...data, authorizedSigner: null };
      memberships.push(member);
      return select ? Object.fromEntries(Object.keys(select).map((key) => [key, member[key]])) : member;
    },
    async update({ where, data }) {
      const member = memberships.find((item) => item.id === where.id);
      Object.assign(member, data);
      return member;
    },
    async delete({ where }) {
      const index = memberships.findIndex((item) => item.id === where.id);
      return memberships.splice(index, 1)[0];
    },
  },
  async $transaction(callback) { return callback(prisma); },
  async $queryRaw(strings, ...values) {
    const sql = strings.join("");
    if (sql.includes('FROM "CommunityMembership"')) {
      return memberships.filter((member) => member.communityId === values[0] && member.userId === values[1]).map(({ id }) => ({ id }));
    }
    if (sql.includes('FROM "Community"')) return communities.filter((community) => community.id === values[0]);
    return [1];
  },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const rateLimitPath = require.resolve("../src/middleware/auth-rate-limit");
const rateLimits = require(rateLimitPath);
require.cache[rateLimitPath].exports = { ...rateLimits, authLimiter: (req, res, next) => next() };
const app = require("../src/app");

test("admin member management is community-scoped and preserves admin and signer safeguards", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, userId, body) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(userId ? { Authorization: `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET)}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const addPath = "/communities/1/members";
    assert.equal((await request("POST", addPath, null, { email: users[3].email })).status, 401);
    assert.equal((await request("POST", addPath, 2, { email: users[3].email })).status, 403);
    assert.equal((await request("POST", "/communities/2/members", 1, { email: users[3].email })).status, 403);
    assert.equal((await request("POST", "/communities/999/members", 1, { email: users[3].email })).status, 404);
    assert.equal((await request("POST", "/communities/nope/members", 1, { email: users[3].email })).status, 400);
    for (const email of [undefined, " ", 42, "invalid"]) {
      assert.equal((await request("POST", addPath, 1, { email })).status, 400);
    }
    assert.equal((await request("POST", addPath, 1, { email: "missing@example.com" })).status, 404);
    assert.equal((await request("POST", addPath, 1, { email: users[1].email })).status, 409);
    forceUniqueRace = true;
    assert.deepEqual(await request("POST", addPath, 1, { email: users[3].email }), {
      status: 409, body: { error: "Already a member of this community" },
    });
    const added = await request("POST", addPath, 1, { email: " USER4@EXAMPLE.COM " });
    assert.equal(added.status, 201);
    assert.deepEqual(added.body.member, { userId: 4, communityId: 1, role: "COMMUNITY_MEMBER" });
    assert.equal(users.length, 5);
    assert.equal(memberships.find((member) => member.userId === 4 && member.communityId === 1).authorizedSigner, null);

    const rolePath = "/communities/1/members/2/role";
    assert.equal((await request("PATCH", rolePath, null, { role: "COMMUNITY_ADMIN" })).status, 401);
    assert.equal((await request("PATCH", rolePath, 2, { role: "COMMUNITY_ADMIN" })).status, 403);
    assert.equal((await request("PATCH", "/communities/2/members/3/role", 1, { role: "COMMUNITY_MEMBER" })).status, 403);
    assert.equal((await request("PATCH", "/communities/999/members/2/role", 1, { role: "COMMUNITY_ADMIN" })).status, 404);
    assert.equal((await request("PATCH", "/communities/1/members/nope/role", 1, { role: "COMMUNITY_ADMIN" })).status, 400);
    assert.equal((await request("PATCH", rolePath, 1, { role: "AUTHORIZED_SIGNER" })).status, 400);
    assert.equal((await request("PATCH", "/communities/1/members/99/role", 1, { role: "COMMUNITY_ADMIN" })).status, 404);
    assert.equal((await request("PATCH", "/communities/1/members/1/role", 1, { role: "COMMUNITY_MEMBER" })).status, 409);
    assert.deepEqual((await request("PATCH", rolePath, 1, { role: "COMMUNITY_ADMIN" })).body.member,
      { userId: 2, communityId: 1, role: "COMMUNITY_ADMIN" });
    assert.equal((await request("PATCH", "/communities/1/members/1/role", 1, { role: "COMMUNITY_MEMBER" })).status, 200);
    assert.equal((await request("PATCH", rolePath, 2, { role: "COMMUNITY_MEMBER" })).status, 409);
    assert.equal(memberships.find((member) => member.userId === 2 && member.communityId === 1).role, "COMMUNITY_ADMIN");

    const removePath = "/communities/1/members/4";
    assert.equal((await request("DELETE", removePath, null)).status, 401);
    assert.equal((await request("DELETE", removePath, 1)).status, 403);
    assert.equal((await request("DELETE", "/communities/2/members/3", 1)).status, 403);
    assert.equal((await request("DELETE", "/communities/999/members/4", 2)).status, 404);
    assert.equal((await request("DELETE", "/communities/1/members/nope", 2)).status, 400);
    assert.equal((await request("DELETE", "/communities/1/members/99", 2)).status, 404);
    assert.equal((await request("DELETE", "/communities/1/members/2", 2)).status, 409);
    const target = memberships.find((member) => member.userId === 4 && member.communityId === 1);
    target.authorizedSigner = { id: 42 };
    assert.deepEqual(await request("DELETE", removePath, 2), {
      status: 409, body: { error: "Remove signer authority before removing this member" },
    });
    assert.equal(target.authorizedSigner.id, 42);
    target.authorizedSigner = null;
    assert.equal((await request("DELETE", removePath, 2)).status, 204);
    assert.equal(memberships.some((member) => member.userId === 4 && member.communityId === 1), false);
    assert.equal(users.length, 5);
    assert.equal((await request("PATCH", "/communities/1/members/1/role", 2, { role: "COMMUNITY_ADMIN" })).status, 200);
    assert.equal((await request("DELETE", "/communities/1/members/1", 2)).status, 204);
    assert.equal(memberships.find((member) => member.userId === 2 && member.communityId === 1).role, "COMMUNITY_ADMIN");
    assert.equal(memberships.find((member) => member.userId === 1 && member.communityId === 2).role, "COMMUNITY_MEMBER");

    const spec = require("../src/openapi");
    assert.ok(spec.paths["/communities/{communityId}/members"].post);
    assert.ok(spec.paths["/communities/{communityId}/members/{userId}/role"].patch);
    assert.ok(spec.paths["/communities/{communityId}/members/{userId}"].delete);
    assert.equal(spec.paths["/communities/{communityId}/members/me"], undefined);
  } finally { server.close(); }
});

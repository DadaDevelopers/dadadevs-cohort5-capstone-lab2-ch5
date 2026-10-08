const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const pathLib = require("node:path");

process.env.JWT_SECRET = "community-signers-test-secret";

const users = [1, 2, 3, 4].map((id) => ({
  id, firstName: `User${id}`, lastName: "Test", email: `user${id}@example.com`, passwordHash: "secret",
}));
const communities = [{ id: 1, requiredSignatures: null }, { id: 2, requiredSignatures: null }];
const memberships = [
  { id: 10, userId: 1, communityId: 1, role: "COMMUNITY_ADMIN" },
  { id: 11, userId: 2, communityId: 1, role: "COMMUNITY_MEMBER" },
  { id: 12, userId: 3, communityId: 2, role: "COMMUNITY_ADMIN" },
  { id: 13, userId: 1, communityId: 2, role: "COMMUNITY_MEMBER" },
];
const signers = [];
let nextSignerId = 1;
let forceUniqueRace = false;

const prisma = {
  community: {
    async findUnique({ where }) { return communities.find((item) => item.id === where.id) || null; },
    async update({ where, data }) {
      const community = communities.find((item) => item.id === where.id);
      Object.assign(community, data);
      return community;
    },
  },
  communityMembership: {
    async findUnique({ where }) {
      const { userId, communityId } = where.userId_communityId;
      const member = memberships.find((item) => item.userId === userId && item.communityId === communityId);
      if (!member) return null;
      return {
        ...member,
        user: users.find((user) => user.id === member.userId),
        authorizedSigner: signers.find((signer) => signer.membershipId === member.id) || null,
      };
    },
  },
  authorizedSigner: {
    async count({ where }) {
      return signers.filter((signer) => memberships.some((member) =>
        member.id === signer.membershipId && member.communityId === where.membership.is.communityId)).length;
    },
    async create({ data }) {
      if (forceUniqueRace) { forceUniqueRace = false; throw { code: "P2002" }; }
      if (signers.some((signer) => signer.membershipId === data.membershipId)) throw { code: "P2002" };
      const signer = { id: nextSignerId++, membershipId: data.membershipId, publicKey: null, createdAt: new Date() };
      signers.push(signer);
      return signer;
    },
    async findMany({ where }) {
      return signers.filter((signer) => memberships.some((member) =>
        member.id === signer.membershipId && member.communityId === where.membership.is.communityId))
        .map((signer) => {
          const member = memberships.find((item) => item.id === signer.membershipId);
          return { ...signer, membership: { ...member, user: users.find((user) => user.id === member.userId) } };
        });
    },
    async delete({ where }) {
      const index = signers.findIndex((signer) => signer.id === where.id);
      if (index < 0) throw { code: "P2025" };
      return signers.splice(index, 1)[0];
    },
    async updateMany({ where, data }) {
      const signer = signers.find((item) => item.id === where.id);
      if (!signer) return { count: 0 };
      Object.assign(signer, data);
      return { count: 1 };
    },
  },
  async $transaction(callback) { return callback(prisma); },
  async $queryRaw(strings, ...values) {
    if (strings.join("").includes('FROM "Community"')) return communities.filter((item) => item.id === values[0]);
    return [1];
  },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const rateLimitPath = require.resolve("../src/middleware/auth-rate-limit");
const rateLimits = require(rateLimitPath);
require.cache[rateLimitPath].exports = { ...rateLimits, authLimiter: (req, res, next) => next() };
const app = require("../src/app");

test("authorized signers are separate from community roles and scoped to membership", async () => {
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
    const path = "/communities/1/signers";
    assert.equal((await request("POST", path, null, { userId: 2 })).status, 401);
    assert.equal((await request("GET", path, null)).status, 401);
    assert.equal((await request("DELETE", `${path}/2`, null)).status, 401);
    assert.equal((await request("POST", path, 2, { userId: 2 })).status, 403);
    assert.equal((await request("POST", path, 3, { userId: 2 })).status, 403);
    assert.equal((await request("POST", "/communities/2/signers", 1, { userId: 3 })).status, 403);
    assert.equal((await request("POST", "/communities/999/signers", 1, { userId: 2 })).status, 404);
    assert.equal((await request("GET", "/communities/999/signers", 1)).status, 404);
    assert.equal((await request("POST", "/communities/nope/signers", 1, { userId: 2 })).status, 400);
    for (const userId of [undefined, "2", 0, -1, 1.5, [], {}]) {
      assert.equal((await request("POST", path, 1, { userId })).status, 400);
    }
    assert.equal((await request("POST", path, 1, { userId: 4 })).status, 409);
    forceUniqueRace = true;
    assert.deepEqual(await request("POST", path, 1, { userId: 2 }), {
      status: 409, body: { error: "Already an authorized signer" },
    });
    const selected = await request("POST", path, 1, { userId: 2 });
    assert.equal(selected.status, 201);
    assert.equal(selected.body.signer.userId, 2);
    assert.equal(selected.body.signer.membershipRole, "COMMUNITY_MEMBER");
    assert.equal(selected.body.signer.isAuthorizedSigner, true);
    assert.equal(JSON.stringify(selected.body).includes("passwordHash"), false);
    assert.equal(memberships.find((member) => member.userId === 2 && member.communityId === 1).role, "COMMUNITY_MEMBER");
    assert.equal((await request("POST", path, 1, { userId: 2 })).status, 409);
    assert.equal((await request("GET", path, 3)).status, 403);
    const listed = await request("GET", path, 2);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.signers.length, 1);
    assert.equal(listed.body.signers[0].userId, 2);
    assert.equal(listed.body.signers[0].publicInfoRegistered, false);
    assert.equal(JSON.stringify(listed.body).includes("passwordHash"), false);
    assert.deepEqual((await request("GET", "/communities/2/signers", 1)).body, { signers: [] });
    assert.equal((await request("DELETE", `${path}/2`, 2)).status, 403);
    assert.equal((await request("DELETE", `${path}/2`, 3)).status, 403);
    assert.equal((await request("DELETE", `${path}/nope`, 1)).status, 400);
    assert.equal((await request("DELETE", `${path}/4`, 1)).status, 404);
    assert.equal((await request("DELETE", `${path}/1`, 1)).status, 404);
    assert.equal((await request("DELETE", `${path}/2`, 1)).status, 204);
    assert.equal(signers.length, 0);
    assert.ok(memberships.some((member) => member.userId === 2 && member.communityId === 1));
    assert.equal((await request("DELETE", `${path}/2`, 1)).status, 404);
    const adminSigner = await request("POST", path, 1, { userId: 1 });
    assert.equal(adminSigner.status, 201);
    assert.equal(adminSigner.body.signer.membershipRole, "COMMUNITY_ADMIN");
    const memberSignerElsewhere = await request("POST", "/communities/2/signers", 3, { userId: 1 });
    assert.equal(memberSignerElsewhere.status, 201);
    assert.equal(memberSignerElsewhere.body.signer.membershipRole, "COMMUNITY_MEMBER");
    const publicInfoPath = "/communities/1/signers/me/public-info";
    assert.deepEqual(await request("GET", publicInfoPath, 1), {
      status: 200, body: { registered: false, publicKey: null },
    });
    assert.equal((await request("GET", publicInfoPath, null)).status, 401);
    assert.equal((await request("PUT", publicInfoPath, null, { publicKey: "PUBLIC-A" })).status, 401);
    assert.equal((await request("GET", publicInfoPath, 2)).status, 403);
    assert.equal((await request("PUT", publicInfoPath, 2, { publicKey: "PUBLIC-A" })).status, 403);
    assert.equal((await request("PUT", publicInfoPath, 3, { publicKey: "PUBLIC-A" })).status, 403);
    assert.equal((await request("PUT", "/communities/999/signers/me/public-info", 1, { publicKey: "PUBLIC-A" })).status, 404);
    assert.equal((await request("PUT", "/communities/nope/signers/me/public-info", 1, { publicKey: "PUBLIC-A" })).status, 400);
    for (const publicKey of [undefined, "", "   ", 12, [], {}, "x".repeat(257)]) {
      assert.equal((await request("PUT", publicInfoPath, 1, { publicKey })).status, 400);
    }
    for (const privateField of ["privateKey", "private_key", "seed", "seedPhrase", "seed_phrase", "mnemonic", "recoveryPhrase", "recovery_phrase", "WIF", "xprv"]) {
      assert.deepEqual(await request("PUT", publicInfoPath, 1, { publicKey: "PUBLIC-A", [privateField]: "secret-value" }), {
        status: 400, body: { error: "Private key material must never be submitted to the server" },
      });
    }
    for (const publicKey of ["xprv-fake-private-value", `K${"1".repeat(51)}`, "one two three seed words"]) {
      assert.equal((await request("PUT", publicInfoPath, 1, { publicKey })).status, 400);
    }
    assert.equal((await request("PUT", publicInfoPath, 1, { publicKey: "PUBLIC-A", nested: { privateKey: "secret-value" } })).status, 400);
    assert.equal(signers.find((signer) => signer.membershipId === 10).publicKey, null);
    const registered = await request("PUT", publicInfoPath, 1, { publicKey: "  PUBLIC-A  " });
    assert.deepEqual(registered, { status: 200, body: { registered: true, publicKey: "PUBLIC-A" } });
    assert.deepEqual(await request("GET", publicInfoPath, 1), registered);
    assert.deepEqual(await request("PUT", publicInfoPath, 1, { publicKey: "PUBLIC-A" }), registered);
    assert.deepEqual(await request("PUT", publicInfoPath, 1, { publicKey: "PUBLIC-B" }), {
      status: 200, body: { registered: true, publicKey: "PUBLIC-B" },
    });
    assert.equal((await request("PUT", publicInfoPath, 1, { publicKey: "PUBLIC-C", seedPhrase: "secret-value" })).status, 400);
    assert.equal((await request("GET", publicInfoPath, 1)).body.publicKey, "PUBLIC-B");
    const listedWithInfo = await request("GET", path, 1);
    assert.equal(listedWithInfo.body.signers[0].publicInfoRegistered, true);
    assert.equal(JSON.stringify(listedWithInfo.body).includes("PUBLIC-B"), false);
    assert.deepEqual(await request("GET", "/communities/2/signers/me/public-info", 1), {
      status: 200, body: { registered: false, publicKey: null },
    });
    assert.equal((await request("DELETE", `${path}/1`, 1)).status, 204);
    assert.equal((await request("GET", path, 1)).body.signers.length, 0);
    assert.equal((await request("GET", "/communities/2/signers", 1)).body.signers.length, 1);

    const thresholdPath = "/communities/1/signing-threshold";
    assert.deepEqual(await request("GET", thresholdPath, 2), {
      status: 200, body: { requiredSignatures: null, authorizedSignerCount: 0 },
    });
    assert.equal((await request("GET", thresholdPath, null)).status, 401);
    assert.equal((await request("PUT", thresholdPath, null, { requiredSignatures: 2 })).status, 401);
    assert.equal((await request("GET", thresholdPath, 3)).status, 403);
    assert.equal((await request("PUT", thresholdPath, 2, { requiredSignatures: 2 })).status, 403);
    assert.equal((await request("PUT", "/communities/2/signing-threshold", 1, { requiredSignatures: 2 })).status, 403);
    assert.equal((await request("GET", "/communities/999/signing-threshold", 1)).status, 404);
    assert.equal((await request("PUT", "/communities/999/signing-threshold", 1, { requiredSignatures: 2 })).status, 404);
    assert.equal((await request("GET", "/communities/nope/signing-threshold", 1)).status, 400);
    for (const requiredSignatures of [undefined, null, 0, 1, -1, "2", 2.5, [], {}, true, 2147483648]) {
      assert.equal((await request("PUT", thresholdPath, 1, { requiredSignatures })).status, 400);
    }
    assert.equal((await request("PUT", thresholdPath, 1, { requiredSignatures: 2 })).status, 409);
    assert.equal((await request("POST", path, 1, { userId: 1 })).status, 201);
    assert.equal((await request("PUT", thresholdPath, 1, { requiredSignatures: 2 })).status, 409);
    assert.equal((await request("POST", path, 1, { userId: 2 })).status, 201);
    assert.deepEqual(await request("PUT", thresholdPath, 1, { requiredSignatures: 2 }), {
      status: 200, body: { requiredSignatures: 2, authorizedSignerCount: 2 },
    });
    assert.deepEqual((await request("GET", thresholdPath, 2)).body, { requiredSignatures: 2, authorizedSignerCount: 2 });
    memberships.push({ id: 14, userId: 4, communityId: 1, role: "COMMUNITY_MEMBER" });
    assert.equal((await request("POST", path, 1, { userId: 4 })).status, 201);
    assert.deepEqual((await request("PUT", thresholdPath, 1, { requiredSignatures: 2 })).body,
      { requiredSignatures: 2, authorizedSignerCount: 3 });
    assert.deepEqual((await request("PUT", thresholdPath, 1, { requiredSignatures: 3 })).body,
      { requiredSignatures: 3, authorizedSignerCount: 3 });
    assert.equal((await request("PUT", thresholdPath, 1, { requiredSignatures: 4 })).status, 409);
    assert.equal((await request("DELETE", `${path}/4`, 1)).status, 409);
    assert.ok(signers.some((signer) => signer.membershipId === 14));
    assert.equal((await request("PUT", thresholdPath, 1, { requiredSignatures: 2 })).status, 200);
    assert.equal((await request("DELETE", `${path}/4`, 1)).status, 204);
    assert.deepEqual((await request("GET", thresholdPath, 2)).body, { requiredSignatures: 2, authorizedSignerCount: 2 });

    const spec = require("../src/openapi");
    assert.ok(spec.paths["/communities/{communityId}/signers"].post);
    assert.ok(spec.paths["/communities/{communityId}/signers"].get);
    assert.ok(spec.paths["/communities/{communityId}/signers/{userId}"].delete);
    assert.ok(spec.paths["/communities/{communityId}/signers/me/public-info"].put);
    assert.ok(spec.paths["/communities/{communityId}/signers/me/public-info"].get);
    assert.ok(spec.paths["/communities/{communityId}/signing-threshold"].put);
    assert.ok(spec.paths["/communities/{communityId}/signing-threshold"].get);
    const schema = fs.readFileSync(pathLib.join(__dirname, "../prisma/schema.prisma"), "utf8");
    assert.match(schema, /publicKey\s+String\?/);
    assert.match(schema, /requiredSignatures\s+Int\?/);
    const migration = fs.readFileSync(pathLib.join(__dirname, "../prisma/migrations/20261008190000_signer_public_key/migration.sql"), "utf8");
    assert.match(migration, /ADD COLUMN "publicKey" TEXT/);
    const thresholdMigration = fs.readFileSync(pathLib.join(__dirname, "../prisma/migrations/20261008210000_signing_threshold/migration.sql"), "utf8");
    assert.match(thresholdMigration, /ADD COLUMN "requiredSignatures" INTEGER/);
  } finally { server.close(); }
});

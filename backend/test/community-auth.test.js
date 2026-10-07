const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "community-test-access-secret";
process.env.JWT_EXPIRES_IN = "1h";

const memberships = new Map();
// The mock can change membership during a request sequence to verify current permissions.
const prisma = {
  communityMembership: {
    // Match the compound-key lookup used by the authorization middleware.
    async findUnique({ where }) {
      const { userId, communityId } = where.userId_communityId;
      return memberships.get(`${userId}:${communityId}`) || null;
    },
  },
  async $queryRaw() { return [1]; },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const app = require("../src/app");

test("community permissions are scoped and reflect current membership", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  // Return status and JSON so permission responses can be inspected together.
  const get = async (path, authenticated = true) => {
    const response = await fetch(base + path, {
      headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    // The old auth path is removed; unauthenticated and nonmember requests differ.
    assert.equal((await fetch(base + "/auth/community-test/1/member")).status, 404);
    assert.deepEqual(await get("/communities/1/test/member", false), { status: 401, body: { error: "Unauthorized" } });
    assert.deepEqual(await get("/communities/1/test/member"), { status: 403, body: { error: "Forbidden" } });
    assert.equal((await get("/communities/999/test/member")).status, 403);
    assert.equal((await get("/communities/not-an-id/test/member")).status, 403);

    // A regular member can pass only the membership check.
    const membership = { id: 10, role: "COMMUNITY_MEMBER", authorizedSigner: null };
    memberships.set("1:1", membership);
    assert.deepEqual(await get("/communities/1/test/member"), { status: 200, body: { message: "Community membership confirmed" } });
    assert.equal((await get("/communities/1/test/admin")).status, 403);
    assert.equal((await get("/communities/1/test/signer")).status, 403);

    // Changing the current role grants admin access without granting signer access.
    membership.role = "COMMUNITY_ADMIN";
    assert.deepEqual(await get("/communities/1/test/admin"), { status: 200, body: { message: "Community admin access granted" } });
    assert.equal((await get("/communities/1/test/signer")).status, 403);

    // Signer access follows the linked signer record, not the admin role.
    membership.authorizedSigner = { id: 20 };
    assert.deepEqual(await get("/communities/1/test/signer"), { status: 200, body: { message: "Authorized signer access granted" } });

    // Permissions for one community do not carry over to another.
    memberships.set("1:2", { id: 11, role: "COMMUNITY_MEMBER", authorizedSigner: null });
    assert.equal((await get("/communities/2/test/member")).status, 200);
    assert.equal((await get("/communities/2/test/admin")).status, 403);
    assert.equal((await get("/communities/2/test/signer")).status, 403);

    // The OpenAPI paths use the new namespace and Community group.
    const paths = require("../src/openapi").paths;
    for (const permission of ["member", "admin", "signer"]) {
      const path = `/communities/{communityId}/test/${permission}`;
      assert.deepEqual(paths[path].get.tags, ["Community"]);
      assert.equal(paths[`/auth/community-test/{communityId}/${permission}`], undefined);
    }
    assert.equal(paths["/auth/admin-test"], undefined);
  } finally {
    server.close();
  }
});

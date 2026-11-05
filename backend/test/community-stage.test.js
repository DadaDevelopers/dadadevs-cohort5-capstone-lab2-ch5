const test = require("node:test");
const assert = require("node:assert/strict");

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };
const { setupStageFor } = require("../src/services/community.service");

const signer = (publicKey) => ({ authorizedSigner: { publicKey } });

test("community list setup stages mirror the protected onboarding state machine", () => {
  assert.equal(setupStageFor({ memberships: [] }), "members");
  assert.equal(setupStageFor({ memberships: [signer(null)], requiredSignatures: null }), "rule");
  assert.equal(setupStageFor({ memberships: [signer(null)], requiredSignatures: 2 }), "signers");
  assert.equal(setupStageFor({ memberships: [signer("02abc")], requiredSignatures: 1 }), "review");
  assert.equal(setupStageFor({ memberships: [], wallet: { status: "CREATING" } }), "review");
  assert.equal(setupStageFor({ memberships: [], wallet: { status: "READY" } }), "active");
});

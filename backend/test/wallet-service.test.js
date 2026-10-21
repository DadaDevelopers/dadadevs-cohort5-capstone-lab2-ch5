const test = require("node:test");
const assert = require("node:assert/strict");
const secp = require("tiny-secp256k1");

const key = (byte) => Buffer.from(secp.pointFromScalar(Buffer.alloc(32, byte), true)).toString("hex");
const signers = [
  { id: 1, publicKey: key(1), membership: { userId: 1 } },
  { id: 2, publicKey: key(2), membership: { userId: 2 } },
  { id: 3, publicKey: key(3), membership: { userId: 3 } },
];
let wallet = null;
let chain = "regtest";
let legacyBalances = true;
const calls = [];
const prisma = {
  community: { async findUnique({ where }) { return where.id === 1 ? { id: 1 } : null; } },
  communityMembership: { async findUnique({ where }) {
    const { userId, communityId } = where.userId_communityId;
    return communityId === 1 && userId <= 4 ? { id: userId, role: userId === 1 ? "COMMUNITY_ADMIN" : "COMMUNITY_MEMBER" } : null;
  } },
  authorizedSigner: { async findMany() { return signers; } },
  communityWallet: {
    async findUnique({ where }) { return wallet && (wallet.communityId === where.communityId || wallet.id === where.id) ? wallet : null; },
    async create({ data }) { wallet = { id: 1, status: "CREATING", network: "regtest", createdAt: new Date(), ...data }; return wallet; },
    async update({ data }) { Object.assign(wallet, data); return wallet; },
  },
  async $transaction(callback) { return callback(prisma); },
  async $queryRaw(strings, ...values) { return [{ id: values[0], requiredSignatures: 2 }]; },
};

class FakeRpc {
  async assertRegtest() { if (chain !== "regtest") throw Object.assign(new Error("wrong network"), { code: "WRONG_NETWORK" }); }
  async call(method, params, scopedWallet) {
    calls.push({ method, scopedWallet });
    switch (method) {
      case "getdescriptorinfo": return { descriptor: `${params[0]}#checksum` };
      case "deriveaddresses": return ["bcrt1qtestreceivingaddress"];
      case "listwallets": return [];
      case "listwalletdir": return { wallets: [] };
      case "createwallet": return { name: params[0] };
      case "getwalletinfo": return { private_keys_enabled: false, descriptors: true };
      case "listdescriptors": return { descriptors: [] };
      case "importdescriptors": return [{ success: true }];
      case "getbalances": return legacyBalances ? { watchonly: { trusted: 0.00000001, untrusted_pending: 0 } } : { mine: { trusted: 0 } };
      case "listunspent": return [{ txid: "a".repeat(64), vout: 0, address: wallet.address, amount: 0.00000001, confirmations: 1, solvable: true }];
      case "listtransactions": return [];
      default: throw new Error(`Unexpected RPC ${method}`);
    }
  }
}

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const rpcPath = require.resolve("../src/lib/bitcoin-rpc");
require.cache[rpcPath] = { id: rpcPath, filename: rpcPath, loaded: true, exports: { BitcoinRpc: FakeRpc } };
const service = require("../src/services/wallet.service");

test("wallet creation requires admin and validates immutable M-of-N policy", async () => {
  await assert.rejects(service.createWallet(2, 1), (error) => error.status === 403);
  assert.equal(calls.length, 0);
  const original = signers[2].publicKey;
  signers[2].publicKey = null;
  await assert.rejects(service.createWallet(1, 1), (error) => error.status === 409 && /register a valid compressed public key/.test(error.message));
  assert.equal(calls.length, 0);
  signers[2].publicKey = original;
  signers[2].publicKey = signers[1].publicKey;
  await assert.rejects(service.createWallet(1, 1), (error) => error.status === 409 && /distinct/.test(error.message));
  signers[2].publicKey = original;
  const result = await service.createWallet(1, 1);
  assert.equal(result.status, "READY");
  assert.equal(result.requiredSignatures, 2);
  assert.equal(result.signers.length, 3);
  assert.ok(result.descriptor.startsWith("wsh(sortedmulti(2,"));
  assert.equal(calls.find((call) => call.method === "importdescriptors").scopedWallet, "communitysafe-1");
  await assert.rejects(service.createWallet(1, 1), (error) => error.status === 409);
});

test("wallet monitoring is membership-scoped and uses only its coordinator", async () => {
  await assert.rejects(service.balance(5, 1), (error) => error.status === 403);
  assert.deepEqual(await service.balance(2, 1), { confirmedSats: "1", pendingSats: "0", immatureSats: "0" });
  legacyBalances = false;
  assert.deepEqual(await service.balance(2, 1), { confirmedSats: "1", pendingSats: "0", immatureSats: "0" });
  assert.equal((await service.utxos(2, 1))[0].amountSats, "1");
  assert.ok(calls.filter((call) => ["getbalances", "listunspent"].includes(call.method)).every((call) => call.scopedWallet === "communitysafe-1"));
});

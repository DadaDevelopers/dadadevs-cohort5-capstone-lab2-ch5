const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";

const txid = "a".repeat(64);
const wallet = { id: 4, communityId: 1, status: "READY", coreWalletName: "communitysafe-1", requiredSignatures: 2, signerSnapshot: [] };
const spend = { id: 9, walletId: 4, status: "READY", psbt: "cHNidA==", txid: null };
const events = [];
let failActivityOnce = true;
let knownByCore = false;
let sends = 0;

const prisma = {
  community: { async findUnique({ where }) { return where.id === 1 ? { id: 1 } : null; } },
  communityMembership: {
    async findUnique({ where }) { return where.userId_communityId.userId === 1 && where.userId_communityId.communityId === 1 ? { id: 1, role: "COMMUNITY_ADMIN" } : null; },
    async findMany() { return [{ userId: 1 }]; },
  },
  communityWallet: { async findUnique({ where }) { return where.communityId === 1 ? wallet : null; } },
  spendingRequest: {
    async findFirst({ where }) { return where.id === spend.id && where.walletId === wallet.id ? spend : null; },
    async update({ where, data }) { if (where.id !== spend.id) return null; Object.assign(spend, data); return spend; },
  },
  auditEvent: {
    async upsert({ where, create }) {
      if (failActivityOnce) { failActivityOnce = false; throw new Error("temporary activity storage failure"); }
      const existing = events.find((item) => item.dedupeKey === where.dedupeKey);
      if (existing) return existing;
      const row = { id: events.length + 1, ...create };
      events.push(row);
      return row;
    },
  },
  notification: { async createMany() { return { count: 0 }; } },
  async $queryRaw() { return [{ id: 1, requiredSignatures: 2 }]; },
  async $transaction(callback) {
    const before = { status: spend.status, txid: spend.txid };
    try { return await callback(prisma); }
    catch (error) { Object.assign(spend, before); throw error; }
  },
};

class FakeRpc {
  async assertRegtest() {}
  async call(method) {
    if (method === "finalizepsbt") return { complete: true, hex: "deadbeef" };
    if (method === "decoderawtransaction") return { txid };
    if (method === "gettransaction") {
      if (knownByCore) return { txid };
      throw new Error("not known");
    }
    if (method === "testmempoolaccept") return [{ allowed: true }];
    if (method === "sendrawtransaction") { sends += 1; knownByCore = true; return txid; }
    throw new Error(`Unexpected RPC ${method}`);
  }
}

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const rpcPath = require.resolve("../src/lib/bitcoin-rpc");
require.cache[rpcPath] = { id: rpcPath, filename: rpcPath, loaded: true, exports: { BitcoinRpc: FakeRpc } };
const service = require("../src/services/wallet.service");

test("broadcast retries reconcile Core success after temporary audit persistence failure", async () => {
  await assert.rejects(() => service.broadcast(1, 1, 9), /temporary activity storage failure/);
  assert.equal(knownByCore, true);
  assert.equal(spend.status, "BROADCASTING");
  assert.equal(sends, 1);

  assert.deepEqual(await service.broadcast(1, 1, 9), { txid, status: "BROADCAST" });
  assert.equal(spend.status, "BROADCAST");
  assert.equal(sends, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "SPENDING_REQUEST_BROADCAST");
});

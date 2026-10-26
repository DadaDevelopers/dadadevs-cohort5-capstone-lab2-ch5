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
let linkedSpends = [];
const calls = [];
const activity = require("./fixtures/bitcoin-core/wallet-activity.json");
const activityDetails = require("./fixtures/bitcoin-core/wallet-activity-details.json");
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
  spendingRequest: {
    async findMany(args = {}) {
      if (args.where && Object.hasOwn(args.where, "txid")) return linkedSpends;
      return [{
        id: 9, status: "SIGNING", recipient: "bcrt1qrecipient", amountSats: 1200n, feeSats: 80n,
        txid: null, createdAt: new Date("2026-10-22T08:00:00Z"), updatedAt: new Date("2026-10-22T08:00:00Z"),
        createdBy: { id: 1, firstName: "Amina", lastName: "Wanjiku" },
        signatures: [{ signerId: 1, createdAt: new Date("2026-10-22T08:01:00Z") }],
      }];
    },
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
      case "listtransactions": return activity.listtransactions;
      case "gettransaction": {
        const item = activityDetails[params[0]];
        if (!item) throw Object.assign(new Error("No such wallet transaction"), { code: -5 });
        return item;
      }
      case "getblockheader": {
        const block = Object.values(activity.blocks).find((candidate) => candidate.hash === params[0]);
        if (!block) throw Object.assign(new Error("Block not found"), { code: -5 });
        return { hash: block.hash, height: block.height };
      }
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

test("spending request list is membership-scoped and never exposes PSBT data", async () => {
  await assert.rejects(service.listSpends(5, 1), (error) => error.status === 403);
  const result = await service.listSpends(2, 1);
  assert.equal(result.requiredSignatures, 2);
  assert.equal(result.signerCount, 3);
  assert.equal(result.spends[0].amountSats, "1200");
  assert.equal(result.spends[0].createdBy.firstName, "Amina");
  assert.equal(Object.hasOwn(result.spends[0], "psbt"), false);
});


test("wallet activity groups Core's change debit/credit legs into one logical payment", async () => {
  const originalAddress = wallet.address;
  wallet.address = activity.walletAddress;
  linkedSpends = [{ id: 42, txid: activity.txids.outgoing }];
  try {
    const result = await service.transactions(2, 1);
    assert.equal(result.length, 3, "the unrelated watch-only receive must not become community activity");
    assert.deepEqual(result.map((item) => item.txid), [
      activity.txids.pending,
      activity.txids.outgoing,
      activity.txids.incoming,
    ]);

    const byTxid = new Map(result.map((item) => [item.txid, item]));
    assert.equal(byTxid.has(activity.txids.unrelated), false);

    const incoming = byTxid.get(activity.txids.incoming);
    assert.equal(incoming.direction, "incoming");
    assert.equal(incoming.category, "receive");
    assert.equal(incoming.amountSats, "1000000");
    assert.equal(incoming.feeSats, null);
    assert.equal(incoming.changeSats, "0");
    assert.equal(incoming.totalDebitSats, null);
    assert.equal(incoming.recipientAddress, null);
    assert.equal(incoming.recipientCount, 0);
    assert.deepEqual(incoming.recipients, []);
    assert.equal(incoming.requestId, null);
    assert.equal(incoming.confirmations, 2);
    assert.equal(incoming.blockhash, activity.blocks.incoming.hash);
    assert.equal(incoming.blockHeight, 1333);
    assert.equal(incoming.time, 1792685147);

    const payment = byTxid.get(activity.txids.outgoing);
    assert.equal(payment.direction, "outgoing");
    assert.equal(payment.amountSats, "100000", "only the external recipient output is the payment");
    assert.equal(payment.feeSats, "189");
    assert.equal(payment.changeSats, "899811", "change is reported separately, not as another payment");
    assert.equal(payment.totalDebitSats, "100189");
    assert.equal(payment.recipientAddress, activity.recipient);
    assert.equal(payment.recipientCount, 1);
    assert.deepEqual(payment.recipients, [{ address: activity.recipient, amountSats: "100000" }]);
    assert.equal(payment.requestId, "42");
    assert.equal(payment.confirmations, 1);
    assert.equal(payment.blockhash, activity.blocks.outgoing.hash);
    assert.equal(payment.blockHeight, 1334);

    const pending = byTxid.get(activity.txids.pending);
    assert.equal(pending.direction, "outgoing");
    assert.equal(pending.amountSats, "50000", "multiple external outputs are summed for one payment");
    assert.equal(pending.feeSats, "100");
    assert.equal(pending.changeSats, "40000");
    assert.equal(pending.totalDebitSats, "50100");
    assert.equal(pending.recipientAddress, null);
    assert.equal(pending.recipientCount, 2);
    assert.deepEqual(new Set(pending.recipients.map((recipient) => recipient.amountSats)), new Set(["30000", "20000"]));
    assert.equal(pending.requestId, null, "an unlinked wallet send remains classified as outgoing");
    assert.equal(pending.confirmations, 0);
    assert.equal(pending.blockhash, null);
    assert.equal(pending.blockHeight, null, "a mempool transaction must not claim a block height");

    const activityCalls = calls.filter((call) => call.method === "listtransactions");
    assert.ok(activityCalls.length > 0 && activityCalls.every((call) => call.scopedWallet === "communitysafe-1"));
  } finally {
    linkedSpends = [];
    wallet.address = originalAddress;
  }
});

test("transaction detail reports the same outgoing identity, fee, change and block height", async () => {
  const originalAddress = wallet.address;
  wallet.address = activity.walletAddress;
  linkedSpends = [{ id: 42, txid: activity.txids.outgoing }];
  try {
    const payment = await service.transaction(2, 1, activity.txids.outgoing);
    assert.equal(payment.direction, "outgoing");
    assert.equal(payment.amountSats, "100000");
    assert.equal(payment.feeSats, "189");
    assert.equal(payment.changeSats, "899811");
    assert.equal(payment.totalDebitSats, "100189");
    assert.equal(payment.recipientAddress, activity.recipient);
    assert.equal(payment.requestId, "42");
    assert.equal(payment.confirmations, 1);
    assert.equal(payment.blockhash, activity.blocks.outgoing.hash);
    assert.equal(payment.blockHeight, 1334);
    assert.equal(payment.time, 1792687148);

    const incoming = await service.transaction(2, 1, activity.txids.incoming);
    assert.equal(incoming.direction, "incoming");
    assert.equal(incoming.amountSats, "1000000");
    assert.equal(incoming.feeSats, null);
    assert.equal(incoming.confirmations, 2);
    assert.equal(incoming.blockHeight, 1333);

    const pending = await service.transaction(2, 1, activity.txids.pending);
    assert.equal(pending.direction, "outgoing");
    assert.equal(pending.amountSats, "50000");
    assert.equal(pending.changeSats, "40000");
    assert.equal(pending.requestId, null);
    assert.equal(pending.confirmations, 0);
    assert.equal(pending.blockHeight, null);
    assert.ok(calls.filter((call) => call.method === "gettransaction").every((call) => call.scopedWallet === "communitysafe-1"));
    await assert.rejects(service.transaction(2, 1, "not-a-txid"), (error) => error.status === 400);
  } finally {
    linkedSpends = [];
    wallet.address = originalAddress;
  }
});


test("confirmed activity resolves a missing block height from its block hash", async () => {
  const originalAddress = wallet.address;
  const originalEntries = activity.listtransactions;
  wallet.address = activity.walletAddress;
  activity.listtransactions = originalEntries.map((entry) => {
    if (entry.txid !== activity.txids.outgoing) return entry;
    const { blockheight, ...withoutHeight } = entry;
    return withoutHeight;
  });
  try {
    const payment = (await service.transactions(2, 1)).find((item) => item.txid === activity.txids.outgoing);
    assert.equal(payment.confirmations, 1);
    assert.equal(payment.blockHeight, 1334);
    assert.ok(calls.some((call) => call.method === "getblockheader" && call.scopedWallet === undefined));
  } finally {
    activity.listtransactions = originalEntries;
    wallet.address = originalAddress;
  }
});

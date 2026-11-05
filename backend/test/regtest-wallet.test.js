const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

test("HTTP Regtest workflows isolate signer keys across 2-of-3 and 2-of-2 communities", {
  skip: process.env.RUN_REGTEST_TESTS !== "1" && "Set RUN_REGTEST_TESTS=1 with the dedicated migrated Regtest database and Bitcoin Core node",
  timeout: 180000,
}, async () => {
  if (!process.env.REGTEST_TEST_DATABASE_URL) throw new Error("REGTEST_TEST_DATABASE_URL is required");
  const databaseUrl = new URL(process.env.REGTEST_TEST_DATABASE_URL);
  if (databaseUrl.pathname.replace(/^\//, "") !== "communitysafe_regtest_test") {
    throw new Error("REGTEST_TEST_DATABASE_URL must target communitysafe_regtest_test");
  }
  const rpcUrl = new URL(process.env.BITCOIN_RPC_URL || "");
  if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(rpcUrl.hostname) || rpcUrl.port !== "18444") {
    throw new Error("BITCOIN_RPC_URL must target the isolated local Regtest node on port 18444");
  }
  process.env.DATABASE_URL = process.env.REGTEST_TEST_DATABASE_URL;
  process.env.BITCOIN_RPC_TIMEOUT_MS = "60000";

  const { BitcoinRpc } = require("../src/lib/bitcoin-rpc");
  const rpc = new BitcoinRpc();
  await rpc.assertRegtest();
  const prisma = require("../src/lib/prisma");
  const rateLimitPath = require.resolve("../src/middleware/auth-rate-limit");
  const rateLimits = require(rateLimitPath);
  require.cache[rateLimitPath].exports = { ...rateLimits, authLimiter: (req, res, next) => next() };
  const app = require("../src/app");
  const runId = crypto.randomBytes(6).toString("hex");
  const credential = await rpc.credentials();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function signerRpc(wallet, method, params = []) {
    const url = new URL(rpc.url);
    url.pathname = `/wallet/${encodeURIComponent(wallet)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(credential).toString("base64")}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "1.0", id: runId, method, params }),
    });
    const body = await response.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }

  async function request(method, route, token, body) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }

  async function successful(method, route, token, body, status = 200) {
    const response = await request(method, route, token, body);
    assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(response.body)}`);
    return response.body;
  }

  async function createUser(index) {
    const password = `Regtest-${runId}-${index}!`;
    const email = `${runId}-${index}@example.invalid`;
    const registered = await successful("POST", "/auth/register", null, {
      firstName: "Regtest", lastName: `Signer${index}`, email, password,
    }, 201);
    const login = await successful("POST", "/auth/login", null, { email, password });
    return { ...registered.user, token: login.token };
  }

  async function createSignerWallet(label) {
    const walletName = `cs-e2e-${runId}-${label}`;
    await rpc.call("createwallet", [walletName, false, false, "", false, true, true]);
    const address = await signerRpc(walletName, "getnewaddress", ["", "bech32"]);
    const info = await signerRpc(walletName, "getaddressinfo", [address]);
    assert.match(info.pubkey, /^(02|03)[0-9a-f]{64}$/i);
    return { walletName, publicKey: info.pubkey.toLowerCase() };
  }

  async function createCommunity(admin, name, members, signerCount, threshold) {
    const created = await successful("POST", "/communities", admin.token, {
      name: `${name} ${runId}`, description: "Isolated reusable Regtest integration test",
    }, 201);
    const communityId = created.community.id;
    for (const member of members.filter((item) => item.id !== admin.id)) {
      await successful("POST", `/communities/${communityId}/members`, admin.token, { email: member.email }, 201);
    }
    for (const member of members.slice(0, signerCount)) {
      await successful("POST", `/communities/${communityId}/signers`, admin.token, { userId: member.id }, 201);
    }
    await successful("PUT", `/communities/${communityId}/signing-threshold`, admin.token, { requiredSignatures: threshold });
    return communityId;
  }

  async function registerKeys(communityId, signers, wallets) {
    assert.equal((await request("PUT", `/communities/${communityId}/signers/me/public-info`, signers[0].token, { publicKey: "PUBLIC-A" })).status, 400);
    for (let index = 0; index < signers.length; index += 1) {
      const body = await successful("PUT", `/communities/${communityId}/signers/me/public-info`, signers[index].token, {
        publicKey: wallets[index].publicKey.toUpperCase(),
      });
      assert.deepEqual(body, { registered: true, publicKey: wallets[index].publicKey });
    }
  }

  async function fundWallet(communityId, admin, fundingWallet, miningAddress) {
    const wallet = await successful("GET", `/communities/${communityId}/wallet`, admin.token);
    await signerRpc(fundingWallet, "sendtoaddress", [wallet.address, 0.1, "", "", false, true, null, "unset", false, 2]);
    await rpc.call("generatetoaddress", [1, miningAddress]);
    const balance = await successful("GET", `/communities/${communityId}/wallet/balance`, admin.token);
    assert.equal(balance.confirmedSats, "10000000");
    const utxos = await successful("GET", `/communities/${communityId}/wallet/utxos`, admin.token);
    assert.equal(utxos.utxos.length, 1);
    return wallet;
  }

  async function completeSpend({ communityId, admin, signers, wallets, fundingWallet, rejectWallet, nonSigner }) {
    const recipient = await signerRpc(fundingWallet, "getnewaddress", ["", "bech32"]);
    assert.equal((await request("POST", `/communities/${communityId}/wallet/spends`, admin.token, { recipient, amountSats: "0", feeRate: 2 })).status, 400);
    const spend = await successful("POST", `/communities/${communityId}/wallet/spends`, admin.token, {
      recipient, amountSats: "2500000", feeRate: 2,
    }, 201);
    if (nonSigner) {
      assert.equal((await request("GET", `/communities/${communityId}/wallet/spends/${spend.id}/psbt`, nonSigner.token)).status, 403);
    }
    assert.equal((await request("POST", `/communities/${communityId}/wallet/spends/${spend.id}/broadcast`, admin.token)).status, 409);
    if (rejectWallet) {
      const requestBody = await successful("GET", `/communities/${communityId}/wallet/spends/${spend.id}/psbt`, signers[0].token);
      const wrong = await signerRpc(rejectWallet, "walletprocesspsbt", [requestBody.psbt]);
      assert.equal((await request("POST", `/communities/${communityId}/wallet/spends/${spend.id}/signatures`, signers[0].token, { psbt: wrong.psbt })).status, 400);
    }
    for (let index = 0; index < 2; index += 1) {
      const requestBody = await successful("GET", `/communities/${communityId}/wallet/spends/${spend.id}/psbt`, signers[index].token);
      const signed = await signerRpc(wallets[index].walletName, "walletprocesspsbt", [requestBody.psbt]);
      if (index === 0 && nonSigner) {
        assert.equal((await request("POST", `/communities/${communityId}/wallet/spends/${spend.id}/signatures`, nonSigner.token, { psbt: signed.psbt })).status, 403);
      }
      const progress = await successful("POST", `/communities/${communityId}/wallet/spends/${spend.id}/signatures`, signers[index].token, { psbt: signed.psbt });
      assert.equal(progress.signatures, index + 1);
      assert.equal(progress.status, index === 0 ? "SIGNING" : "READY");
      if (index === 0) {
        assert.equal((await request("POST", `/communities/${communityId}/wallet/spends/${spend.id}/signatures`, signers[index].token, { psbt: signed.psbt })).status, 409);
      }
    }
    const sent = await successful("POST", `/communities/${communityId}/wallet/spends/${spend.id}/broadcast`, admin.token);
    assert.match(sent.txid, /^[0-9a-f]{64}$/);
    const confirmationAddress = await signerRpc(fundingWallet, "getnewaddress", ["", "bech32"]);
    await rpc.call("generatetoaddress", [1, confirmationAddress]);
    const confirmed = await successful("GET", `/communities/${communityId}/wallet/transactions/${sent.txid}`, admin.token);
    assert.ok(confirmed.confirmations >= 1);
    const final = await successful("GET", `/communities/${communityId}/wallet/spends/${spend.id}`, admin.token);
    assert.equal(final.status, "BROADCAST");
    return sent.txid;
  }

  try {
    const users = [];
    for (let index = 0; index < 4; index += 1) users.push(await createUser(index));
    const fundingWallet = `cs-e2e-${runId}-funding`;
    await rpc.call("createwallet", [fundingWallet, false, false, "", false, true, true]);
    const miningAddress = await signerRpc(fundingWallet, "getnewaddress", ["", "bech32"]);
    await rpc.call("generatetoaddress", [101, miningAddress]);

    const walletsA = [];
    for (let index = 0; index < 3; index += 1) walletsA.push(await createSignerWallet(`a-${index}`));
    const communityA = await createCommunity(users[0], "Regtest 2-of-3", users, 3, 2);
    const incomplete = await request("POST", `/communities/${communityA}/wallet`, users[0].token);
    assert.deepEqual(incomplete, { status: 409, body: { error: "Every authorized signer must register a valid compressed public key before wallet creation" } });
    await successful("PUT", `/communities/${communityA}/signers/me/public-info`, users[0].token, { publicKey: walletsA[0].publicKey });
    assert.equal((await request("PUT", `/communities/${communityA}/signers/me/public-info`, users[1].token, { publicKey: walletsA[0].publicKey })).status, 409);
    await registerKeys(communityA, users.slice(0, 3), walletsA);
    const createdA = await successful("POST", `/communities/${communityA}/wallet`, users[0].token, undefined, 201);
    assert.equal(createdA.status, "READY");
    assert.equal(createdA.requiredSignatures, 2);
    const unfundedRecipient = await signerRpc(fundingWallet, "getnewaddress", ["", "bech32"]);
    assert.equal((await request("POST", `/communities/${communityA}/wallet/spends`, users[0].token, {
      recipient: unfundedRecipient, amountSats: "2500000", feeRate: 2,
    })).status, 409);
    const fundedA = await fundWallet(communityA, users[0], fundingWallet, miningAddress);
    assert.equal((await request("GET", `/communities/${communityA}/wallet`, users[3].token)).status, 200);
    await completeSpend({ communityId: communityA, admin: users[0], signers: users.slice(0, 3), wallets: walletsA, fundingWallet, nonSigner: users[3] });

    const walletsB = [];
    for (let index = 0; index < 2; index += 1) walletsB.push(await createSignerWallet(`b-${index}`));
    assert.notEqual(walletsA[0].publicKey, walletsB[0].publicKey);
    const communityB = await createCommunity(users[0], "Regtest 2-of-2", [users[0], users[3]], 2, 2);
    await registerKeys(communityB, [users[0], users[3]], walletsB);
    const createdB = await successful("POST", `/communities/${communityB}/wallet`, users[0].token, undefined, 201);
    assert.equal(createdB.status, "READY");
    assert.notEqual(createdB.address, fundedA.address);
    assert.equal((await request("GET", `/communities/${communityB}/wallet`, users[1].token)).status, 403);
    await fundWallet(communityB, users[0], fundingWallet, miningAddress);
    await completeSpend({ communityId: communityB, admin: users[0], signers: [users[0], users[3]], wallets: walletsB, fundingWallet, rejectWallet: walletsA[0].walletName });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
});

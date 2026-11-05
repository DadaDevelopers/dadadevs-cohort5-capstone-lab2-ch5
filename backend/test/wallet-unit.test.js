const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { BitcoinRpc, BitcoinRpcError } = require("../src/lib/bitcoin-rpc");
const { btcToSats, satsToBtc, normalizeCompressedPublicKey, publicKeys, txFingerprint } = require("../src/lib/bitcoin-values");
const { Psbt, payments, networks } = require("bitcoinjs-lib");
const secp = require("tiny-secp256k1");
const {
  stableJson, compareInputMetadata, compareFinalizedInputMetadata, comparePartialSignatures,
  verifyWalletPolicy, verifyFinalizedSignerPsbt, verifySignerPsbt,
} = require("../src/lib/psbt-verification");

test("satoshi values and multisig signer policy are exact", () => {
  assert.equal(btcToSats("0.00000001"), 1n);
  assert.equal(btcToSats(0.00000001), 1n);
  assert.equal(btcToSats("21000000"), 2100000000000000n);
  assert.equal(satsToBtc(123456789n), "1.23456789");
  assert.throws(() => btcToSats("0.000000001"));
  const a = Buffer.from(secp.pointFromScalar(Buffer.alloc(32, 1), true)).toString("hex");
  const b = Buffer.from(secp.pointFromScalar(Buffer.alloc(32, 2), true)).toString("hex");
  assert.deepEqual(publicKeys([b, a], 2), [a, b].sort());
  assert.equal(normalizeCompressedPublicKey(`  ${a.toUpperCase()}  `), a);
  assert.equal(normalizeCompressedPublicKey(`02${"ff".repeat(32)}`), null);
  assert.throws(() => publicKeys([a, a], 2), /Duplicate/);
  assert.throws(() => publicKeys([a, b], 3), /threshold/);
  assert.throws(() => publicKeys([a, "xprv-secret"], 2), /compressed/);
  const tx = { version: 2, locktime: 0, vin: [{ txid: "a", vout: 0, sequence: 1 }], vout: [{ n: 0, value: 0.1, scriptPubKey: { hex: "0014" } }] };
  assert.notEqual(txFingerprint(tx), txFingerprint({ ...tx, vout: [{ ...tx.vout[0], value: 0.2 }] }));
  assert.notEqual(txFingerprint(tx), txFingerprint({ ...tx, vin: [{ ...tx.vin[0], vout: 1 }] }));
});

test("RPC uses cookie auth, scopes wallet requests and rejects wrong network", async () => {
  const seen = [];
  const savedCookie = process.env.BITCOIN_RPC_COOKIE_FILE;
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ result: req.url === "/" ? { chain: "main" } : { walletname: "communitysafe-2" }, error: null, id: "communitysafe" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    process.env.BITCOIN_RPC_COOKIE_FILE = "developer-environment-cookie";
    const rpc = new BitcoinRpc({ url: `http://127.0.0.1:${server.address().port}`, user: "rpcuser", password: "rpcpass" });
    await assert.rejects(rpc.assertRegtest(), (error) => error instanceof BitcoinRpcError && error.code === "WRONG_NETWORK");
    await rpc.call("getwalletinfo", [], "communitysafe-2");
    assert.equal(seen[1].path, "/wallet/communitysafe-2");
    assert.equal(seen[1].authorization, `Basic ${Buffer.from("rpcuser:rpcpass").toString("base64")}`);
    assert.throws(() => new BitcoinRpc({ url: "http://example.com:18443", user: "x", password: "y" }), /local HTTP/);
    await assert.rejects(rpc.call("getwalletinfo", [], "../another-wallet"), /Invalid coordinator/);
    const missingCookie = new BitcoinRpc({ url: `http://127.0.0.1:${server.address().port}`, cookieFile: "missing-regtest-cookie" });
    await assert.rejects(missingCookie.call("getblockchaininfo"), (error) => error.code === "CONFIG" && !error.message.includes("missing-regtest-cookie"));
  } finally {
    if (savedCookie === undefined) delete process.env.BITCOIN_RPC_COOKIE_FILE;
    else process.env.BITCOIN_RPC_COOKIE_FILE = savedCookie;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("RPC reports authentication, connection and timeout without leaking credentials", async () => {
  const authServer = http.createServer((req, res) => { res.writeHead(401); res.end(); });
  await new Promise((resolve) => authServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${authServer.address().port}`;
  const rpc = new BitcoinRpc({ url, user: "secret-user", password: "secret-password" });
  await assert.rejects(rpc.call("getblockchaininfo"), (error) => error.code === "AUTH" && !error.message.includes("secret"));
  await new Promise((resolve) => authServer.close(resolve));
  await assert.rejects(rpc.call("getblockchaininfo"), (error) => error.code === "CONNECTION");
  const slowServer = http.createServer(() => {});
  await new Promise((resolve) => slowServer.listen(0, "127.0.0.1", resolve));
  try {
    const slow = new BitcoinRpc({ url: `http://127.0.0.1:${slowServer.address().port}`, user: "x", password: "y", timeoutMs: 100 });
    await assert.rejects(slow.call("getblockchaininfo"), (error) => error.code === "TIMEOUT");
  } finally { slowServer.closeAllConnections(); await new Promise((resolve) => slowServer.close(resolve)); }
});

test("each external multisig PSBT signature is verified cryptographically", () => {
  const privateKeys = [1, 2, 3].map((n) => Buffer.alloc(32, n));
  const pubkeys = privateKeys.map((key) => Buffer.from(secp.pointFromScalar(key, true))).sort(Buffer.compare);
  const multisig = payments.p2ms({ m: 2, pubkeys, network: networks.regtest });
  const witness = payments.p2wsh({ redeem: multisig, network: networks.regtest });
  const psbt = new Psbt({ network: networks.regtest });
  psbt.addInput({ hash: "11".repeat(32), index: 0, witnessUtxo: { script: witness.output, value: 100000n }, witnessScript: multisig.output });
  psbt.addOutput({ script: witness.output, value: 90000n });
  const signerKey = privateKeys[0];
  const publicKey = Buffer.from(secp.pointFromScalar(signerKey, true));
  psbt.signInput(0, { publicKey, sign: (hash) => secp.sign(hash, signerKey) });
  assert.equal(verifySignerPsbt(psbt.toBase64(), publicKey.toString("hex")), true);
  assert.equal(verifySignerPsbt(psbt.toBase64(), pubkeys.find((key) => !key.equals(publicKey)).toString("hex")), false);
  const altered = Psbt.fromBase64(psbt.toBase64());
  altered.data.inputs[0].partialSig[0].signature[10] ^= 1;
  assert.equal(verifySignerPsbt(altered.toBase64(), publicKey.toString("hex")), false);
});

test("Core signer derivation metadata is allowed without weakening PSBT checks", () => {
  const signer = `02${"11".repeat(32)}`;
  const other = `03${"22".repeat(32)}`;
  const current = {
    witness_utxo: { amount: 1, scriptPubKey: { hex: "0020aa" } },
    witness_script: { hex: "5221aa52ae", type: "multisig" },
    sighash: "ALL",
    unknown: { fc01: "preserve-me" },
    partial_signatures: { [other]: "existing-signature" },
  };
  const derivation = { pubkey: signer, master_fingerprint: "12345678", path: "m/84'/1'/0'/0/0" };
  const incoming = { ...current, bip32_derivs: [derivation], partial_signatures: { ...current.partial_signatures, [signer]: "new-signature" } };
  assert.equal(compareInputMetadata(current, incoming, signer).valid, true);
  assert.equal(comparePartialSignatures(current, incoming, signer), true);
  assert.equal(stableJson({ b: 1, a: { d: 2, c: 3 } }), stableJson({ a: { c: 3, d: 2 }, b: 1 }));

  for (const changed of [
    { ...incoming, witness_utxo: { ...incoming.witness_utxo, amount: 2 } },
    { ...incoming, witness_script: { ...incoming.witness_script, hex: "changed" } },
    { ...incoming, sighash: "NONE" },
    { ...incoming, unknown: { fc01: "changed" } },
    { ...incoming, bip32_derivs: [{ ...derivation, pubkey: other }] },
  ]) assert.equal(compareInputMetadata(current, changed, signer).valid, false);
  assert.equal(comparePartialSignatures(current, { ...incoming, partial_signatures: { [signer]: "new-signature" } }, signer), false);
  assert.equal(comparePartialSignatures(current, { ...incoming, partial_signatures: { ...incoming.partial_signatures, [`02${"33".repeat(32)}`]: "extra" } }, signer), false);
});

test("PSBT inputs must match the wallet's exact 2-of-3 P2WSH policy", () => {
  const privateKeys = [1, 2, 3].map((n) => Buffer.alloc(32, n));
  const publicKeys = privateKeys.map((key) => Buffer.from(secp.pointFromScalar(key, true)).toString("hex")).sort();
  const witnessScript = payments.p2ms({ m: 2, pubkeys: publicKeys.map((key) => Buffer.from(key, "hex")), network: networks.regtest }).output;
  const witness = payments.p2wsh({ redeem: { output: witnessScript }, network: networks.regtest });
  const psbt = new Psbt({ network: networks.regtest });
  psbt.addInput({ hash: "44".repeat(32), index: 0, witnessUtxo: { script: witness.output, value: 100000n }, witnessScript });
  psbt.addOutput({ script: witness.output, value: 90000n });
  assert.equal(verifyWalletPolicy(psbt.toBase64(), 2, publicKeys), true);
  assert.equal(verifyWalletPolicy(psbt.toBase64(), 3, publicKeys), false);
  const changedScript = Psbt.fromBase64(psbt.toBase64());
  changedScript.data.inputs[0].witnessScript = Buffer.from("51", "hex");
  assert.equal(verifyWalletPolicy(changedScript.toBase64(), 2, publicKeys), false);
  const changedUtxo = Psbt.fromBase64(psbt.toBase64());
  changedUtxo.data.inputs[0].witnessUtxo.script = Buffer.from("0014" + "00".repeat(20), "hex");
  assert.equal(verifyWalletPolicy(changedUtxo.toBase64(), 2, publicKeys), false);
});

test("a Core-finalized threshold signature preserves prior signatures and signer identity", () => {
  const privateKeys = [1, 2, 3].map((n) => Buffer.alloc(32, n));
  const entries = privateKeys.map((privateKey) => ({
    privateKey,
    publicKey: Buffer.from(secp.pointFromScalar(privateKey, true)),
  })).sort((a, b) => Buffer.compare(a.publicKey, b.publicKey));
  const publicKeys = entries.map((entry) => entry.publicKey.toString("hex"));
  const witnessScript = payments.p2ms({ m: 2, pubkeys: entries.map((entry) => entry.publicKey), network: networks.regtest }).output;
  const witness = payments.p2wsh({ redeem: { output: witnessScript }, network: networks.regtest });
  const current = new Psbt({ network: networks.regtest });
  current.addInput({ hash: "55".repeat(32), index: 0, witnessUtxo: { script: witness.output, value: 100000n }, witnessScript });
  current.addOutput({ script: witness.output, value: 90000n });
  const signer = (entry) => ({ publicKey: entry.publicKey, sign: (hash) => secp.sign(hash, entry.privateKey) });
  current.signInput(0, signer(entries[0]));
  const finalized = Psbt.fromBase64(current.toBase64(), { network: networks.regtest });
  finalized.signInput(0, signer(entries[1]));
  finalized.finalizeAllInputs();

  assert.equal(verifyWalletPolicy(finalized.toBase64(), 2, publicKeys), true);
  assert.equal(verifyFinalizedSignerPsbt(current.toBase64(), finalized.toBase64(), publicKeys[1], publicKeys), true);
  assert.equal(verifyFinalizedSignerPsbt(current.toBase64(), finalized.toBase64(), publicKeys[2], publicKeys), false);
  const corrupted = Psbt.fromBase64(finalized.toBase64(), { network: networks.regtest });
  corrupted.data.inputs[0].finalScriptWitness[10] ^= 1;
  assert.equal(verifyFinalizedSignerPsbt(current.toBase64(), corrupted.toBase64(), publicKeys[1], publicKeys), false);

  const decodedCurrent = { witness_utxo: { amount: 1 }, witness_script: { hex: "policy" }, bip32_derivs: [], partial_signatures: { [publicKeys[0]]: "signature" } };
  const decodedFinal = { witness_utxo: { amount: 1 }, final_scriptwitness: ["", "signature", "signature", "policy"] };
  assert.equal(compareFinalizedInputMetadata(decodedCurrent, decodedFinal).valid, true);
  assert.equal(compareFinalizedInputMetadata(decodedCurrent, { ...decodedFinal, witness_utxo: { amount: 2 } }).valid, false);
  assert.equal(compareFinalizedInputMetadata(decodedCurrent, { ...decodedFinal, final_scriptsig: { hex: "unexpected" } }).valid, false);
});

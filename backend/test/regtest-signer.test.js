const test = require("node:test");
const assert = require("node:assert/strict");
const { Psbt, payments, networks } = require("bitcoinjs-lib");
const secp = require("tiny-secp256k1");

const { parseArgs, validateApiUrl, validateRpcUrl, associationIdentity, inspectPsbt, verifyUnspentInputs } = require("../scripts/regtest-signer");

test("Regtest signer associations are stable and community scoped", () => {
  const api = validateApiUrl("http://127.0.0.1:3000/");
  const rpc = validateRpcUrl("http://localhost:18444");
  const first = associationIdentity(api, rpc, 8, 2);
  assert.deepEqual(associationIdentity(api, rpc, 8, 2), first);
  assert.notEqual(associationIdentity(api, rpc, 9, 2).walletName, first.walletName);
  assert.notEqual(associationIdentity(api, rpc, 8, 3).walletName, first.walletName);
  assert.match(first.walletName, /^cs-signer-[0-9a-f]{32}$/);
});

test("Regtest signer arguments and local endpoint restrictions are validated", () => {
  assert.deepEqual(parseArgs(["setup", "--community-id", "8", "--user-id", "2"]), {
    command: "setup", communityId: 8, userId: 2,
  });
  assert.deepEqual(parseArgs(["sign", "--community-id", "8", "--user-id", "2", "--spend-id", "4"]), {
    command: "sign", communityId: 8, userId: 2, spendId: 4,
  });
  assert.throws(() => parseArgs(["sign", "--community-id", "8", "--user-id", "2"]), /spend-id/);
  assert.throws(() => validateApiUrl("https://example.com"), /local HTTP/);
  assert.throws(() => validateRpcUrl("http://127.0.0.1:18443"), /18444/);
});

test("Regtest signer review checks the exact wallet policy, recipient, amount and fee", () => {
  const publicKeys = [1, 2].map((value) => Buffer.from(secp.pointFromScalar(Buffer.alloc(32, value), true))).sort(Buffer.compare);
  const multisig = payments.p2ms({ m: 2, pubkeys: publicKeys, network: networks.regtest });
  const community = payments.p2wsh({ redeem: multisig, network: networks.regtest });
  const recipientKey = Buffer.from(secp.pointFromScalar(Buffer.alloc(32, 3), true));
  const recipient = payments.p2wpkh({ pubkey: recipientKey, network: networks.regtest });
  const psbt = new Psbt({ network: networks.regtest });
  psbt.addInput({ hash: "11".repeat(32), index: 0, witnessUtxo: { script: community.output, value: 100000n }, witnessScript: multisig.output });
  psbt.addOutput({ address: recipient.address, value: 80000n });
  psbt.addOutput({ address: community.address, value: 19000n });
  const wallet = {
    address: community.address,
    requiredSignatures: 2,
    signers: publicKeys.map((key) => ({ publicKey: key.toString("hex") })),
  };
  const spend = { recipient: recipient.address, amountSats: "80000", feeSats: "1000", psbt: psbt.toBase64() };
  const decoded = {
    fee: 0.00001,
    inputs: [{ witness_utxo: { amount: 0.001, scriptPubKey: { hex: community.output.toString("hex") } } }],
    tx: {
      vin: [{ txid: "11".repeat(32), vout: 0 }],
      vout: [
        { value: 0.0008, scriptPubKey: { address: recipient.address } },
        { value: 0.00019, scriptPubKey: { address: community.address } },
      ],
    },
  };
  assert.deepEqual(inspectPsbt(decoded, wallet, spend), { amount: 80000n, fee: 1000n, inputs: [`${"11".repeat(32)}:0`] });
  assert.throws(() => inspectPsbt({ ...decoded, fee: 0.00002 }, wallet, spend), /fee/);
  assert.throws(() => inspectPsbt(decoded, { ...wallet, requiredSignatures: 1 }, spend), /policy/);
});

test("Regtest signer review confirms each PSBT input against the node's UTXO set", async () => {
  const txid = "11".repeat(32);
  const decoded = {
    tx: { vin: [{ txid, vout: 0 }] },
    inputs: [{ witness_utxo: { amount: 0.001, scriptPubKey: { hex: "0020abcd" } } }],
  };
  const matchingRpc = { async call(method, params) {
    assert.deepEqual([method, params], ["gettxout", [txid, 0, true]]);
    return { value: 0.001, scriptPubKey: { hex: "0020abcd" } };
  } };
  await verifyUnspentInputs(matchingRpc, decoded);
  await assert.rejects(verifyUnspentInputs({ async call() { return null; } }, decoded), /unspent Regtest output/);
});

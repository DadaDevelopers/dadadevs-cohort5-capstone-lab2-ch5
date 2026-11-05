const test = require("node:test");
const assert = require("node:assert/strict");
const { Psbt, Transaction, networks } = require("bitcoinjs-lib");
const {
  compareInputMetadata, comparePartialSignatures, verifyWalletPolicy, verifySignerPsbt,
} = require("../src/lib/psbt-verification");
const fixture = require("./fixtures/browser-signer/psbt.json");
const coreFormatFixture = require("./fixtures/browser-signer/core-format.json");

const toHex = (value) => Buffer.from(value).toString("hex");
const parse = (base64) => Psbt.fromBase64(base64, { network: networks.regtest });

/**
 * Reshapes a bitcoinjs-decoded PSBT into the `decodepsbt` shape the service
 * compares, so browser output is checked exactly like a Core round-trip. Only
 * the fields psbt-verification inspects are modelled.
 */
function decodedInputs(base64) {
  return parse(base64).data.inputs.map((input) => ({
    // `decodepsbt` includes `non_witness_utxo` when the coordinator supplied the full
    // previous transaction. Model its stable parts so browser output is compared like Core.
    ...(input.nonWitnessUtxo ? {
      non_witness_utxo: {
        txid: Transaction.fromBuffer(input.nonWitnessUtxo).getId(),
        hex: toHex(input.nonWitnessUtxo),
      },
    } : {}),
    witness_utxo: {
      amount: Number(input.witnessUtxo.value) / 100000000,
      scriptPubKey: { hex: toHex(input.witnessUtxo.script) },
    },
    witness_script: { hex: toHex(input.witnessScript) },
    bip32_derivs: (input.bip32Derivation || []).map(({ masterFingerprint, path, pubkey }) => ({
      master_fingerprint: toHex(masterFingerprint),
      path,
      pubkey: toHex(pubkey),
    })),
    partial_signatures: Object.fromEntries((input.partialSig || []).map(({ pubkey, signature }) => [toHex(pubkey), toHex(signature)])),
  }));
}

function reencode(base64, mutate) {
  const psbt = parse(base64);
  psbt.data.inputs.forEach(mutate);
  return psbt.toBase64();
}

test("browser (scure) signatures are accepted by the backend bitcoinjs verification", () => {
  const [signerA, signerB] = fixture.signerKeys;
  for (const psbt of [fixture.unsigned, fixture.signedA, fixture.signedAB]) {
    assert.equal(verifyWalletPolicy(psbt, fixture.threshold, fixture.publicKeys), true);
  }

  assert.equal(verifySignerPsbt(fixture.signedA, signerA), true);
  assert.equal(verifySignerPsbt(fixture.signedA, signerB), false);
  assert.equal(verifySignerPsbt(fixture.signedA, fixture.uninvolvedKey), false);

  // The second browser signer builds on the first partial signature without
  // dropping or altering it, so the combined PSBT still finalizes on Regtest.
  assert.equal(verifySignerPsbt(fixture.signedAB, signerB), true);
  assert.equal(verifySignerPsbt(fixture.signedAB, fixture.uninvolvedKey), false);

  const partial = decodedInputs(fixture.signedA);
  const combined = decodedInputs(fixture.signedAB);
  assert.equal(partial.length, 1);
  assert.equal(combined.length, 1);
  assert.deepEqual(Object.keys(partial[0].partial_signatures), [signerA]);
  assert.deepEqual(Object.keys(combined[0].partial_signatures).sort(), [signerA, signerB].sort());
  assert.deepEqual(combined[0].partial_signatures[signerA], partial[0].partial_signatures[signerA]);
  assert.equal(partial[0].partial_signatures[signerA].slice(-2), "01", "SIGHASH_ALL is required");

  for (const derivation of combined[0].bip32_derivs) {
    assert.match(derivation.master_fingerprint, /^[0-9a-f]{8}$/);
    assert.match(derivation.path, /^m(\/\d+'?)+$/);
  }

  // Browser signing must leave every coordinator field byte-identical.
  assert.equal(compareInputMetadata(partial[0], combined[0], signerB).valid, true);
  assert.equal(comparePartialSignatures(partial[0], combined[0], signerB), true);
  assert.equal(compareInputMetadata(combined[0], combined[0], signerB).valid, true);
});

test("browser compatibility checks reject mismatched, tampered, and injected signatures", () => {
  const [signerA, signerB] = fixture.signerKeys;
  const partial = decodedInputs(fixture.signedA);
  const combined = decodedInputs(fixture.signedAB);

  assert.equal(verifyWalletPolicy(fixture.signedAB, 3, fixture.publicKeys), false);
  assert.equal(verifyWalletPolicy(fixture.signedAB, fixture.threshold, [signerA, signerB, signerB]), false);
  assert.equal(verifyWalletPolicy(fixture.signedAB, fixture.threshold, [...fixture.publicKeys.slice(0, 2), "02" + "11".repeat(32)]), false);

  // A signer may not claim the partial signature of another key.
  assert.equal(comparePartialSignatures(partial, combined, fixture.uninvolvedKey), false);
  assert.equal(compareInputMetadata(partial[0], { ...combined[0], witness_script: { hex: "51" } }, signerB).valid, false);
  assert.equal(compareInputMetadata(partial[0], {
    ...combined[0],
    bip32_derivs: [...combined[0].bip32_derivs, {
      master_fingerprint: "00000000", path: "m/48'/1'/0'/2'/0/0", pubkey: fixture.uninvolvedKey,
    }],
  }, signerB).valid, false);

  const corrupted = reencode(fixture.signedAB, (input) => {
    const own = input.partialSig.find(({ pubkey }) => toHex(pubkey) === signerB);
    own.signature[10] ^= 1;
  });
  assert.equal(verifySignerPsbt(corrupted, signerB), false);
  assert.equal(verifySignerPsbt(corrupted, signerA), true);

  // An extra signature for a key outside the wallet policy is rejected even
  // though the PSBT still parses and both known signatures remain valid.
  const injected = reencode(fixture.signedAB, (input) => {
    input.partialSig.push({ pubkey: Buffer.from(fixture.uninvolvedKey, "hex"), signature: input.partialSig[0].signature });
  });
  assert.equal(comparePartialSignatures(partial[0], decodedInputs(injected)[0], signerB), false);
  assert.equal(verifySignerPsbt(injected, fixture.uninvolvedKey), false);

  // Re-signing with the same key, as a browser retry would, is not accepted as
  // a fresh contribution because the signature count does not grow by exactly one.
  assert.equal(comparePartialSignatures(combined[0], combined[0], signerB), false);
  assert.equal(comparePartialSignatures(partial[0], partial[0], signerA), false);
});

test("Bitcoin Core walletcreatefundedpsbt inputs keep non_witness_utxo through browser signing", () => {
  const [signerA, signerC] = coreFormatFixture.signerKeys;
  const unsigned = decodedInputs(coreFormatFixture.unsigned);
  const partial = decodedInputs(coreFormatFixture.signedA);
  const combined = decodedInputs(coreFormatFixture.signedAB);

  for (const psbt of [coreFormatFixture.unsigned, coreFormatFixture.signedA, coreFormatFixture.signedAB]) {
    assert.equal(verifyWalletPolicy(psbt, coreFormatFixture.threshold, coreFormatFixture.publicKeys), true);
  }
  assert.equal(verifySignerPsbt(coreFormatFixture.signedA, signerA), true);
  assert.equal(verifySignerPsbt(coreFormatFixture.signedAB, signerC), true);
  assert.equal(verifySignerPsbt(coreFormatFixture.signedAB, coreFormatFixture.uninvolvedKey), false);

  // Core adds the full previous transaction next to witnessUtxo for this P2WSH input.
  // That is valid coordinator metadata and must survive browser signing byte-for-byte.
  assert.equal(unsigned.length, 1);
  assert.ok(unsigned[0].non_witness_utxo.hex.length > 0);
  for (const decoded of [partial, combined]) {
    assert.equal(decoded[0].non_witness_utxo.hex, unsigned[0].non_witness_utxo.hex);
    assert.equal(decoded[0].non_witness_utxo.txid, unsigned[0].non_witness_utxo.txid);
  }
  assert.equal(compareInputMetadata(unsigned[0], partial[0], signerA).valid, true);
  assert.equal(compareInputMetadata(partial[0], combined[0], signerC).valid, true);
  assert.equal(comparePartialSignatures(partial[0], combined[0], signerC), true);

  // The supplementary transaction must commit to the exact P2WSH output being spent.
  const psbt = parse(coreFormatFixture.unsigned);
  const input = psbt.data.inputs[0];
  const outpoint = psbt.txInputs[0];
  const previousTx = Transaction.fromBuffer(input.nonWitnessUtxo);
  assert.equal(previousTx.getId(), Buffer.from(outpoint.hash).reverse().toString("hex"));
  assert.equal(previousTx.outs[outpoint.index].value, input.witnessUtxo.value);
  assert.equal(toHex(previousTx.outs[outpoint.index].script), toHex(input.witnessUtxo.script));

  // Any difference in the full previous transaction is rejected like any other metadata.
  const lastByte = partial[0].non_witness_utxo.hex.slice(-2);
  assert.equal(compareInputMetadata(unsigned[0], {
    ...partial[0],
    non_witness_utxo: {
      ...partial[0].non_witness_utxo,
      hex: `${partial[0].non_witness_utxo.hex.slice(0, -2)}${lastByte === "00" ? "01" : "00"}`,
    },
  }, signerA).valid, false);
});


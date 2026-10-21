const { Psbt, networks, payments, script } = require("bitcoinjs-lib");
const secp = require("tiny-secp256k1");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const stableJson = (value) => JSON.stringify(stableValue(value));

function valueType(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function changedFields(before, after, prefix = "") {
  if (stableJson(before) === stableJson(after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) || Array.isArray(after)) {
    return [{ field: prefix || "value", beforeType: valueType(before), afterType: valueType(after) }];
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].sort().flatMap((key) => changedFields(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

function unsignedInputMetadata(input) {
  const { partial_signatures, bip32_derivs, ...metadata } = input;
  return metadata;
}

function derivationMap(input) {
  const map = new Map();
  for (const item of input.bip32_derivs || []) {
    const fields = item && Object.keys(item).sort();
    if (!item || stableJson(fields) !== stableJson(["master_fingerprint", "path", "pubkey"]) ||
        typeof item.pubkey !== "string" || !/^(02|03)[0-9a-f]{64}$/i.test(item.pubkey) ||
        typeof item.master_fingerprint !== "string" || !/^[0-9a-f]{8}$/i.test(item.master_fingerprint) ||
        typeof item.path !== "string" || !/^m(?:\/[0-9]+['h]?)*$/.test(item.path) ||
        map.has(item.pubkey.toLowerCase())) return null;
    map.set(item.pubkey.toLowerCase(), stableJson(item));
  }
  return map;
}

function compareInputMetadata(current, incoming, signerPublicKey) {
  const changes = changedFields(unsignedInputMetadata(current), unsignedInputMetadata(incoming));
  if (changes.length) return { valid: false, changes };
  const before = derivationMap(current);
  const after = derivationMap(incoming);
  if (!before || !after) return { valid: false, changes: [{ field: "bip32_derivs", beforeType: "array", afterType: "array" }] };
  for (const [key, value] of before) {
    if (after.get(key) !== value) return { valid: false, changes: [{ field: `bip32_derivs.${key}`, beforeType: "object", afterType: after.has(key) ? "object" : "missing" }] };
  }
  const additions = [...after.keys()].filter((key) => !before.has(key));
  if (additions.some((key) => key !== signerPublicKey.toLowerCase())) {
    return { valid: false, changes: additions.map((key) => ({ field: `bip32_derivs.${key}`, beforeType: "missing", afterType: "object" })) };
  }
  return { valid: true, changes: additions.map(() => ({ field: "bip32_derivs.<signer>", beforeType: "missing", afterType: "object" })) };
}

function compareFinalizedInputMetadata(current, incoming) {
  const {
    partial_signatures: _currentSignatures,
    bip32_derivs: _currentDerivations,
    witness_script: _currentWitnessScript,
    ...currentMetadata
  } = current;
  const { final_scriptwitness: _finalWitness, ...incomingMetadata } = incoming;
  const changes = changedFields(currentMetadata, incomingMetadata);
  return { valid: changes.length === 0, changes };
}

function comparePartialSignatures(current, incoming, signerPublicKey) {
  const before = current.partial_signatures || {};
  const after = incoming.partial_signatures || {};
  const signerKey = signerPublicKey.toLowerCase();
  if (Object.entries(before).some(([key, value]) => after[key] !== value)) return false;
  const additions = Object.keys(after).filter((key) => before[key] === undefined);
  return additions.length === 1 && additions[0].toLowerCase() === signerKey;
}

function verifyWalletPolicy(base64, requiredSignatures, publicKeys) {
  try {
    const keys = publicKeys.map((key) => Buffer.from(key, "hex")).sort(Buffer.compare);
    const witnessScript = payments.p2ms({ m: requiredSignatures, pubkeys: keys, network: networks.regtest }).output;
    const scriptPubKey = payments.p2wsh({ redeem: { output: witnessScript }, network: networks.regtest }).output;
    const psbt = Psbt.fromBase64(base64, { network: networks.regtest });
    return psbt.data.inputs.length > 0 && psbt.data.inputs.every((input) => {
      if (!input.witnessUtxo || !Buffer.from(input.witnessUtxo.script).equals(scriptPubKey)) return false;
      if (input.witnessScript) return Buffer.from(input.witnessScript).equals(witnessScript);
      const stack = decodeWitness(input.finalScriptWitness);
      return stack && stack.length >= requiredSignatures + 2 && Buffer.from(stack.at(-1)).equals(witnessScript);
    });
  } catch (_) {
    return false;
  }
}

function readCompactSize(buffer, offset) {
  const first = buffer[offset];
  if (first === undefined) throw new Error("Truncated witness");
  if (first < 253) return { value: first, bytes: 1 };
  if (first === 253) return { value: buffer.readUInt16LE(offset + 1), bytes: 3 };
  if (first === 254) return { value: buffer.readUInt32LE(offset + 1), bytes: 5 };
  const value = buffer.readBigUInt64LE(offset + 1);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Oversized witness");
  return { value: Number(value), bytes: 9 };
}

function decodeWitness(serialized) {
  if (!serialized) return null;
  try {
    const buffer = Buffer.from(serialized);
    let offset = 0;
    const count = readCompactSize(buffer, offset);
    offset += count.bytes;
    if (count.value > 100) return null;
    const items = [];
    for (let i = 0; i < count.value; i += 1) {
      const length = readCompactSize(buffer, offset);
      offset += length.bytes;
      if (length.value > 10000 || offset + length.value > buffer.length) return null;
      items.push(buffer.subarray(offset, offset + length.value));
      offset += length.value;
    }
    return offset === buffer.length ? items : null;
  } catch (_) {
    return null;
  }
}

function verifyFinalizedSignerPsbt(currentBase64, incomingBase64, signerPublicKey, authorizedPublicKeys) {
  try {
    const current = Psbt.fromBase64(currentBase64, { network: networks.regtest });
    const incoming = Psbt.fromBase64(incomingBase64, { network: networks.regtest });
    if (current.data.inputs.length !== incoming.data.inputs.length) return false;
    const transaction = incoming.extractTransaction(true);
    const authorized = authorizedPublicKeys.map((key) => Buffer.from(key, "hex"));
    const signerHex = signerPublicKey.toLowerCase();
    return incoming.data.inputs.every((input, index) => {
      const before = current.data.inputs[index].partialSig || [];
      if (before.some((item) => Buffer.from(item.pubkey).toString("hex") === signerHex)) return false;
      const stack = decodeWitness(input.finalScriptWitness);
      if (!stack || stack.length < 3 || stack[0].length !== 0) return false;
      const signatures = stack.slice(1, -1);
      if (signatures.length !== before.length + 1) return false;
      const signatureHex = new Set(signatures.map((item) => Buffer.from(item).toString("hex")));
      if (before.some((item) => !signatureHex.has(Buffer.from(item.signature).toString("hex")))) return false;
      const matchedKeys = new Set();
      for (const encoded of signatures) {
        const decoded = script.signature.decode(encoded);
        if (decoded.hashType !== 1) return false;
        const hash = transaction.hashForWitnessV0(
          index,
          Buffer.from(stack.at(-1)),
          input.witnessUtxo.value,
          decoded.hashType,
        );
        const matches = authorized.filter((key) => secp.verify(hash, key, decoded.signature));
        if (matches.length !== 1) return false;
        matchedKeys.add(matches[0].toString("hex"));
      }
      return matchedKeys.size === signatures.length && matchedKeys.has(signerHex);
    });
  } catch (_) {
    return false;
  }
}

function verifySignerPsbt(base64, publicKey) {
  try {
    const psbt = Psbt.fromBase64(base64);
    const key = Buffer.from(publicKey, "hex");
    if (psbt.data.inputs.length === 0) return false;
    return psbt.data.inputs.every((input, index) => {
      const signatures = (input.partialSig || []).filter((item) => Buffer.from(item.pubkey).equals(key));
      if (signatures.length !== 1 || signatures[0].signature.at(-1) !== 1) return false;
      return psbt.validateSignaturesOfInput(index, (pubkey, hash, signature) => secp.verify(hash, pubkey, signature), key);
    });
  } catch (_) {
    return false;
  }
}

module.exports = {
  stableJson,
  changedFields,
  compareInputMetadata,
  compareFinalizedInputMetadata,
  comparePartialSignatures,
  verifyWalletPolicy,
  verifyFinalizedSignerPsbt,
  verifySignerPsbt,
};

const { createHash } = require("node:crypto");
const secp = require("tiny-secp256k1");

const COMPRESSED_PUBLIC_KEY = /^(02|03)[0-9a-f]{64}$/;

function normalizeCompressedPublicKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!COMPRESSED_PUBLIC_KEY.test(normalized)) return null;
  try {
    return secp.isPoint(Buffer.from(normalized, "hex")) ? normalized : null;
  } catch (_) {
    return null;
  }
}

function btcToSats(value) {
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 21000000)) throw new Error("Invalid Bitcoin amount");
  const text = typeof value === "number" ? value.toFixed(8) : String(value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) throw new Error("Invalid Bitcoin amount");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}

function satsToBtc(sats) {
  const value = BigInt(sats);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100000000n}.${String(abs % 100000000n).padStart(8, "0")}`;
}

function publicKeys(keys, threshold) {
  if (!Array.isArray(keys) || keys.length < 2 || keys.length > 15 || !Number.isInteger(threshold) || threshold < 2 || threshold > keys.length) {
    throw new Error("Invalid multisignature threshold or signer count");
  }
  const normalized = keys.map((key) => {
    const publicKey = normalizeCompressedPublicKey(key);
    if (!publicKey) throw new Error("Each signer needs a valid compressed public key");
    return publicKey;
  });
  if (new Set(normalized.map((key) => key.slice(2))).size !== normalized.length) throw new Error("Duplicate signer public keys");
  return normalized.sort();
}

function txFingerprint(tx) {
  const body = {
    vin: tx.vin.map((i) => [i.txid, i.vout, i.sequence]),
    vout: tx.vout.map((o) => [o.n, btcToSats(o.value).toString(), o.scriptPubKey.hex]),
    locktime: tx.locktime,
    version: tx.version,
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

module.exports = { btcToSats, satsToBtc, normalizeCompressedPublicKey, publicKeys, txFingerprint };

const MAX_PUBLIC_KEY_LENGTH = 256;
const PRIVATE_FIELDS = new Set([
  "privatekey", "seed", "seedphrase", "mnemonic", "recoveryphrase", "wif", "xprv", "xpriv", "secret",
]);
const PRIVATE_ERROR = "Private key material must never be submitted to the server";
const WIF_PATTERN = /^(?:[59][1-9A-HJ-NP-Za-km-z]{50}|[KLc][1-9A-HJ-NP-Za-km-z]{51})$/;

function looksLikePrivateKey(value) {
  return /^(?:xprv|xpriv|tprv|yprv|zprv|uprv|vprv|wif[:=]|-----BEGIN .*PRIVATE KEY)/i.test(value) || WIF_PATTERN.test(value);
}

function containsPrivateField(body) {
  const pending = [body];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_FIELDS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())) return true;
      pending.push(child);
    }
  }
  return false;
}

function validatePublicInfo(body) {
  if (containsPrivateField(body)) {
    return { error: PRIVATE_ERROR };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, "publicKey")) {
    return { error: "Only publicKey is allowed" };
  }
  if (typeof body.publicKey !== "string" || !body.publicKey.trim() ||
      body.publicKey.trim().length > MAX_PUBLIC_KEY_LENGTH) {
    return { error: "publicKey must be a nonempty string of at most 256 characters" };
  }
  const publicKey = body.publicKey.trim();
  if (looksLikePrivateKey(publicKey)) return { error: PRIVATE_ERROR };
  if (/\s/.test(publicKey)) return { error: "publicKey must not contain whitespace" };
  return { publicKey };
}

module.exports = { validatePublicInfo, MAX_PUBLIC_KEY_LENGTH };

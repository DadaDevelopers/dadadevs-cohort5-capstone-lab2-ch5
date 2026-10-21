// Small Bitcoin helpers used for client-side validation and display.
// The backend and the Bitcoin integration layer remain the source of truth;
// these checks only give people fast, plain-language feedback while typing.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_CONST = 1
const BECH32M_CONST = 0x2bc830a3

function polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= gen[i]
    }
  }
  return chk >>> 0
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5)
  out.push(0)
  for (const c of hrp) out.push(c.charCodeAt(0) & 31)
  return out
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const max = (1 << to) - 1
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & max)
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & max)
  } else if (bits >= from || ((acc << (to - bits)) & max) !== 0) {
    return null
  }
  return out
}

/** Encodes a segwit address. Used by the mock layer to produce valid regtest addresses. */
export function encodeSegwitAddress(hrp: string, version: number, program: number[]): string {
  const data = [version, ...(convertBits(program, 8, 5, true) ?? [])]
  const constant = version === 0 ? BECH32_CONST : BECH32M_CONST
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ constant
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31)
  return `${hrp}1${[...data, ...checksum].map((d) => CHARSET[d]).join('')}`
}

interface DecodedAddress {
  hrp: string
  version: number
  program: number[]
}

function decodeSegwitAddress(address: string): DecodedAddress | 'bad-checksum' | null {
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null
  const lower = address.toLowerCase()
  const pos = lower.lastIndexOf('1')
  if (pos < 1 || pos + 7 > lower.length || lower.length > 90) return null
  const hrp = lower.slice(0, pos)
  const data: number[] = []
  for (const c of lower.slice(pos + 1)) {
    const d = CHARSET.indexOf(c)
    if (d === -1) return null
    data.push(d)
  }
  const version = data[0]
  const check = polymod([...hrpExpand(hrp), ...data])
  const expected = version === 0 ? BECH32_CONST : BECH32M_CONST
  if (check !== expected) return 'bad-checksum'
  const program = convertBits(data.slice(1, -6), 5, 8, false)
  if (!program || program.length < 2 || program.length > 40) return null
  if (version === 0 && program.length !== 20 && program.length !== 32) return null
  return { hrp, version, program }
}

/** Human prefixes for the test networks this prototype supports. */
export const TEST_NETWORK_PREFIXES = ['bcrt1', 'tb1']

/**
 * Returns a plain-language error, or null when the address looks valid for
 * regtest or signet.
 */
export function validateRecipientAddress(raw: string, ownAddress?: string | null): string | null {
  const address = raw.trim()
  if (!address) return "Enter the recipient's Bitcoin address."
  const lower = address.toLowerCase()
  if (lower.startsWith('bc1') || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
    return 'This is a mainnet address for real Bitcoin. This prototype only works on test networks, so use an address that starts with bcrt1 (regtest) or tb1 (signet).'
  }
  if (/^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
    return 'This is an older style test address. Ask the recipient for a SegWit address that starts with bcrt1 or tb1.'
  }
  if (!TEST_NETWORK_PREFIXES.some((p) => lower.startsWith(p))) {
    return 'This does not look like a Bitcoin test-network address. It should start with bcrt1 (regtest) or tb1 (signet).'
  }
  const decoded = decodeSegwitAddress(address)
  if (decoded === 'bad-checksum') {
    return 'This address has a typo somewhere: its built-in checksum does not match. Copy it again from the recipient instead of typing it.'
  }
  if (!decoded || (decoded.hrp !== 'bcrt' && decoded.hrp !== 'tb')) {
    return 'This address is not complete or has characters that are not allowed. Copy it again from the recipient.'
  }
  if (ownAddress && lower === ownAddress.toLowerCase()) {
    return "This is the community wallet's own receiving address. Sending to it would only move funds back to the same wallet."
  }
  return null
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/
const PUBLIC_PREFIXES = ['tpub', 'vpub', 'upub', 'Vpub', 'Upub']
const PRIVATE_PREFIXES = ['xprv', 'tprv', 'yprv', 'zprv', 'uprv', 'vprv', 'Yprv', 'Zprv', 'Uprv', 'Vprv']

export type KeyCheck =
  | { kind: 'ok' }
  | { kind: 'empty' }
  | { kind: 'private-key' }
  | { kind: 'seed-phrase' }
  | { kind: 'mainnet' }
  | { kind: 'invalid'; message: string }

/**
 * Classifies whatever a signer pasted into the public key field. Anything that
 * looks like secret material is flagged so the UI can discard it immediately.
 */
export function checkExtendedPublicKey(raw: string): KeyCheck {
  const value = raw.trim()
  if (!value) return { kind: 'empty' }
  if (PRIVATE_PREFIXES.some((p) => value.startsWith(p))) return { kind: 'private-key' }
  // WIF private keys on test networks start with c or 9 and are 51-52 chars long.
  if (/^[c9][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(value)) return { kind: 'private-key' }
  const words = value.split(/\s+/)
  if (words.length >= 12 && words.every((w) => /^[a-z]{3,8}$/.test(w))) return { kind: 'seed-phrase' }
  if (/^(xpub|ypub|zpub|Ypub|Zpub)/.test(value)) return { kind: 'mainnet' }
  if (!PUBLIC_PREFIXES.some((p) => value.startsWith(p))) {
    return { kind: 'invalid', message: 'A test-network extended public key starts with tpub or Vpub.' }
  }
  if (!BASE58.test(value)) {
    return { kind: 'invalid', message: 'The key contains characters that are not allowed. Copy it again from your wallet app.' }
  }
  if (value.length !== 111) {
    return { kind: 'invalid', message: `An extended public key is 111 characters long. This one has ${value.length}.` }
  }
  return { kind: 'ok' }
}

export function validateFingerprint(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  return /^[0-9a-fA-F]{8}$/.test(v) ? null : 'The fingerprint is 8 characters using 0-9 and a-f, for example 9bc1b974.'
}

export function validateDerivationPath(raw: string): string | null {
  const v = raw.trim()
  if (!v) return 'Enter the derivation path your wallet app shows, for example m/48\'/1\'/0\'/2\'.'
  return /^m(\/\d+'?)+$/.test(v) ? null : "That path is not in the usual format. It looks like m/48'/1'/0'/2'."
}

/**
 * Rough virtual size for a P2WSH M-of-N spend. Good enough for a fee estimate
 * shown to signers before the integration layer prepares the real PSBT.
 */
export function estimateVsize(inputs: number, outputs: number, m: number, n: number): number {
  const witnessBytes = 1 + 1 + m * 73 + 1 + 3 + n * 34
  const inputVbytes = 41 + Math.ceil(witnessBytes / 4)
  return 11 + inputs * inputVbytes + outputs * 43
}

export const DUST_LIMIT_SATS = 546

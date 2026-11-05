import { hex } from '@scure/base'
import { Address, OutScript, p2ms, p2wsh } from '@scure/btc-signer'
import { BrowserSignerError } from './errors'

/** Bitcoin Core's Regtest parameters. `@scure/btc-signer` has no built-in Regtest entry. */
export const REGTEST_NETWORK = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef } as const
export const REGTEST_ADDRESS_PREFIX = 'bcrt1'
export const MAX_POLICY_KEYS = 16

const DESCRIPTOR = /^wsh\(sortedmulti\((\d{1,2})((?:,0[23][0-9a-f]{64})*)\)\)(?:#[0-9a-z]{8})?$/i
const MAX_DESCRIPTOR_LENGTH = 4000

export interface WalletPolicy {
  /** Descriptor exactly as the coordinator returned it. */
  descriptor: string
  /** Native SegWit wallet address derived from the descriptor. */
  address: string
  threshold: number
  /** Sorted compressed public keys, matching Bitcoin Core's `sortedmulti` order. */
  publicKeys: string[]
  witnessScript: Uint8Array
  script: Uint8Array
}

export interface WalletPolicySource {
  descriptor: string
  address: string
  threshold: number
  network: string
}

/**
 * Parses Bitcoin Core's watch-only descriptor. The optional BIP380 checksum is
 * ignored; the address re-derivation below is what binds the policy to the
 * coordinator's wallet, because it hashes every key and the threshold.
 */
export function parseWalletDescriptor(descriptor: string): { threshold: number; publicKeys: string[] } {
  const value = descriptor.trim()
  if (!value || value.length > MAX_DESCRIPTOR_LENGTH) {
    throw new BrowserSignerError('INVALID_POLICY', 'The community wallet descriptor is missing or too long.')
  }
  const match = DESCRIPTOR.exec(value)
  if (!match) {
    throw new BrowserSignerError('INVALID_POLICY', 'Only native SegWit `wsh(sortedmulti(…))` wallets can be signed in the browser.')
  }
  const threshold = Number(match[1])
  const publicKeys = match[2].split(',').filter(Boolean).map((key) => key.toLowerCase())
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > MAX_POLICY_KEYS) {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet signature threshold is not supported.')
  }
  if (publicKeys.length < threshold || publicKeys.length > MAX_POLICY_KEYS) {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet descriptor has an unsupported number of signer keys.')
  }
  const unique = new Set(publicKeys)
  if (unique.size !== publicKeys.length) {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet descriptor repeats a signer key.')
  }
  return { threshold, publicKeys }
}

/** Rebuilds the P2WSH multisig output from a descriptor and Regtest network parameters. */
export function policyFromDescriptor(descriptor: string): WalletPolicy {
  const { threshold, publicKeys } = parseWalletDescriptor(descriptor)
  const sorted = [...publicKeys].sort()
  let witness
  try {
    witness = p2wsh(p2ms(threshold, sorted.map((key) => hex.decode(key))), REGTEST_NETWORK)
  } catch {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet descriptor cannot be turned into a multisig script.')
  }
  if (!witness.address?.startsWith(REGTEST_ADDRESS_PREFIX)) {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet descriptor does not produce a Regtest address.')
  }
  return {
    descriptor: descriptor.trim(),
    address: witness.address,
    threshold,
    publicKeys: sorted,
    witnessScript: witness.witnessScript,
    script: witness.script,
  }
}

/** Validates the coordinator's descriptor/address/threshold before any key is used. */
export function assertWalletPolicy(source: WalletPolicySource): WalletPolicy {
  if (source.network !== 'regtest') {
    throw new BrowserSignerError('INVALID_POLICY', 'Browser signing is only available on Regtest.')
  }
  const policy = policyFromDescriptor(source.descriptor)
  if (source.address !== policy.address) {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet address does not match its descriptor.')
  }
  if (source.threshold !== policy.threshold) {
    throw new BrowserSignerError('INVALID_POLICY', 'The wallet threshold does not match its descriptor.')
  }
  return policy
}

/** Decodes a Regtest address into its output script. Throws on any other network. */
export function addressScript(address: string): Uint8Array {
  if (!address || !address.toLowerCase().startsWith(REGTEST_ADDRESS_PREFIX)) {
    throw new BrowserSignerError('INVALID_POLICY', 'The recipient must be a Regtest address beginning with bcrt1.')
  }
  try {
    return OutScript.encode(Address(REGTEST_NETWORK).decode(address))
  } catch {
    throw new BrowserSignerError('INVALID_POLICY', 'The recipient address is not a valid Regtest address.')
  }
}

export function scriptEquals(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

import { hex } from '@scure/base'
import { HDKey } from '@scure/bip32'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { BrowserSignerError } from './errors'

/**
 * BIP48 signer path for the Regtest POC wallet. Every community keeps its own
 * vault, so the same recovery words can back several independent signer keys.
 */
export const SIGNER_DERIVATION_PATH = "m/48'/1'/0'/2'/0/0"
export const RECOVERY_WORD_COUNT = 24

const RECOVERY_STRENGTH = 256
const PRIVATE_DERIVATION = /^m(?:\/[0-9]+'?)+$/

export interface SignerKeyMaterial {
  /** Canonical lowercase recovery phrase. Never send this anywhere. */
  mnemonic: string
  privateKey: Uint8Array
  /** Compressed secp256k1 public key, 66 lowercase hex characters. */
  publicKey: string
  /** BIP32 master fingerprint, 8 lowercase hex characters. */
  fingerprint: string
  derivationPath: string
}

/** Creates fresh 24-word BIP39 recovery material with 256 bits of entropy. */
export function createRecoveryWords(): string[] {
  return generateMnemonic(wordlist, RECOVERY_STRENGTH).split(' ')
}

/** Trims, lowercases, and collapses whitespace so pasted phrases compare reliably. */
export function normalizeMnemonic(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

export function isValidMnemonic(value: string): boolean {
  const mnemonic = normalizeMnemonic(value)
  return mnemonic.length > 0 && validateMnemonic(mnemonic, wordlist)
}

/**
 * Derives the signer's secp256k1 key from BIP39 recovery words. The seed never
 * leaves this function; callers receive only what the signer needs.
 */
export function deriveSignerKey(mnemonicInput: string, derivationPath = SIGNER_DERIVATION_PATH): SignerKeyMaterial {
  const mnemonic = normalizeMnemonic(mnemonicInput)
  if (!isValidMnemonic(mnemonic)) {
    throw new BrowserSignerError('INVALID_MNEMONIC', 'Enter your 12–24 recovery words in the correct order.')
  }
  if (!PRIVATE_DERIVATION.test(derivationPath)) {
    throw new BrowserSignerError('INVALID_MNEMONIC', 'The signer derivation path is not valid.')
  }
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
  const child = root.derive(derivationPath)
  if (!child.privateKey || !child.publicKey) {
    throw new BrowserSignerError('INVALID_MNEMONIC', 'These recovery words cannot be derived into a signer key.')
  }
  return {
    mnemonic,
    privateKey: child.privateKey,
    publicKey: hex.encode(child.publicKey),
    fingerprint: root.fingerprint.toString(16).padStart(8, '0'),
    derivationPath,
  }
}

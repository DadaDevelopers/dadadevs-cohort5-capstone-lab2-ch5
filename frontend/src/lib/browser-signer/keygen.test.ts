import { describe, expect, it } from 'vitest'
import {
  createRecoveryWords,
  deriveSignerKey,
  isValidMnemonic,
  normalizeMnemonic,
  RECOVERY_WORD_COUNT,
  SIGNER_DERIVATION_PATH,
} from './keygen'
import { TEST_MNEMONICS } from './testing'

describe('browser signer key derivation', () => {
  it('creates 24 BIP39 words with 256 bits of entropy', () => {
    const words = createRecoveryWords()
    expect(words).toHaveLength(RECOVERY_WORD_COUNT)
    expect(words.every((word) => word.length > 0)).toBe(true)
    expect(isValidMnemonic(words.join(' '))).toBe(true)
    expect(createRecoveryWords()).not.toEqual(words)
  })

  it('derives the same compressed key for the same recovery words', () => {
    const first = deriveSignerKey(TEST_MNEMONICS[0])
    const second = deriveSignerKey(TEST_MNEMONICS[0])

    expect(first.publicKey).toBe(second.publicKey)
    expect(first.publicKey).toMatch(/^0[23][0-9a-f]{64}$/)
    expect(first.fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(first.derivationPath).toBe(SIGNER_DERIVATION_PATH)
    expect(first.privateKey).toHaveLength(32)
    expect(new Set([first.publicKey, ...TEST_MNEMONICS.slice(1).map((mnemonic) => deriveSignerKey(mnemonic).publicKey)]).size).toBe(3)
  })

  it('matches the BIP39 test vector seed derivation', () => {
    // Trezor BIP39 vector #1 at the POC signer path: stable across library upgrades.
    expect(deriveSignerKey(TEST_MNEMONICS[0])).toMatchObject({
      publicKey: '030b90ed2e86bad7f2a4fe9769bb417d7ba9caa1124807dbfb362dfbeeb65e7e01',
      fingerprint: '73c5da0a',
    })
  })

  it('normalizes pasted recovery words but rejects invalid phrases', () => {
    const messy = `  ${TEST_MNEMONICS[0].toUpperCase().replace(/ /g, '   ')}  `
    expect(normalizeMnemonic(messy)).toBe(TEST_MNEMONICS[0])
    expect(isValidMnemonic(messy)).toBe(true)
    expect(() => deriveSignerKey('abandon abandon abandon')).toThrowError(/recovery words/i)
    expect(() => deriveSignerKey('')).toThrowError(/recovery words/i)
    expect(isValidMnemonic('abandon '.repeat(23) + 'abandon')).toBe(false)
  })

  it('accepts only hardened-safe derivation paths', () => {
    expect(() => deriveSignerKey(TEST_MNEMONICS[0], "m/48'/1'/0'/2'/0/0/")).toThrowError(/derivation path/i)
    expect(() => deriveSignerKey(TEST_MNEMONICS[0], 'n/48h/1')).toThrowError(/derivation path/i)
    expect(deriveSignerKey(TEST_MNEMONICS[0], "m/48'/1'/0'/2'/0/0").derivationPath).toBe("m/48'/1'/0'/2'/0/0")
  })
})

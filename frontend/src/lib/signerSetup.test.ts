import { describe, expect, it } from 'vitest'
import { compressedPublicKeyError, signerSetupCommand } from './signerSetup'

describe('guided signer setup', () => {
  it('builds the exact utility command from authenticated state IDs', () => {
    expect(signerSetupCommand('7', '42')).toBe('npm run regtest:signer -- setup --community-id 42 --user-id 7')
  })

  it('rejects IDs that could alter the terminal command', () => {
    expect(() => signerSetupCommand('7 --spend-id 1', '42')).toThrow('valid user and community IDs')
    expect(() => signerSetupCommand('7', '0')).toThrow('valid user and community IDs')
  })

  it('accepts only compressed secp256k1 public keys', () => {
    expect(compressedPublicKeyError(`02${'ab'.repeat(32)}`)).toBeNull()
    expect(compressedPublicKeyError(`04${'ab'.repeat(64)}`)).toContain('66-character')
    expect(compressedPublicKeyError('not-a-key')).toContain('66-character')
    expect(compressedPublicKeyError('')).toContain('printed by the signer setup utility')
  })
})

/** Failure modes of the in-browser signer. Every message is safe to show to the signer. */
export type BrowserSignerErrorCode =
  | 'UNAVAILABLE'
  | 'INVALID_MNEMONIC'
  | 'WEAK_PASSPHRASE'
  | 'VAULT_MISSING'
  | 'VAULT_EXISTS'
  | 'VAULT_CORRUPT'
  | 'WRONG_PASSPHRASE'
  | 'INVALID_POLICY'
  | 'POLICY_MISMATCH'
  | 'INVALID_PSBT'
  | 'UNSUPPORTED_PSBT'
  | 'ALREADY_SIGNED'
  | 'ALREADY_FINALIZED'
  | 'UNSUPPORTED_SIGHASH'
  | 'KEY_NOT_AUTHORISED'
  | 'UNEXPECTED_OUTPUT'
  | 'FEE_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'SIGNING_FAILED'

export class BrowserSignerError extends Error {
  readonly code: BrowserSignerErrorCode

  constructor(code: BrowserSignerErrorCode, message: string) {
    super(message)
    this.name = 'BrowserSignerError'
    this.code = code
  }
}

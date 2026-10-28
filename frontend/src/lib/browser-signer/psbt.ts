import { base64, hex } from '@scure/base'
import { SigHash, Transaction } from '@scure/btc-signer'
import { BrowserSignerError } from './errors'
import { addressScript, scriptEquals, type WalletPolicy } from './policy'

type TransactionInput = ReturnType<Transaction['getInput']>

/** The backend rejects PSBTs larger than this, so fail before doing any work. */
const MAX_PSBT_LENGTH = 200_000
const BASE64_PSBT = /^[A-Za-z0-9+/]+={0,2}$/

/** Everything the signer checked against the coordinator's spending request. */
export interface SigningExpectation {
  policy: WalletPolicy
  /** The signer's own compressed public key, lowercase hex. */
  ownPublicKey: string
  recipientAddress: string
  amountSats: bigint
  feeSats: bigint
}

export interface PsbtSummary {
  inputCount: number
  totalInputSats: bigint
  recipientSats: bigint
  changeSats: bigint
  feeSats: bigint
  /** Public keys that already contributed a partial signature. */
  existingSigners: string[]
}

export interface InspectedPsbt {
  /** Parsed transaction. Mutating it is the caller's responsibility. */
  transaction: Transaction
  summary: PsbtSummary
}

export interface SignPsbtInput extends SigningExpectation {
  psbtBase64: string
  privateKey: Uint8Array
}

function assertOwnKeyAuthorised(expectation: SigningExpectation): string {
  const ownKey = expectation.ownPublicKey.toLowerCase()
  if (!expectation.policy.publicKeys.includes(ownKey)) {
    throw new BrowserSignerError('KEY_NOT_AUTHORISED', 'This browser key is not one of the wallet signer keys.')
  }
  return ownKey
}

function parseSigningPsbt(psbtBase64: string): Transaction {
  const value = psbtBase64.trim()
  if (!value || value.length > MAX_PSBT_LENGTH || !BASE64_PSBT.test(value)) {
    throw new BrowserSignerError('INVALID_PSBT', 'Paste the Base64 PSBT exported by the coordinator.')
  }
  let raw: Uint8Array
  try {
    raw = base64.decode(value)
  } catch {
    throw new BrowserSignerError('INVALID_PSBT', 'The PSBT is not valid Base64.')
  }
  let transaction: Transaction
  try {
    // Keep coordinator metadata byte-for-byte: the backend rejects any changed input field.
    transaction = Transaction.fromPSBT(raw, { unknown: 'ignore', proprietary: 'ignore' })
  } catch {
    throw new BrowserSignerError('INVALID_PSBT', 'The PSBT could not be decoded.')
  }
  if (transaction.opts.PSBTVersion !== 0) {
    throw new BrowserSignerError('UNSUPPORTED_PSBT', 'Only PSBT version 0 can be signed in the browser.')
  }
  if (transaction.inputsLength === 0) {
    throw new BrowserSignerError('INVALID_PSBT', 'The PSBT does not contain any inputs.')
  }
  return transaction
}

/**
 * Bitcoin Core also attaches the full previous transaction (`nonWitnessUtxo`) to
 * some native SegWit inputs, notably P2WSH coordinator inputs. That field is extra
 * evidence, not proof of a legacy input: only `witnessUtxo` and `witnessScript`
 * determine the witness program and the script that is hashed below.
 *
 * When the full transaction is present it must still commit to the exact prevout
 * that is validated here. `@scure/btc-signer` already rejects a previous
 * transaction whose hash differs from the input outpoint while parsing, so this
 * check binds the remaining fields locally instead of trusting parser internals.
 */
function assertPrevTransactionMatches(input: TransactionInput, prevout: NonNullable<TransactionInput['witnessUtxo']>, label: string): void {
  const previous = input.nonWitnessUtxo
  if (!previous) return
  const index = input.index
  const output = index === undefined ? undefined : previous.outputs[index]
  if (index === undefined || !Number.isSafeInteger(index) || index < 0 || !output) {
    throw new BrowserSignerError('INVALID_PSBT', `${label} carries a previous transaction without the spent output.`)
  }
  if (output.amount !== prevout.amount || !scriptEquals(output.script, prevout.script)) {
    throw new BrowserSignerError('INVALID_PSBT', `${label} carries a previous transaction that does not match the spent output.`)
  }
}

function checkInput(input: TransactionInput, index: number, policy: WalletPolicy, ownKey: string, allowOwnSignature: boolean): bigint {
  const label = `Input ${index + 1}`
  if (input.finalScriptSig || input.finalScriptWitness) {
    throw new BrowserSignerError('ALREADY_FINALIZED', `${label} is already finalized and cannot be signed again.`)
  }
  const prevout = input.witnessUtxo
  if (!prevout) {
    // A full previous transaction without `witnessUtxo` means a legacy input, which
    // this signer has never supported. Keep that failure explicit.
    throw input.nonWitnessUtxo
      ? new BrowserSignerError('UNSUPPORTED_PSBT', `${label} is not a native SegWit input.`)
      : new BrowserSignerError('INVALID_PSBT', `${label} is missing the previous output it spends.`)
  }
  if (!scriptEquals(prevout.script, policy.script)) {
    throw new BrowserSignerError('POLICY_MISMATCH', `${label} does not spend from this community wallet.`)
  }
  if (prevout.amount <= 0n) {
    throw new BrowserSignerError('INVALID_PSBT', `${label} has an invalid amount.`)
  }
  if (!scriptEquals(input.witnessScript, policy.witnessScript)) {
    throw new BrowserSignerError('POLICY_MISMATCH', `${label} carries a different wallet script than the descriptor.`)
  }
  assertPrevTransactionMatches(input, prevout, label)
  if (input.sighashType !== undefined && input.sighashType !== SigHash.ALL) {
    throw new BrowserSignerError('UNSUPPORTED_SIGHASH', `${label} is not signed with SIGHASH_ALL.`)
  }
  for (const [publicKey] of input.partialSig ?? []) {
    const key = hex.encode(publicKey).toLowerCase()
    if (!policy.publicKeys.includes(key)) {
      throw new BrowserSignerError('POLICY_MISMATCH', `${label} already contains a signature from a key outside the wallet.`)
    }
    if (key === ownKey && !allowOwnSignature) {
      throw new BrowserSignerError('ALREADY_SIGNED', 'This signer key has already signed the request.')
    }
  }
  return prevout.amount
}

function inspect(psbtBase64: string, expectation: SigningExpectation, allowOwnSignature: boolean): InspectedPsbt {
  const ownKey = assertOwnKeyAuthorised(expectation)
  const transaction = parseSigningPsbt(psbtBase64)

  if (expectation.recipientAddress.toLowerCase() === expectation.policy.address.toLowerCase()) {
    throw new BrowserSignerError('INVALID_POLICY', 'The recipient is the community wallet itself.')
  }
  if (expectation.amountSats <= 0n) {
    throw new BrowserSignerError('AMOUNT_MISMATCH', 'The request amount must be positive.')
  }
  const recipientScript = addressScript(expectation.recipientAddress)

  const seen = new Set<string>()
  const existingSigners = new Set<string>()
  let totalInputSats = 0n
  for (let i = 0; i < transaction.inputsLength; i += 1) {
    const input = transaction.getInput(i)
    if (!input.txid) {
      throw new BrowserSignerError('INVALID_PSBT', `Input ${i + 1} is missing the transaction it spends.`)
    }
    const outpoint = `${hex.encode(input.txid)}:${input.index}`
    if (seen.has(outpoint)) {
      throw new BrowserSignerError('INVALID_PSBT', 'The PSBT spends the same output twice.')
    }
    seen.add(outpoint)
    totalInputSats += checkInput(input, i, expectation.policy, ownKey, allowOwnSignature)
    for (const [publicKey] of input.partialSig ?? []) existingSigners.add(hex.encode(publicKey).toLowerCase())
  }

  let recipientSats = 0n
  let changeSats = 0n
  for (let i = 0; i < transaction.outputsLength; i += 1) {
    const output = transaction.getOutput(i)
    if (!output.script || output.amount === undefined) {
      throw new BrowserSignerError('INVALID_PSBT', `Output ${i + 1} is incomplete.`)
    }
    if (scriptEquals(output.script, recipientScript)) {
      recipientSats += output.amount
    } else if (scriptEquals(output.script, expectation.policy.script)) {
      changeSats += output.amount
    } else {
      throw new BrowserSignerError('UNEXPECTED_OUTPUT', `Output ${i + 1} pays an address that is not the recipient or the community change address.`)
    }
  }
  if (recipientSats !== expectation.amountSats) {
    throw new BrowserSignerError('AMOUNT_MISMATCH', 'The PSBT does not pay the requested amount to the recipient.')
  }
  const feeSats = totalInputSats - recipientSats - changeSats
  if (feeSats <= 0n) {
    throw new BrowserSignerError('FEE_MISMATCH', 'The PSBT does not leave a positive network fee.')
  }
  if (feeSats !== expectation.feeSats) {
    throw new BrowserSignerError('FEE_MISMATCH', 'The PSBT network fee does not match the prepared request.')
  }

  return {
    transaction,
    summary: {
      inputCount: transaction.inputsLength,
      totalInputSats,
      recipientSats,
      changeSats,
      feeSats,
      existingSigners: [...existingSigners],
    },
  }
}

/** Validates a coordinator PSBT without touching a private key. */
export function inspectSigningPsbt(psbtBase64: string, expectation: SigningExpectation): InspectedPsbt {
  return inspect(psbtBase64, expectation, false)
}



/**
 * Adds this signer's partial signature to every input and returns the PSBT to
 * submit. The unsigned transaction, input metadata, and outputs are re-checked
 * after signing so the backend's strict comparison cannot be surprised.
 */
export function signSigningPsbt(input: SignPsbtInput): { psbtBase64: string; summary: PsbtSummary } {
  const before = inspect(input.psbtBase64, input, false)
  const { transaction } = before
  const ownKey = input.ownPublicKey.toLowerCase()
  const unsignedHex = hex.encode(transaction.unsignedTx)

  for (let i = 0; i < transaction.inputsLength; i += 1) {
    const previousSignatures = (transaction.getInput(i).partialSig ?? []).length
    let signed = false
    try {
      signed = transaction.signIdx(input.privateKey, i)
    } catch {
      throw new BrowserSignerError('SIGNING_FAILED', `Input ${i + 1} could not be signed with this key.`)
    }
    if (!signed) {
      throw new BrowserSignerError('SIGNING_FAILED', `Input ${i + 1} could not be signed with this key.`)
    }
    const after = transaction.getInput(i)
    const ownSignatures = (after.partialSig ?? []).filter(([publicKey]) => hex.encode(publicKey).toLowerCase() === ownKey)
    if (ownSignatures.length !== 1 || ownSignatures[0][1].at(-1) !== SigHash.ALL) {
      throw new BrowserSignerError('SIGNING_FAILED', `Input ${i + 1} did not produce a SIGHASH_ALL signature.`)
    }
    if ((after.partialSig ?? []).length !== previousSignatures + 1) {
      throw new BrowserSignerError('SIGNING_FAILED', `Input ${i + 1} gained more than one signature.`)
    }
    if (!scriptEquals(after.witnessScript, input.policy.witnessScript) || !scriptEquals(after.witnessUtxo?.script, input.policy.script)) {
      throw new BrowserSignerError('SIGNING_FAILED', `Input ${i + 1} changed while signing.`)
    }
  }

  if (hex.encode(transaction.unsignedTx) !== unsignedHex) {
    throw new BrowserSignerError('SIGNING_FAILED', 'Signing changed the unsigned transaction.')
  }
  let psbtBase64: string
  try {
    psbtBase64 = base64.encode(transaction.toPSBT(0))
  } catch {
    throw new BrowserSignerError('SIGNING_FAILED', 'The signed PSBT could not be serialized.')
  }

  const after = inspect(psbtBase64, input, true)
  if (after.summary.feeSats !== before.summary.feeSats ||
      after.summary.recipientSats !== before.summary.recipientSats ||
      after.summary.changeSats !== before.summary.changeSats) {
    throw new BrowserSignerError('SIGNING_FAILED', 'The signed PSBT does not match the reviewed request.')
  }
  return { psbtBase64, summary: after.summary }
}

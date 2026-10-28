import { base64, hex } from '@scure/base'
import { p2wpkh, SigHash, Transaction } from '@scure/btc-signer'
import { describe, expect, it } from 'vitest'
import { addressScript, REGTEST_NETWORK } from './policy'
import { inspectSigningPsbt, signSigningPsbt, type SigningExpectation } from './psbt'
import { buildTestPsbt, TEST_MNEMONICS, testRecipientAddress, testSignerKeys, testWalletPolicy } from './testing'
import { deriveSignerKey } from './keygen'

const policy = testWalletPolicy()
const keys = testSignerKeys()
const foreignKey = deriveSignerKey(TEST_MNEMONICS[0], "m/48'/1'/0'/2'/0/1")

function expectation(overrides: Partial<SigningExpectation> = {}): SigningExpectation {
  return {
    policy,
    ownPublicKey: keys[0].publicKey,
    recipientAddress: testRecipientAddress(),
    amountSats: 90_000n,
    feeSats: 1_000n,
    ...overrides,
  }
}

function otherAddress(): string {
  const address = p2wpkh(hex.decode(keys[2].publicKey), REGTEST_NETWORK).address
  if (!address) throw new Error('test address unavailable')
  return address
}

function parse(psbt: string): Transaction {
  return Transaction.fromPSBT(base64.decode(psbt))
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code ?? 'NO_CODE'
  }
  return 'NO_ERROR'
}

describe('PSBT inspection', () => {
  it('summarises a valid coordinator PSBT', () => {
    const psbt = buildTestPsbt(policy, { recipientAddress: testRecipientAddress() })
    const { summary } = inspectSigningPsbt(psbt, expectation())

    expect(summary).toEqual({
      inputCount: 1,
      totalInputSats: 91_000n,
      recipientSats: 90_000n,
      changeSats: 0n,
      feeSats: 1_000n,
      existingSigners: [],
    })
  })

  it('accounts for a change output when the inputs overpay', () => {
    const psbt = buildTestPsbt(policy, { inputAmounts: [100_000n] })
    const { summary } = inspectSigningPsbt(psbt, expectation())
    expect(summary.totalInputSats).toBe(100_000n)
    expect(summary.changeSats).toBe(9_000n)
    expect(summary.feeSats).toBe(1_000n)
  })

  it('accepts multiple inputs and no change output', () => {
    const psbt = buildTestPsbt(policy, { inputAmounts: [50_000n, 41_000n], amountSats: 90_000n, feeSats: 1_000n })
    const { summary } = inspectSigningPsbt(psbt, expectation())
    expect(summary.inputCount).toBe(2)
    expect(summary.totalInputSats).toBe(91_000n)
    expect(summary.changeSats).toBe(0n)
  })

  it('rejects a recipient that is the community wallet itself', () => {
    const psbt = buildTestPsbt(policy)
    expect(codeOf(() => inspectSigningPsbt(psbt, expectation({ recipientAddress: policy.address })))).toBe('INVALID_POLICY')
    expect(codeOf(() => inspectSigningPsbt(psbt, expectation({ amountSats: 0n })))).toBe('AMOUNT_MISMATCH')
  })

  it('rejects PSBTs that pay anything else', () => {
    const extra = buildTestPsbt(policy, {
      inputAmounts: [92_000n],
      extraOutput: { script: addressScript(otherAddress()), amountSats: 1_000n },
    })
    expect(codeOf(() => inspectSigningPsbt(extra, expectation()))).toBe('UNEXPECTED_OUTPUT')
  })

  it('rejects amount and fee mismatches', () => {
    const cheaper = buildTestPsbt(policy, { amountSats: 89_000n })
    expect(codeOf(() => inspectSigningPsbt(cheaper, expectation()))).toBe('AMOUNT_MISMATCH')

    const expensive = buildTestPsbt(policy, { feeSats: 2_000n })
    expect(codeOf(() => inspectSigningPsbt(expensive, expectation()))).toBe('FEE_MISMATCH')

    const noFee = buildTestPsbt(policy, { inputAmounts: [90_000n], feeSats: 0n })
    expect(codeOf(() => inspectSigningPsbt(noFee, expectation({ feeSats: 0n })))).toBe('FEE_MISMATCH')
  })

  it('rejects keys outside the policy and scripts from another wallet', () => {
    const psbt = buildTestPsbt(policy)
    expect(codeOf(() => inspectSigningPsbt(psbt, expectation({ ownPublicKey: foreignKey.publicKey })))).toBe('KEY_NOT_AUTHORISED')

    const elsewhere = testWalletPolicy(1, 1)
    const foreignPsbt = buildTestPsbt(elsewhere)
    expect(codeOf(() => inspectSigningPsbt(foreignPsbt, expectation()))).toBe('POLICY_MISMATCH')
  })

  it('rejects unsupported sighash flags and finalized inputs', () => {
    const psbt = buildTestPsbt(policy, { sighashType: SigHash.NONE })
    expect(codeOf(() => inspectSigningPsbt(psbt, expectation()))).toBe('UNSUPPORTED_SIGHASH')

    const finalized = parse(buildTestPsbt(policy))
    finalized.signIdx(keys[0].privateKey, 0)
    finalized.signIdx(keys[1].privateKey, 0)
    finalized.finalizeIdx(0)
    expect(codeOf(() => inspectSigningPsbt(base64.encode(finalized.toPSBT(0)), expectation()))).toBe('ALREADY_FINALIZED')
  })

  it('rejects malformed, oversized, and duplicated PSBTs', () => {
    expect(codeOf(() => inspectSigningPsbt('', expectation()))).toBe('INVALID_PSBT')
    expect(codeOf(() => inspectSigningPsbt('not a psbt', expectation()))).toBe('INVALID_PSBT')
    expect(codeOf(() => inspectSigningPsbt('A'.repeat(200_001), expectation()))).toBe('INVALID_PSBT')
    expect(codeOf(() => inspectSigningPsbt(base64.encode(new Uint8Array([1, 2, 3])), expectation()))).toBe('INVALID_PSBT')

    const duplicated = new Transaction({ PSBTVersion: 0 })
    for (let index = 0; index < 2; index += 1) {
      duplicated.addInput({
        txid: new Uint8Array(32).fill(7),
        index: 0,
        witnessUtxo: { script: policy.script, amount: 100_000n },
        witnessScript: policy.witnessScript,
      })
    }
    duplicated.addOutput({ script: addressScript(testRecipientAddress()), amount: 90_000n })
    expect(codeOf(() => inspectSigningPsbt(base64.encode(duplicated.toPSBT(0)), expectation()))).toBe('INVALID_PSBT')
  })
})

describe('PSBT signing', () => {
  it('adds exactly one SIGHASH_ALL signature per input', () => {
    const psbt = buildTestPsbt(policy, { inputAmounts: [60_000n, 41_000n] })
    const signed = signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey })
    const transaction = parse(signed.psbtBase64)

    expect(signed.summary.existingSigners).toEqual([keys[0].publicKey])
    expect(transaction.inputsLength).toBe(2)
    for (let index = 0; index < transaction.inputsLength; index += 1) {
      const partials = transaction.getInput(index).partialSig ?? []
      expect(partials).toHaveLength(1)
      expect(hex.encode(partials[0][0])).toBe(keys[0].publicKey)
      expect(partials[0][1].at(-1)).toBe(SigHash.ALL)
      expect(hex.encode(transaction.getInput(index).witnessScript ?? new Uint8Array())).toBe(hex.encode(policy.witnessScript))
    }
  })

  it('keeps the unsigned transaction and coordinator metadata intact', () => {
    const psbt = buildTestPsbt(policy, { inputAmounts: [100_000n] })
    const before = parse(psbt)
    const signed = signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey })
    const after = parse(signed.psbtBase64)

    expect(hex.encode(after.unsignedTx)).toBe(hex.encode(before.unsignedTx))
    expect(hex.encode(after.getInput(0).witnessUtxo?.script ?? new Uint8Array())).toBe(hex.encode(policy.script))
    expect(after.getInput(0).witnessUtxo?.amount).toBe(100_000n)
    expect(after.getOutput(0).amount).toBe(90_000n)
    expect(after.getOutput(1).amount).toBe(9_000n)
  })

  it('adds a second signature without dropping the first', () => {
    const psbt = buildTestPsbt(policy)
    const first = signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey })
    const second = signSigningPsbt({
      ...expectation({ ownPublicKey: keys[1].publicKey }),
      psbtBase64: first.psbtBase64,
      privateKey: keys[1].privateKey,
    })

    expect(second.summary.existingSigners.sort()).toEqual([keys[0].publicKey, keys[1].publicKey].sort())
    expect(parse(second.psbtBase64).getInput(0).partialSig).toHaveLength(2)
    expect(codeOf(() => parse(second.psbtBase64).finalizeIdx(0))).toBe('NO_ERROR')
  })

  it('refuses to sign twice with the same key', () => {
    const psbt = buildTestPsbt(policy)
    const signed = signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey })

    expect(codeOf(() => signSigningPsbt({ ...expectation(), psbtBase64: signed.psbtBase64, privateKey: keys[0].privateKey }))).toBe('ALREADY_SIGNED')
    expect(codeOf(() => inspectSigningPsbt(signed.psbtBase64, expectation()))).toBe('ALREADY_SIGNED')
  })

  it('rejects signatures from keys outside the wallet policy', () => {
    const psbt = buildTestPsbt(policy)
    const signed = signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey })
    const signature = parse(signed.psbtBase64).getInput(0).partialSig?.[0][1]
    expect(signature).toBeDefined()

    const transaction = parse(psbt)
    transaction.updateInput(0, { partialSig: [[hex.decode(foreignKey.publicKey), signature as Uint8Array]] })
    expect(codeOf(() => inspectSigningPsbt(base64.encode(transaction.toPSBT(0)), expectation()))).toBe('POLICY_MISMATCH')
  })

  it('rejects PSBTs that spend a different previous output', () => {
    const psbt = buildTestPsbt(policy)
    const transaction = parse(psbt)
    transaction.updateInput(0, { witnessUtxo: { script: policy.script, amount: 200_000n } })
    expect(codeOf(() => inspectSigningPsbt(base64.encode(transaction.toPSBT(0)), expectation()))).toBe('FEE_MISMATCH')

    const elsewhere = testWalletPolicy(1, 1)
    expect(codeOf(() => inspectSigningPsbt(buildTestPsbt(elsewhere), expectation()))).toBe('POLICY_MISMATCH')
  })

  it('never signs a request that fails inspection', () => {
    const psbt = buildTestPsbt(policy, { amountSats: 89_000n })
    expect(codeOf(() => signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey }))).toBe('AMOUNT_MISMATCH')
    expect(codeOf(() => signSigningPsbt({ ...expectation({ amountSats: 90_000n }), psbtBase64: 'garbage', privateKey: keys[0].privateKey }))).toBe('INVALID_PSBT')
  })
})
describe('Bitcoin Core coordinator PSBTs', () => {
  it('reviews and signs a P2WSH input that also carries the full previous transaction', () => {
    const psbt = buildTestPsbt(policy, { withCoordinatorMetadata: true })
    const original = parse(psbt).getInput(0)

    expect(original.nonWitnessUtxo).toBeDefined()
    expect(original.bip32Derivation).toHaveLength(3)
    expect(hex.encode(original.nonWitnessUtxo!.outputs[original.index!].script)).toBe(hex.encode(policy.script))
    expect(inspectSigningPsbt(psbt, expectation()).summary).toEqual({
      inputCount: 1,
      totalInputSats: 91_000n,
      recipientSats: 90_000n,
      changeSats: 0n,
      feeSats: 1_000n,
      existingSigners: [],
    })

    const signed = signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey })
    const after = parse(signed.psbtBase64).getInput(0)

    // The backend compares every decoded coordinator field, including non_witness_utxo.
    expect(after.nonWitnessUtxo).toEqual(original.nonWitnessUtxo)
    expect(after.witnessUtxo).toEqual(original.witnessUtxo)
    expect(hex.encode(after.witnessScript ?? new Uint8Array())).toBe(hex.encode(policy.witnessScript))
    expect(after.bip32Derivation).toEqual(original.bip32Derivation)
    expect(after.partialSig).toHaveLength(1)
    expect(signed.summary.existingSigners).toEqual([keys[0].publicKey])
  })

  it('still refuses legacy inputs that only carry the full previous transaction', () => {
    const funding = new Transaction()
    funding.addInput({ txid: new Uint8Array(32).fill(1), index: 0 })
    funding.addOutput({ script: addressScript(testRecipientAddress()), amount: 100_000n })

    const legacy = new Transaction({ PSBTVersion: 0 })
    legacy.addInput({ txid: hex.decode(funding.id), index: 0, nonWitnessUtxo: funding.toBytes(), sequence: 0xfffffffd })
    legacy.addOutput({ script: addressScript(testRecipientAddress()), amount: 90_000n })
    const psbt = base64.encode(legacy.toPSBT(0))

    expect(parse(psbt).getInput(0).witnessUtxo).toBeUndefined()
    expect(codeOf(() => inspectSigningPsbt(psbt, expectation()))).toBe('UNSUPPORTED_PSBT')
    expect(codeOf(() => signSigningPsbt({ ...expectation(), psbtBase64: psbt, privateKey: keys[0].privateKey }))).toBe('UNSUPPORTED_PSBT')
  })
})


import { base64, hex } from '@scure/base'
import { p2wpkh, Transaction } from '@scure/btc-signer'
import { deriveSignerKey, type SignerKeyMaterial } from './keygen'
import { addressScript, assertWalletPolicy, policyFromDescriptor, REGTEST_NETWORK, type WalletPolicy } from './policy'

/** Public BIP39 test vectors: valid, deterministic, and never used on a real network. */
export const TEST_MNEMONICS = [
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  'legal winner thank year wave sausage worth useful legal winner thank yellow',
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
]

export function testSignerKeys(): SignerKeyMaterial[] {
  return TEST_MNEMONICS.map((mnemonic) => deriveSignerKey(mnemonic))
}

/** Builds the same `wsh(sortedmulti(...))` policy that Bitcoin Core would return. */
export function testWalletPolicy(requiredSignatures = 2, keyCount = 3): WalletPolicy {
  const keys = testSignerKeys().slice(0, keyCount).map((key) => key.publicKey).sort()
  const descriptor = `wsh(sortedmulti(${requiredSignatures},${keys.join(',')}))`
  const derived = policyFromDescriptor(descriptor)
  return assertWalletPolicy({ descriptor, address: derived.address, threshold: requiredSignatures, network: 'regtest' })
}

/** A Regtest P2WPKH address that is never change or the multisig itself. */
export function testRecipientAddress(): string {
  const address = p2wpkh(hex.decode(testSignerKeys()[0].publicKey), REGTEST_NETWORK).address
  if (!address) throw new Error('test recipient address is unavailable')
  return address
}

export interface TestPsbtOptions {
  recipientAddress?: string
  amountSats?: bigint
  feeSats?: bigint
  /** Defaults to one input covering the payment, fee, and extra output. */
  inputAmounts?: bigint[]
  extraOutput?: { script: Uint8Array; amountSats: bigint }
  sighashType?: number
  /**
   * Reproduces the metadata Bitcoin Core's `walletcreatefundedpsbt` puts on a P2WSH
   * coordinator input: the full previous transaction next to `witnessUtxo`, plus one
   * BIP32 derivation per signer key.
   */
  withCoordinatorMetadata?: boolean
}

/** The transaction that funded an input, in the form Core returns as `nonWitnessUtxo`. */
function testFundingTransaction(policy: WalletPolicy, amountSats: bigint, index: number): Transaction {
  const funding = new Transaction()
  funding.addInput({ txid: new Uint8Array(32).fill(0xa0 + index), index })
  funding.addOutput({ script: policy.script, amount: amountSats })
  funding.addOutput({ script: policy.script, amount: 1_000n })
  return funding
}

function testBip32Derivations(policy: WalletPolicy): [Uint8Array, { fingerprint: number; path: number[] }][] {
  return testSignerKeys()
    .filter((key) => policy.publicKeys.includes(key.publicKey))
    .map((key) => [
      hex.decode(key.publicKey),
      {
        fingerprint: Number.parseInt(key.fingerprint, 16),
        path: key.derivationPath
          .split('/')
          .slice(1)
          .map((step) => (step.endsWith("'") ? Number(step.slice(0, -1)) + 0x80000000 : Number(step))),
      },
    ])
}

/** Creates an unsigned coordinator PSBT for the given policy. */
export function buildTestPsbt(policy: WalletPolicy, options: TestPsbtOptions = {}): string {
  const recipientAddress = options.recipientAddress ?? testRecipientAddress()
  const amountSats = options.amountSats ?? 90_000n
  const feeSats = options.feeSats ?? 1_000n
  const extraSats = options.extraOutput?.amountSats ?? 0n
  const inputAmounts = options.inputAmounts ?? [amountSats + feeSats + extraSats]
  const totalInputSats = inputAmounts.reduce((total, value) => total + value, 0n)
  const changeSats = totalInputSats - amountSats - feeSats - extraSats
  if (changeSats < 0n) throw new Error('test PSBT inputs do not cover the outputs')

  const transaction = new Transaction({ PSBTVersion: 0 })
  inputAmounts.forEach((value, index) => {
    const common = {
      index: 0,
      witnessUtxo: { script: policy.script, amount: value },
      witnessScript: policy.witnessScript,
      sequence: 0xfffffffd,
      sighashType: options.sighashType,
    }
    if (!options.withCoordinatorMetadata) {
      transaction.addInput({ ...common, txid: new Uint8Array(32).fill(index + 1) })
      return
    }
    const funding = testFundingTransaction(policy, value, index)
    transaction.addInput({
      ...common,
      txid: hex.decode(funding.id),
      nonWitnessUtxo: funding.toBytes(),
      bip32Derivation: testBip32Derivations(policy),
    })
  })
  transaction.addOutput({ script: addressScript(recipientAddress), amount: amountSats })
  if (changeSats > 0n) transaction.addOutput({ script: policy.script, amount: changeSats })
  if (options.extraOutput) transaction.addOutput({ script: options.extraOutput.script, amount: options.extraOutput.amountSats })
  return base64.encode(transaction.toPSBT(0))
}

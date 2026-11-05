import { describe, expect, it } from 'vitest'
import {
  addressScript,
  assertWalletPolicy,
  MAX_POLICY_KEYS,
  parseWalletDescriptor,
  policyFromDescriptor,
  REGTEST_ADDRESS_PREFIX,
  scriptEquals,
} from './policy'
import { testRecipientAddress, testSignerKeys, testWalletPolicy } from './testing'

const DESCRIPTOR = 'wsh(sortedmulti(2,030b90ed2e86bad7f2a4fe9769bb417d7ba9caa1124807dbfb362dfbeeb65e7e01,033d693bd1a3ece139f62ab52a28e34c069c8d68f18788ca5f5b2ff9d800730ef2,03aa93b6a70ed21658af2fafcc7344ccc5bff0703cd872bd9d9f06825e02f2145c))'
const ADDRESS = 'bcrt1qr3az57pxl8z7q6d9q7v0fmeaphuwe3z0ghvkjr457ch4vqwmtkask29wwr'

function fakeKey(index: number): string {
  return `02${index.toString(16).padStart(2, '0').repeat(32)}`
}

describe('wallet policy validation', () => {
  it('rebuilds the Regtest P2WSH multisig descriptor and address', () => {
    const policy = policyFromDescriptor(DESCRIPTOR)

    expect(policy.address).toBe(ADDRESS)
    expect(policy.threshold).toBe(2)
    expect(policy.publicKeys).toEqual(testSignerKeys().map((key) => key.publicKey).sort())
    // OP_0 PUSH32 <sha256(witnessScript)> is the native SegWit output script.
    expect(policy.script).toHaveLength(34)
    expect(policy.script[0]).toBe(0x00)
    expect(policy.script[1]).toBe(0x20)
    // OP_2 <key> <key> <key> OP_3 OP_CHECKMULTISIG
    expect(policy.witnessScript[0]).toBe(0x52)
    expect(policy.witnessScript.at(-1)).toBe(0xae)
  })

  it('sorts keys and ignores the optional BIP380 checksum', () => {
    const reversed = DESCRIPTOR.replace(
      /sortedmulti\(2,([^)]+)\)/,
      (_match, keys: string) => `sortedmulti(2,${keys.split(',').reverse().join(',')})`,
    )
    expect(policyFromDescriptor(reversed).address).toBe(ADDRESS)
    expect(policyFromDescriptor(`${DESCRIPTOR}#abcdefgh`).address).toBe(ADDRESS)
    expect(policyFromDescriptor(DESCRIPTOR.toUpperCase()).address).toBe(ADDRESS)
  })

  it('binds the coordinator address and threshold to the descriptor', () => {
    const policy = testWalletPolicy()
    const source = { descriptor: policy.descriptor, address: policy.address, threshold: policy.threshold, network: 'regtest' }

    expect(assertWalletPolicy(source).address).toBe(policy.address)
    expect(() => assertWalletPolicy({ ...source, address: testRecipientAddress() })).toThrowError(/address does not match/i)
    expect(() => assertWalletPolicy({ ...source, threshold: 1 })).toThrowError(/threshold does not match/i)
    expect(() => assertWalletPolicy({ ...source, network: 'testnet' })).toThrowError(/only available on Regtest/i)
    const keys = testSignerKeys()
    expect(() => assertWalletPolicy({ ...source, descriptor: `wsh(sortedmulti(2,${keys[0].publicKey},${keys[1].publicKey}))` })).toThrowError(/address does not match/i)
  })

  it('rejects descriptors the browser signer cannot verify', () => {
    expect(() => parseWalletDescriptor('')).toThrowError(/missing or too long/i)
    expect(() => parseWalletDescriptor(`${'x'.repeat(4001)}`)).toThrowError(/missing or too long/i)
    expect(() => parseWalletDescriptor(`sh(wsh(sortedmulti(1,${fakeKey(1)})))`)).toThrowError(/native SegWit/i)
    expect(() => parseWalletDescriptor(`wsh(multi(1,${fakeKey(1)}))`)).toThrowError(/native SegWit/i)
    expect(() => parseWalletDescriptor(`wsh(sortedmulti(1,xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet))`)).toThrowError(/native SegWit/i)
    expect(() => parseWalletDescriptor(`wsh(sortedmulti(0,${fakeKey(1)}))`)).toThrowError(/threshold/i)
    expect(() => parseWalletDescriptor(`wsh(sortedmulti(3,${fakeKey(1)},${fakeKey(2)}))`)).toThrowError(/number of signer keys/i)
    expect(() => parseWalletDescriptor(`wsh(sortedmulti(1,${fakeKey(1)},${fakeKey(1)}))`)).toThrowError(/repeats/i)
    const seventeen = Array.from({ length: MAX_POLICY_KEYS + 1 }, (_value, index) => fakeKey(index + 1)).join(',')
    expect(() => parseWalletDescriptor(`wsh(sortedmulti(${MAX_POLICY_KEYS + 1},${seventeen}))`)).toThrowError(/threshold/i)
    expect(() => parseWalletDescriptor(`wsh(sortedmulti(2,${testSignerKeys()[0].publicKey}))`)).toThrowError(/number of signer keys/i)
  })

  it('decodes Regtest recipient addresses only', () => {
    const script = addressScript(testRecipientAddress())
    expect(script).toHaveLength(22)
    expect(script[0]).toBe(0x00)
    expect(script[1]).toBe(0x14)
    expect(() => addressScript('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toThrowError(/Regtest address/i)
    expect(() => addressScript(`${REGTEST_ADDRESS_PREFIX}notanaddress`)).toThrowError(/not a valid Regtest address/i)
    expect(() => addressScript('')).toThrowError(/Regtest address/i)
  })

  it('compares scripts without trusting object identity', () => {
    const policy = testWalletPolicy()
    expect(scriptEquals(policy.script, new Uint8Array(policy.script))).toBe(true)
    expect(scriptEquals(undefined, policy.script)).toBe(false)
    expect(scriptEquals(policy.script, policy.witnessScript)).toBe(false)
    expect(scriptEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
  })
})

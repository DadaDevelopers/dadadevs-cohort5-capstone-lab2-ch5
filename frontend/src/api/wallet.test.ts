import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './index'
import { resetHttpStateForTests, storeSession } from './http'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wallet = {
  communityId: 3,
  status: 'READY',
  network: 'regtest',
  address: 'bcrt1qexample',
  descriptor: 'wsh(sortedmulti(2,...))#checksum',
  requiredSignatures: 2,
  signers: [{ userId: 7 }, { userId: 8 }, { userId: 9 }],
  createdAt: '2026-10-22T08:00:00Z',
}

describe('real signer key, threshold, and wallet APIs', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
    storeSession('access', 'refresh')
  })

  it('submits only the current signer compressed public key', async () => {
    const publicKey = `02${'AB'.repeat(32)}`
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ registered: true, publicKey: publicKey.toLowerCase() }))

    await expect(api.registerSignerKey('3', ` ${publicKey} `)).resolves.toEqual({ registered: true, publicKey: publicKey.toLowerCase() })
    expect(fetchMock.mock.calls[0][0]).toBe('/communities/3/signers/me/public-info')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ publicKey: publicKey.toLowerCase() })
  })

  it('reads only the authenticated signer public information', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ registered: false, publicKey: null }))
    await expect(api.getMySignerPublicInfo('3')).resolves.toEqual({ registered: false, publicKey: null })
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/communities/3/signers/me/public-info')
  })

  it('sets the real threshold and maps the returned draft policy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ requiredSignatures: 2, authorizedSignerCount: 3 }))
    await expect(api.setThreshold('3', 2)).resolves.toMatchObject({ status: 'draft', threshold: 2, signerCount: 3 })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ requiredSignatures: 2 })
  })

  it('combines a ready wallet with the Bitcoin Core balance', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(wallet))
      .mockResolvedValueOnce(json({ confirmedSats: '10000000', pendingSats: '2500', immatureSats: '0' }))

    await expect(api.getWallet('3')).resolves.toMatchObject({
      status: 'active',
      network: 'regtest',
      receiveAddress: 'bcrt1qexample',
      threshold: 2,
      signerCount: 3,
      confirmedBalanceSats: 10000000,
      unconfirmedIncomingSats: 2500,
    })
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/communities/3/wallet', '/communities/3/wallet/balance'])
  })

  it('does not silently round unsafe satoshi balances', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(wallet))
      .mockResolvedValueOnce(json({ confirmedSats: '9007199254740992', pendingSats: '0', immatureSats: '0' }))
    await expect(api.getWallet('3')).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('creates a wallet with no client-supplied policy or key material', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(wallet, 201))
    await expect(api.createWallet('3')).resolves.toMatchObject({ status: 'active', receiveAddress: 'bcrt1qexample' })
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })

  it('reads the descriptor needed by the browser signer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(wallet))

    await expect(api.getWalletPolicy('3')).resolves.toEqual({
      descriptor: 'wsh(sortedmulti(2,...))#checksum',
      address: 'bcrt1qexample',
      threshold: 2,
      network: 'regtest',
    })
    expect(fetchMock.mock.calls[0][0]).toBe('/communities/3/wallet')
  })

  it('refuses to hand out a policy the browser signer cannot verify', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ ...wallet, status: 'DRAFT' }))
    await expect(api.getWalletPolicy('3')).rejects.toMatchObject({ code: 'CONFLICT' })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ ...wallet, network: 'testnet' }))
    await expect(api.getWalletPolicy('3')).rejects.toMatchObject({ code: 'CONFLICT' })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ ...wallet, descriptor: undefined }))
    await expect(api.getWalletPolicy('3')).rejects.toMatchObject({ code: 'NETWORK' })
  })
})

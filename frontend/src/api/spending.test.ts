import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './index'
import { resetHttpStateForTests, storeSession } from './http'
import type { SpendingRequestSummary } from '../types'

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const spend = {
  id: 12,
  status: 'SIGNING' as const,
  recipient: 'bcrt1qrecipient',
  amountSats: '120000',
  feeSats: '800',
  txid: null,
  createdAt: '2026-10-22T08:00:00Z',
  updatedAt: '2026-10-22T08:00:00Z',
  createdBy: { id: 7, firstName: 'Amina', lastName: 'Wanjiku' },
  signatures: [{ signerId: 2, createdAt: '2026-10-22T08:01:00Z' }],
}

describe('real spending request APIs', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
    storeSession('access', 'refresh')
  })

  it('maps safe list projections and real signature progress', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ requiredSignatures: 2, signerCount: 3, spends: [spend] }))
    await expect(api.listSpendingRequests('3')).resolves.toEqual([
      expect.objectContaining({ id: '12', status: 'awaiting_signatures', amountSats: 120000, estimatedFeeSats: 800, threshold: 2, signerCount: 3, createdByName: 'Amina Wanjiku' }),
    ])
  })

  it('maps cancelled requests without calling them declined', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ requiredSignatures: 2, signerCount: 3, spends: [{ ...spend, status: 'CANCELLED', signatures: [] }] }))
    await expect(api.listSpendingRequests('3')).resolves.toEqual([expect.objectContaining({ status: 'cancelled' })])
  })

  it('derives held funds only from requests that still reserve inputs', () => {
    const item = (status: SpendingRequestSummary['status']) => ({ amountSats: 120000, estimatedFeeSats: 800, status }) as SpendingRequestSummary
    expect(api.reservedByRequests([
      item('pending'),
      item('ready_to_broadcast'),
      item('broadcast'),
      item('cancelled'),
    ])).toBe(241600)
  })

  it('creates with exact backend fields and decimal satoshi text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ id: 13, status: 'SIGNING', recipient: spend.recipient, amountSats: '120000', feeSats: '800' }, 201))
    await expect(api.createSpendingRequest('3', { recipientAddress: ` ${spend.recipient} `, amountSats: 120000, feeRate: 4 })).resolves.toEqual({ id: '13' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ recipient: spend.recipient, amountSats: '120000', feeRate: 4 })
  })

  it('composes detail with real signers and wallet address', async () => {
    const signer = { signerId: 2, userId: 8, firstName: 'Kamau', lastName: 'Otieno', email: 'k@example.org', membershipRole: 'COMMUNITY_MEMBER', publicInfoRegistered: true, createdAt: '2026-10-20T08:00:00Z' }
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ...spend, requiredSignatures: 2, signerCount: 3 }))
      .mockResolvedValueOnce(json({ signers: [signer] }))
      .mockResolvedValueOnce(json({ communityId: 3, status: 'READY', network: 'regtest', address: 'bcrt1qchange', requiredSignatures: 2, signers: [{}, {}, {}], createdAt: '2026-10-20T08:00:00Z' }))

    await expect(api.getSpendingRequest('3', '12')).resolves.toMatchObject({
      request: { id: '12', changeAddress: 'bcrt1qchange' },
      signatures: [{ signerId: '2', signerName: 'Kamau Otieno', verified: true }],
      transaction: null,
    })
  })

  it('cancels through the admin-only backend route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ id: 12, status: 'CANCELLED' }))
    await api.cancelSpendingRequest('3', '12')
    expect(fetchMock.mock.calls[0][0]).toBe('/communities/3/wallet/spends/12/cancel')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('rejects unsafe satoshi projections rather than rounding them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ requiredSignatures: 2, signerCount: 3, spends: [{ ...spend, amountSats: '9007199254740992' }] }))
    await expect(api.listSpendingRequests('3')).rejects.toMatchObject({ code: 'NETWORK' })
  })
})

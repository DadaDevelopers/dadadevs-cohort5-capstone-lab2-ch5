import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './index'
import { resetHttpStateForTests, storeSession } from './http'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const incoming = {
  txid: '6b7fc5fb0e2b73579559ea120ba2bfd4de6db57018c782638d357e9965a5428f',
  category: 'receive', direction: 'incoming', amountSats: '1000000',
  feeSats: null, changeSats: '0', totalDebitSats: null,
  recipientAddress: null, recipientCount: 0, recipients: [], requestId: null,
  confirmations: 2, blockhash: '43936e4b141fc3b29635961a74f29c352ffa9f9df6a5551f0932439c79d9a751',
  blockHeight: 1333, time: 1792685147,
}
const outgoing = {
  txid: 'a0748e014db354a90c57a85b82ff3b2952cafe01e0d96f29b59d6ce9c988044d',
  category: 'send', direction: 'outgoing', amountSats: '100000',
  feeSats: '189', changeSats: '899811', totalDebitSats: '100189',
  recipientAddress: 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0', recipientCount: 1,
  recipients: [{ address: 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0', amountSats: '100000' }],
  requestId: '42', confirmations: 1, blockhash: '76d4865a6eb949309720448ed0c524917d9214037e656b9fa28f12aaf95f6b8f',
  blockHeight: 1334, time: 1792687148,
}
const pending = {
  txid: 'c0748e014db354a90c57a85b82ff3b2952cafe01e0d96f29b59d6ce9c988044d',
  category: 'send', direction: 'outgoing', amountSats: '50000',
  feeSats: '100', changeSats: '40000', totalDebitSats: '50100',
  recipientAddress: null, recipientCount: 2,
  recipients: [
    { address: 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0', amountSats: '30000' },
    { address: 'bcrt1qrecipient2qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', amountSats: '20000' },
  ],
  requestId: null, confirmations: 0, blockhash: null, blockHeight: null, time: 1792689000,
}
const tx = outgoing
const wallet = { communityId: 3, status: 'READY', network: 'regtest', address: 'bcrt1qexample', requiredSignatures: 2, signers: [{}, {}], createdAt: '2026-10-22T08:00:00Z' }

describe('real broadcast and transaction monitoring APIs', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
    storeSession('access', 'refresh')
  })

  it('broadcasts through the admin-only request route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ txid: tx.txid, status: 'BROADCAST' }))
    await expect(api.broadcastTransaction('3', '12')).resolves.toEqual({ txid: tx.txid, status: 'BROADCAST' })
    expect(fetchMock.mock.calls[0][0]).toBe('/communities/3/wallet/spends/12/broadcast')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('preserves node/below-threshold broadcast failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'Spending request is not ready' }, 409))
    await expect(api.broadcastTransaction('3', '12')).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })

  it('maps aggregated wallet activity into one logical row per transaction', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ transactions: [incoming, outgoing, pending] }))
    await expect(api.listTransactions('3')).resolves.toEqual([
      expect.objectContaining({
        txid: pending.txid, direction: 'outgoing', amountSats: 50000, feeSats: 100,
        changeSats: 40000, totalDebitSats: 50100, confirmations: 0, status: 'mempool',
        blockHeight: null, requestId: null, label: 'Payment from wallet', recipientCount: 2,
      }),
      expect.objectContaining({
        txid: outgoing.txid, direction: 'outgoing', amountSats: 100000, feeSats: 189,
        changeSats: 899811, totalDebitSats: 100189, confirmations: 1, status: 'confirmed',
        blockHeight: 1334, requestId: '42', label: 'Community payment',
        counterpartyAddress: outgoing.recipientAddress, recipientCount: 1,
      }),
      expect.objectContaining({
        txid: incoming.txid, direction: 'incoming', amountSats: 1000000, feeSats: null,
        changeSats: 0, totalDebitSats: null, confirmations: 2, status: 'confirmed',
        blockHeight: 1333, requestId: null, label: 'Bitcoin received', recipientCount: 0,
      }),
    ])
  })

  it('derives contributions only from logical incoming transactions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ transactions: [incoming, outgoing] }))
    await expect(api.listContributions('3')).resolves.toEqual([
      expect.objectContaining({
        communityId: '3', txid: incoming.txid, vout: null, label: null,
        amountSats: 1000000, confirmations: 2, blockHeight: 1333,
      }),
    ])
  })

  it('uses the detail endpoint as the same aggregated transaction identity', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(outgoing))
    await expect(api.getTransaction('3', outgoing.txid)).resolves.toMatchObject({
      direction: 'outgoing', amountSats: 100000, feeSats: 189, changeSats: 899811,
      totalDebitSats: 100189, confirmations: 1, status: 'confirmed', blockHeight: 1334,
      requestId: '42', counterpartyAddress: outgoing.recipientAddress,
    })
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`/communities/3/wallet/transactions/${outgoing.txid}`)
  })

  it('never assigns a block height to an unconfirmed transaction', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ ...pending, blockHeight: 1334 }))
    await expect(api.getTransaction('3', pending.txid)).resolves.toMatchObject({
      confirmations: 0, status: 'mempool', blockHeight: null,
    })
  })

  it('rejects unsafe transaction amounts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ transactions: [{ ...incoming, amountSats: '9007199254740992' }] }))
    await expect(api.listTransactions('3')).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('composes the dashboard only from live community, wallet, request, and transaction endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ community: { id: 3, name: 'Umoja', description: 'Shared', role: 'COMMUNITY_ADMIN' } }))
      .mockResolvedValueOnce(json(wallet))
      .mockResolvedValueOnce(json({ members: [{ id: 7, firstName: 'Amina', lastName: 'Wanjiku', email: 'a@example.org', role: 'COMMUNITY_ADMIN' }] }))
      .mockResolvedValueOnce(json({ requiredSignatures: 2, signerCount: 2, spends: [] }))
      .mockResolvedValueOnce(json({ transactions: [incoming] }))
      .mockResolvedValueOnce(json({ confirmedSats: '125000', pendingSats: '0', immatureSats: '0' }))

    await expect(api.getDashboard('3')).resolves.toMatchObject({
      community: { id: '3', name: 'Umoja' },
      wallet: { confirmedBalanceSats: 125000 },
      memberCount: 1,
      requests: [],
      recentHistory: [{ txid: incoming.txid, direction: 'incoming' }],
      recentContributions: [{ txid: incoming.txid, amountSats: 1000000, blockHeight: 1333 }],
    })
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/communities/3',
      '/communities/3/wallet',
      '/communities/3/members',
      '/communities/3/wallet/spends',
      '/communities/3/wallet/transactions',
      '/communities/3/wallet/balance',
    ])
  })
})

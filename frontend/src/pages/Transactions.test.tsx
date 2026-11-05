import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { resetHttpStateForTests, storeSession } from '../api/http'
import { CommunityProvider, useCommunity } from '../context/CommunityContext'
import { SessionProvider } from '../context/SessionContext'
import type { HistoryEntry } from '../types'
import { TransactionDetail, Transactions } from './Transactions'

const user = { id: '7', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '2026-10-22T08:00:00Z' }
const community = { id: '42', name: 'Umoja', description: 'Shared fund', type: 'community' as const, createdBy: null, createdAt: null, setupStage: 'active' as const }
const wallet = { id: '42', communityId: '42', network: 'regtest' as const, scriptType: 'P2WSH' as const, status: 'active' as const, threshold: 2, signerCount: 3, receiveAddress: 'bcrt1qexample', createdAt: null, confirmedBalanceSats: 899811, unconfirmedIncomingSats: 0, reservedSats: 0 }
const member = { id: '7', communityId: '42', userId: '7', name: user.name, email: user.email, isAdmin: true, joinedAt: null }

const incoming: HistoryEntry = {
  direction: 'incoming',
  txid: '6b7fc5fb0e2b73579559ea120ba2bfd4de6db57018c782638d357e9965a5428f',
  amountSats: 1_000_000,
  feeSats: null,
  changeSats: 0,
  totalDebitSats: null,
  at: '2026-10-22T08:05:47.000Z',
  confirmations: 2,
  status: 'confirmed',
  label: 'Bitcoin received',
  requestId: null,
  blockHash: '43936e4b141fc3b29635961a74f29c352ffa9f9df6a5551f0932439c79d9a751',
  blockHeight: 1333,
  counterpartyAddress: null,
  recipientCount: 0,
  recipients: [],
}

const outgoing: HistoryEntry = {
  direction: 'outgoing',
  txid: 'a0748e014db354a90c57a85b82ff3b2952cafe01e0d96f29b59d6ce9c988044d',
  amountSats: 100_000,
  feeSats: 189,
  changeSats: 899_811,
  totalDebitSats: 100_189,
  at: '2026-10-22T08:39:08.000Z',
  confirmations: 1,
  status: 'confirmed',
  label: 'Community payment',
  requestId: '42',
  blockHash: '76d4865a6eb949309720448ed0c524917d9214037e656b9fa28f12aaf95f6b8f',
  blockHeight: 1334,
  counterpartyAddress: 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0',
  recipientCount: 1,
  recipients: [{ address: 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0', amountSats: 100_000 }],
}

const pending: HistoryEntry = {
  ...outgoing,
  txid: 'c0748e014db354a90c57a85b82ff3b2952cafe01e0d96f29b59d6ce9c988044d',
  amountSats: 50_000,
  feeSats: 100,
  changeSats: 40_000,
  totalDebitSats: 50_100,
  confirmations: 0,
  status: 'mempool',
  requestId: null,
  label: 'Payment from wallet',
  blockHash: null,
  blockHeight: null,
  counterpartyAddress: null,
  recipientCount: 2,
  recipients: [
    { address: 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0', amountSats: 30_000 },
    { address: 'bcrt1qrecipient2qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', amountSats: 20_000 },
  ],
}

function CommunityGate({ children }: { children: ReactNode }) {
  const { ready, community: active, wallet: activeWallet, membership: activeMembership } = useCommunity()
  if (!ready || !active || !activeWallet || !activeMembership) return <p>Loading community</p>
  return <>{children}</>
}

function renderApp(path: string) {
  return render(
    <SessionProvider>
      <CommunityProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/app/transactions" element={<CommunityGate><Transactions /></CommunityGate>} />
            <Route path="/app/transactions/:txid" element={<CommunityGate><TransactionDetail /></CommunityGate>} />
          </Routes>
        </MemoryRouter>
      </CommunityProvider>
    </SessionProvider>,
  )
}

function transactionLinks() {
  return screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/app/transactions/'))
}

describe('transaction history presentation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
    storeSession('access', 'refresh')
    vi.spyOn(api, 'restoreSession').mockResolvedValue(user)
    vi.spyOn(api, 'listMyCommunities').mockResolvedValue([community])
    vi.spyOn(api, 'loadCommunityContext').mockResolvedValue({
      community,
      wallet,
      membership: { member, signer: null, isAdmin: true, isSigner: false },
    })
    vi.spyOn(api, 'listTransactions').mockResolvedValue([outgoing, incoming])
    vi.spyOn(api, 'getTransaction').mockResolvedValue(outgoing)
  })

  it('shows one row for the contribution and one for the payment without a change row', async () => {
    renderApp('/app/transactions')
    expect(await screen.findByText('Community payment')).not.toBeNull()
    expect(transactionLinks()).toHaveLength(2)
    expect(screen.getByText('Bitcoin received')).not.toBeNull()
    expect(screen.queryByText('+0.00899811 BTC')).toBeNull()
    expect(screen.queryByText('-0.00899811 BTC')).toBeNull()
  })

  it('renders amount and status in separate, horizontally separated cells', async () => {
    renderApp('/app/transactions')
    const paymentLink = await screen.findByRole('link', { name: /Community payment/ })
    const amount = within(paymentLink).getByText('-0.001 BTC')
    const status = within(paymentLink).getByText('1 confirmation')
    expect(amount).not.toBe(status)
    expect(amount.contains(status)).toBe(false)
    expect(amount.parentElement?.className).toContain('text-right')
    expect(amount.parentElement?.className).toContain('justify-self-end')
    expect(amount.className).toContain('whitespace-nowrap')
    expect(status.className).toContain('whitespace-nowrap')
    expect(paymentLink.className).toContain('md:grid-cols-[8.5rem_minmax(0,1fr)_11.5rem_12.5rem]')
  })

  it('filters received contributions and outgoing payments', async () => {
    renderApp('/app/transactions')
    await screen.findByText('Community payment')
    const filter = screen.getByLabelText('Filter transactions by type')
    fireEvent.change(filter, { target: { value: 'outgoing' } })
    await waitFor(() => expect(screen.queryByText('Bitcoin received')).toBeNull())
    expect(transactionLinks()).toHaveLength(1)
    fireEvent.change(filter, { target: { value: 'incoming' } })
    await waitFor(() => expect(screen.queryByText('Community payment')).toBeNull())
    expect(transactionLinks()).toHaveLength(1)
  })


  it('renders outgoing payment details with fee, change, debit, recipient, block height and request', async () => {
    renderApp(`/app/transactions/${outgoing.txid}`)
    expect(await screen.findByRole('heading', { name: 'Community payment' })).not.toBeNull()
    expect(screen.getByText('-0.001 BTC')).not.toBeNull()
    expect(screen.getByText('bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0')).not.toBeNull()
    expect(screen.getByText('189 sats')).not.toBeNull()
    expect(screen.getByText('899,811 sats')).not.toBeNull()
    expect(screen.getByText('100,189 sats')).not.toBeNull()
    expect(screen.getByText('1,334')).not.toBeNull()
    expect(screen.getByText('Regtest')).not.toBeNull()
    expect(screen.getByText('Payment request #42')).not.toBeNull()
    expect(screen.getAllByText('1 confirmation').length).toBeGreaterThan(0)
    expect(screen.queryByText('Contribution received')).toBeNull()
    expect(screen.queryByText('Paid by the sender')).toBeNull()
    expect(screen.getByText('Change returned to the community wallet')).not.toBeNull()
  })

  it('keeps incoming contribution details incoming and sender-paid', async () => {
    vi.mocked(api.getTransaction).mockResolvedValue(incoming)
    renderApp(`/app/transactions/${incoming.txid}`)
    expect(await screen.findByRole('heading', { name: 'Contribution received' })).not.toBeNull()
    expect(screen.getByText('+0.010 BTC')).not.toBeNull()
    expect(screen.getByText('Paid by the sender')).not.toBeNull()
    expect(screen.getByText('1,333')).not.toBeNull()
    expect(screen.queryByText('Change returned to the community wallet')).toBeNull()
    expect(screen.queryByText('Total wallet debit (payment + fee)')).toBeNull()
  })

  it('shows an explicit unlinked state and no invented height for a mempool send', async () => {
    vi.mocked(api.getTransaction).mockResolvedValue(pending)
    renderApp(`/app/transactions/${pending.txid}`)
    expect(await screen.findByRole('heading', { name: 'Community payment' })).not.toBeNull()
    expect(screen.getByText('Unconfirmed')).not.toBeNull()
    expect(screen.getByText('Not in a block yet')).not.toBeNull()
    expect(screen.getByText('Not linked to a spending request')).not.toBeNull()
    expect(screen.getByText('Not linked to a stored request')).not.toBeNull()
    expect(screen.getByText('30,000 sats')).not.toBeNull()
    expect(screen.getByText('20,000 sats')).not.toBeNull()
  })
})

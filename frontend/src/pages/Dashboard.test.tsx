import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { useActiveCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import type { DashboardSummary } from '../types'
import Dashboard from './Dashboard'

vi.mock('../context/CommunityContext', () => ({ useActiveCommunity: vi.fn() }))
vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }))

const user = { id: '7', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '2026-10-22T08:00:00Z' }
const community = { id: '42', name: 'Umoja', description: 'Shared fund', type: 'community' as const, createdBy: null, createdAt: null, setupStage: 'active' as const }
const wallet = { id: '42', communityId: '42', network: 'regtest' as const, scriptType: 'P2WSH' as const, status: 'active' as const, threshold: 2, signerCount: 3, receiveAddress: 'bcrt1qexample', createdAt: null, confirmedBalanceSats: 2_100_000_012_345_678, unconfirmedIncomingSats: 12_345_678, reservedSats: 100_000_000 }
const member = { id: '7', communityId: '42', userId: '7', name: user.name, email: user.email, isAdmin: true, joinedAt: null }
const dashboard: DashboardSummary = { community, wallet, memberCount: 8, requests: [], recentHistory: [], recentContributions: [] }

describe('dashboard information hierarchy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(useSession).mockReturnValue({ user, initializing: false, restoreError: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), restore: vi.fn() })
    vi.mocked(useActiveCommunity).mockReturnValue({
      communities: [community], community, wallet,
      membership: { member, signer: null, isAdmin: true, isSigner: false },
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(), clear: vi.fn(),
    })
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboard)
    vi.spyOn(api, 'listSigners').mockResolvedValue([
      { id: 's1', communityId: '42', memberId: '7', name: 'Amina Wanjiku', status: 'ready', xpub: null, fingerprint: null, derivationPath: null, selectedAt: '', registeredAt: '' },
      { id: 's2', communityId: '42', memberId: '8', name: 'Brian Otieno', status: 'awaiting_key', xpub: null, fingerprint: null, derivationPath: null, selectedAt: '', registeredAt: null },
    ])
  })

  it('makes available funds primary without losing eight-decimal precision', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(await screen.findByText('Available to spend')).not.toBeNull()
    const balance = screen.getAllByTestId('responsive-btc-amount')[0]
    expect(balance.textContent).toBe('20999999.12345678BTC')
    expect(balance.className).toContain('btc-balance')
    expect(screen.getByText('Arriving')).not.toBeNull()
  })

  it('shows the authorized payment action and real signer names', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect((await screen.findByRole('link', { name: /Propose a payment/ })).getAttribute('href')).toBe('/app/requests/new')
    expect(await screen.findByText('Amina Wanjiku')).not.toBeNull()
    expect(screen.getByText('Brian Otieno')).not.toBeNull()
    expect(screen.queryByText('Latest contributions')).toBeNull()
  })
})

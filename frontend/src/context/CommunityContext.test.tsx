import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import type { Community, Membership, User, Wallet } from '../types'
import { CommunityProvider, useCommunity } from './CommunityContext'
import { useSession } from './SessionContext'

vi.mock('./SessionContext', () => ({ useSession: vi.fn() }))

const user = (id: string): User => ({ id, name: `User ${id}`, email: `${id}@example.org`, createdAt: '2026-10-22T08:00:00Z' })
const context = (id: string, name: string, setupStage: Community['setupStage'] = 'active'): { community: Community; wallet: Wallet; membership: Membership } => {
  const community: Community = { id, name, description: '', type: 'community', createdBy: null, createdAt: null, setupStage }
  const member = { id, communityId: id, userId: id, name: `User ${id}`, email: `${id}@example.org`, isAdmin: false, joinedAt: null }
  return {
    community,
    wallet: { id, communityId: id, network: 'regtest', scriptType: 'P2WSH', status: 'active', threshold: 2, signerCount: 3, receiveAddress: 'bcrt1qexample', createdAt: null, confirmedBalanceSats: 0, unconfirmedIncomingSats: 0, reservedSats: 0 },
    membership: { member, signer: null, isAdmin: false, isSigner: false },
  }
}

function Probe() {
  const value = useCommunity()
  return (
    <div>
      <p>{value.ready ? value.community?.name ?? 'none' : 'loading'}</p>
      <p data-testid="wallet-community">{value.wallet?.communityId ?? 'no-wallet'}</p>
      <p data-testid="community-error">{value.error ?? 'no-error'}</p>
      <button onClick={() => void value.selectCommunity('22')}>Switch to 22</button>
    </div>
  )
}

describe('community state isolation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('ignores an old user load and never shows it after switching users', async () => {
    let resolveOld: ((value: ReturnType<typeof context>) => void) | undefined
    const oldLoad = new Promise<ReturnType<typeof context>>((resolve) => { resolveOld = resolve })
    vi.mocked(useSession).mockReturnValue({ user: user('1') } as ReturnType<typeof useSession>)
    vi.spyOn(api, 'listMyCommunities')
      .mockResolvedValueOnce([context('11', 'Old community').community])
      .mockResolvedValueOnce([context('22', 'New community').community])
    vi.spyOn(api, 'loadCommunityContext').mockImplementation((id) => id === '11' ? oldLoad : Promise.resolve(context('22', 'New community')))

    const view = render(<CommunityProvider><Probe /></CommunityProvider>)
    await waitFor(() => expect(api.loadCommunityContext).toHaveBeenCalledWith('11'))

    vi.mocked(useSession).mockReturnValue({ user: user('2') } as ReturnType<typeof useSession>)
    view.rerender(<CommunityProvider><Probe /></CommunityProvider>)
    expect(await screen.findByText('New community')).not.toBeNull()

    await act(async () => { resolveOld?.(context('11', 'Old community')) })
    expect(screen.queryByText('Old community')).toBeNull()
    expect(screen.getByText('New community')).not.toBeNull()
  })

  it('restores an accessible fallback when a stored community is no longer available', async () => {
    sessionStorage.setItem('communitysafe.community.1', '99')
    const available = context('11', 'Available community')
    vi.mocked(useSession).mockReturnValue({ user: user('1') } as ReturnType<typeof useSession>)
    vi.spyOn(api, 'listMyCommunities').mockResolvedValue([available.community])
    vi.spyOn(api, 'loadCommunityContext').mockResolvedValue(available)

    render(<CommunityProvider><Probe /></CommunityProvider>)
    expect(await screen.findByText('Available community')).not.toBeNull()
    expect(api.loadCommunityContext).toHaveBeenCalledWith('11')
    expect(sessionStorage.getItem('communitysafe.community.1')).toBe('11')
  })

  it('switches community state atomically without exposing the target wallet early', async () => {
    const first = context('11', 'Active community')
    const second = context('22', 'Incomplete community', 'signers')
    let resolveSecond: ((value: ReturnType<typeof context>) => void) | undefined
    const delayedSecond = new Promise<ReturnType<typeof context>>((resolve) => { resolveSecond = resolve })
    vi.mocked(useSession).mockReturnValue({ user: user('1') } as ReturnType<typeof useSession>)
    vi.spyOn(api, 'listMyCommunities').mockResolvedValue([first.community, second.community])
    vi.spyOn(api, 'loadCommunityContext').mockImplementation((id) => id === '11' ? Promise.resolve(first) : delayedSecond)

    render(<CommunityProvider><Probe /></CommunityProvider>)
    expect(await screen.findByText('Active community')).not.toBeNull()
    expect(screen.getByTestId('wallet-community').textContent).toBe('11')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to 22' }))
    await waitFor(() => expect(api.loadCommunityContext).toHaveBeenCalledWith('22'))
    expect(screen.getByText('Active community')).not.toBeNull()
    expect(screen.getByTestId('wallet-community').textContent).toBe('11')

    await act(async () => { resolveSecond?.(second) })
    expect(await screen.findByText('Incomplete community')).not.toBeNull()
    expect(screen.getByTestId('wallet-community').textContent).toBe('22')
    expect(sessionStorage.getItem('communitysafe.community.1')).toBe('22')
  })

  it('keeps the current community isolated when a switch request fails', async () => {
    const first = context('11', 'Safe current community')
    const second = context('22', 'Unavailable community', 'rule')
    vi.mocked(useSession).mockReturnValue({ user: user('1') } as ReturnType<typeof useSession>)
    vi.spyOn(api, 'listMyCommunities').mockResolvedValue([first.community, second.community])
    vi.spyOn(api, 'loadCommunityContext').mockImplementation((id) => id === '11' ? Promise.resolve(first) : Promise.reject(new Error('Switch failed')))

    render(<CommunityProvider><Probe /></CommunityProvider>)
    expect(await screen.findByText('Safe current community')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 22' }))
    expect(await screen.findByText('Switch failed')).not.toBeNull()
    expect(screen.getByText('Safe current community')).not.toBeNull()
    expect(screen.getByTestId('wallet-community').textContent).toBe('11')
    expect(sessionStorage.getItem('communitysafe.community.1')).toBe('11')
  })
})

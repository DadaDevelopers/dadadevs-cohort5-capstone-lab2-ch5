import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { SetupLayout } from './SetupLayout'

vi.mock('../context/CommunityContext', () => ({ useCommunity: vi.fn() }))
vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }))

const user = { id: '7', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '' }
const community = { id: '42', name: 'Umoja', description: 'Shared fund', type: 'community' as const, createdBy: null, createdAt: null, setupStage: 'members' as const }
const wallet = { id: '42', communityId: '42', network: 'regtest' as const, scriptType: 'P2WSH' as const, status: 'draft' as const, threshold: null, signerCount: 0, receiveAddress: null, createdAt: null, confirmedBalanceSats: 0, unconfirmedIncomingSats: 0, reservedSats: 0 }
const active = { ...community, id: '84', name: 'Completed community', setupStage: 'active' as const }
const selectCommunity = vi.fn()

describe('setup brand navigation', () => {
  beforeEach(() => {
    selectCommunity.mockReset()
    vi.mocked(useSession).mockReturnValue({ user, initializing: false, restoreError: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), restore: vi.fn() })
    vi.mocked(useCommunity).mockReturnValue({
      communities: [community, active], community, wallet, membership: null,
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity, clear: vi.fn(),
    })
  })

  it('links the full wordmark to the public landing page', () => {
    render(
      <MemoryRouter initialEntries={['/setup/members']}>
        <Routes>
          <Route element={<SetupLayout />}><Route path="/setup/members" element={<p>Members step</p>} /></Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'CommunitySafe home' }).getAttribute('href')).toBe('/')
  })

  it('keeps an accessible community switcher in setup and returns active communities to the dashboard', async () => {
    selectCommunity.mockResolvedValue(active)
    render(
      <MemoryRouter initialEntries={['/setup/members']}>
        <Routes>
          <Route path="/app" element={<p>Active dashboard</p>} />
          <Route element={<SetupLayout />}><Route path="/setup/members" element={<p>Members step</p>} /></Route>
        </Routes>
      </MemoryRouter>,
    )
    const switcher = screen.getByRole('combobox', { name: 'Switch community' })
    fireEvent.change(switcher, { target: { value: active.id } })
    expect(await screen.findByText('Active dashboard')).not.toBeNull()
    await waitFor(() => expect(selectCommunity).toHaveBeenCalledWith(active.id))
  })

  it('keeps alternative communities available when the selected setup context cannot load', () => {
    vi.mocked(useCommunity).mockReturnValue({
      communities: [community, active], community: null, wallet: null, membership: null,
      loading: false, ready: true, error: 'The selected community could not be loaded.',
      refresh: vi.fn(), selectCommunity, clear: vi.fn(),
    })
    render(
      <MemoryRouter initialEntries={['/setup/members']}>
        <Routes><Route element={<SetupLayout />}><Route path="/setup/members" element={<p>Members step</p>} /></Route></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('combobox', { name: 'Switch community' })).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('The selected community could not be loaded.')
    expect(screen.queryByText('Members step')).toBeNull()
  })
})

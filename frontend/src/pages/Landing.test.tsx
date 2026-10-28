import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import Landing from './Landing'

vi.mock('../context/CommunityContext', () => ({ useCommunity: vi.fn() }))
vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }))

const user = { id: '7', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '' }
const community = { id: '42', name: 'Umoja', description: 'Shared fund', type: 'community' as const, createdBy: null, createdAt: null, setupStage: 'active' as const }
const communityState = {
  communities: [community], community, wallet: null, membership: null,
  loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(), clear: vi.fn(),
}

describe('public landing navigation', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ user: null, initializing: false, restoreError: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), restore: vi.fn() })
    vi.mocked(useCommunity).mockReturnValue({ ...communityState, communities: [], community: null })
  })

  it('keeps the public entry actions for unauthenticated visitors', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'CommunitySafe home' }).getAttribute('href')).toBe('/')
    expect(screen.getAllByRole('link', { name: 'Get started' })[0].getAttribute('href')).toBe('/signup')
    expect(screen.getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0)
  })

  it('offers authenticated users a client-side route back to the dashboard', () => {
    vi.mocked(useSession).mockReturnValue({ user, initializing: false, restoreError: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), restore: vi.fn() })
    vi.mocked(useCommunity).mockReturnValue(communityState)
    render(<MemoryRouter><Landing /></MemoryRouter>)
    const actions = screen.getAllByRole('link', { name: 'Open Dashboard' })
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.every((link) => link.getAttribute('href') === '/app')).toBe(true)
    expect(screen.getByText(/Signed in as/).textContent).toContain(user.name)
  })

  it('preserves onboarding by returning an incomplete community to its required step', () => {
    vi.mocked(useSession).mockReturnValue({ user, initializing: false, restoreError: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), restore: vi.fn() })
    vi.mocked(useCommunity).mockReturnValue({ ...communityState, community: { ...community, setupStage: 'signers' } })
    render(<MemoryRouter><Landing /></MemoryRouter>)
    const actions = screen.getAllByRole('link', { name: 'Continue setup' })
    expect(actions.every((link) => link.getAttribute('href') === '/setup/signers')).toBe(true)
  })
})

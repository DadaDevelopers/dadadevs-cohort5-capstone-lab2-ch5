import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { hasStoredSession, resetHttpStateForTests, storeSession } from '../api/http'
import { CommunityProvider } from '../context/CommunityContext'
import { SessionProvider } from '../context/SessionContext'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'
import Dashboard from '../pages/Dashboard'

const user = { id: '7', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '2026-10-22T08:00:00Z' }
const community = { id: '42', name: 'Umoja', description: 'Shared fund', type: 'community' as const, createdBy: null, createdAt: null, setupStage: 'active' as const }
const wallet = { id: '42', communityId: '42', network: 'regtest' as const, scriptType: 'P2WSH' as const, status: 'active' as const, threshold: 2, signerCount: 3, receiveAddress: 'bcrt1qexample', createdAt: null, confirmedBalanceSats: 0, unconfirmedIncomingSats: 0, reservedSats: 0 }
const member = { id: '7', communityId: '42', userId: '7', name: user.name, email: user.email, isAdmin: true, joinedAt: null }

function LoginPage() {
  const navigate = useNavigate()
  return <div><p>Login page</p><button onClick={() => navigate(-1)}>Browser back</button></div>
}

describe('visible logout', () => {
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
    vi.spyOn(api, 'getDashboard').mockResolvedValue({ community, wallet, memberCount: 1, requests: [], recentHistory: [], recentContributions: [] })
    vi.spyOn(api, 'listSigners').mockResolvedValue([])
    vi.spyOn(api, 'getUnreadNotificationCount').mockResolvedValue({ count: 0 })
    vi.spyOn(api, 'listNotifications').mockResolvedValue({ items: [], nextCursor: null })
  })

  it('shows a labelled action, clears session/community state, redirects, and stays protected after Back', async () => {
    render(
      <SessionProvider>
        <CommunityProvider>
          <MemoryRouter initialEntries={['/app']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}><Route index element={<p>Private dashboard</p>} /></Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </CommunityProvider>
      </SessionProvider>,
    )

    expect(await screen.findByText('Private dashboard')).not.toBeNull()
    expect(sessionStorage.getItem('communitysafe.community.7')).toBe('42')
    const logout = screen.getByRole('button', { name: 'Log out' })
    expect(logout.textContent).toContain('Log out')

    fireEvent.click(logout)
    expect(await screen.findByText('Login page')).not.toBeNull()
    expect(hasStoredSession()).toBe(false)
    expect(sessionStorage.getItem('communitysafe.community.7')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    await waitFor(() => expect(screen.queryByText('Private dashboard')).toBeNull())
    expect(screen.getByText('Login page')).not.toBeNull()
  })

  it('groups navigation and keeps settings in the account region', async () => {
    render(
      <SessionProvider>
        <CommunityProvider>
          <MemoryRouter initialEntries={['/app']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}><Route index element={<p>Private dashboard</p>} /></Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </CommunityProvider>
      </SessionProvider>,
    )

    expect(await screen.findByText('Private dashboard')).not.toBeNull()
    for (const heading of ['Overview', 'Money', 'Community', 'Governance']) {
      expect(screen.getByRole('heading', { name: heading })).not.toBeNull()
    }
    expect(screen.getByRole('navigation', { name: 'Account navigation' }).textContent).toContain('Settings')
    expect(screen.getByRole('link', { name: 'Audit log' })).not.toBeNull()
  })

  it('opens the same grouped navigation in the mobile drawer', async () => {
    render(
      <SessionProvider>
        <CommunityProvider>
          <MemoryRouter initialEntries={['/app']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}><Route index element={<p>Private dashboard</p>} /></Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </CommunityProvider>
      </SessionProvider>,
    )

    await screen.findByText('Private dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { name: 'Money' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'CommunitySafe home' }).every((link) => link.getAttribute('href') === '/')).toBe(true)
    expect(screen.getByRole('button', { name: 'Close menu' })).not.toBeNull()
  })

  it('shows full expanded labels and provides accessible collapsed icon navigation', async () => {
    render(
      <SessionProvider>
        <CommunityProvider>
          <MemoryRouter initialEntries={['/app']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}><Route index element={<p>Private dashboard</p>} /></Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </CommunityProvider>
      </SessionProvider>,
    )

    await screen.findByText('Private dashboard')
    const spending = screen.getByRole('link', { name: 'Spending requests' })
    expect(spending.textContent).toContain('Spending requests')
    expect(spending.querySelector('span')?.className).not.toContain('truncate')

    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' })
    collapse.focus()
    expect(document.activeElement).toBe(collapse)
    fireEvent.click(collapse)

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Spending requests' }).getAttribute('title')).toBe('Spending requests')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('title')).toBe('Settings')
    expect(screen.getAllByRole('link', { name: 'CommunitySafe home' })[0].getAttribute('title')).toBe('CommunitySafe home')
    expect(document.querySelector('[data-sidebar-state="collapsed"]')?.className).toContain('w-[4.5rem]')

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).not.toBeNull()
    expect(document.querySelector('[data-sidebar-state="expanded"]')?.className).toContain('w-[17rem]')
  })

  it('uses the CommunitySafe wordmark link to open the public landing page without clearing the session', async () => {
    render(
      <SessionProvider>
        <CommunityProvider>
          <MemoryRouter initialEntries={['/app/wallet']}>
            <Routes>
              <Route path="/" element={<p>Public landing</p>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<p>Dashboard destination</p>} />
                  <Route path="wallet" element={<p>Wallet destination</p>} />
                </Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </CommunityProvider>
      </SessionProvider>,
    )

    expect(await screen.findByText('Wallet destination')).not.toBeNull()
    const brandLinks = screen.getAllByRole('link', { name: 'CommunitySafe home' })
    expect(brandLinks.every((link) => link.getAttribute('href') === '/')).toBe(true)
    const logoLink = brandLinks[0]
    logoLink.focus()
    expect(document.activeElement).toBe(logoLink)
    fireEvent.click(logoLink)
    expect(await screen.findByText('Public landing')).not.toBeNull()
    expect(hasStoredSession()).toBe(true)
    expect(sessionStorage.getItem('communitysafe.community.7')).toBe('42')
  })

  it('keeps the responsive dashboard balance available in both sidebar states', async () => {
    render(
      <SessionProvider>
        <CommunityProvider>
          <MemoryRouter initialEntries={['/app']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}><Route index element={<Dashboard />} /></Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </CommunityProvider>
      </SessionProvider>,
    )

    expect((await screen.findAllByTestId('responsive-btc-amount')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getAllByTestId('responsive-btc-amount')[0].className).toContain('btc-balance')
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getAllByTestId('responsive-btc-amount')[0].className).toContain('btc-balance')
  })
})

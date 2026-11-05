import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../context/SessionContext'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }))

const restore = vi.fn(async () => {})
const baseSession = {
  user: null,
  initializing: false,
  restoreError: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  restore,
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/private?tab=wallet']}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/private" element={<p>Private page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    restore.mockClear()
    vi.mocked(useSession).mockReturnValue({ ...baseSession })
  })

  it('waits for session initialization before routing', () => {
    vi.mocked(useSession).mockReturnValue({ ...baseSession, initializing: true })
    renderRoute()
    expect(screen.getByRole('status').textContent).toContain('Restoring your session')
  })

  it('redirects an unauthenticated visitor to login', () => {
    renderRoute()
    expect(screen.getByText('Login page')).not.toBeNull()
    expect(screen.queryByText('Private page')).toBeNull()
  })

  it('renders a protected child for an authenticated user', () => {
    vi.mocked(useSession).mockReturnValue({
      ...baseSession,
      user: { id: '7', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '2026-10-22T08:00:00.000Z' },
    })
    renderRoute()
    expect(screen.getByText('Private page')).not.toBeNull()
  })

  it('offers retry when session restoration fails', () => {
    vi.mocked(useSession).mockReturnValue({ ...baseSession, restoreError: 'Server unavailable' })
    renderRoute()
    expect(screen.getByText('Server unavailable')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(restore).toHaveBeenCalledOnce()
  })
})

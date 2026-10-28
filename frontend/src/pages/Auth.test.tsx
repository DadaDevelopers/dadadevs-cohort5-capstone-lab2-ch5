import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../context/SessionContext'
import { Login, Signup } from './Auth'

vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }))

const login = vi.fn(async () => ({ id: '1', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '' }))
const register = vi.fn(async () => ({ id: '1', name: 'Amina Wanjiku', email: 'amina@example.org', createdAt: '' }))
const session = { user: null, initializing: false, restoreError: null, login, register, logout: vi.fn(), restore: vi.fn() }

function renderAuth(page: 'login' | 'signup') {
  return render(<MemoryRouter>{page === 'login' ? <Login /> : <Signup />}</MemoryRouter>)
}

describe('authentication layout', () => {
  beforeEach(() => {
    login.mockClear()
    register.mockClear()
    vi.mocked(useSession).mockReturnValue(session)
  })

  it('keeps the branded message and accessible login fields in one shared layout', () => {
    renderAuth('login')
    expect(screen.getByRole('region', { name: 'About CommunitySafe' })).not.toBeNull()
    expect(screen.getByText('Community funds, protected together.')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'CommunitySafe' }).getAttribute('href')).toBe('/')
    expect(screen.getByLabelText('Email address')).not.toBeNull()
    expect(screen.getByLabelText('Password')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Show password' })).not.toBeNull()
  })

  it('preserves client validation without calling authentication', () => {
    renderAuth('login')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Enter the email address you signed up with.')).not.toBeNull()
    expect(screen.getByText('Enter your password.')).not.toBeNull()
    expect(login).not.toHaveBeenCalled()
  })

  it('uses the same branded shell for signup', () => {
    renderAuth('signup')
    expect(screen.getByRole('region', { name: 'About CommunitySafe' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Create your account' })).not.toBeNull()
    expect(screen.getByLabelText('Full name')).not.toBeNull()
    expect(screen.queryByText(/forgot password/i)).toBeNull()
  })
})

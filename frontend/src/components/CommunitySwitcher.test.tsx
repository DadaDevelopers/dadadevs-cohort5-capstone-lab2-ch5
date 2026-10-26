import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommunity } from '../context/CommunityContext'
import type { Community } from '../types'
import { CommunitySwitcher } from './CommunitySwitcher'

vi.mock('../context/CommunityContext', () => ({ useCommunity: vi.fn() }))

const community = (id: string, name: string, setupStage: Community['setupStage']): Community => ({
  id, name, setupStage, description: '', type: 'community', createdBy: null, createdAt: null,
})
const active = community('1', 'Umoja Active', 'active')
const members = community('2', 'New Members Fund', 'members')
const signers = community('3', 'Signer Setup Fund', 'signers')

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderSwitcher(initial = '/app') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <CommunitySwitcher />
      <Routes><Route path="*" element={<LocationProbe />} /></Routes>
    </MemoryRouter>,
  )
}

describe('shared community switcher', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows configured community names plainly, distinguishes setup stages, and opens the exact next step', async () => {
    const selectCommunity = vi.fn(async (id: string) => id === members.id ? members : null)
    vi.mocked(useCommunity).mockReturnValue({
      communities: [active, members], community: active, wallet: null, membership: null,
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity, clear: vi.fn(),
    })
    renderSwitcher()

    expect(screen.getByRole('option', { name: 'Umoja Active' })).not.toBeNull()
    expect(screen.getByRole('option', { name: 'New Members Fund — Setup: Add members' })).not.toBeNull()
    const switcher = screen.getByRole('combobox', { name: 'Switch community' })
    switcher.focus()
    expect(document.activeElement).toBe(switcher)
    fireEvent.change(switcher, { target: { value: members.id } })

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/setup/members'))
    expect(selectCommunity).toHaveBeenCalledWith(members.id)
  })

  it('returns from incomplete setup to an active dashboard', async () => {
    vi.mocked(useCommunity).mockReturnValue({
      communities: [members, active], community: members, wallet: null, membership: null,
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(async () => active), clear: vi.fn(),
    })
    renderSwitcher('/setup/members')
    fireEvent.change(screen.getByRole('combobox', { name: 'Switch community' }), { target: { value: active.id } })
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app'))
  })

  it('supports multiple incomplete communities when no completed community exists', async () => {
    vi.mocked(useCommunity).mockReturnValue({
      communities: [members, signers], community: members, wallet: null, membership: null,
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(async () => signers), clear: vi.fn(),
    })
    renderSwitcher('/setup/members')
    expect(screen.getByRole('option', { name: 'New Members Fund — Setup: Add members' })).not.toBeNull()
    expect(screen.getByRole('option', { name: 'Signer Setup Fund — Setup: Add signer keys' })).not.toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Switch community' }), { target: { value: signers.id } })
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/setup/signers'))
  })

  it('does not navigate when loading the selected community fails', async () => {
    vi.mocked(useCommunity).mockReturnValue({
      communities: [active, members], community: active, wallet: null, membership: null,
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(async () => null), clear: vi.fn(),
    })
    renderSwitcher()
    fireEvent.change(screen.getByRole('combobox', { name: 'Switch community' }), { target: { value: members.id } })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Switch community' }).hasAttribute('disabled')).toBe(false))
    expect(screen.getByTestId('location').textContent).toBe('/app')
  })
})

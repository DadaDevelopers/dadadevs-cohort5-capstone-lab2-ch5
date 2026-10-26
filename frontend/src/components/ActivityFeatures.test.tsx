import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import Audit from '../pages/Audit'
import { NotificationBell } from './NotificationBell'
import { SpendingDiscussion } from './SpendingDiscussion'

vi.mock('../context/CommunityContext', () => ({
  useCommunity: () => ({ community: { id: '42', name: 'Umoja' } }),
  useActiveCommunity: () => ({ community: { id: '42', name: 'Umoja' } }),
}))

describe('activity UI', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders real paginated audit events and filters by type', async () => {
    const list = vi.spyOn(api, 'listAuditEvents').mockResolvedValue({ items: [{
      id: '9', eventType: 'SPENDING_REQUEST_CREATED', entityType: 'spending_request', entityId: '12',
      metadata: null, actor: { id: '7', name: 'Amina Wanjiku' }, createdAt: '2026-10-26T08:00:00Z',
    }], nextCursor: null })
    render(<MemoryRouter><Audit /></MemoryRouter>)
    expect(await screen.findByText('Payment proposed')).not.toBeNull()
    expect(screen.getByText(/Amina Wanjiku/)).not.toBeNull()
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'WALLET_CREATED' } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith('42', expect.objectContaining({ type: 'WALLET_CREATED' })))
  })

  it('shows unread notifications and marks a selected item read', async () => {
    vi.spyOn(api, 'getUnreadNotificationCount').mockResolvedValue({ count: 2 })
    vi.spyOn(api, 'listNotifications').mockResolvedValue({ items: [{
      id: '3', category: 'payment', message: 'Payment #12 needs review.', entityType: 'spending_request', entityId: '12',
      createdAt: '2026-10-26T08:00:00Z', readAt: null,
    }], nextCursor: null })
    const mark = vi.spyOn(api, 'markNotificationRead').mockResolvedValue()
    render(<MemoryRouter><NotificationBell /></MemoryRouter>)
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    fireEvent.click(bell)
    const link = await screen.findByRole('link', { name: /Payment #12 needs review/ })
    expect(link.getAttribute('href')).toBe('/app/requests/12')
    fireEvent.click(link)
    await waitFor(() => expect(mark).toHaveBeenCalledWith('42', '3'))
  })

  it('renders discussion content as text and posts a validated message', async () => {
    vi.spyOn(api, 'listDiscussionMessages').mockResolvedValue({ items: [{
      id: '1', body: '<script>window.bad=true</script>', createdAt: '2026-10-26T08:00:00Z', author: { id: '8', name: 'Njeri' },
    }], nextCursor: null })
    const add = vi.spyOn(api, 'addDiscussionMessage').mockResolvedValue({ id: '2', body: 'Looks good', createdAt: '2026-10-26T09:00:00Z', author: { id: '7', name: 'Amina' } })
    render(<MemoryRouter><SpendingDiscussion communityId="42" requestId="12" currentUserId="7" /></MemoryRouter>)
    expect(await screen.findByText('<script>window.bad=true</script>')).not.toBeNull()
    expect(document.querySelector('script')).toBeNull()
    fireEvent.change(screen.getByLabelText('Add to the discussion'), { target: { value: ' Looks good ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post message' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith('42', '12', 'Looks good'))
    expect(await screen.findByText('Looks good')).not.toBeNull()
  })
})

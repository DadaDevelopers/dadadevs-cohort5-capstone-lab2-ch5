import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import type { Notification } from '../types'
import { useCommunity } from '../context/CommunityContext'
import { dateTime } from '../lib/format'
import { Icon } from './Icon'
import { Button, cx } from './ui'

const notificationLink = (item: Notification) => item.entityType === 'spending_request' ? `/app/requests/${item.entityId}` : item.entityType === 'transaction' ? `/app/transactions/${item.entityId}` : '/app/audit'

export function NotificationBell() {
  const { community } = useCommunity()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadCount = useCallback(async () => {
    if (!community || document.visibilityState === 'hidden') return
    try { setCount((await api.getUnreadNotificationCount(community.id)).count) } catch { /* Header polling must not interrupt the current screen. */ }
  }, [community])

  const loadItems = useCallback(async () => {
    if (!community) return
    try { setError(null); setItems((await api.listNotifications(community.id, { limit: 20 })).items) }
    catch (reason) { setError(errorMessage(reason)) }
  }, [community])

  useEffect(() => {
    void loadCount()
    const timer = window.setInterval(() => void loadCount(), 60_000)
    document.addEventListener('visibilitychange', loadCount)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', loadCount) }
  }, [loadCount])

  useEffect(() => { setOpen(false); setItems([]); setCount(0); setError(null) }, [community?.id])
  if (!community) return null

  const markRead = async (item: Notification) => {
    if (item.readAt) return
    try {
      await api.markNotificationRead(community.id, item.id)
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value))
      setCount((value) => Math.max(0, value - 1))
    } catch (reason) { setError(errorMessage(reason)) }
  }
  const markAll = async () => {
    try {
      await api.markAllNotificationsRead(community.id)
      const now = new Date().toISOString()
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })))
      setCount(0)
    } catch (reason) { setError(errorMessage(reason)) }
  }

  return (
    <div className="relative">
      <button type="button" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void loadItems() }} className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
        <Icon name="bell" size={21} />
        {count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-bad-ink px-1 text-center text-[11px] font-bold leading-5 text-white" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && <section className="fixed inset-x-4 top-24 z-40 max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96" aria-label="Notifications">
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3"><h2 className="font-bold">Notifications</h2>{count > 0 && <Button variant="ghost" size="sm" onClick={() => void markAll()}>Mark all read</Button>}</header>
        {error ? <p className="p-4 text-sm text-bad-ink" role="alert">{error}</p> : items.length === 0 ? <p className="p-6 text-center text-sm text-muted">No notifications yet.</p> : <ul className="divide-y divide-line">{items.map((item) => <li key={item.id} className={cx('px-4 py-3', !item.readAt && 'bg-teal-soft')}>
          <Link to={notificationLink(item)} onClick={() => { void markRead(item); setOpen(false) }} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"><p className={cx('text-sm', !item.readAt && 'font-semibold')}>{item.message}</p><time className="mt-1 block text-xs text-muted" dateTime={item.createdAt}>{dateTime(item.createdAt)}</time></Link>
        </li>)}</ul>}
      </section>}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { Button, EmptyState, ErrorState, LoadingBlock, PageHeader, Panel } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { dateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const eventNames: Record<string, string> = {
  COMMUNITY_CREATED: 'Community created', MEMBER_JOINED: 'Member joined', MEMBER_ADDED: 'Member added',
  MEMBER_ROLE_CHANGED: 'Member role changed', MEMBER_REMOVED: 'Member removed', SIGNER_SELECTED: 'Signer selected',
  SIGNER_REMOVED: 'Signer removed', SIGNER_KEY_REGISTERED: 'Signer key registered', SIGNING_THRESHOLD_CHANGED: 'Approval rule changed',
  WALLET_CREATED: 'Wallet created', SPENDING_REQUEST_CREATED: 'Payment proposed', SPENDING_REQUEST_SIGNED: 'Payment signed',
  SPENDING_THRESHOLD_REACHED: 'Signature threshold reached', SPENDING_REQUEST_BROADCAST: 'Payment broadcast',
  SPENDING_REQUEST_CANCELLED: 'Payment cancelled', PAYMENT_CONFIRMED: 'Payment confirmed', CONTRIBUTION_CONFIRMED: 'Contribution confirmed',
  DISCUSSION_MESSAGE_ADDED: 'Discussion message added',
}

const label = (value: string) => eventNames[value] ?? value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
const eventLink = (entityType: string, entityId: string) => entityType === 'spending_request' ? `/app/requests/${entityId}` : entityType === 'transaction' ? `/app/transactions/${entityId}` : null

export default function Audit() {
  const { community } = useActiveCommunity()
  const [type, setType] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const [history, setHistory] = useState<(string | undefined)[]>([])
  const page = useAsync(() => api.listAuditEvents(community.id, { type, cursor, limit: 20 }), [community.id, type, cursor])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description={`A permanent, server-generated record of important activity in ${community.name}.`} />
      <label className="flex max-w-xs flex-col gap-1.5 text-sm font-semibold" htmlFor="audit-type">
        Event type
        <select id="audit-type" value={type} onChange={(event) => { setType(event.target.value); setCursor(undefined); setHistory([]) }} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px] focus:border-forest focus:outline-none focus:ring-2 focus:ring-teal-line">
          <option value="">All activity</option>
          {Object.entries(eventNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      </label>
      {page.loading ? <LoadingBlock rows={4} label="Loading audit events" /> : page.error ? <ErrorState message={page.error} onRetry={page.reload} /> : !page.data?.items.length ? <EmptyState icon="audit" title="No activity yet">Important actions will appear here as they happen.</EmptyState> : (
        <Panel><ol className="divide-y divide-line">{page.data.items.map((event) => (
          <li key={event.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0"><p className="font-semibold text-ink">{label(event.eventType)}</p><p className="mt-0.5 text-sm text-muted">{community.name} · {event.actor?.name ?? 'CommunitySafe'} · {label(event.entityType)} #{event.entityId}</p>{eventLink(event.entityType, event.entityId) && <Link className="mt-1 inline-block text-sm font-semibold text-forest underline underline-offset-2" to={eventLink(event.entityType, event.entityId)!}>Open related record</Link>}</div>
            <time className="shrink-0 text-sm text-muted" dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
          </li>
        ))}</ol></Panel>
      )}
      {page.data && (history.length > 0 || page.data.nextCursor) && <nav className="flex justify-end gap-2" aria-label="Audit log pages">
        <Button variant="secondary" size="sm" disabled={history.length === 0} onClick={() => { const previous = [...history]; setCursor(previous.pop()); setHistory(previous) }}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={!page.data.nextCursor} onClick={() => { setHistory((values) => [...values, cursor]); setCursor(page.data?.nextCursor ?? undefined) }}>Next</Button>
      </nav>}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { Icon, type IconName } from '../components/Icon'
import { cx, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { dateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { AuditAction, AuditEvent } from '../types'

type Group = 'all' | 'setup' | 'requests' | 'signing' | 'money'

const GROUPS: { value: Group; label: string; actions: AuditAction[] }[] = [
  { value: 'all', label: 'Everything', actions: [] },
  { value: 'setup', label: 'Community & setup', actions: ['community_created', 'community_updated', 'member_added', 'signers_selected', 'signer_key_registered', 'threshold_set', 'wallet_created'] },
  { value: 'requests', label: 'Requests', actions: ['request_created', 'request_edited', 'request_rejected'] },
  { value: 'signing', label: 'Signatures', actions: ['request_signed', 'request_declined', 'threshold_reached'] },
  { value: 'money', label: 'Money in & out', actions: ['contribution_received', 'broadcast_succeeded', 'broadcast_failed'] },
]

const META: Record<AuditAction, { label: string; icon: IconName; tone: string }> = {
  community_created: { label: 'Community created', icon: 'house', tone: 'bg-sunken text-ink' },
  community_updated: { label: 'Community updated', icon: 'pen', tone: 'bg-sunken text-ink' },
  member_added: { label: 'Member added', icon: 'users', tone: 'bg-sunken text-ink' },
  signers_selected: { label: 'Signers selected', icon: 'key', tone: 'bg-teal text-teal-ink' },
  signer_key_registered: { label: 'Public key registered', icon: 'key', tone: 'bg-teal text-teal-ink' },
  threshold_set: { label: 'Approval rule set', icon: 'rule', tone: 'bg-teal text-teal-ink' },
  wallet_created: { label: 'Wallet created', icon: 'lock', tone: 'bg-forest text-white' },
  contribution_received: { label: 'Contribution received', icon: 'arrowDownLeft', tone: 'bg-ok text-ok-ink' },
  request_created: { label: 'Request created', icon: 'request', tone: 'bg-wait text-wait-ink' },
  request_edited: { label: 'Request edited', icon: 'pen', tone: 'bg-wait text-wait-ink' },
  request_signed: { label: 'Signed', icon: 'pen', tone: 'bg-forest text-white' },
  request_declined: { label: 'Declined', icon: 'x', tone: 'bg-bad text-bad-ink' },
  threshold_reached: { label: 'Approval rule met', icon: 'unlock', tone: 'bg-accent text-white' },
  request_rejected: { label: 'Request closed', icon: 'ban', tone: 'bg-sunken text-ink' },
  broadcast_succeeded: { label: 'Sent to network', icon: 'send', tone: 'bg-ok text-ok-ink' },
  broadcast_failed: { label: 'Send failed', icon: 'alert', tone: 'bg-bad text-bad-ink' },
}

function targetLink(e: AuditEvent): string | null {
  if (e.targetType === 'request') return `/app/requests/${e.targetId}`
  if (e.targetType === 'transaction') return `/app/transactions/${e.targetId}`
  return null
}

export default function Audit() {
  const { community } = useActiveCommunity()
  const events = useAsync(() => api.listAuditEvents(community.id), [community.id])
  const [group, setGroup] = useState<Group>('all')
  const actions = GROUPS.find((g) => g.value === group)?.actions ?? []
  const shown = (events.data ?? []).filter((e) => group === 'all' || actions.includes(e.action))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="A permanent record of who did what and when: who created each request, who signed or declined, and who sent each payment. Every member can read it."
      />
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Filter events" className="flex min-w-max gap-2">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              role="tab"
              aria-selected={group === g.value}
              onClick={() => setGroup(g.value)}
              className={cx('h-10 border px-4 text-sm font-semibold', group === g.value ? 'border-forest bg-forest text-white' : 'border-line-strong bg-surface hover:bg-sunken')}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {events.loading && !events.data ? (
        <LoadingBlock rows={6} label="Loading audit log" />
      ) : events.error ? (
        <ErrorState message={events.error} onRetry={events.reload} />
      ) : shown.length === 0 ? (
        <EmptyState icon="audit" title="No events here yet">Events are added automatically as people use the community wallet.</EmptyState>
      ) : (
        <ol className="relative border border-line bg-surface">
          {shown.map((e) => {
            const meta = META[e.action]
            const link = targetLink(e)
            return (
              <li key={e.id} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-line px-4 py-4 last:border-b-0 sm:grid-cols-[11rem_2.5rem_1fr] sm:px-5">
                <time dateTime={e.createdAt} className="col-span-2 mb-2 text-sm tabular text-muted sm:col-span-1 sm:mb-0 sm:pt-2">
                  {dateTime(e.createdAt)}
                </time>
                <span className={cx('flex h-10 w-10 items-center justify-center', meta.tone)}>
                  <Icon name={meta.icon} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-wider text-muted">{meta.label}</p>
                  <p className="mt-0.5 text-[15px] leading-relaxed">
                    <span className="font-semibold">{e.actorName}</span> · {e.summary}
                  </p>
                  {link && (
                    <Link to={link} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2">
                      Open <Icon name="arrowRight" size={14} />
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

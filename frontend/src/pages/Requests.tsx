import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { SignerSlotsMini } from '../components/SignerSlots'
import { RequestStatusBadge } from '../components/StatusBadge'
import { Amount, ButtonLink, cx, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { date } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { SpendingRequestStatus } from '../types'

type Filter = 'all' | SpendingRequestStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_signatures', label: 'Awaiting signatures' },
  { value: 'ready_to_broadcast', label: 'Ready to send' },
  { value: 'broadcast', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Declined' },
]

const EMPTY_TEXT: Record<Filter, string> = {
  all: 'No one has proposed a payment yet.',
  pending: 'No requests are waiting for their first signature.',
  awaiting_signatures: 'No requests are part-way through signing.',
  ready_to_broadcast: 'No fully signed requests are waiting to be sent.',
  broadcast: 'Nothing has been sent from the wallet yet.',
  failed: 'No sends have failed. Good.',
  rejected: 'No requests have been declined.',
}

export default function Requests() {
  const { community, membership } = useActiveCommunity()
  const [params, setParams] = useSearchParams()
  const filter = (FILTERS.find((f) => f.value === params.get('status'))?.value ?? 'all') as Filter
  const list = useAsync(() => api.listSpendingRequests(community.id), [community.id, membership.member.id])

  const all = list.data ?? []
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, f.value === 'all' ? all.length : all.filter((r) => r.status === f.value).length]))
  const shown = filter === 'all' ? all : all.filter((r) => r.status === filter)
  const mySignerId = membership.signer?.id

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spending requests"
        description="Every proposed payment, who proposed it and how many signers have approved it."
        actions={
          membership.isSigner ? (
            <ButtonLink to="/app/requests/new" icon="plus">
              New request
            </ButtonLink>
          ) : undefined
        }
      />

      {!membership.isSigner && (
        <Notice tone="info">
          {membership.isAdmin
            ? 'Only authorised signers can propose payments. As administrator you are not in the signer set, so you can review requests but not create or sign them.'
            : 'Only authorised signers can propose or sign payments. You can open any request to see its details and who has signed.'}
        </Notice>
      )}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Filter by status" className="flex min-w-max gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setParams(f.value === 'all' ? {} : { status: f.value })}
              className={cx(
                'h-10 border px-4 text-sm font-semibold transition-colors',
                filter === f.value ? 'border-forest bg-forest text-white' : 'border-line-strong bg-surface hover:bg-sunken',
              )}
            >
              {f.label}
              {list.data && <span className={cx('ml-1.5 tabular', filter === f.value ? 'text-white/80' : 'text-muted')}>({counts[f.value]})</span>}
            </button>
          ))}
        </div>
      </div>

      {list.loading && !list.data ? (
        <LoadingBlock rows={4} label="Loading spending requests" />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No spending requests yet' : `Nothing under “${FILTERS.find((f) => f.value === filter)?.label}”`}
          action={membership.isSigner && filter === 'all' ? <ButtonLink to="/app/requests/new" icon="plus" size="sm">New request</ButtonLink> : undefined}
        >
          {EMPTY_TEXT[filter]}
        </EmptyState>
      ) : (
        <ol className="border border-line bg-surface">
          {shown.map((r) => {
            const signed = r.signatures.filter((s) => s.decision === 'signed').length
            const declined = r.signatures.filter((s) => s.decision === 'declined').length
            const waitingOnMe =
              !!mySignerId && (r.status === 'pending' || r.status === 'awaiting_signatures') && !r.signatures.some((s) => s.signerId === mySignerId)
            return (
              <li key={r.id}>
                <Link
                  to={`/app/requests/${r.id}`}
                  className={cx(
                    'grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-2 border-b border-line px-4 py-5 last:border-b-0 hover:bg-paper sm:px-5 md:grid-cols-[3rem_1fr_auto_auto_7rem] md:items-center md:gap-x-6',
                    waitingOnMe && 'border-l-4 border-l-accent',
                  )}
                >
                  <span className="text-2xl font-extrabold tabular text-faint">{r.number}</span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug">{r.title}</span>
                    <span className="mt-0.5 block text-[15px] text-ink-soft">
                      <Amount sats={r.amountSats} className="font-semibold text-ink" /> · by {r.createdByName}
                    </span>
                    {waitingOnMe && <span className="mt-1 block text-sm font-semibold text-accent-ink">Waiting for your signature</span>}
                  </span>
                  <span className="col-start-2 md:col-start-auto">
                    <SignerSlotsMini total={r.signerCount} signed={signed} declined={declined} threshold={r.threshold} />
                  </span>
                  <span className="col-start-2 md:col-start-auto">
                    <RequestStatusBadge status={r.status} />
                  </span>
                  <span className="col-start-2 text-sm text-muted md:col-start-auto md:text-right">{date(r.createdAt)}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

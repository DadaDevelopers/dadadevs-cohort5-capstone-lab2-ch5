import { Link } from 'react-router-dom'
import * as api from '../api'
import { Icon } from '../components/Icon'
import { SignerSlotsMini } from '../components/SignerSlots'
import { ConfirmationBadge, RequestStatusBadge } from '../components/StatusBadge'
import { Amount, Avatar, Badge, BitcoinAmount, ButtonLink, cx, EmptyState, ErrorState, Notice, PageHeader, Panel, Skeleton } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { date } from '../lib/format'
import { roleLabel } from '../lib/status'
import { useAsync } from '../lib/useAsync'
import type { SpendingRequestSummary } from '../types'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const OPEN = ['pending', 'awaiting_signatures', 'ready_to_broadcast', 'failed']

function RequestRow({ r, highlight }: { r: SpendingRequestSummary; highlight?: boolean }) {
  const signed = r.signatures.filter((s) => s.decision === 'signed').length
  const declined = r.signatures.filter((s) => s.decision === 'declined').length
  return (
    <li>
      <Link
        to={`/app/requests/${r.id}`}
        className={cx('flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-paper sm:flex-row sm:items-center sm:gap-4', highlight && 'border-l-4 border-l-accent')}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.title}</p>
          <p className="text-sm text-muted">
            <Amount sats={r.amountSats} /> · #{r.number} · by {r.createdByName}
          </p>
        </div>
        <SignerSlotsMini total={r.signerCount} signed={signed} declined={declined} threshold={r.threshold} />
        <RequestStatusBadge status={r.status} />
      </Link>
    </li>
  )
}

export default function Dashboard() {
  const { user } = useSession()
  const { community, wallet, membership } = useActiveCommunity()
  const dash = useAsync(() => api.getDashboard(community.id), [community.id, membership.member.id])
  const signers = useAsync(() => api.listSigners(community.id), [community.id])

  const firstName = user?.name.split(' ')[0] ?? ''
  const d = dash.data
  const open = d?.requests.filter((r) => OPEN.includes(r.status)) ?? []
  const mySignerId = membership.signer?.id
  const needsMe = mySignerId
    ? open.filter((r) => (r.status === 'pending' || r.status === 'awaiting_signatures') && !r.signatures.some((s) => s.signerId === mySignerId))
    : []
  const readyToSend = open.filter((r) => r.status === 'ready_to_broadcast' || r.status === 'failed')
  const w = d?.wallet ?? wallet
  const available = w.confirmedBalanceSats - w.reservedSats
  const signerList = signers.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={<>Here is what is happening with <span className="font-semibold text-ink">{community.name}</span>. You are viewing as <span className="font-semibold text-ink">{roleLabel(membership)}</span>.</>}
        actions={membership.isAdmin ? <ButtonLink to="/app/requests/new" icon="send">Propose a payment</ButtonLink> : undefined}
      />

      {dash.error && !d ? (
        <ErrorState message={dash.error} onRetry={dash.reload} title="The dashboard could not be loaded" />
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]" aria-label="Wallet and approval summary">
            {!d ? (
              <><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></>
            ) : (
              <>
                <div className="min-w-0 rounded-xl bg-forest p-6 text-white shadow-sm sm:p-8">
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-line">Available to spend</p>
                  <BitcoinAmount sats={available} className="mt-5" />
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">Confirmed funds not reserved by an open spending request.</p>
                  <dl className="mt-8 grid gap-4 border-t border-white/20 pt-5 sm:grid-cols-3">
                    <div className="min-w-0"><dt className="text-xs font-semibold text-white/60">Confirmed</dt><dd className="mt-1"><BitcoinAmount sats={w.confirmedBalanceSats} size="compact" /></dd></div>
                    <div className="min-w-0"><dt className="text-xs font-semibold text-white/60">Reserved</dt><dd className="mt-1"><BitcoinAmount sats={w.reservedSats} size="compact" /></dd></div>
                    <div className="min-w-0"><dt className="text-xs font-semibold text-white/60">Arriving</dt><dd className="mt-1"><BitcoinAmount sats={w.unconfirmedIncomingSats} size="compact" /></dd></div>
                  </dl>
                </div>
                <Panel title="Approval rule" bodyClassName="p-6">
                  <div className="flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular">{w.threshold}</span><span className="text-lg font-bold text-muted">of {w.signerCount}</span></div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">Authorised signers must approve every payment before it can be sent.</p>
                  <div className="mt-5 border-t border-line pt-5">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Authorised signers</p>
                    {signers.loading && !signers.data ? <Skeleton className="mt-3 h-12" /> : signers.error ? <p className="mt-3 text-sm text-bad-ink">Signer details are temporarily unavailable.</p> : (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {signerList.map((signer) => (
                          <li key={signer.id} className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-paper py-1 pl-1 pr-3">
                            <Avatar name={signer.name} size={28} />
                            <span className="max-w-32 truncate text-sm font-semibold">{signer.name}</span>
                            <Badge tone={signer.status === 'ready' ? 'ok' : 'wait'} className="h-6 px-2 text-[11px]">{signer.status === 'ready' ? 'Ready' : 'Key needed'}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Panel>
              </>
            )}
          </section>

          {d && membership.isSigner && needsMe.length > 0 && (
            <section className="border-2 border-accent bg-surface" aria-labelledby="needs-me">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-wait/60 px-5 py-4">
                <h2 id="needs-me" className="flex items-center gap-2 text-[17px] font-bold">
                  <Icon name="pen" size={20} />
                  Waiting for your signature
                  <span className="bg-accent px-2 py-0.5 text-sm text-white">{needsMe.length}</span>
                </h2>
                <p className="text-sm text-ink-soft">Review each one carefully. Signing cannot be undone.</p>
              </div>
              <ul>
                {needsMe.map((r) => (
                  <RequestRow key={r.id} r={r} highlight />
                ))}
              </ul>
            </section>
          )}
          {d && readyToSend.length > 0 && (
            <Notice
              tone={readyToSend.some((r) => r.status === 'failed') ? 'bad' : 'info'}
              title={readyToSend.some((r) => r.status === 'failed') ? 'A payment could not be sent' : 'A payment is ready to send'}
              action={<ButtonLink to={`/app/requests/${readyToSend[0].id}`} size="sm" variant="secondary">Open request</ButtonLink>}
            >
              {readyToSend[0].title} has all the signatures it needs.{' '}
              {readyToSend[0].status === 'failed' ? 'The last attempt failed and an administrator can retry it. Its signatures are kept.' : 'A community administrator can now broadcast it.'}
            </Notice>
          )}

          <div className="grid gap-6 xl:grid-cols-5">
            <Panel
              className="xl:col-span-3"
              title="Recent activity"
              action={
                <Link to="/app/transactions" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                  View all <Icon name="arrowRight" size={16} />
                </Link>
              }
            >
              {!d ? (
                <div className="flex flex-col gap-3 p-5">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : d.recentHistory.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon="transfer" title="No transactions yet" action={<ButtonLink to="/app/wallet" size="sm" variant="secondary" icon="receive">Show receiving address</ButtonLink>}>
                    Share the community address to receive the first contribution.
                  </EmptyState>
                </div>
              ) : (
                <ul>
                  {d.recentHistory.map((h) => (
                    <li key={h.txid}>
                      <Link to={`/app/transactions/${h.txid}`} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-paper">
                        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', h.direction === 'incoming' ? 'bg-ok text-ok-ink' : 'bg-wait text-wait-ink')}><Icon name={h.direction === 'incoming' ? 'arrowDownLeft' : 'arrowUpRight'} size={18} /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{h.direction === 'incoming' ? 'Received' : 'Payment'}</span><span className="block truncate text-sm text-muted">{date(h.at)} · {h.label}</span></span>
                        <span className="flex shrink-0 flex-col items-end gap-1"><Amount sats={h.amountSats} sign={h.direction === 'incoming' ? '+' : '-'} className={cx('font-bold', h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink')} /><ConfirmationBadge confirmations={h.confirmations} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              className="xl:col-span-2"
              title="Open spending requests"
              action={
                <Link to="/app/requests" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                  View all <Icon name="arrowRight" size={16} />
                </Link>
              }
            >
              {!d ? (
                <div className="flex flex-col gap-3 p-5">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : open.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No open requests" action={membership.isAdmin ? <ButtonLink to="/app/requests/new" icon="plus" size="sm">New request</ButtonLink> : undefined}>
                    When an administrator creates a payment request it will appear here with its signing progress.
                  </EmptyState>
                </div>
              ) : (
                <ul>
                  {open.slice(0, 4).map((r) => <RequestRow key={r.id} r={r} />)}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

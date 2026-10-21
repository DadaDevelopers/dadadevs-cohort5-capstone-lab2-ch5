import { Link } from 'react-router-dom'
import * as api from '../api'
import { Icon } from '../components/Icon'
import { SignerSlotsMini } from '../components/SignerSlots'
import { ConfirmationBadge, RequestStatusBadge } from '../components/StatusBadge'
import { Amount, ButtonLink, cx, EmptyState, ErrorState, Notice, Panel, Skeleton } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { date, relative } from '../lib/format'
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-extrabold leading-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-[15px] text-ink-soft">
          Here is what is happening with <span className="font-semibold text-ink">{community.name}</span>. You are viewing as{' '}
          <span className="font-semibold text-ink">{roleLabel(membership)}</span>.
        </p>
      </header>

      {dash.error && !d ? (
        <ErrorState message={dash.error} onRetry={dash.reload} title="The dashboard could not be loaded" />
      ) : (
        <>
          <section className="grid border border-line bg-surface sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
            {!d ? (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="border-b border-line p-6 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-4 h-8 w-32" />
                  <Skeleton className="mt-3 h-4 w-28" />
                </div>
              ))
            ) : (
              <>
                <div className="border-b border-line p-6 sm:border-r xl:border-b-0">
                  <p className="text-sm font-semibold text-muted">Wallet balance</p>
                  <p className="mt-2 text-[28px] font-extrabold leading-none">
                    <Amount sats={w.confirmedBalanceSats} />
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">
                    <Amount sats={available} /> free to spend
                    {w.unconfirmedIncomingSats > 0 && (
                      <>
                        {' · '}+<Amount sats={w.unconfirmedIncomingSats} /> arriving
                      </>
                    )}
                  </p>
                </div>
                <div className="border-b border-line p-6 xl:border-b-0 xl:border-r">
                  <p className="text-sm font-semibold text-muted">Approval rule</p>
                  <p className="mt-2 text-[28px] font-extrabold leading-none tabular">
                    {w.threshold} of {w.signerCount}
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">signers must approve each payment</p>
                </div>
                <div className="border-b border-line p-6 sm:border-b-0 sm:border-r">
                  <p className="text-sm font-semibold text-muted">Open requests</p>
                  <p className="mt-2 text-[28px] font-extrabold leading-none tabular text-accent-ink">{open.length}</p>
                  <p className="mt-2 text-sm text-ink-soft">
                    {mySignerId ? `${needsMe.length} waiting for your signature` : 'being reviewed by signers'}
                  </p>
                </div>
                <div className="p-6">
                  <p className="text-sm font-semibold text-muted">Members</p>
                  <p className="mt-2 text-[28px] font-extrabold leading-none tabular">{d.memberCount}</p>
                  <p className="mt-2 text-sm text-ink-soft">{w.signerCount} of them are authorised signers</p>
                </div>
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
          {d && membership.isSigner && needsMe.length === 0 && open.length > 0 && (
            <Notice tone="ok" title="Nothing needs your signature right now">You have signed or responded to every open request.</Notice>
          )}
          {d && !membership.isSigner && (
            <Notice tone="info" title={membership.isAdmin ? 'You manage the community, but you do not sign' : 'You can follow everything, but you do not sign'}>
              {membership.isAdmin
                ? `Spending needs ${w.threshold} of the ${w.signerCount} authorised signers. As administrator you have no override and cannot create or approve payments.`
                : `Payments are proposed and approved by the ${w.signerCount} authorised signers. You can see every request, who signed it, and where the money went.`}
            </Notice>
          )}
          {d && readyToSend.length > 0 && (
            <Notice
              tone={readyToSend.some((r) => r.status === 'failed') ? 'bad' : 'info'}
              title={readyToSend.some((r) => r.status === 'failed') ? 'A payment could not be sent' : 'A payment is ready to send'}
              action={<ButtonLink to={`/app/requests/${readyToSend[0].id}`} size="sm" variant="secondary">Open request</ButtonLink>}
            >
              {readyToSend[0].title} has all the signatures it needs.{' '}
              {readyToSend[0].status === 'failed' ? 'The last attempt failed and can be retried. Its signatures are kept.' : 'Any signer can now send it.'}
            </Notice>
          )}

          <div className="grid gap-6 xl:grid-cols-5">
            <Panel
              className="xl:col-span-3"
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
                  <EmptyState
                    title="No open requests"
                    action={membership.isSigner ? <ButtonLink to="/app/requests/new" icon="plus" size="sm">New request</ButtonLink> : undefined}
                  >
                    When a signer proposes a payment it will appear here with its signing progress.
                  </EmptyState>
                </div>
              ) : (
                <ul>
                  {open.map((r) => (
                    <RequestRow key={r.id} r={r} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              className="xl:col-span-2"
              title="Recent transactions"
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
                        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center', h.direction === 'incoming' ? 'bg-ok text-ok-ink' : 'bg-wait text-wait-ink')}>
                          <Icon name={h.direction === 'incoming' ? 'arrowDownLeft' : 'arrowUpRight'} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{h.direction === 'incoming' ? 'Received' : 'Payment'}</span>
                          <span className="block truncate text-sm text-muted">
                            {date(h.at)} · {h.label}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <Amount sats={h.amountSats} sign={h.direction === 'incoming' ? '+' : '-'} className={cx('font-bold', h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink')} />
                          <ConfirmationBadge confirmations={h.confirmations} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {d && d.recentContributions.length > 0 && (
            <Panel
              title="Latest contributions"
              action={
                <Link to="/app/wallet" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                  Wallet <Icon name="arrowRight" size={16} />
                </Link>
              }
            >
              <ul className="grid sm:grid-cols-2 xl:grid-cols-4">
                {d.recentContributions.map((c) => (
                  <li key={c.id} className="border-b border-line p-5 sm:border-r xl:border-b-0 xl:last:border-r-0">
                    <Amount sats={c.amountSats} sign="+" className="text-lg font-bold text-ok-ink" />
                    <p className="mt-1 truncate text-sm text-ink-soft">{c.label ?? 'Contribution'}</p>
                    <p className="mt-0.5 text-xs text-muted">{relative(c.receivedAt)}</p>
                    <div className="mt-3">
                      <ConfirmationBadge confirmations={c.confirmations} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

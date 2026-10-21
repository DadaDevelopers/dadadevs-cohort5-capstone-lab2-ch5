import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { Icon } from '../components/Icon'
import { ConfirmationBadge } from '../components/StatusBadge'
import { Amount, ButtonLink, CopyField, cx, EmptyState, ErrorState, KeyValue, LoadingBlock, Notice, PageHeader, Panel } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { dateTime, date, shortHash } from '../lib/format'
import { confirmationText } from '../lib/status'
import { useAsync } from '../lib/useAsync'

type Kind = 'all' | 'incoming' | 'outgoing'

export function Transactions() {
  const { community } = useActiveCommunity()
  const [params, setParams] = useSearchParams()
  const kind = (['incoming', 'outgoing'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as Kind
  const list = useAsync(() => api.listTransactions(community.id), [community.id])
  const rows = (list.data ?? []).filter((h) => kind === 'all' || h.direction === kind)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="Everything that has entered or left the community wallet, with its status on the Bitcoin network."
        actions={
          <label className="flex items-center gap-2">
            <span className="sr-only">Filter by type</span>
            <select
              value={kind}
              onChange={(e) => setParams(e.target.value === 'all' ? {} : { type: e.target.value })}
              className="h-11 border border-line-strong bg-surface px-3 text-[15px] font-semibold outline-none focus:border-ink"
            >
              <option value="all">All types</option>
              <option value="incoming">Received</option>
              <option value="outgoing">Payments</option>
            </select>
          </label>
        }
      />

      {list.loading && !list.data ? (
        <LoadingBlock rows={5} label="Loading transactions" />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon="transfer" title={kind === 'all' ? 'No transactions yet' : 'Nothing of this type yet'} action={<ButtonLink to="/app/wallet" size="sm" variant="secondary" icon="receive">Receiving address</ButtonLink>}>
          Contributions appear here as soon as the node sees them. Payments appear once a fully signed request is sent.
        </EmptyState>
      ) : (
        <div className="border border-line bg-surface">
          <div className="hidden grid-cols-[9rem_1fr_10rem_11rem] gap-4 border-b border-line bg-sunken px-5 py-3 text-sm font-bold md:grid">
            <span>Date</span>
            <span>Type</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Status</span>
          </div>
          <ul>
            {rows.map((h) => (
              <li key={h.txid}>
                <Link to={`/app/transactions/${h.txid}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-line px-5 py-4 last:border-b-0 hover:bg-paper md:grid-cols-[9rem_1fr_10rem_11rem] md:items-center">
                  <span className="order-3 text-sm text-muted md:order-none md:text-[15px] md:text-ink">{date(h.at)}</span>
                  <span className="order-1 min-w-0 md:order-none">
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon name={h.direction === 'incoming' ? 'arrowDownLeft' : 'arrowUpRight'} size={18} className={h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink'} />
                      {h.direction === 'incoming' ? 'Received' : 'Payment'}
                    </span>
                    <span className="block truncate text-sm text-muted">{h.label}</span>
                  </span>
                  <Amount sats={h.amountSats} sign={h.direction === 'incoming' ? '+' : '-'} className={cx('order-2 text-right font-bold md:order-none', h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink')} />
                  <span className="order-4 flex justify-end md:order-none">
                    <ConfirmationBadge confirmations={h.confirmations} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function TransactionDetail() {
  const { txid = '' } = useParams()
  const { community } = useActiveCommunity()
  const tx = useAsync(() => api.getTransaction(community.id, txid), [community.id, txid])
  const h = tx.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Transaction"
        title={h ? (h.direction === 'incoming' ? 'Contribution received' : 'Payment sent') : 'Transaction'}
        back="/app/transactions"
        actions={
          h && (
            <button type="button" onClick={tx.reload} className="inline-flex h-11 items-center gap-2 border border-line-strong bg-surface px-4 text-[15px] font-semibold hover:bg-sunken">
              <Icon name="refresh" size={18} /> Refresh status
            </button>
          )
        }
      />
      {tx.loading && !h ? (
        <LoadingBlock rows={3} label="Loading transaction" />
      ) : tx.error || !h ? (
        <ErrorState title="Transaction not found" message={tx.error ?? 'Not found'} onRetry={tx.reload} />
      ) : (
        <>
          <section className="grid border border-line bg-surface md:grid-cols-3">
            <div className="border-b border-line p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-muted">Amount</p>
              <Amount sats={h.amountSats} sign={h.direction === 'incoming' ? '+' : '-'} className={cx('mt-1 block text-3xl font-extrabold', h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink')} />
            </div>
            <div className="border-b border-line p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-muted">Status</p>
              <p className="mt-1 text-xl font-bold">{h.confirmations > 0 ? 'Confirmed' : 'In the mempool'}</p>
              <p className="text-sm text-ink-soft">{confirmationText(h.confirmations)}</p>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-muted">Confirmation progress</p>
              <div className="mt-3 flex gap-1" aria-label={`${Math.min(h.confirmations, 6)} of 6 confirmations`}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className={cx('h-6 flex-1', i < h.confirmations ? 'bg-forest' : 'border border-dashed border-line-strong')} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Six confirmations is the usual point at which a payment is treated as final.</p>
            </div>
          </section>

          {h.confirmations === 0 && (
            <Notice tone="warn" title="Waiting for the first confirmation">
              The transaction is known to the network but not yet in a block. On this simulated regtest chain a block arrives every minute.
            </Notice>
          )}

          <Panel title="Details">
            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <CopyField label="Transaction ID (txid)" value={h.txid} />
              {h.counterpartyAddress && <CopyField label="Paid to" value={h.counterpartyAddress} />}
              <dl className="grid gap-5 sm:grid-cols-3">
                <KeyValue label={h.direction === 'incoming' ? 'Received' : 'Sent'}>{dateTime(h.at)}</KeyValue>
                <KeyValue label="Block height">{h.blockHeight !== null ? h.blockHeight.toLocaleString('en-GB') : 'Not in a block yet'}</KeyValue>
                <KeyValue label="Network fee">{h.feeSats !== null ? <Amount sats={h.feeSats} /> : 'Paid by the sender'}</KeyValue>
                <KeyValue label="Description">{h.label}</KeyValue>
                {h.requestId && (
                  <KeyValue label="Spending request">
                    <Link to={`/app/requests/${h.requestId}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                      Open request <Icon name="arrowRight" size={16} />
                    </Link>
                  </KeyValue>
                )}
              </dl>
              <p className="text-sm text-muted">
                Regtest transactions only exist on the development node, so they cannot be looked up on public block explorers. Short form: <span className="font-mono">{shortHash(h.txid)}</span>
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

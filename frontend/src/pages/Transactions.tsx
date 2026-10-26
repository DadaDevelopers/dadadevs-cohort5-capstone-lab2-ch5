import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { Icon } from '../components/Icon'
import { ConfirmationBadge } from '../components/StatusBadge'
import { Amount, ButtonLink, CopyField, cx, EmptyState, ErrorState, KeyValue, LoadingBlock, Notice, PageHeader, Panel } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { dateTime, date, sats, shortHash } from '../lib/format'
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
          <label className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
            <span className="text-sm font-semibold text-ink-soft">Filter</span>
            <select
              value={kind}
              onChange={(e) => setParams(e.target.value === 'all' ? {} : { type: e.target.value })}
              aria-label="Filter transactions by type"
              className="h-11 min-w-[10.5rem] border border-line-strong bg-surface px-3 text-[15px] font-semibold outline-none focus:border-ink"
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
          <div className="hidden grid-cols-[8.5rem_minmax(0,1fr)_11.5rem_12.5rem] items-center gap-4 border-b border-line bg-sunken px-5 py-3 text-sm font-bold md:grid">
            <span>Date</span>
            <span>Type</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Status</span>
          </div>
          <ul>
            {rows.map((h) => (
              <li key={h.txid}>
                <Link
                  to={`/app/transactions/${h.txid}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b border-line px-4 py-4 last:border-b-0 hover:bg-paper sm:px-5 md:grid-cols-[8.5rem_minmax(0,1fr)_11.5rem_12.5rem] md:items-center"
                >
                  <span className="col-start-1 row-start-2 text-sm text-muted md:col-start-auto md:row-start-auto md:text-[15px] md:text-ink">{date(h.at)}</span>
                  <span className="col-start-1 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon name={h.direction === 'incoming' ? 'arrowDownLeft' : 'arrowUpRight'} size={18} className={h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink'} />
                      {h.direction === 'incoming' ? 'Received' : 'Payment'}
                    </span>
                    <span className="block truncate text-sm text-muted">{h.label}</span>
                  </span>
                  <span className="col-start-2 row-start-1 min-w-0 justify-self-end text-right md:col-start-auto md:row-start-auto">
                    <Amount sats={h.amountSats} sign={h.direction === 'incoming' ? '+' : '-'} className={cx('font-bold', h.direction === 'incoming' ? 'text-ok-ink' : 'text-bad-ink')} />
                  </span>
                  <span className="col-start-2 row-start-2 flex min-w-0 justify-end md:col-start-auto md:row-start-auto">
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
  const outgoing = h?.direction === 'outgoing'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Transaction"
        title={h ? (outgoing ? 'Community payment' : 'Contribution received') : 'Transaction'}
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
          <section className="grid border border-line bg-surface md:grid-cols-3" aria-label="Transaction summary">
            <div className="min-w-0 border-b border-line p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-muted">{outgoing ? 'Sent to recipient' : 'Amount received'}</p>
              <Amount sats={h.amountSats} sign={outgoing ? '-' : '+'} className={cx('mt-1 block text-3xl font-extrabold', outgoing ? 'text-bad-ink' : 'text-ok-ink')} />
              <p className="mt-1 text-sm text-muted">{sats(h.amountSats)}</p>
              {outgoing && h.recipientCount > 1 && (
                <p className="mt-1 text-sm text-muted">Combined across {h.recipientCount} recipient outputs.</p>
              )}
            </div>
            <div className="min-w-0 border-b border-line p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-muted">Status</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ConfirmationBadge confirmations={h.confirmations} />
                <span className="text-sm text-ink-soft">{confirmationText(h.confirmations)}</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{h.confirmations > 0 ? 'Mined on the Regtest chain' : 'Waiting in the mempool'}</p>
            </div>
            <div className="min-w-0 p-6">
              <p className="text-sm font-semibold text-muted">Confirmation progress</p>
              <div className="mt-3 flex gap-1" aria-label={`${Math.max(0, Math.min(h.confirmations, 6))} of 6 confirmations`}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className={cx('h-6 flex-1', i < h.confirmations ? 'bg-forest' : 'border border-dashed border-line-strong')} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Six confirmations is the usual point at which a payment is treated as final.</p>
            </div>
          </section>

          {h.confirmations === 0 && (
            <Notice tone="warn" title="Waiting for the first confirmation">
              Bitcoin Core knows the transaction, but it is not yet in a mined Regtest block. Refresh after mining a block to update its status.
            </Notice>
          )}

          {outgoing && h.requestId === null && (
            <Notice tone="info" title="Not linked to a spending request">
              Bitcoin Core shows this transaction leaving the community wallet, so it is classified as outgoing. No stored spending request matches its transaction ID.
            </Notice>
          )}

          <Panel title="Details">
            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <CopyField label="Transaction ID (txid)" value={h.txid} />
              {outgoing && h.recipients.length === 1 && (
                <CopyField label="Recipient Bitcoin address" value={h.recipients[0].address} />
              )}
              {outgoing && h.recipients.length > 1 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-muted">Recipients</p>
                  {h.recipients.map((recipient) => (
                    <div key={recipient.address} className="flex flex-col gap-1 border border-line bg-paper p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <code className="min-w-0 break-all font-mono text-[13px] leading-relaxed">{recipient.address}</code>
                      <Amount sats={recipient.amountSats} showSats className="shrink-0 font-semibold" />
                    </div>
                  ))}
                </div>
              )}
              {outgoing && h.recipients.length === 0 && h.counterpartyAddress && (
                <CopyField label="Recipient Bitcoin address" value={h.counterpartyAddress} />
              )}
              {outgoing && h.recipients.length === 0 && !h.counterpartyAddress && (
                <KeyValue label="Recipient">The node did not report a recipient address for this transaction.</KeyValue>
              )}
              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label={outgoing ? 'Sent on' : 'Received on'}>{dateTime(h.at)}</KeyValue>
                <KeyValue label="Block height">
                  {h.blockHeight !== null ? h.blockHeight.toLocaleString('en-GB') : h.confirmations > 0 ? 'Unavailable' : 'Not in a block yet'}
                </KeyValue>
                <KeyValue label="Network">Regtest</KeyValue>
                <KeyValue label="Network fee">
                  {outgoing
                    ? h.feeSats !== null ? <Amount sats={h.feeSats} showSats /> : 'Not reported by the node'
                    : 'Paid by the sender'}
                </KeyValue>
                {outgoing && (
                  <KeyValue label="Change returned to the community wallet">
                    {h.changeSats > 0 ? <Amount sats={h.changeSats} showSats /> : 'No change output'}
                  </KeyValue>
                )}
                {outgoing && (
                  <KeyValue label="Total wallet debit (payment + fee)">
                    {h.totalDebitSats !== null ? <Amount sats={h.totalDebitSats} showSats /> : 'Unavailable'}
                  </KeyValue>
                )}
                {outgoing && (
                  <KeyValue label="Spending request">
                    {h.requestId ? (
                      <Link to={`/app/requests/${h.requestId}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                        Payment request #{h.requestId} <Icon name="arrowRight" size={16} />
                      </Link>
                    ) : 'Not linked to a stored request'}
                  </KeyValue>
                )}
                <KeyValue label="Description">{h.label}</KeyValue>
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

import { QRCodeSVG } from 'qrcode.react'
import { useLocation } from 'react-router-dom'
import * as api from '../api'
import { Icon } from '../components/Icon'
import { ConfirmationBadge, NetworkBadge } from '../components/StatusBadge'
import { Amount, BitcoinAmount, Button, ButtonLink, CopyField, EmptyState, ErrorState, KeyValue, LoadingBlock, Notice, PageHeader, Panel, Skeleton } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { date, dateTime, sats, shortHash } from '../lib/format'
import { confirmationText } from '../lib/status'
import { useAsync } from '../lib/useAsync'
import { Link } from 'react-router-dom'

export default function WalletPage() {
  const location = useLocation()
  const justCreated = (location.state as { created?: boolean } | null)?.created === true
  const { community, membership } = useActiveCommunity()
  const wallet = useAsync(() => api.getWallet(community.id), [community.id])
  const contributions = useAsync(() => api.listContributions(community.id), [community.id])
  const requests = useAsync(() => api.listSpendingRequests(community.id), [community.id])

  const w = wallet.data
  const reserved = requests.data ? api.reservedByRequests(requests.data) : null
  const reload = () => {
    wallet.reload()
    contributions.reload()
    requests.reload()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Wallet"
        description="The community’s shared Bitcoin wallet. Anyone can send money in. Money only goes out with the approval rule."
        eyebrow={w ? <NetworkBadge network={w.network} /> : undefined}
        actions={
          <>
            <Button type="button" onClick={reload} variant="secondary" icon="refresh">Refresh</Button>
            {membership.isAdmin && (
              <ButtonLink to="/app/requests/new" icon="send">
                Propose a payment
              </ButtonLink>
            )}
          </>
        }
      />

      {justCreated && (
        <Notice tone="ok" title="Your community wallet is ready">
          Share the receiving address below with contributors. The signer set and approval rule are now fixed.
        </Notice>
      )}

      {wallet.error && !w ? (
        <ErrorState message={wallet.error} onRetry={wallet.reload} title="The wallet could not be loaded" />
      ) : !w ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64 lg:col-span-3" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:col-span-5">
            <div className="flex items-center gap-4 border-b border-line p-6">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-forest text-2xl font-extrabold text-white" aria-hidden="true">
                ₿
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-muted">Confirmed balance</p>
                <BitcoinAmount sats={w.confirmedBalanceSats} className="mt-2" />
                <p className="text-sm tabular text-muted">{sats(w.confirmedBalanceSats)}</p>
              </div>
            </div>
            <dl className="grid gap-5 p-6 sm:grid-cols-2">
              <KeyValue label="Available to spend">
                {reserved === null ? <span className="text-muted">Loading…</span> : <BitcoinAmount sats={Math.max(0, w.confirmedBalanceSats - reserved)} size="compact" />}
              </KeyValue>
              <KeyValue label="Reserved for open requests">
                {reserved === null ? <span className="text-muted">Loading…</span> : <BitcoinAmount sats={reserved} size="compact" />}
              </KeyValue>
              <KeyValue label="Arriving (unconfirmed)">
                <BitcoinAmount sats={w.unconfirmedIncomingSats} size="compact" />
              </KeyValue>
              <KeyValue label="Approval rule">
                <span className="font-semibold">{w.threshold} of {w.signerCount} signers</span>
              </KeyValue>
              <KeyValue label="Network">
                <span className="font-mono text-sm uppercase">{w.network}</span>
              </KeyValue>
              <KeyValue label="Created">{w.createdAt ? date(w.createdAt) : '–'}</KeyValue>
            </dl>
            {!membership.isSigner && (
              <p className="mt-auto border-t border-line px-6 py-4 text-sm text-ink-soft">
                {membership.isAdmin
                  ? 'You can create payments as administrator, but only wallet signers can add Bitcoin signatures.'
                  : 'Only administrators can create payments and only authorised signers can sign them. You can see every movement of funds.'}
              </p>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-7" aria-labelledby="receive-heading">
            <div className="flex items-center gap-2 border-b border-line px-6 py-4">
              <Icon name="receive" size={20} />
              <h2 id="receive-heading" className="text-[17px] font-bold">Receive Bitcoin</h2>
            </div>
            {w.receiveAddress ? (
              <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
                <div className="flex min-w-0 flex-col gap-4">
                  <CopyField label="Community receiving address" value={w.receiveAddress} />
                  <p className="text-[15px] leading-relaxed text-ink-soft">
                    Anyone can send test Bitcoin to this address. It belongs to the whole community: spending from it needs {w.threshold} of the {w.signerCount} signers.
                  </p>
                  <Notice tone="warn">This is a {w.network === 'regtest' ? 'Regtest' : 'Signet'} test address. Test coins have no monetary value. Do not send real Bitcoin to it; it would be lost.</Notice>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-2 self-start rounded-xl border border-line bg-white p-3">
                  <QRCodeSVG value={`bitcoin:${w.receiveAddress}`} size={168} level="M" marginSize={1} title="QR code of the community receiving address" />
                  <span className="text-xs text-muted">Scan to pay</span>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <EmptyState icon="wallet" title="No address yet">The address appears once the wallet is created.</EmptyState>
              </div>
            )}
          </section>
        </div>
      )}

      <Panel title="Incoming contributions">
        {contributions.loading && !contributions.data ? (
          <div className="p-5">
            <LoadingBlock rows={3} label="Loading contributions" />
          </div>
        ) : contributions.error ? (
          <div className="p-5">
            <ErrorState message={contributions.error} onRetry={contributions.reload} />
          </div>
        ) : (contributions.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState icon="receive" title="No contributions yet">
              When someone sends Bitcoin to the address above it shows up here, first as unconfirmed and then with its confirmations.
            </EmptyState>
          </div>
        ) : (
          <ul>
            {(contributions.data ?? []).map((c) => (
              <li key={c.id}>
                <Link to={`/app/transactions/${c.txid}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-line px-5 py-4 last:border-b-0 hover:bg-paper sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ok text-ok-ink">
                    <Icon name="arrowDownLeft" size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.label ?? 'Contribution'}</span>
                    <span className="block truncate text-sm text-muted">
                      {dateTime(c.receivedAt)} · <span className="font-mono">{shortHash(c.txid, 8, 6)}</span>
                    </span>
                  </span>
                  <span className="col-start-2 justify-self-end text-right sm:col-start-auto">
                    <Amount sats={c.amountSats} sign="+" className="font-bold text-ok-ink" />
                  </span>
                  <span className="col-start-2 flex flex-col items-start gap-1 justify-self-end text-right sm:col-start-auto sm:items-end">
                    <ConfirmationBadge confirmations={c.confirmations} />
                    <span className="text-xs text-muted">{confirmationText(c.confirmations)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-sm text-muted">Balances come from the configured Bitcoin Core {w?.network === 'signet' ? 'Signet' : 'Regtest'} wallet. Use Refresh after mining or receiving a transaction.</p>
    </div>
  )
}

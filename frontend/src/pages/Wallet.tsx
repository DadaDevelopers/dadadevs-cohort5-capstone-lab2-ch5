import { QRCodeSVG } from 'qrcode.react'
import { useLocation } from 'react-router-dom'
import * as api from '../api'
import { Icon } from '../components/Icon'
import { ConfirmationBadge } from '../components/StatusBadge'
import { Amount, ButtonLink, CopyField, EmptyState, ErrorState, KeyValue, LoadingBlock, Notice, PageHeader, Panel, Skeleton } from '../components/ui'
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

  const w = wallet.data
  const reload = () => {
    wallet.reload()
    contributions.reload()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Wallet"
        description="The community’s shared Bitcoin wallet. Anyone can send money in. Money only goes out with the approval rule."
        actions={
          <>
            <button type="button" onClick={reload} className="inline-flex h-11 items-center gap-2 border border-line-strong bg-surface px-4 text-[15px] font-semibold hover:bg-sunken">
              <Icon name="refresh" size={18} /> Refresh
            </button>
            {membership.isSigner && (
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
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="flex flex-col border border-line bg-surface lg:col-span-2">
            <div className="flex items-center gap-4 border-b border-line p-6">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center bg-accent text-2xl font-extrabold text-white" aria-hidden="true">
                ₿
              </span>
              <div>
                <p className="text-sm font-semibold text-muted">Balance</p>
                <p className="text-3xl font-extrabold leading-tight">
                  <Amount sats={w.confirmedBalanceSats} />
                </p>
                <p className="text-sm tabular text-muted">{sats(w.confirmedBalanceSats)}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-5 p-6">
              <KeyValue label="Free to spend">
                <Amount sats={w.confirmedBalanceSats - w.reservedSats} className="font-semibold" />
              </KeyValue>
              <KeyValue label="Held for open requests">
                <Amount sats={w.reservedSats} className="font-semibold" />
              </KeyValue>
              <KeyValue label="Arriving (unconfirmed)">
                <Amount sats={w.unconfirmedIncomingSats} className="font-semibold" />
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
                  ? 'You are not in the signer set, so you cannot propose or approve payments. That is by design.'
                  : 'Only authorised signers can propose or approve payments. You can see every movement of funds.'}
              </p>
            )}
          </section>

          <section className="border border-line bg-surface lg:col-span-3" aria-labelledby="receive-heading">
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
                  <Notice tone="warn">This is a regtest address. Do not send real Bitcoin to it; it would be lost.</Notice>
                </div>
                <div className="flex flex-col items-center gap-2 self-start border border-line p-3">
                  <QRCodeSVG value={`bitcoin:${w.receiveAddress.toUpperCase()}`} size={168} level="M" marginSize={1} title="QR code of the community receiving address" />
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
                <Link to={`/app/transactions/${c.txid}`} className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-paper sm:grid-cols-[auto_1fr_auto_auto]">
                  <span className="flex h-10 w-10 items-center justify-center bg-ok text-ok-ink">
                    <Icon name="arrowDownLeft" size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.label ?? 'Contribution'}</span>
                    <span className="block truncate text-sm text-muted">
                      {dateTime(c.receivedAt)} · <span className="font-mono">{shortHash(c.txid, 8, 6)}</span>
                    </span>
                  </span>
                  <span className="col-start-2 sm:col-start-auto">
                    <Amount sats={c.amountSats} sign="+" className="font-bold text-ok-ink" />
                  </span>
                  <span className="col-start-2 flex flex-col items-start gap-1 sm:col-start-auto sm:items-end">
                    <ConfirmationBadge confirmations={c.confirmations} />
                    <span className="text-xs text-muted">{confirmationText(c.confirmations)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-sm text-muted">A new regtest block is simulated every minute, so confirmations increase while you watch. Use Refresh to update.</p>
    </div>
  )
}

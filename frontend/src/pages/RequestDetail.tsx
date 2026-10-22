import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import { Icon } from '../components/Icon'
import { SignerSlots } from '../components/SignerSlots'
import { RequestStatusBadge } from '../components/StatusBadge'
import { Amount, Avatar, Badge, Button, ButtonLink, CopyField, cx, ErrorState, KeyValue, LoadingBlock, Modal, Notice, PageHeader, Panel, TextArea } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { date, dateTime, sats, shortHash } from '../lib/format'
import { confirmationText, requestStatusMeta } from '../lib/status'
import { useAsync } from '../lib/useAsync'
import type { Membership, SpendingRequestDetail } from '../types'

function SignModal({ detail, open, onClose, onSigned }: { detail: SpendingRequestDetail; open: boolean; onClose: () => void; onSigned: (d: SpendingRequestDetail) => void }) {
  const r = detail.request
  const signed = detail.signatures.filter((s) => s.decision === 'signed').length
  const [checked, setChecked] = useState(false)
  const [stage, setStage] = useState<'review' | 'signing' | 'done'>('review')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SpendingRequestDetail | null>(null)

  const close = () => {
    if (stage === 'signing') return
    if (result) onSigned(result)
    setStage('review')
    setChecked(false)
    setError(null)
    setResult(null)
    onClose()
  }

  const sign = async () => {
    setStage('signing')
    setError(null)
    try {
      const d = await api.signTransaction(r.id)
      setResult(d)
      setStage('done')
    } catch (err) {
      setError(errorMessage(err))
      setStage('review')
    }
  }

  const after = result ? result.signatures.filter((s) => s.decision === 'signed').length : signed

  return (
    <Modal open={open} onClose={close} title={stage === 'done' ? 'Signature added' : 'You’re about to sign this transaction'}>
      {stage === 'done' && result ? (
        <div className="mt-6 flex flex-col gap-6">
          <Notice tone="ok" title={after >= r.threshold ? 'The approval rule is met' : `${after} of ${r.threshold} signatures collected`}>
            {after >= r.threshold
              ? 'Your signature completed the set. Any signer can now send the payment to the Bitcoin network.'
              : `${r.threshold - after} more signature${r.threshold - after === 1 ? ' is' : 's are'} needed before the payment can be sent.`}
          </Notice>
          <SignerSlots signers={result.signers} signatures={result.signatures} threshold={r.threshold} />
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[15px] text-ink-soft">Please review the details carefully. Once you sign, it cannot be undone.</p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <dl className="flex flex-col gap-5">
              <KeyValue label="Recipient">
                <code className="break-all font-mono text-sm">{r.recipientAddress}</code>
              </KeyValue>
              <KeyValue label="Amount">
                <Amount sats={r.amountSats} className="font-semibold" />
              </KeyValue>
              <KeyValue label="Network fee (estimated)">
                <Amount sats={r.estimatedFeeSats} />
              </KeyValue>
              <KeyValue label="Total leaving the wallet">
                <Amount sats={r.amountSats + r.estimatedFeeSats} className="text-lg font-extrabold" />
              </KeyValue>
            </dl>
            <dl className="flex flex-col border border-line">
              <KeyValue label="Purpose" className="border-b border-line p-4">
                {r.purpose}
              </KeyValue>
              <KeyValue label="Change address (back to the community wallet)" className="border-b border-line p-4">
                <code className="break-all font-mono text-sm">{r.changeAddress}</code>
              </KeyValue>
              <KeyValue label="Current approvals" className="p-4">
                <span className="text-xl font-extrabold tabular">
                  {signed} of {r.threshold}
                </span>
              </KeyValue>
            </dl>
          </div>
          <div className="mt-6 flex gap-3 border border-teal-line bg-teal-soft p-4">
            <Icon name="shield" size={22} className="mt-0.5 shrink-0 text-teal-ink" />
            <p className="text-[15px] leading-relaxed">
              <span className="font-semibold text-teal-ink">Signing means you are authorising this transaction</span> with your private key, which stays on your
              own device. CommunitySafe never sees it. <span className="text-ink-soft">In this prototype the signature is simulated and no key is used.</span>
            </p>
          </div>
          <label className="mt-5 flex items-start gap-3 text-[15px]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={stage === 'signing'} />
            <span>I have checked the recipient address and the amount, and this payment matches what the community agreed.</span>
          </label>
          {error && <Notice tone="bad" className="mt-4" title="Your signature was not added">{error}</Notice>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={stage === 'signing'}>
              Cancel
            </Button>
            <Button onClick={sign} disabled={!checked} busy={stage === 'signing'} icon="pen">
              {stage === 'signing' ? 'Waiting for your signing device…' : 'Review & sign'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function DeclineModal({ detail, open, onClose, onDone }: { detail: SpendingRequestDetail; open: boolean; onClose: () => void; onDone: (d: SpendingRequestDetail) => void }) {
  const r = detail.request
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const declined = detail.signatures.filter((s) => s.decision === 'declined').length + 1
  const stillAble = r.signerCount - declined
  const closes = stillAble < r.threshold

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const d = await api.declineSpendingRequest(r.id, reason)
      onDone(d)
      setReason('')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Decline this request">
      <div className="mt-4 flex flex-col gap-5">
        {closes ? (
          <Notice tone="warn" title="Your decline will close this request">
            Only {stillAble} signers would remain, fewer than the {r.threshold} required. The request will be closed and nothing will be sent.
          </Notice>
        ) : (
          <Notice tone="info" title="Declining does not cancel the request">
            {stillAble} signers can still sign and only {r.threshold} are needed, so the request stays open. Your decline is recorded and visible to all members.
          </Notice>
        )}
        <TextArea label="Reason" optional value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I would like a second quote first." maxLength={300} />
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep reviewing
          </Button>
          <Button variant="danger" onClick={submit} busy={busy} icon="x">
            Decline
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function YourPart({ detail, membership, onSign, onDecline }: { detail: SpendingRequestDetail; membership: Membership; onSign: () => void; onDecline: () => void }) {
  const r = detail.request
  const collecting = r.status === 'pending' || r.status === 'awaiting_signatures'
  const mine = membership.signer ? detail.signatures.find((s) => s.signerId === membership.signer?.id) : undefined

  if (!membership.isSigner) {
    return (
      <Panel title="Your part">
        <div className="flex flex-col gap-3 p-5 text-[15px] leading-relaxed text-ink-soft">
          <Badge tone="neutral" icon="eye" className="self-start">Read only</Badge>
          {membership.isAdmin ? (
            <p>
              You are the administrator, but you are not one of the {r.signerCount} authorised signers. Administrators cannot sign, approve, or send payments, and
              cannot override the approval rule.
            </p>
          ) : (
            <p>Only the {r.signerCount} authorised signers can sign. As a member you can see every detail and who has signed.</p>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Your part">
      <div className="flex flex-col gap-3 p-5">
        {mine?.decision === 'signed' ? (
          <>
            <Button disabled icon="check" className="w-full bg-ok! text-ok-ink!">
              You signed this
            </Button>
            <p className="text-sm text-ink-soft">
              Signed {dateTime(mine.createdAt)}. Your signature counts once{collecting ? ', so there is nothing more for you to do until it is ready to send.' : '.'}
            </p>
          </>
        ) : mine?.decision === 'declined' ? (
          <>
            <Button disabled icon="x" className="w-full">
              You declined this
            </Button>
            <p className="text-sm text-ink-soft">
              Declined {dateTime(mine.createdAt)}
              {mine.reason ? `: “${mine.reason}”` : '.'}
            </p>
          </>
        ) : collecting ? (
          <>
            <Button size="lg" icon="pen" onClick={onSign} className="w-full">
              Approve and sign
            </Button>
            <Button variant="secondary" onClick={onDecline} className="w-full">
              Decline
            </Button>
            <p className="text-sm text-ink-soft">You will see the full transaction before anything is signed.</p>
          </>
        ) : (
          <p className="text-[15px] text-ink-soft">This request is no longer collecting signatures. You did not take part.</p>
        )}
      </div>
    </Panel>
  )
}

function SendPanel({ detail, membership, onUpdate }: { detail: SpendingRequestDetail; membership: Membership; onUpdate: (d: SpendingRequestDetail) => void }) {
  const r = detail.request
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signed = detail.signatures.filter((s) => s.decision === 'signed').length
  const remaining = Math.max(0, r.threshold - signed)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      onUpdate(await api.broadcastTransaction(r.id))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (r.status === 'broadcast' && detail.transaction) {
    const t = detail.transaction
    return (
      <Panel title="Sent to the Bitcoin network">
        <div className="flex flex-col gap-4 p-5">
          <Badge tone="ok" icon="check" className="self-start">{confirmationText(t.confirmations)}</Badge>
          <CopyField label="Transaction ID (txid)" value={t.txid} />
          <p className="text-sm text-ink-soft">Sent {dateTime(t.broadcastAt)} after {signed} of {r.threshold} signatures.</p>
          <ButtonLink to={`/app/transactions/${t.txid}`} variant="secondary" iconRight="arrowRight">
            View transaction
          </ButtonLink>
        </div>
      </Panel>
    )
  }

  if (r.status === 'rejected') {
    return (
      <Panel title="Closed">
        <p className="p-5 text-[15px] leading-relaxed text-ink-soft">
          Too many signers declined for {r.threshold} signatures to be reached. Nothing was sent and the funds held for this request are free again. Anyone with
          signing rights can propose a new request.
        </p>
      </Panel>
    )
  }

  if (r.status === 'failed' && r.lastBroadcastError) {
    return (
      <section className="border-2 border-bad-line bg-surface">
        <h2 className="flex items-center gap-2 border-b border-bad-line bg-bad px-5 py-4 text-[17px] font-bold text-bad-ink">
          <Icon name="alert" size={20} /> Sending failed
        </h2>
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[15px] leading-relaxed">
            The Bitcoin node did not accept the transaction, so <strong>no money left the wallet</strong>. This request and all {signed} signatures are kept. You can try
            again once the problem is fixed.
          </p>
          <div className="border border-line bg-paper p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Node error · {r.lastBroadcastError.code}</p>
            <p className="mt-1 break-words font-mono text-[13px]">{r.lastBroadcastError.message}</p>
            <p className="mt-2 text-xs text-muted">
              {dateTime(r.lastBroadcastError.at)} · attempt {r.broadcastAttempts}
            </p>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          {membership.isSigner ? (
            <Button icon="refresh" busy={busy} onClick={send}>
              Try sending again
            </Button>
          ) : (
            <p className="text-sm text-ink-soft">A signer can retry sending.</p>
          )}
        </div>
      </section>
    )
  }

  const ready = r.status === 'ready_to_broadcast'
  return (
    <section className={cx('border bg-surface', ready ? 'border-2 border-accent' : 'border-line')}>
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 text-[17px] font-bold">
        <Icon name={ready ? 'unlock' : 'lock'} size={20} />
        Send to the Bitcoin network
      </h2>
      <div className="flex flex-col gap-4 p-5">
        {ready ? (
          <>
            <p className="text-[15px] leading-relaxed">
              All {r.threshold} required signatures are collected. The transaction can now be finalised and sent.
            </p>
            {error && <Notice tone="bad">{error}</Notice>}
            {membership.isSigner ? (
              <Button size="lg" icon="send" busy={busy} onClick={send} className="w-full">
                {busy ? 'Sending…' : 'Send payment'}
              </Button>
            ) : (
              <p className="text-sm text-ink-soft">Waiting for one of the signers to send it.</p>
            )}
          </>
        ) : (
          <>
            <Button disabled icon="lock" className="w-full">
              Locked
            </Button>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              {signed} of {r.threshold} signatures collected. <strong className="text-ink">{remaining} more</strong> {remaining === 1 ? 'is' : 'are'} needed before this
              can be sent. Until then the transaction stays off the network and the funds stay in the wallet.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

export default function RequestDetail() {
  const { id = '' } = useParams()
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created === true
  const { membership, refresh } = useActiveCommunity()
  const detail = useAsync(() => api.getSpendingRequest(id), [id, membership.member.id])
  const [signOpen, setSignOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)

  if (detail.loading && !detail.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Spending request" back="/app/requests" />
        <LoadingBlock rows={4} label="Loading spending request" />
      </div>
    )
  }
  if (detail.error || !detail.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Spending request" back="/app/requests" />
        <ErrorState message={detail.error ?? 'Not found'} onRetry={detail.reload} />
      </div>
    )
  }

  const d = detail.data
  const r = d.request
  const signatureCount = d.signatures.length
  const firstSignature = d.signatures[0]
  const isCreator = r.createdBy === membership.member.id
  const editable = r.status === 'pending' && signatureCount === 0
  const update = (next: SpendingRequestDetail) => {
    detail.setData(next)
    void refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Request #${r.number}`}
        title={r.title}
        back="/app/requests"
        actions={<RequestStatusBadge status={r.status} />}
      />

      {created && <Notice tone="ok" title="Request created">It needs {r.threshold} of {r.signerCount} signatures. Signers will see it on their dashboard.</Notice>}

      <section className="flex flex-col gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center bg-teal text-teal-ink">
          <Icon name="request" size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-3xl font-extrabold leading-tight">
            <Amount sats={r.amountSats} />
          </p>
          <p className="text-sm tabular text-muted">{sats(r.amountSats)}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-[15px] sm:text-right">
          <dt className="text-muted">Created by</dt>
          <dd className="font-semibold">{r.createdByName}</dd>
          <dt className="text-muted">Date</dt>
          <dd>{date(r.createdAt)}</dd>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel title="Signatures">
            <div className="p-5 sm:p-6">
              <SignerSlots signers={d.signers} signatures={d.signatures} threshold={r.threshold} youSignerId={membership.signer?.id} />
            </div>
            <ul className="border-t border-line">
              {d.signers.map((s) => {
                const sig = d.signatures.find((x) => x.signerId === s.id)
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
                    <Avatar name={s.name} size={36} tone={sig?.decision === 'signed' ? 'forest' : 'light'} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {s.name}
                        {s.id === membership.signer?.id && <span className="ml-1.5 font-normal text-muted">(you)</span>}
                      </p>
                      {sig?.decision === 'declined' && sig.reason && <p className="text-sm text-ink-soft">“{sig.reason}”</p>}
                    </div>
                    {sig ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <Badge tone={sig.decision === 'signed' ? 'ok' : 'bad'} icon={sig.decision === 'signed' ? 'check' : 'x'}>
                          {sig.decision === 'signed' ? 'Signed' : 'Declined'}
                        </Badge>
                        <span className="text-xs text-muted">{dateTime(sig.createdAt)}</span>
                      </span>
                    ) : (
                      <Badge tone="wait" icon="clock">
                        {r.status === 'pending' || r.status === 'awaiting_signatures' ? 'Waiting' : 'Did not sign'}
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel title="Payment details">
            <div className="flex flex-col gap-5 p-5 sm:p-6">
              {signatureCount > 0 ? (
                <Notice tone="lock" title="Read only: signing has started">
                  {firstSignature ? `${firstSignature.signerName} signed first on ${dateTime(firstSignature.createdAt)}. ` : ''}
                  From that moment the recipient, amount and purpose are locked, so every signer approves exactly the same payment. A change needs a new request.
                </Notice>
              ) : editable && isCreator ? (
                <Notice tone="info" title="You can still edit this" action={<ButtonLink to={`/app/requests/${r.id}/edit`} size="sm" variant="secondary" icon="pen">Edit details</ButtonLink>}>
                  Nobody has signed yet. As soon as the first signer signs, these details are locked.
                </Notice>
              ) : null}
              <CopyField label="Recipient address" value={r.recipientAddress} />
              <dl className="grid gap-5 sm:grid-cols-3">
                <KeyValue label="Amount">
                  <Amount sats={r.amountSats} className="font-semibold" />
                </KeyValue>
                <KeyValue label="Estimated network fee">
                  <Amount sats={r.estimatedFeeSats} /> <span className="text-sm text-muted">({r.feeRateSatVb} sat/vB)</span>
                </KeyValue>
                <KeyValue label="Total leaving the wallet">
                  <Amount sats={r.amountSats + r.estimatedFeeSats} className="font-extrabold" />
                </KeyValue>
              </dl>
              <KeyValue label="Purpose">
                <p className="whitespace-pre-line leading-relaxed">{r.purpose}</p>
              </KeyValue>
              <KeyValue label="Change returns to the community wallet at">
                <code className="break-all font-mono text-[13px] text-ink-soft" title={r.changeAddress}>
                  {shortHash(r.changeAddress, 16, 12)}
                </code>
              </KeyValue>
            </div>
          </Panel>
        </div>

        {/* Actions come first on small screens so signers do not have to scroll past the details. */}
        <div className="order-first flex flex-col gap-6 lg:order-none">
          <YourPart detail={d} membership={membership} onSign={() => setSignOpen(true)} onDecline={() => setDeclineOpen(true)} />
          <SendPanel detail={d} membership={membership} onUpdate={update} />
          <p className="text-sm text-muted">
            {requestStatusMeta[r.status].plain}{' '}
            <Link to="/app/audit" className="font-semibold text-ink underline underline-offset-2">
              See the audit log
            </Link>
          </p>
        </div>
      </div>

      {membership.isSigner && (
        <>
          <SignModal detail={d} open={signOpen} onClose={() => setSignOpen(false)} onSigned={update} />
          <DeclineModal detail={d} open={declineOpen} onClose={() => setDeclineOpen(false)} onDone={update} />
        </>
      )}
    </div>
  )
}

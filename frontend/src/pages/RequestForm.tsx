import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../api'
import { ApiError, errorMessage } from '../api/errors'
import { Icon } from '../components/Icon'
import { Amount, Button, ButtonLink, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, TextArea, TextField } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { DUST_LIMIT_SATS, estimateVsize, validateRecipientAddress } from '../lib/bitcoin'
import { btc, parseBtcToSats, sats } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const FEE_RATE = 4

/** Create a new spending request, or edit one that nobody has signed yet. */
export default function RequestForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { community, membership, refresh } = useActiveCommunity()
  const data = useAsync(
    () => Promise.all([api.getWallet(community.id), id ? api.getSpendingRequest(id) : Promise.resolve(null)]),
    [community.id, id],
  )

  const [title, setTitle] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const existing = data.data?.[1]?.request ?? null
  useEffect(() => {
    if (existing) {
      setTitle(existing.title)
      setRecipient(existing.recipientAddress)
      setAmount(btc(existing.amountSats))
      setPurpose(existing.purpose)
    }
  }, [existing])

  if (!membership.isSigner) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="New spending request" back="/app/requests" />
        <EmptyState icon="lock" title="Only authorised signers can propose payments" action={<ButtonLink to="/app/requests" variant="secondary" size="sm">Back to requests</ButtonLink>}>
          {membership.isAdmin
            ? 'You are the administrator but not in the signer set. Being administrator does not give spending power. Ask one of the signers to propose this payment.'
            : 'You are a community member. Ask one of the authorised signers to propose this payment. You will be able to follow its progress.'}
        </EmptyState>
      </div>
    )
  }

  if (data.loading && !data.data) return <LoadingBlock rows={4} label="Loading" />
  if (data.error || !data.data) return <ErrorState message={data.error ?? 'Not found'} onRetry={data.reload} />

  const [wallet, detail] = data.data
  const signatureCount = detail?.signatures.length ?? 0
  if (editing && detail) {
    const mine = detail.request.createdBy === membership.member.id
    if (!mine || signatureCount > 0 || detail.request.status !== 'pending') {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="Edit request" back={`/app/requests/${id}`} />
          <Notice tone="lock" title="This request can no longer be edited">
            {!mine
              ? 'Only the person who created a request can edit it.'
              : 'Signing has started, so the recipient, amount and purpose are locked. Signers must always approve exactly what was proposed. If the payment needs to change, create a new request.'}
          </Notice>
          <div className="flex gap-3">
            <ButtonLink to={`/app/requests/${id}`} variant="secondary">Back to the request</ButtonLink>
            {mine && <ButtonLink to="/app/requests/new" icon="plus">Create a new request</ButtonLink>}
          </div>
        </div>
      )
    }
  }

  const m = wallet.threshold ?? 2
  const n = wallet.signerCount
  const fee = estimateVsize(1, 2, m, n) * FEE_RATE
  const ownReservation = existing ? existing.amountSats + existing.estimatedFeeSats : 0
  const available = wallet.confirmedBalanceSats - wallet.reservedSats + ownReservation
  const amountSats = parseBtcToSats(amount)

  const clientErrors: Record<string, string> = {}
  if (title.trim().length < 3) clientErrors.title = 'Give the request a short title, like “Iron sheets for the hall”.'
  const addrErr = validateRecipientAddress(recipient, wallet.receiveAddress)
  if (addrErr) clientErrors.recipientAddress = addrErr
  if (amount.trim() === '') clientErrors.amountSats = 'Enter the amount in BTC, for example 0.0125.'
  else if (amountSats === null) clientErrors.amountSats = 'Use numbers only, with at most 8 digits after the decimal point.'
  else if (amountSats <= 0) clientErrors.amountSats = 'Enter an amount greater than zero.'
  else if (amountSats < DUST_LIMIT_SATS) clientErrors.amountSats = `The Bitcoin network will not relay payments under ${DUST_LIMIT_SATS} sats (0.00000546 BTC).`
  if (purpose.trim().length < 10) clientErrors.purpose = 'Explain what the money is for, so signers can judge it.'

  const overBalance = amountSats !== null && amountSats > 0 && amountSats + fee > wallet.confirmedBalanceSats
  const overAvailable = amountSats !== null && amountSats > 0 && amountSats + fee > available

  const show = (key: string) => (touched[key] || touched.submit ? (serverErrors[key] ?? clientErrors[key]) : serverErrors[key])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched((t) => ({ ...t, submit: true }))
    setServerErrors({})
    if (Object.keys(clientErrors).length || overAvailable || amountSats === null) return
    setBusy(true)
    setFormError(null)
    const input = { title, purpose, recipientAddress: recipient, amountSats }
    try {
      const r = editing && id ? await api.updateSpendingRequest(id, input) : await api.createSpendingRequest(community.id, input)
      await refresh()
      navigate(`/app/requests/${r.id}`, { state: { created: !editing } })
    } catch (err) {
      if (err instanceof ApiError) setServerErrors(err.fields)
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  const blur = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }))

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageHeader
        title={editing ? 'Edit spending request' : 'Create spending request'}
        back={editing ? `/app/requests/${id}` : '/app/requests'}
        description="Propose a payment from the community wallet. Signers will see exactly these details before they sign."
      />
      {formError && <Notice tone="bad" title={editing ? 'Changes were not saved' : 'The request was not created'}>{formError}</Notice>}

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <TextField label="Title" placeholder="e.g. Purchase networking equipment" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={blur('title')} error={show('title')} maxLength={80} />
          <TextField
            label="Recipient Bitcoin address"
            mono
            placeholder="bcrt1q…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            onBlur={blur('recipientAddress')}
            error={show('recipientAddress')}
            spellCheck={false}
            autoComplete="off"
            hint="Copy and paste it from the recipient. Test-network addresses start with bcrt1 or tb1."
          />
          <TextField
            label="Amount (BTC)"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={blur('amountSats')}
            error={show('amountSats')}
            hint={amountSats ? `${sats(amountSats)}` : `Free to spend: ${btc(available)} BTC`}
          />
          {overAvailable && (
            <Notice tone="warn" title={overBalance ? 'This is more than the wallet holds' : 'Some funds are already held for other requests'}>
              {overBalance
                ? `The wallet balance is ${btc(wallet.confirmedBalanceSats)} BTC. This payment plus its network fee needs ${btc((amountSats ?? 0) + fee)} BTC.`
                : `${btc(wallet.reservedSats - ownReservation)} BTC is set aside for other open requests, leaving ${btc(available)} BTC free. Lower the amount, or wait for other requests to finish.`}
            </Notice>
          )}
          <TextArea
            label="Purpose"
            placeholder="e.g. Purchase of networking equipment for the community network. Quote from …"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            onBlur={blur('purpose')}
            error={show('purpose')}
            maxLength={500}
            hint="Members and signers will read this. Mention quotes or receipts if you have them."
          />
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-2">
          <section className="border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-3.5 font-bold">Summary</h2>
            <dl className="flex flex-col gap-3 px-5 py-4 text-[15px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Amount</dt>
                <dd className="font-semibold">{amountSats ? <Amount sats={amountSats} /> : '–'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Estimated network fee</dt>
                <dd className="font-semibold">
                  <Amount sats={fee} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-3">
                <dt className="font-semibold">Total leaving the wallet</dt>
                <dd className="font-extrabold">{amountSats ? <Amount sats={amountSats + fee} /> : '–'}</dd>
              </div>
            </dl>
            <p className="border-t border-line px-5 py-3 text-sm text-muted">
              Fee estimated at {FEE_RATE} sat/vB for a {m}-of-{n} transaction. The final fee is set when the transaction is prepared.
            </p>
          </section>
          <div className="flex items-center gap-3 border border-teal-line bg-teal-soft px-5 py-4">
            <Icon name="rule" size={22} className="shrink-0 text-teal-ink" />
            <p className="text-[15px]">
              This payment will need <strong>{m} of {n} signatures</strong> before it can be sent.
            </p>
          </div>
          <Notice tone="lock">Once the first signer signs, these details are locked. To change them after that, you will need a new request.</Notice>
        </aside>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-6">
        <ButtonLink to={editing ? `/app/requests/${id}` : '/app/requests'} variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" busy={busy}>
          {editing ? 'Save changes' : 'Create request'}
        </Button>
      </div>
    </form>
  )
}

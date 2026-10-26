import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import { Amount, Button, ButtonLink, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, TextField } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { DUST_LIMIT_SATS, validateRecipientAddress } from '../lib/bitcoin'
import { parseBtcToSats, sats } from '../lib/format'
import { useAsync } from '../lib/useAsync'

export default function RequestForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { community, membership, refresh } = useActiveCommunity()
  const wallet = useAsync(() => api.getWallet(community.id), [community.id])
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [feeRate, setFeeRate] = useState('4')
  const [touched, setTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (id) {
    return <div className="flex flex-col gap-6"><PageHeader title="Editing is unavailable" back={`/app/requests/${id}`} /><Notice tone="lock">The backend does not mutate prepared Bitcoin transactions. Cancel the request and create a new one instead.</Notice></div>
  }
  if (!membership.isAdmin) {
    return <div className="flex flex-col gap-6"><PageHeader title="New spending request" back="/app/requests" /><EmptyState icon="lock" title="Only administrators can create payments" action={<ButtonLink to="/app/requests" variant="secondary" size="sm">Back to requests</ButtonLink>}>Wallet signers approve with cryptographic signatures, but creating and cancelling requests is an administrator action.</EmptyState></div>
  }
  if (wallet.loading && !wallet.data) return <LoadingBlock rows={4} label="Loading wallet" />
  if (wallet.error || !wallet.data) return <ErrorState message={wallet.error ?? 'Wallet not found'} onRetry={wallet.reload} />

  const amountSats = parseBtcToSats(amount)
  const rate = Number(feeRate)
  let recipientError = validateRecipientAddress(recipient, wallet.data.receiveAddress)
  if (!recipientError && !recipient.trim().toLowerCase().startsWith('bcrt1')) recipientError = 'Use a Regtest SegWit address beginning with bcrt1.'
  const amountError = amount.trim() === '' ? 'Enter an amount in BTC.' : amountSats === null || amountSats <= 0 ? 'Enter a valid amount greater than zero with at most 8 decimals.' : amountSats < DUST_LIMIT_SATS ? `Enter at least ${DUST_LIMIT_SATS} sats.` : null
  const feeError = !Number.isInteger(rate) || rate < 1 || rate > 100 ? 'Fee rate must be a whole number from 1 to 100 sat/vB.' : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (recipientError || amountError || feeError || amountSats === null) return
    setBusy(true)
    setFormError(null)
    try {
      const result = await api.createSpendingRequest(community.id, { recipientAddress: recipient, amountSats, feeRate: rate })
      await refresh()
      navigate(`/app/requests/${result.id}`, { state: { created: true } })
    } catch (err) {
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageHeader title="Create spending request" back="/app/requests" description="Bitcoin Core prepares the exact transaction and returns the actual network fee. Signers review that transaction before signing." />
      {formError && <Notice tone="bad" title="The request was not created">{formError}</Notice>}
      <TextField label="Recipient Regtest address" mono placeholder="bcrt1q…" value={recipient} onChange={(event) => setRecipient(event.target.value)} error={touched ? recipientError ?? undefined : undefined} spellCheck={false} autoComplete="off" />
      <TextField label="Amount (BTC)" inputMode="decimal" placeholder="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} error={touched ? amountError ?? undefined : undefined} hint={amountSats ? sats(amountSats) : undefined} />
      <TextField label="Fee rate (sat/vB)" inputMode="numeric" value={feeRate} onChange={(event) => setFeeRate(event.target.value)} error={touched ? feeError ?? undefined : undefined} hint="Allowed range: 1–100 sat/vB. Bitcoin Core calculates the final fee." />
      <Notice tone="lock">Recipient, amount, selected inputs, and actual fee are fixed in the prepared PSBT. This request cannot be edited; cancel it and create another if anything is wrong.</Notice>
      {amountSats && <div className="border border-line bg-surface p-5"><span className="text-sm text-muted">Requested amount</span><p className="mt-1 text-xl font-extrabold"><Amount sats={amountSats} /></p></div>}
      <div className="flex justify-end gap-3 border-t border-line pt-6"><ButtonLink to="/app/requests" variant="secondary">Cancel</ButtonLink><Button type="submit" busy={busy}>Prepare request</Button></div>
    </form>
  )
}

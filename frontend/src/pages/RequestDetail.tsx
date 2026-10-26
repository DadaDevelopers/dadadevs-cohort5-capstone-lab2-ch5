import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import { RequestStatusBadge } from '../components/StatusBadge'
import { BrowserSignRequestPanel } from '../components/browser-signer/BrowserSignRequestPanel'
import { SpendingDiscussion } from '../components/SpendingDiscussion'
import { Amount, Avatar, Badge, Button, CopyField, ErrorState, KeyValue, LoadingBlock, Notice, PageHeader, Panel, TextArea } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { dateTime } from '../lib/format'
import { browserSignerEnabled } from '../lib/browserSignerFlag'
import { useAsync } from '../lib/useAsync'

export default function RequestDetail() {
  const { id = '' } = useParams()
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created === true
  const { community, membership, refresh } = useActiveCommunity()
  const detail = useAsync(() => api.getSpendingRequest(community.id, id), [community.id, id, membership.member.id])
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [psbt, setPsbt] = useState<string | null>(null)
  const [signedPsbt, setSignedPsbt] = useState('')
  const [signingBusy, setSigningBusy] = useState(false)
  const [signingMessage, setSigningMessage] = useState<string | null>(null)
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastTxid, setBroadcastTxid] = useState<string | null>(null)

  if (detail.loading && !detail.data) return <div className="flex flex-col gap-6"><PageHeader title="Spending request" back="/app/requests" /><LoadingBlock rows={4} label="Loading spending request" /></div>
  if (detail.error || !detail.data) return <div className="flex flex-col gap-6"><PageHeader title="Spending request" back="/app/requests" /><ErrorState message={detail.error ?? 'Not found'} onRetry={detail.reload} /></div>

  const { request, signatures, signers } = detail.data
  const cancellable = ['pending', 'awaiting_signatures', 'ready_to_broadcast'].includes(request.status)
  const alreadySigned = !!membership.signer && signatures.some((signature) => signature.signerId === membership.signer?.id)
  const canSign = membership.isSigner && !alreadySigned && ['pending', 'awaiting_signatures'].includes(request.status)
  const canBroadcast = membership.isAdmin && request.status === 'ready_to_broadcast'
  const retrievePsbt = async () => {
    setSigningBusy(true)
    setActionError(null)
    try {
      setPsbt(await api.getSpendingRequestPsbt(community.id, request.id))
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSigningBusy(false)
    }
  }
  const submitSigned = async () => {
    if (!signedPsbt.trim()) {
      setActionError('Paste the PSBT produced by your independent signer wallet.')
      return
    }
    setSigningBusy(true)
    setActionError(null)
    setSigningMessage(null)
    try {
      const progress = await api.submitSignedPsbt(community.id, request.id, signedPsbt)
      setSigningMessage(progress.status === 'READY' ? 'Your signature was verified. The threshold is complete.' : `Your signature was verified. ${progress.signatures} of ${progress.requiredSignatures} signatures are now collected.`)
      setSignedPsbt('')
      detail.reload()
      await refresh()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSigningBusy(false)
    }
  }
  const broadcast = async () => {
    setBroadcasting(true)
    setActionError(null)
    try {
      const result = await api.broadcastTransaction(community.id, request.id)
      setBroadcastTxid(result.txid)
      detail.reload()
      await refresh()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBroadcasting(false)
    }
  }
  const cancel = async () => {
    if (!window.confirm('Cancel this request and release its reserved inputs?')) return
    setCancelling(true)
    setActionError(null)
    try {
      await api.cancelSpendingRequest(community.id, request.id)
      detail.reload()
      await refresh()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`Request #${request.number}`} title={request.title} back="/app/requests" actions={<RequestStatusBadge status={request.status} />} />
      {created && <Notice tone="ok" title="Request prepared">Bitcoin Core selected and reserved the inputs and calculated the actual fee. Signers must review the PSBT before signing.</Notice>}
      {actionError && <Notice tone="bad">{actionError}</Notice>}

      <section className="grid gap-5 border border-line bg-surface p-5 sm:grid-cols-3 sm:p-6">
        <KeyValue label="Amount"><Amount sats={request.amountSats} className="text-2xl font-extrabold" /></KeyValue>
        <KeyValue label="Actual network fee"><Amount sats={request.estimatedFeeSats} className="font-bold" /></KeyValue>
        <KeyValue label="Created">{dateTime(request.createdAt)} by {request.createdByName}</KeyValue>
      </section>

      <Panel title="Prepared transaction">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <CopyField label="Recipient address" value={request.recipientAddress} />
          <KeyValue label="Total leaving the wallet"><Amount sats={request.amountSats + request.estimatedFeeSats} className="font-extrabold" /></KeyValue>
          <Notice tone="lock">The backend verifies this recipient, amount, fee, inputs, and wallet policy again for every submitted signed PSBT. Prepared requests are never edited in place.</Notice>
        </div>
      </Panel>

      <Panel title={`Signatures · ${signatures.length} of ${request.threshold}`}>
        <ul>
          {signers.map((signer) => {
            const signature = signatures.find((item) => item.signerId === signer.id)
            return <li key={signer.id} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-b-0"><Avatar name={signer.name} size={38} /><span className="min-w-0 flex-1 font-semibold">{signer.name}{signer.memberId === membership.member.userId && <span className="ml-1 font-normal text-muted">(you)</span>}</span>{signature ? <Badge tone="ok" icon="check">Signed {dateTime(signature.createdAt)}</Badge> : <Badge tone="wait" icon="clock">Waiting</Badge>}</li>
          })}
        </ul>
      </Panel>

      {signingMessage && <Notice tone="ok">{signingMessage}</Notice>}
      {broadcastTxid && <Notice tone="ok" title="Payment sent">Bitcoin Core accepted the transaction. Transaction ID: <code className="break-all font-mono">{broadcastTxid}</code></Notice>}
      {canSign && browserSignerEnabled() && (
        <BrowserSignRequestPanel
          communityId={community.id}
          userId={membership.member.userId}
          request={request}
          onSigned={(message) => {
            setSigningMessage(message)
            detail.reload()
            void refresh()
          }}
        />
      )}
      {canSign && (
        <Panel title="Sign with your independent wallet">
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <Notice tone="warn" title="Review before signing">Verify the recipient, amount, actual fee, and wallet policy in your signer tool. Private keys and Bitcoin RPC credentials must stay in that independent wallet; never paste them here.</Notice>
            {!psbt ? (
              <Button variant="secondary" busy={signingBusy} onClick={() => void retrievePsbt()}>Retrieve PSBT for signing</Button>
            ) : (
              <>
                <CopyField label="Coordinator PSBT" value={psbt} />
                <p className="text-sm text-muted">Import this PSBT into the independent Regtest signer wallet, review it, sign it there, then export the resulting signed PSBT.</p>
                <TextArea label="Signed PSBT" mono rows={5} value={signedPsbt} onChange={(event) => setSignedPsbt(event.target.value)} placeholder="Paste the Base64 signed PSBT—not a private key or seed phrase" spellCheck={false} autoComplete="off" />
                <div className="flex justify-end"><Button icon="key" busy={signingBusy} onClick={() => void submitSigned()}>Submit cryptographic signature</Button></div>
              </>
            )}
          </div>
        </Panel>
      )}
      {membership.isSigner && alreadySigned && <Notice tone="ok">Your verified signature is already recorded. Each wallet signer counts at most once.</Notice>}
      {canBroadcast && <Panel title="Send to the Bitcoin network"><div className="flex flex-col gap-4 p-5 sm:p-6"><Notice tone="warn">The signature threshold is complete. Broadcasting is an administrator action and cannot be undone after Bitcoin Core accepts the transaction.</Notice><Button size="lg" icon="send" busy={broadcasting} onClick={() => void broadcast()}>Broadcast payment</Button></div></Panel>}
      <SpendingDiscussion communityId={community.id} requestId={request.id} currentUserId={membership.member.userId} />
      {membership.isAdmin && cancellable && <div className="flex justify-end"><Button variant="danger" busy={cancelling} onClick={() => void cancel()}>Cancel request</Button></div>}
    </div>
  )
}

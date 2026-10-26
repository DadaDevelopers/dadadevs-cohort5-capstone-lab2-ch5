import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import { Icon } from '../components/Icon'
import { BrowserSignerCard } from '../components/browser-signer/BrowserSignerCard'
import { Avatar, Badge, Button, CopyButton, EmptyState, ErrorState, LoadingBlock, Modal, Notice, PageHeader, TextArea } from '../components/ui'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { date, shortHash } from '../lib/format'
import { browserSignerEnabled } from '../lib/browserSignerFlag'
import { compressedPublicKeyError, signerSetupCommand } from '../lib/signerSetup'
import { useAsync } from '../lib/useAsync'
import { StepHeader } from './Setup'

function isSecretMaterial(value: string): boolean {
  const trimmed = value.trim()
  return /^(?:xprv|tprv|yprv|zprv|uprv|vprv|-----BEGIN .*PRIVATE KEY)/i.test(trimmed) || trimmed.split(/\s+/).length >= 12
}

function RegisterKeyForm({ communityId, userId, onDone }: { communityId: string; userId: string; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [secretWarning, setSecretWarning] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onKeyChange = (value: string) => {
    if (isSecretMaterial(value)) {
      setPublicKey('')
      setSecretWarning('What you pasted may be secret key or recovery material. It was cleared immediately and was not sent. Never share it with CommunitySafe.')
      return
    }
    setSecretWarning(null)
    setPublicKey(value)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validation = compressedPublicKeyError(publicKey)
    setFieldError(validation)
    if (validation) return
    setBusy(true)
    setFormError(null)
    try {
      await api.registerSignerKey(communityId, publicKey)
      await onDone()
    } catch (err) {
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  let command: string | null = null
  let commandError: string | null = null
  try {
    command = signerSetupCommand(userId, communityId)
  } catch (error) {
    commandError = errorMessage(error)
  }

  return (
    <section className="border-2 border-accent bg-surface p-5 sm:p-6">
      <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">Your action</p>
      <h2 className="mt-1 text-xl font-extrabold">Register your compressed public key</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Use the guided local setup to create or recover the independent Regtest signer wallet associated with your account and this community.
      </p>
      {commandError && <Notice tone="bad" className="mt-4">{commandError}</Notice>}
      <div className="mt-5"><Button type="button" icon="key" disabled={!command} onClick={() => setOpen(true)}>Open guided signer setup</Button></div>

      <Modal open={open} onClose={() => setOpen(false)} title="Set up your independent Regtest signer">
        <div className="mt-5 flex flex-col gap-5">
          <Notice tone="lock" title="Keys stay outside CommunitySafe">
            Run this on the signer’s own trusted computer. The browser and coordinator never receive the private key, recovery words, RPC cookie, or RPC password.
          </Notice>

          <section>
            <h3 className="font-bold">1. Prepare the local services</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-ink-soft">
              <li>Open a terminal in this project’s <code className="font-mono">backend</code> folder and install its dependencies.</li>
              <li>Run Bitcoin Core in Regtest server mode with RPC available only on local port <code className="font-mono">18444</code>.</li>
              <li>Set <code className="font-mono">BITCOIN_RPC_COOKIE_FILE</code> to the cookie file path. Do not copy the cookie contents into this page or the command.</li>
              <li>Set <code className="font-mono">COMMUNITYSAFE_TOKEN</code> in that terminal to this signer’s short-lived access token. Never put it in the copied command, screenshots, or chat.</li>
              <li>The API defaults to <code className="font-mono">http://127.0.0.1:3000</code>. Only set <code className="font-mono">COMMUNITYSAFE_API_URL</code> when the local backend uses another loopback URL.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold">2. Run the generated command</h3>
            {command ? (
              <div className="mt-2 flex flex-col gap-2 border border-line bg-paper p-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">{command}</code>
                <CopyButton value={command} label="Copy command" />
              </div>
            ) : <Notice tone="bad">{commandError}</Notice>}
            <p className="mt-2 text-sm text-muted">The utility verifies that the terminal token belongs to user {userId}, confirms that user is an authorised signer in community {communityId}, and refuses non-local or non-Regtest RPC.</p>
          </section>

          <form onSubmit={submit} noValidate>
            <h3 className="font-bold">3. Register the printed public key</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Copy only the value after <code className="font-mono">Public key:</code> in the utility output, paste it below, then register it. The existing backend validates ownership and permissions.</p>
            <Notice tone="warn" className="mt-3" title="Public key only">It must be 66 hexadecimal characters beginning with <code className="font-mono">02</code> or <code className="font-mono">03</code>.</Notice>
            {secretWarning && <Notice tone="bad" className="mt-3" title="Secret material removed">{secretWarning}</Notice>}
            {formError && <Notice tone="bad" className="mt-3">{formError}</Notice>}
            <div className="mt-4"><TextArea label="Compressed public key" mono rows={2} value={publicKey} onChange={(event) => onKeyChange(event.target.value)} error={fieldError ?? undefined} placeholder="02…" maxLength={66} spellCheck={false} autoComplete="off" /></div>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Close</Button><Button type="submit" icon="key" busy={busy}>Register public key</Button></div>
          </form>
        </div>
      </Modal>
    </section>
  )
}

export default function Signers({ mode = 'app' }: { mode?: 'app' | 'setup' }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const { community, wallet, membership, refresh } = useCommunity()
  const cid = community?.id ?? ''
  const signers = useAsync(() => api.listSigners(cid), [cid, membership?.member.id])
  const myPublicInfo = useAsync(() => membership?.isSigner ? api.getMySignerPublicInfo(cid) : Promise.resolve(null), [cid, membership?.isSigner])

  if (!community || !wallet || !membership) return null
  const isDraft = wallet.status === 'draft'
  const list = signers.data ?? []
  const ready = list.filter((signer) => signer.status === 'ready').length
  const mine = membership.signer ? list.find((signer) => signer.memberId === membership.member.userId) : undefined

  const afterChange = async () => {
    signers.reload()
    myPublicInfo.reload()
    await refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === 'setup' ? <StepHeader step={4} title="Add signer keys" description="Each authorised signer signs in and registers the public key from their own independent Regtest wallet." /> : <PageHeader title="Authorised signers" description="The people whose genuine Bitcoin signatures can release community funds." />}

      {signers.loading && !signers.data ? <LoadingBlock rows={4} label="Loading signers" /> : signers.error ? <ErrorState message={signers.error} onRetry={signers.reload} /> : list.length === 0 ? <EmptyState icon="key" title="No signers chosen yet">The administrator chooses signers from the member list first.</EmptyState> : (
        <>
          <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-5 py-4">
            <p className="text-3xl font-extrabold tabular">{ready}<span className="text-faint">/{list.length}</span></p>
            <p className="text-[15px] font-semibold">{ready === list.length ? 'All signers are ready' : `${list.length - ready} still need to register a public key`}</p>
          </div>

          {!isDraft ? <Notice tone="lock" title="The signer keys are fixed">These keys were combined into the wallet on {wallet.createdAt ? date(wallet.createdAt) : 'creation'} and cannot be edited or replaced.</Notice> : mine && mine.status === 'awaiting_key' && user ? <RegisterKeyForm communityId={cid} userId={user.id} onDone={afterChange} /> : mine ? <Notice tone="ok" title="Your key is registered">Use the matching independent signer wallet when a spending request needs your signature.</Notice> : membership.isAdmin ? <Notice tone="info" title="Each signer must register their own key">Administrators cannot register another person’s key. Ask each selected signer to sign in to their own account and complete this step.</Notice> : <Notice tone="info">You are not an authorised signer. You can follow setup progress, but cannot register a key or sign.</Notice>}

          {mine && user && browserSignerEnabled() && (
            <BrowserSignerCard
              communityId={cid}
              userId={user.id}
              registeredPublicKey={myPublicInfo.loading && !myPublicInfo.data ? undefined : (myPublicInfo.data?.publicKey ?? null)}
              canRegister={isDraft}
              onRegistered={afterChange}
            />
          )}

          <ul className="border border-line bg-surface">
            {list.map((signer) => {
              const isMe = signer.memberId === membership.member.userId
              const ownKey = isMe ? myPublicInfo.data?.publicKey : null
              return (
                <li key={signer.id} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={signer.name} size={40} tone={signer.status === 'ready' ? 'forest' : 'light'} />
                    <p className="min-w-0 flex-1 font-semibold">{signer.name}{isMe && <span className="ml-1.5 font-normal text-muted">(you)</span>}</p>
                    {signer.status === 'ready' ? <Badge tone="ok" icon={isDraft ? 'check' : 'lock'}>Ready</Badge> : <Badge tone="wait" icon="clock">Waiting for public key</Badge>}
                  </div>
                  {ownKey && <div className="flex items-center gap-2 pl-0 text-sm sm:pl-[52px]"><span className="text-muted">Your public key</span><code className="font-mono" title={ownKey}>{shortHash(ownKey, 14, 10)}</code><CopyButton value={ownKey} className="h-8" /></div>}
                </li>
              )
            })}
          </ul>

          <p className="flex items-start gap-2 text-sm text-muted"><Icon name="shield" size={16} className="mt-0.5 shrink-0" />CommunitySafe stores public keys only. Private keys, recovery words, and Bitcoin RPC credentials stay outside the browser and coordinator.</p>
        </>
      )}

      {mode === 'setup' && <div className="flex justify-between border-t border-line pt-6"><Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/setup/rule')}>Back</Button><Button size="lg" iconRight="arrowRight" disabled={ready !== list.length || list.length === 0} onClick={() => navigate('/setup/review')}>{ready === list.length ? 'Review and create' : `Waiting for ${list.length - ready} signer${list.length - ready === 1 ? '' : 's'}`}</Button></div>}
    </div>
  )
}

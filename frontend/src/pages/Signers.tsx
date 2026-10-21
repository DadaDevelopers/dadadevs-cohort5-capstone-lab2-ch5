import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { ApiError, errorMessage } from '../api/errors'
import { Icon } from '../components/Icon'
import { Avatar, Badge, Button, CopyButton, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, TextArea, TextField } from '../components/ui'
import { useCommunity } from '../context/CommunityContext'
import { checkExtendedPublicKey, validateDerivationPath, validateFingerprint } from '../lib/bitcoin'
import { date, dateTime, shortHash } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { AuthorisedSigner } from '../types'
import { StepHeader } from './Setup'

const DEFAULT_PATH = "m/48'/1'/0'/2'"

/**
 * Lets a signer register public key information. Anything that looks like a
 * private key or recovery phrase is discarded the moment it is pasted.
 */
function RegisterKeyForm({ communityId, signer, onDone }: { communityId: string; signer: AuthorisedSigner; onDone: () => void }) {
  const [xpub, setXpub] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [path, setPath] = useState(DEFAULT_PATH)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [secretWarning, setSecretWarning] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onKeyChange = (value: string) => {
    const check = checkExtendedPublicKey(value)
    if (check.kind === 'private-key' || check.kind === 'seed-phrase') {
      setXpub('')
      setSecretWarning(
        check.kind === 'private-key'
          ? 'What you pasted looks like a private key. We cleared it straight away and it was not sent anywhere. Never share it with anyone, including CommunitySafe.'
          : 'What you pasted looks like recovery words. We cleared them straight away and they were not sent anywhere. Never type your recovery words into any website.',
      )
      return
    }
    setSecretWarning(null)
    setXpub(value)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    const check = checkExtendedPublicKey(xpub)
    if (check.kind === 'empty') next.xpub = 'Paste your extended public key.'
    else if (check.kind === 'mainnet') next.xpub = 'This is a mainnet key (xpub/zpub). The prototype needs your test-network key, which starts with tpub or Vpub.'
    else if (check.kind === 'invalid') next.xpub = check.message
    const fpErr = validateFingerprint(fingerprint)
    if (fpErr) next.fingerprint = fpErr
    const pathErr = validateDerivationPath(path)
    if (pathErr) next.derivationPath = pathErr
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setFormError(null)
    try {
      await api.registerSignerKey(communityId, signer.id, { xpub, fingerprint, derivationPath: path })
      onDone()
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="border-2 border-accent bg-surface p-5 sm:p-6">
      <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">Your action</p>
      <h2 className="mt-1 text-xl font-extrabold">Register your public key</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Your wallet app (for example Sparrow or Nunchuk) creates a key pair on your own phone or computer. Share only the <strong>public</strong> part here.
        It lets CommunitySafe build the shared address, but it cannot be used to spend.
      </p>
      <Notice tone="warn" className="mt-4" title="Never paste a private key or recovery words">
        A public key starts with <code className="font-mono">tpub</code> or <code className="font-mono">Vpub</code> on test networks. If you see
        <code className="font-mono"> tprv</code>, <code className="font-mono">xprv</code> or a list of 12 or 24 words, stop: that is secret.
      </Notice>
      {secretWarning && (
        <Notice tone="bad" className="mt-4" title="Secret material removed">
          {secretWarning}
        </Notice>
      )}
      {formError && <Notice tone="bad" className="mt-4">{formError}</Notice>}
      <div className="mt-5 flex flex-col gap-5">
        <TextArea
          label="Extended public key"
          mono
          rows={3}
          value={xpub}
          onChange={(e) => onKeyChange(e.target.value)}
          error={errors.xpub}
          placeholder="tpubD6NzVbkrYhZ4…"
          spellCheck={false}
          autoComplete="off"
          hint="111 characters. Copy it from your wallet app’s multisig or keystore settings."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Master fingerprint" optional mono value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} error={errors.fingerprint} placeholder="9bc1b974" maxLength={8} hint="8 characters, helps signers check they used the right key." />
          <TextField label="Derivation path" mono value={path} onChange={(e) => setPath(e.target.value)} error={errors.derivationPath} hint="Leave as is unless your wallet app shows a different one." />
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" icon="key" busy={busy}>
          Register public key
        </Button>
      </div>
    </form>
  )
}

export default function Signers({ mode = 'app' }: { mode?: 'app' | 'setup' }) {
  const navigate = useNavigate()
  const { community, wallet, membership, refresh } = useCommunity()
  const cid = community?.id ?? ''
  const signers = useAsync(() => api.listSigners(cid), [cid, membership?.member.id])
  const [simulating, setSimulating] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (!community || !wallet || !membership) return null
  const isDraft = wallet.status === 'draft'
  const list = signers.data ?? []
  const ready = list.filter((s) => s.status === 'ready').length
  const mine = membership.signer ? list.find((s) => s.id === membership.signer?.id) : undefined

  const afterChange = async () => {
    signers.reload()
    await refresh()
  }

  const simulate = async (signerId: string) => {
    setSimulating(signerId)
    setActionError(null)
    try {
      await api.simulateSignerRegistration(cid, signerId)
      await afterChange()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSimulating(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === 'setup' ? (
        <StepHeader
          step={4}
          title="Add signer keys"
          description="Each authorised signer registers the public key from their own wallet app. When every signer is ready, the shared wallet can be created."
        />
      ) : (
        <PageHeader title="Authorised signers" description="The people whose signatures can release community funds, and the public keys that identify them." />
      )}

      {signers.loading && !signers.data ? (
        <LoadingBlock rows={4} label="Loading signers" />
      ) : signers.error ? (
        <ErrorState message={signers.error} onRetry={signers.reload} />
      ) : list.length === 0 ? (
        <EmptyState icon="key" title="No signers chosen yet">The administrator chooses signers from the member list first.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-5 py-4">
            <p className="text-3xl font-extrabold tabular">
              {ready}
              <span className="text-faint">/{list.length}</span>
            </p>
            <p className="text-[15px] font-semibold">{ready === list.length ? 'All signers are ready' : `${list.length - ready} still need to register a public key`}</p>
            <div className="ml-auto flex gap-1" aria-hidden="true">
              {list.map((s) => (
                <span key={s.id} className={s.status === 'ready' ? 'h-4 w-4 bg-forest' : 'h-4 w-4 border border-dashed border-line-strong'} />
              ))}
            </div>
          </div>

          {!isDraft ? (
            <Notice tone="lock" title="The signer set is fixed">
              These keys were combined into the wallet on {wallet.createdAt ? date(wallet.createdAt) : 'creation'}. They cannot be edited or replaced,
              and nobody can register a new key. Losing a key reduces how many signers can sign, so the rule allows {wallet.signerCount - (wallet.threshold ?? 0)} to be unavailable.
            </Notice>
          ) : mine && mine.status === 'awaiting_key' ? (
            <RegisterKeyForm communityId={cid} signer={mine} onDone={() => void afterChange()} />
          ) : mine ? (
            <Notice tone="ok" title="Your key is registered">Thanks. You will be asked to sign spending requests with the same wallet app.</Notice>
          ) : membership.isAdmin ? (
            <Notice tone="info" title="Signers register their own keys">
              As administrator you cannot enter keys for other people. In this demo you can simulate a signer completing the step, or switch to their view.
            </Notice>
          ) : (
            <Notice tone="info">You are not an authorised signer, so there is nothing for you to do here. You can follow everyone’s progress.</Notice>
          )}

          {actionError && <Notice tone="bad">{actionError}</Notice>}

          <ul className="border border-line bg-surface">
            {list.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={s.name} size={40} tone={s.status === 'ready' ? 'forest' : 'light'} />
                  <p className="min-w-0 flex-1 font-semibold">
                    {s.name}
                    {s.id === membership.signer?.id && <span className="ml-1.5 font-normal text-muted">(you)</span>}
                  </p>
                  {s.status === 'ready' ? (
                    <Badge tone="ok" icon={isDraft ? 'check' : 'lock'}>Ready</Badge>
                  ) : (
                    <Badge tone="wait" icon="clock">Waiting for public key</Badge>
                  )}
                  {isDraft && s.status !== 'ready' && membership.isAdmin && s.id !== membership.signer?.id && (
                    <Button variant="secondary" size="sm" busy={simulating === s.id} onClick={() => void simulate(s.id)}>
                      Simulate registration (demo)
                    </Button>
                  )}
                </div>
                {s.status === 'ready' && s.xpub && (
                  <dl className="grid gap-x-6 gap-y-2 pl-0 text-sm sm:grid-cols-[auto_1fr] sm:pl-[52px]">
                    <dt className="text-muted">Fingerprint</dt>
                    <dd className="font-mono">{s.fingerprint ?? 'not given'}</dd>
                    <dt className="text-muted">Path</dt>
                    <dd className="font-mono">{s.derivationPath}</dd>
                    <dt className="text-muted">Public key</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-2">
                      <code className="font-mono" title={s.xpub}>{shortHash(s.xpub, 14, 10)}</code>
                      <CopyButton value={s.xpub} className="h-8" />
                    </dd>
                    {s.registeredAt && (
                      <>
                        <dt className="text-muted">Registered</dt>
                        <dd>{dateTime(s.registeredAt)}</dd>
                      </>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>

          <p className="flex items-start gap-2 text-sm text-muted">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
            CommunitySafe stores public keys only. Private keys and recovery words stay on each signer’s device and are never requested.
          </p>
        </>
      )}

      {mode === 'setup' && (
        <div className="flex justify-between border-t border-line pt-6">
          <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/setup/rule')}>
            Back
          </Button>
          <Button size="lg" iconRight="arrowRight" disabled={ready !== list.length || list.length === 0} onClick={() => navigate('/setup/review')}>
            {ready === list.length ? 'Review and create' : `Waiting for ${list.length - ready} signer${list.length - ready === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}
    </div>
  )
}

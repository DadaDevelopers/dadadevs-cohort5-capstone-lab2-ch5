import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { ApiError, errorMessage } from '../api/errors'
import { Icon, type IconName } from '../components/Icon'
import { Avatar, Badge, Button, cx, ErrorState, LoadingBlock, Notice, TextArea, TextField } from '../components/ui'
import { useCommunity } from '../context/CommunityContext'
import { useAsync } from '../lib/useAsync'
import type { CommunityType } from '../types'

const TYPES: { value: CommunityType; label: string; icon: IconName; hint: string }[] = [
  { value: 'community', label: 'Community', icon: 'house', hint: 'Residents, chamas, village projects' },
  { value: 'organization', label: 'Organization', icon: 'building', hint: 'NGOs, schools, clubs' },
  { value: 'group', label: 'Group', icon: 'group', hint: 'Friends, teams, study groups' },
]

export function StepHeader({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <header className="mb-8">
      <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">Step {step} of 5</p>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight">{title}</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{description}</p>
    </header>
  )
}

export function CreateCommunity() {
  const navigate = useNavigate()
  const { selectCommunity } = useCommunity()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<CommunityType>('community')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length < 3) next.name = 'Give the community a name of at least 3 characters.'
    if (description.length > 1000) next.description = 'Keep the description under 1000 characters.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setFormError(null)
    try {
      const c = await api.createCommunity({ name, description, type })
      await selectCommunity(c.id)
      navigate('/setup/members')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepHeader step={1} title="Create your community" description="Start by giving your community a name and description. You will become its administrator." />
      {formError && <Notice tone="bad" title="The community was not created" className="mb-6">{formError}</Notice>}
      <div className="flex flex-col gap-6">
        <TextField label="Community name" placeholder="e.g. Dada Developers Initiative" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <div>
          <TextArea
            label="Description"
            optional
            placeholder="Tell members what the community is about and what the money is for."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
            maxLength={1000}
          />
          <p className="mt-1 text-right text-sm tabular text-muted">{description.length}/1000</p>
        </div>
        <fieldset>
          <legend className="text-[15px] font-semibold">Community type</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={cx(
                  'flex cursor-pointer flex-col gap-3 border p-5 transition-colors',
                  type === t.value ? 'border-teal-ink bg-teal' : 'border-line-strong bg-surface hover:bg-sunken',
                )}
              >
                <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                <Icon name={t.icon} size={24} />
                <span className="text-lg font-bold">{t.label}</span>
                <span className="text-sm text-ink-soft">{t.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-10 flex justify-end border-t border-line pt-6">
        <Button type="submit" size="lg" iconRight="arrowRight" busy={busy}>
          Next
        </Button>
      </div>
    </form>
  )
}

export function ReviewAndCreate() {
  const navigate = useNavigate()
  const { community, wallet, membership, refresh } = useCommunity()
  const cid = community?.id ?? ''
  const members = useAsync(() => api.listMembers(cid), [cid])
  const signers = useAsync(() => api.listSigners(cid), [cid])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!community || !wallet || !membership) return null

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.createWallet(cid)
      // The setup layout sees the wallet is active and moves on to the wallet screen.
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const loading = members.loading || signers.loading
  const loadError = members.error ?? signers.error

  return (
    <div>
      <StepHeader step={5} title="Register & create the wallet" description="Check everything below. Creating the wallet fixes the signer set and the approval rule." />
      {loading && !members.data ? (
        <LoadingBlock rows={3} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => { members.reload(); signers.reload() }} />
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid border border-line sm:grid-cols-3">
            <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
              <dt className="text-sm font-semibold text-muted">Community</dt>
              <dd className="mt-1 text-lg font-bold">{community.name}</dd>
            </div>
            <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
              <dt className="text-sm font-semibold text-muted">Members</dt>
              <dd className="mt-1 text-lg font-bold">{members.data?.length ?? 0}</dd>
            </div>
            <div className="p-5">
              <dt className="text-sm font-semibold text-muted">Approval rule</dt>
              <dd className="mt-1 text-lg font-bold">
                {wallet.threshold} of {wallet.signerCount} signers must approve
              </dd>
            </div>
          </dl>
          <section>
            <h2 className="text-lg font-bold">Authorised signers</h2>
            <ul className="mt-3 border border-line">
              {(signers.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <Avatar name={s.name} size={36} />
                  <span className="flex-1 font-semibold">{s.name}</span>
                  {s.status === 'ready' ? (
                    <Badge tone="ok" icon="check">Key registered{s.fingerprint ? ` · ${s.fingerprint}` : ''}</Badge>
                  ) : (
                    <Badge tone="wait" icon="clock">Waiting for key</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <Notice tone="lock" title="What gets fixed when you create the wallet">
            The {wallet.signerCount} signers and the rule “{wallet.threshold} of {wallet.signerCount} must approve” are built into the wallet’s Bitcoin address.
            They cannot be changed afterwards. Adding or replacing a signer would need a new wallet, which this version does not support.
            You can still add ordinary members at any time.
          </Notice>
          {error && <Notice tone="bad" title="The wallet was not created">{error}</Notice>}
          {membership.isAdmin ? (
            <div className="flex justify-between border-t border-line pt-6">
              <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/setup/signers')}>
                Back
              </Button>
              <Button size="lg" busy={busy} onClick={create} icon="lock">
                {busy ? 'Creating wallet…' : 'Create wallet'}
              </Button>
            </div>
          ) : (
            <Notice tone="info">Only the administrator can create the wallet. Switch to the Administrator view to finish setup.</Notice>
          )}
        </div>
      )}
    </div>
  )
}

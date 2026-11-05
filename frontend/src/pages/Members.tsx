import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { ApiError, errorMessage } from '../api/errors'
import { Icon } from '../components/Icon'
import { Avatar, Badge, Button, cx, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, TextField } from '../components/ui'
import { useCommunity } from '../context/CommunityContext'
import { date } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { AuthorisedSigner, CommunityMember } from '../types'
import { StepHeader } from './Setup'

function AddMemberForm({ communityId, onAdded }: { communityId: string; onAdded: (m: CommunityMember) => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address, like name@example.org.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setFormError(null)
    try {
      const m = await api.addMember(communityId, { email })
      onAdded(m)
      setAdded(m.name)
      setEmail('')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button icon="plus" onClick={() => setOpen(true)}>
        Add member
      </Button>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="w-full border border-ink bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Add a member</h2>
          <p className="mt-0.5 text-sm text-muted">Enter the email address of an existing CommunitySafe account. Membership does not automatically grant signing authority.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="p-1.5 hover:bg-sunken" aria-label="Close add member form">
          <Icon name="x" size={20} />
        </button>
      </div>
      {formError && <Notice tone="bad" className="mt-4">{formError}</Notice>}
      {added && !formError && <Notice tone="ok" className="mt-4">{added} was added to the community.</Notice>}
      <div className="mt-4">
        <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="name@example.org" />
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" busy={busy} icon="plus">
          Add to community
        </Button>
      </div>
    </form>
  )
}

/**
 * Member list and signer selection. In setup mode the administrator picks
 * signers here; once the wallet exists the selection is shown as fixed.
 */
export default function Members({ mode = 'app' }: { mode?: 'app' | 'setup' }) {
  const navigate = useNavigate()
  const { community, wallet, membership, refresh } = useCommunity()
  const cid = community?.id ?? ''
  const data = useAsync(() => Promise.all([api.listMembers(cid), api.listSigners(cid)]), [cid, membership?.member.id])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)

  const members: CommunityMember[] = useMemo(() => data.data?.[0] ?? [], [data.data])
  const signers: AuthorisedSigner[] = useMemo(() => data.data?.[1] ?? [], [data.data])

  useEffect(() => {
    setSelected(new Set(signers.map((s) => s.memberId)))
  }, [signers])

  if (!community || !wallet || !membership) return null
  const isDraft = wallet.status === 'draft'
  const canPickSigners = membership.isAdmin && isDraft
  const admin = members.find((m) => m.isAdmin)

  const filtered = members.filter((m) => {
    const q = query.trim().toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.email.includes(q)
  })

  const toggle = (memberId: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(memberId)
      else next.delete(memberId)
      return next
    })
  }

  const saveSigners = async () => {
    setSaveError(null)
    if (selected.size < 2) {
      setSaveError('Choose at least 2 signers. A single signer would put the funds back in one person’s hands.')
      return
    }
    setSaving(true)
    try {
      await api.setAuthorisedSigners(cid, [...selected])
      await refresh()
      navigate('/setup/rule')
    } catch (err) {
      setSaveError(errorMessage(err))
      setSaving(false)
    }
  }

  const changeRole = async (member: CommunityMember, isAdmin: boolean) => {
    setActingOn(member.id)
    setMemberActionError(null)
    try {
      await api.changeMemberRole(cid, member.userId, isAdmin)
      await Promise.all([data.reload(), refresh()])
    } catch (err) {
      setMemberActionError(errorMessage(err))
    } finally {
      setActingOn(null)
    }
  }

  const remove = async (member: CommunityMember) => {
    if (!window.confirm(`Remove ${member.name} from this community?`)) return
    setActingOn(member.id)
    setMemberActionError(null)
    try {
      await api.removeMember(cid, member.userId)
      await data.reload()
    } catch (err) {
      setMemberActionError(errorMessage(err))
    } finally {
      setActingOn(null)
    }
  }

  const header =
    mode === 'setup' ? (
      <StepHeader
        step={2}
        title="Add members"
        description="Add everyone who belongs to the community, then choose which of them will be authorised signers. Members can see everything; only signers can approve spending."
      />
    ) : (
      <PageHeader
        title="Members"
        description={`${members.length || '…'} people belong to ${community.name}. Membership lets people see the wallet. Signing authority is separate.`}
      />
    )

  return (
    <div className="flex flex-col gap-6">
      {header}

      {membership.isAdmin ? (
        <div className="flex flex-wrap items-start gap-4">
          <AddMemberForm communityId={cid} onAdded={() => data.reload()} />
        </div>
      ) : (
        <Notice tone="info" title="You can see who is in the community">
          Only the administrator{admin ? `, ${admin.name},` : ''} can add members or choose signers.
        </Notice>
      )}

      {!isDraft && (
        <Notice tone="lock" title="The signer set is fixed">
          These {signers.length} signers were built into the wallet when it was created
          {wallet.createdAt ? ` on ${date(wallet.createdAt)}` : ''}. Nobody, including the administrator, can add, remove or replace a signer.
          A change would need a new wallet, which this version does not support.
        </Notice>
      )}

      {memberActionError && <Notice tone="bad">{memberActionError}</Notice>}

      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search members"
          className="h-12 w-full border border-line-strong bg-surface pl-10 pr-3 text-[15px] outline-none focus:border-ink"
        />
      </div>

      {data.loading && !data.data ? (
        <LoadingBlock rows={5} label="Loading members" />
      ) : data.error ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : members.length === 0 ? (
        <EmptyState icon="users" title="No members yet">Add the people who belong to this community.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title="Nobody matches that search">Try part of a first name or email address.</EmptyState>
      ) : (
        <ul className="border border-line bg-surface">
          {filtered.map((m) => {
            const isSigner = selected.has(m.id)
            const signerRecord = signers.find((s) => s.memberId === m.id)
            const isYou = m.id === membership.member.id
            return (
              <li key={m.id} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <Avatar name={m.name} size={44} tone={signerRecord || isSigner ? 'forest' : 'light'} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {m.name}
                      {isYou && <span className="text-sm font-normal text-muted">(you)</span>}
                      {m.isAdmin && <Badge tone="neutral">Administrator</Badge>}
                    </p>
                    <p className="truncate text-sm text-muted">{m.email}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {canPickSigners ? (
                  <label className="flex items-center gap-2 text-sm font-semibold sm:w-52">
                    <span className="sr-only">Role for {m.name}</span>
                    <select
                      value={isSigner ? 'signer' : 'member'}
                      onChange={(e) => toggle(m.id, e.target.value === 'signer')}
                      className={cx('h-11 w-full border bg-surface px-3 text-[15px] font-semibold outline-none focus:border-ink', isSigner ? 'border-teal-ink' : 'border-line-strong')}
                    >
                      <option value="member">Member</option>
                      <option value="signer">Authorised signer</option>
                    </select>
                  </label>
                ) : signerRecord ? (
                  <Badge tone="teal" icon={isDraft ? 'key' : 'lock'}>Authorised signer</Badge>
                ) : (
                  <Badge tone="neutral">Member</Badge>
                )}
                {membership.isAdmin && !isYou && (
                  <>
                    <select
                      aria-label={`Membership role for ${m.name}`}
                      value={m.isAdmin ? 'admin' : 'member'}
                      disabled={actingOn === m.id}
                      onChange={(event) => void changeRole(m, event.target.value === 'admin')}
                      className="h-11 border border-line-strong bg-surface px-3 text-sm font-semibold outline-none focus:border-ink"
                    >
                      <option value="member">Member access</option>
                      <option value="admin">Administrator</option>
                    </select>
                    <Button variant="ghost" size="sm" busy={actingOn === m.id} onClick={() => void remove(m)}>Remove</Button>
                  </>
                )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {mode === 'setup' && (
        <div className="flex flex-col gap-4 border-t border-line pt-6">
          {canPickSigners ? (
            <>
              <p className="text-[15px]">
                <span className="font-bold">{selected.size} signer{selected.size === 1 ? '' : 's'} selected.</span>{' '}
                <span className="text-ink-soft">You can include yourself, but being administrator does not make you a signer automatically.</span>
              </p>
              {saveError && <Notice tone="bad">{saveError}</Notice>}
              <div className="flex justify-end">
                <Button size="lg" iconRight="arrowRight" busy={saving} onClick={saveSigners}>
                  Save signers and continue
                </Button>
              </div>
            </>
          ) : (
            <Notice tone="info">Waiting for the administrator to choose the signers.</Notice>
          )}
        </div>
      )}
    </div>
  )
}

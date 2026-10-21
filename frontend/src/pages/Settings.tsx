import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api'
import { ApiError, errorMessage } from '../api/errors'
import { Icon, type IconName } from '../components/Icon'
import { Button, KeyValue, Notice, PageHeader, Panel, TextArea, TextField } from '../components/ui'
import { useActiveCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { date } from '../lib/format'

const LINKS: { to: string; icon: IconName; title: string; body: string }[] = [
  { to: '/app/members', icon: 'users', title: 'Members', body: 'Who belongs to the community' },
  { to: '/app/signers', icon: 'key', title: 'Signers', body: 'Signer public keys and readiness' },
  { to: '/app/approval-rule', icon: 'rule', title: 'Approval rule', body: 'How many signatures a payment needs' },
  { to: '/app/audit', icon: 'audit', title: 'Audit log', body: 'Every important action, with timestamps' },
]

export default function Settings() {
  const navigate = useNavigate()
  const { logout } = useSession()
  const { community, wallet, membership, refresh } = useActiveCommunity()
  const [name, setName] = useState(community.name)
  const [description, setDescription] = useState(community.description)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 3) {
      setErrors({ name: 'Give the community a name of at least 3 characters.' })
      return
    }
    setErrors({})
    setBusy(true)
    setStatus(null)
    try {
      await api.updateCommunity(community.id, { name, description })
      await refresh()
      setStatus({ tone: 'ok', text: 'Community details saved.' })
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      setStatus({ tone: 'bad', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <Panel title="Community information">
        {membership.isAdmin ? (
          <form onSubmit={save} noValidate className="flex flex-col gap-5 p-5 sm:p-6">
            {status && <Notice tone={status.tone}>{status.text}</Notice>}
            <TextField label="Community name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
            <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            <div className="flex justify-end">
              <Button type="submit" busy={busy}>
                Save changes
              </Button>
            </div>
          </form>
        ) : (
          <dl className="flex flex-col gap-4 p-5 sm:p-6">
            <KeyValue label="Community name">{community.name}</KeyValue>
            <KeyValue label="Description">{community.description || 'No description'}</KeyValue>
            <p className="text-sm text-muted">Only the administrator can change these details.</p>
          </dl>
        )}
      </Panel>

      <Panel title="Multisig configuration">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <dl className="grid gap-5 sm:grid-cols-4">
            <KeyValue label="Approval rule">
              <span className="text-xl font-extrabold">
                {wallet.threshold} of {wallet.signerCount}
              </span>
            </KeyValue>
            <KeyValue label="Wallet type">P2WSH multisig</KeyValue>
            <KeyValue label="Network">
              <span className="font-mono uppercase">{wallet.network}</span>
            </KeyValue>
            <KeyValue label="Created">{wallet.createdAt ? date(wallet.createdAt) : '–'}</KeyValue>
          </dl>
          <Notice tone="lock">Fixed when the wallet was created. Nobody can change the rule or the signer set from here.</Notice>
        </div>
      </Panel>

      <ul className="border border-line bg-surface">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0 hover:bg-paper">
              <Icon name={l.icon} size={22} />
              <span className="flex-1">
                <span className="block font-bold">{l.title}</span>
                <span className="block text-sm text-muted">{l.body}</span>
              </span>
              <Icon name="chevronRight" size={20} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <div>
        <Button
          variant="ghost"
          icon="logout"
          className="text-bad-ink"
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          Log out
        </Button>
      </div>
    </div>
  )
}

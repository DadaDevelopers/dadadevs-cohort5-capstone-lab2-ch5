import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Button, KeyValue, Notice, PageHeader, Panel } from '../components/ui'
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
  const { community, wallet, membership } = useActiveCommunity()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <Panel title="Community information">
        <dl className="flex flex-col gap-4 p-5 sm:p-6">
          <KeyValue label="Community name">{community.name}</KeyValue>
          <KeyValue label="Description">{community.description || 'No description'}</KeyValue>
          {membership.isAdmin && community.joinCode && <KeyValue label="Member join code"><span className="font-mono font-bold">{community.joinCode}</span></KeyValue>}
          <p className="text-sm text-muted">Community detail editing is not available in the current server API.</p>
        </dl>
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

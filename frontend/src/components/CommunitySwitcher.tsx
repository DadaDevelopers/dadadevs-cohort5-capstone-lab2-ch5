import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommunity } from '../context/CommunityContext'
import type { Community, SetupStage } from '../types'
import { cx } from './ui'

const STAGE_LABELS: Record<Exclude<SetupStage, 'active'>, string> = {
  members: 'Add members',
  rule: 'Set approval rule',
  signers: 'Add signer keys',
  review: 'Review and create',
}

export function communityDestination(community: Community): string {
  return community.setupStage === 'active' ? '/app' : `/setup/${community.setupStage}`
}

export function communityOptionLabel(community: Community): string {
  return community.setupStage === 'active'
    ? community.name
    : `${community.name} — Setup: ${STAGE_LABELS[community.setupStage]}`
}

export function CommunitySwitcher({ tone = 'light', className, showError = true }: { tone?: 'light' | 'dark'; className?: string; showError?: boolean }) {
  const { communities, community, loading, error, selectCommunity } = useCommunity()
  const navigate = useNavigate()
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (communities.length < 2) return null

  const onChange = async (id: string) => {
    if (id === community?.id) return
    setPendingId(id)
    const selected = await selectCommunity(id)
    setPendingId(null)
    if (selected) navigate(communityDestination(selected), { replace: true })
  }

  const errorId = error && showError ? 'community-switch-error' : undefined
  return (
    <div className={cx('min-w-0', className)}>
      <label className="block min-w-0">
        <span className={cx('mb-1 block text-[11px] font-bold uppercase tracking-wider', tone === 'dark' ? 'text-white/60' : 'text-muted')}>Current community</span>
        <select
          aria-label="Switch community"
          aria-describedby={errorId}
          value={pendingId ?? community?.id ?? ''}
          disabled={loading || pendingId !== null}
          onChange={(event) => void onChange(event.target.value)}
          className={cx(
            'h-10 w-full min-w-0 truncate rounded-lg border px-3 text-sm font-semibold outline-none focus:ring-2',
            tone === 'dark'
              ? 'border-white/25 bg-forest-2 text-white focus:border-white focus:ring-white/30'
              : 'border-line-strong bg-surface text-ink focus:border-teal-ink focus:ring-teal/50',
          )}
        >
          {!community && <option value="" disabled>Choose a community</option>}
          {communities.map((item) => <option key={item.id} value={item.id}>{communityOptionLabel(item)}</option>)}
        </select>
      </label>
      {error && showError && <p id={errorId} role="alert" className={cx('mt-1.5 text-xs leading-snug', tone === 'dark' ? 'text-red-200' : 'text-bad-ink')}>{error}</p>}
    </div>
  )
}

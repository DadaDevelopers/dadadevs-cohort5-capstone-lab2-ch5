import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import type { SetupStage } from '../types'
import { Icon, Logo } from './Icon'
import { PrototypeBanner } from './PrototypeBanner'
import { Button, cx, ErrorState, Skeleton } from './ui'
import { CommunitySwitcher } from './CommunitySwitcher'
import { NotificationBell } from './NotificationBell'

export const SETUP_STEPS: { stage: SetupStage | 'create'; path: string; label: string; hint: string }[] = [
  { stage: 'create', path: '/start', label: 'Create community', hint: 'Name and type' },
  { stage: 'members', path: '/setup/members', label: 'Add members', hint: 'Who belongs, who signs' },
  { stage: 'rule', path: '/setup/rule', label: 'Set approval rule', hint: 'How many must approve' },
  { stage: 'signers', path: '/setup/signers', label: 'Add signer keys', hint: 'Public keys only' },
  { stage: 'review', path: '/setup/review', label: 'Register & create', hint: 'Create the wallet' },
]

const stageIndex: Record<SetupStage, number> = { members: 1, rule: 2, signers: 3, review: 4, active: 5 }

/** The five-step onboarding shell from the Figma "Create community" frames. */
export function SetupLayout() {
  const { user, logout } = useSession()
  const { community, ready, error, refresh, clear } = useCommunity()
  const location = useLocation()
  const navigate = useNavigate()
  const onStart = location.pathname === '/start'
  const onLogout = async () => {
    clear()
    await logout()
    navigate('/login', { replace: true })
  }

  if (!user) return <Navigate to="/login" replace />
  if (!ready) {
    return (
      <div className="min-h-dvh">
        <PrototypeBanner />
        <div className="p-10" role="status">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-10 w-80" />
          <Skeleton className="mt-6 h-72 max-w-3xl" />
        </div>
      </div>
    )
  }

  const draft = !onStart && community && community.setupStage !== 'active' ? community : null
  if (!onStart) {
    if (!community && !error) return <Navigate to="/start" replace />
    if (community?.setupStage === 'active') {
      // Finishing step 5 lands on the wallet so the new receiving address is the first thing shown.
      const justCreated = location.pathname === '/setup/review'
      return <Navigate to={justCreated ? '/app/wallet' : '/app'} replace state={{ created: justCreated }} />
    }
    if (community) {
      const requested = SETUP_STEPS.findIndex((s) => s.path === location.pathname)
      if (requested > stageIndex[community.setupStage]) return <Navigate to={`/setup/${community.setupStage}`} replace />
    }
  }
  const reached = draft ? stageIndex[draft.setupStage] : 0
  const currentIndex = SETUP_STEPS.findIndex((s) => s.path === location.pathname)

  return (
    <div className="flex min-h-dvh flex-col">
      <PrototypeBanner />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="shrink-0 bg-night text-white md:w-72">
          <div className="flex min-h-16 items-center gap-2.5 px-4 py-3 md:px-6">
            <Link to="/" aria-label="CommunitySafe home" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-white">
              <Logo size={26} />
              <span className="text-lg font-bold">CommunitySafe</span>
            </Link>
            <span className="ml-auto rounded-lg bg-white"><NotificationBell /></span>
            <Button variant="inverse" size="sm" icon="logout" onClick={onLogout}>Log out</Button>
          </div>
          <CommunitySwitcher tone="dark" showError={!!community} className="px-4 pb-4 md:px-6" />
          {draft && <p className="px-6 pb-2 text-sm text-white/70">Setting up <span className="font-semibold text-white">{draft.name}</span></p>}
          <ol className="flex gap-1 overflow-x-auto px-3 pb-4 md:mt-6 md:flex-col md:gap-6 md:overflow-visible md:pb-10">
            {SETUP_STEPS.map((step, i) => {
              const done = i < reached
              const current = i === currentIndex
              const reachable = !onStart && i >= 1 && i <= reached
              const content = (
                <span className={cx('flex items-center gap-3 px-3 py-2', current && 'bg-forest-2')}>
                  <span
                    className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center text-sm font-bold',
                      done ? 'bg-accent text-white' : current ? 'bg-accent text-white' : 'border border-accent text-accent',
                    )}
                  >
                    {done && !current ? <Icon name="check" size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className={cx('block font-semibold', current ? 'text-white' : 'text-white/85')}>{step.label}</span>
                    <span className="block text-xs text-white/55">{step.hint}</span>
                  </span>
                  <span className={cx('whitespace-nowrap text-sm font-semibold md:hidden', current ? 'block' : 'hidden')}>{step.label}</span>
                </span>
              )
              return (
                <li key={step.path} aria-current={current ? 'step' : undefined}>
                  {reachable && !current ? (
                    <Link to={step.path} className="block hover:bg-white/5">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              )
            })}
          </ol>
        </aside>
        <main className="flex-1 bg-surface px-4 py-8 sm:px-8 lg:px-16 lg:py-12">
          <div className="mx-auto max-w-3xl">
            {error && !community ? (
              <ErrorState title="This community is unavailable" message={error} onRetry={() => void refresh()} />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

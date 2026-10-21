import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { roleLabel } from '../lib/status'
import { Icon, Logo, type IconName } from './Icon'
import { PrototypeBanner } from './PrototypeBanner'
import { RoleSwitcher } from './RoleSwitcher'
import { Avatar, Button, cx, ErrorState, Skeleton } from './ui'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/app', label: 'Dashboard', icon: 'home', end: true },
  { to: '/app/wallet', label: 'Wallet', icon: 'wallet' },
  { to: '/app/requests', label: 'Spending requests', icon: 'request' },
  { to: '/app/transactions', label: 'Transactions', icon: 'transfer' },
  { to: '/app/members', label: 'Members', icon: 'users' },
  { to: '/app/signers', label: 'Signers', icon: 'key' },
  { to: '/app/approval-rule', label: 'Approval rule', icon: 'rule' },
  { to: '/app/audit', label: 'Audit log', icon: 'audit' },
  { to: '/app/settings', label: 'Settings', icon: 'gear' },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { community, wallet } = useCommunity()
  return (
    <div className="flex h-full flex-col bg-forest text-white">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <Logo size={28} />
        <span className="text-lg font-bold">CommunitySafe</span>
      </div>
      <nav className="mt-2 flex-1 overflow-y-auto px-3" aria-label="Main">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 border-l-4 px-3 py-2.5 text-[15px] font-semibold transition-colors',
                    isActive ? 'border-accent bg-forest-2 text-white' : 'border-transparent text-white/80 hover:bg-forest-2 hover:text-white',
                  )
                }
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {community && wallet && (
        <div className="border-t border-white/20 px-6 py-5">
          <p className="font-bold leading-snug">{community.name}</p>
          <p className="mt-1 text-sm text-white/75">
            {wallet.threshold} of {wallet.signerCount} signers must approve
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-white/50">{wallet.network} · {wallet.scriptType}</p>
        </div>
      )}
    </div>
  )
}

function AppSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PrototypeBanner />
      <div className="flex flex-1">
        <div className="hidden w-64 bg-forest lg:block" />
        <main className="flex-1 p-6 lg:p-10" role="status" aria-live="polite">
          <span className="sr-only">Loading your community…</span>
          <Skeleton className="h-9 w-72" />
          <Skeleton className="mt-3 h-5 w-96 max-w-full" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="mt-6 h-64" />
        </main>
      </div>
    </div>
  )
}

/** Shell for every signed-in screen once a community wallet exists. */
export function AppLayout() {
  const { user, logout } = useSession()
  const { community, membership, ready, error, refresh } = useCommunity()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => setMenuOpen(false), [location.pathname])

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!ready) return <AppSkeleton />
  if (error && !community) {
    return (
      <div className="min-h-dvh">
        <PrototypeBanner showDemoControls />
        <div className="mx-auto max-w-2xl p-6 pt-16">
          <ErrorState title="Your community could not be loaded" message={error} onRetry={() => void refresh()} />
        </div>
      </div>
    )
  }
  if (!community || !membership) return <Navigate to="/start" replace />
  if (community.setupStage !== 'active') return <Navigate to={`/setup/${community.setupStage}`} replace />

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PrototypeBanner showDemoControls />
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
          <Sidebar />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-night/60" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:px-10">
            <button className="-ml-1 p-2 hover:bg-sunken lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Icon name="menu" size={22} />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <Logo size={22} />
              <span className="font-bold">CommunitySafe</span>
            </div>
            <div className="order-last w-full sm:order-none sm:w-auto">
              <RoleSwitcher />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Avatar name={user.name} size={36} />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-bold leading-tight">{user.name}</p>
                <p className="truncate text-xs text-muted">{roleLabel(membership)}</p>
              </div>
              <Button variant="ghost" size="sm" icon="logout" onClick={onLogout} aria-label="Log out">
                <span className="hidden md:inline">Log out</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

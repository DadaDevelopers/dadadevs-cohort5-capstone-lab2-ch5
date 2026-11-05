import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { roleLabel } from '../lib/status'
import { Icon, Logo, type IconName } from './Icon'
import { PrototypeBanner } from './PrototypeBanner'
import { Avatar, Button, cx, ErrorState, Skeleton } from './ui'
import { CommunitySwitcher } from './CommunitySwitcher'
import { NotificationBell } from './NotificationBell'

interface NavigationItem { to: string; label: string; icon: IconName; end?: boolean; unavailable?: boolean }

export const NAV_GROUPS: { label: string; items: NavigationItem[] }[] = [
  { label: 'Overview', items: [
    { to: '/app', label: 'Dashboard', icon: 'home', end: true },
    { to: '/app/wallet', label: 'Wallet', icon: 'wallet' },
  ] },
  { label: 'Money', items: [
    { to: '/app/requests', label: 'Spending requests', icon: 'request' },
    { to: '/app/transactions', label: 'Transactions', icon: 'transfer' },
  ] },
  { label: 'Community', items: [
    { to: '/app/members', label: 'Members', icon: 'users' },
    { to: '/app/signers', label: 'Signers', icon: 'key' },
  ] },
  { label: 'Governance', items: [
    { to: '/app/approval-rule', label: 'Approval rule', icon: 'rule' },
    { to: '/app/audit', label: 'Audit log', icon: 'audit' },
  ] },
]

const SETTINGS: NavigationItem = { to: '/app/settings', label: 'Settings', icon: 'gear' }

function NavigationLink({ item, onNavigate, collapsed = false }: { item: NavigationItem; onNavigate?: () => void; collapsed?: boolean }) {
  const accessibleLabel = item.unavailable ? `${item.label} (coming soon)` : item.label
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? accessibleLabel : undefined}
      title={collapsed ? accessibleLabel : undefined}
      className={({ isActive }) =>
        cx(
          'flex min-h-11 items-center rounded-lg border-l-4 text-[15px] font-semibold transition-colors',
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive ? 'border-teal-line bg-forest-2 text-white' : 'border-transparent text-white/80 hover:bg-forest-2 hover:text-white',
        )
      }
    >
      <Icon name={item.icon} size={20} className="shrink-0" />
      <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 whitespace-nowrap'}>{item.label}</span>
      {item.unavailable && <span className={cx('rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/65', collapsed && 'sr-only')}>Soon</span>}
    </NavLink>
  )
}

function Sidebar({ onNavigate, collapsed = false, onToggle, idPrefix }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void; idPrefix: string }) {
  const { community, wallet } = useCommunity()
  return (
    <div className="flex h-full flex-col bg-forest text-white">
      <div className={cx('flex h-16 items-center', collapsed ? 'justify-center gap-1 px-1' : 'gap-2.5 px-4')}>
        <Link to="/" aria-label="CommunitySafe home" title={collapsed ? 'CommunitySafe home' : undefined} className={cx('flex min-w-0 items-center rounded-lg focus-visible:outline-white', collapsed ? 'justify-center' : 'flex-1 gap-2.5')}>
          <Logo size={28} />
          {!collapsed && <span className="whitespace-nowrap text-lg font-bold">CommunitySafe</span>}
        </Link>
        {onToggle && (
          <button type="button" onClick={onToggle} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-forest-2 hover:text-white" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls={`${idPrefix}-sidebar-navigation`} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={collapsed ? 'chevronRight' : 'arrowLeft'} size={18} />
          </button>
        )}
      </div>
      <nav id={`${idPrefix}-sidebar-navigation`} className={cx('min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')} aria-label="Main navigation">
        {NAV_GROUPS.map((group, index) => (
          <section key={group.label} className={cx(index === 0 ? 'mt-2' : collapsed ? 'mt-3' : 'mt-6')} aria-labelledby={`${idPrefix}-nav-${group.label.toLowerCase()}`}>
            <h2 id={`${idPrefix}-nav-${group.label.toLowerCase()}`} className={collapsed ? 'sr-only' : 'mb-2 px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50'}>{group.label}</h2>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => <li key={item.to}><NavigationLink item={item} onNavigate={onNavigate} collapsed={collapsed} /></li>)}
            </ul>
          </section>
        ))}
      </nav>
      <div className={cx('mt-auto border-t border-white/15', collapsed ? 'p-2' : 'p-3')}>
        {community && wallet && !collapsed && (
          <div className="mb-2 rounded-lg bg-night/25 px-3 py-3">
            <p className="truncate font-bold leading-snug">{community.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/70">{wallet.threshold} of {wallet.signerCount} signers must approve</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/50">{wallet.network} · {wallet.scriptType}</p>
          </div>
        )}
        <nav aria-label="Account navigation">
          <NavigationLink item={SETTINGS} onNavigate={onNavigate} collapsed={collapsed} />
        </nav>
      </div>
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
  const { community, membership, ready, error, refresh, clear } = useCommunity()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => setMenuOpen(false), [location.pathname])

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!ready) return <AppSkeleton />
  if (error && !community) {
    return (
      <div className="min-h-dvh">
        <PrototypeBanner />
        <div className="mx-auto max-w-2xl p-6 pt-16">
          <ErrorState title="Your community could not be loaded" message={error} onRetry={() => void refresh()} />
        </div>
      </div>
    )
  }
  if (!community || !membership) return <Navigate to="/start" replace />
  if (community.setupStage !== 'active') return <Navigate to={`/setup/${community.setupStage}`} replace />

  const onLogout = async () => {
    clear()
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PrototypeBanner />
      <div className="flex flex-1">
        <aside className={cx('sticky top-0 hidden h-[calc(100dvh-2.25rem)] shrink-0 overflow-hidden transition-[width] duration-200 lg:block', sidebarCollapsed ? 'w-[4.5rem]' : 'w-[17rem]')} data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'}>
          <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} idPrefix="desktop" />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-night/60" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
              <Sidebar onNavigate={() => setMenuOpen(false)} idPrefix="mobile" />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:px-10">
            <button className="-ml-1 p-2 hover:bg-sunken lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Icon name="menu" size={22} />
            </button>
            <Link to="/" aria-label="CommunitySafe home" className="flex items-center gap-2 rounded-lg lg:hidden">
              <Logo size={22} />
              <span className="font-bold">CommunitySafe</span>
            </Link>
            <CommunitySwitcher className="min-w-[12rem] flex-1 sm:max-w-sm" />
            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <Avatar name={user.name} size={36} />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-bold leading-tight">{user.name}</p>
                <p className="truncate text-xs text-muted">{roleLabel(membership)}</p>
              </div>
              <Button variant="ghost" size="sm" icon="logout" onClick={onLogout} aria-label="Log out">
                <span>Log out</span>
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

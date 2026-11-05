import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { Button, Notice, Spinner } from './ui'

export function ProtectedRoute() {
  const { user, initializing, restoreError, restore } = useSession()
  const location = useLocation()

  if (initializing) {
    return (
      <main className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <span className="flex items-center gap-3 font-semibold"><Spinner /> Restoring your session…</span>
      </main>
    )
  }
  if (restoreError && !user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-5">
        <Notice tone="bad" title="CommunitySafe could not restore your session">
          <p>{restoreError}</p>
          <Button className="mt-4" onClick={() => void restore()}>Try again</Button>
        </Notice>
      </main>
    )
  }
  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }
  return <Outlet />
}

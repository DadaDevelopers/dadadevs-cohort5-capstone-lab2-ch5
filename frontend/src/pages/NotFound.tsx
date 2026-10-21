import { useLocation } from 'react-router-dom'
import { Logo } from '../components/Icon'
import { PrototypeBanner } from '../components/PrototypeBanner'
import { ButtonLink } from '../components/ui'
import { useSession } from '../context/SessionContext'

export default function NotFound({ embedded = false }: { embedded?: boolean }) {
  const { user } = useSession()
  const location = useLocation()
  const Main = embedded ? 'div' : 'main'
  return (
    <div className={embedded ? '' : 'flex min-h-dvh flex-col bg-paper'}>
      {!embedded && <PrototypeBanner />}
      <Main className={embedded ? 'py-10' : 'mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16'}>
        <Logo size={40} />
        <p className="mt-8 text-sm font-bold uppercase tracking-wider text-accent-ink">Error 404</p>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight sm:text-5xl">This page does not exist.</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Nothing lives at <code className="break-all bg-sunken px-1.5 py-0.5 font-mono text-base">{location.pathname}</code>. The link may be old, or it may have
          a typo.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink to={user ? '/app' : '/'}>{user ? 'Go to the dashboard' : 'Go to the home page'}</ButtonLink>
          {!user && (
            <ButtonLink to="/login" variant="secondary">
              Log in
            </ButtonLink>
          )}
        </div>
      </Main>
    </div>
  )
}

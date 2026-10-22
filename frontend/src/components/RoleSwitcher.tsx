import { useState } from 'react'
import { errorMessage } from '../api/errors'
import { useCommunity } from '../context/CommunityContext'
import { useSession } from '../context/SessionContext'
import { demoRoleLabel, viewerRole } from '../lib/status'
import type { DemoRole } from '../types'
import { cx, Spinner } from './ui'

const ROLES: DemoRole[] = ['admin', 'signer', 'member']

/**
 * Prototype only. Signs in as the seeded person who holds each role so the
 * three permission levels can be compared from one browser.
 */
export function RoleSwitcher({ dark = false }: { dark?: boolean }) {
  const { switchRole } = useSession()
  const { community, membership } = useCommunity()
  const [pending, setPending] = useState<DemoRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!community || !membership) return null
  const current = viewerRole(membership)

  const choose = async (role: DemoRole) => {
    if (role === current || pending) return
    setPending(role)
    setError(null)
    try {
      await switchRole(community.id, role)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={cx('flex gap-2', dark ? 'flex-col items-start' : 'items-center')}>
        <span className={cx('text-xs font-semibold uppercase tracking-wider', dark ? 'text-white/70' : 'hidden text-muted lg:inline')}>View as</span>
        <div role="radiogroup" aria-label="Demo role" className={cx('inline-flex border', dark ? 'border-white/40' : 'border-ink')}>
          {ROLES.map((r) => {
            const active = r === current
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(r)}
                className={cx(
                  'inline-flex h-8 items-center gap-1 px-2.5 text-[13px] font-semibold transition-colors sm:px-3',
                  active ? (dark ? 'bg-white text-ink' : 'bg-ink text-white') : dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-sunken',
                )}
              >
                {pending === r && <Spinner className="h-3.5 w-3.5" />}
                {demoRoleLabel[r]}
              </button>
            )
          })}
        </div>
      </div>
      {error && <p className="max-w-xs text-xs text-bad-ink" role="alert">{error}</p>}
    </div>
  )
}

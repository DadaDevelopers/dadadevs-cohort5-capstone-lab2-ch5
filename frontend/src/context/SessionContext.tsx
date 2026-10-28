import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import type { User } from '../types'

interface SessionValue {
  user: User | null
  initializing: boolean
  restoreError: string | null
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  restore: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/** Holds the real backend session and restores it from tab-scoped storage after reload. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => api.onSessionExpired(() => setUser(null)), [])

  useEffect(() => {
    let active = true
    setInitializing(true)
    setRestoreError(null)
    void api.restoreSession().then((restored) => {
      if (active) setUser(restored)
    }).catch((error: unknown) => {
      if (active) setRestoreError(errorMessage(error))
    }).finally(() => {
      if (active) setInitializing(false)
    })
    return () => { active = false }
  }, [])

  const restore = useCallback(async () => {
    setInitializing(true)
    setRestoreError(null)
    try {
      setUser(await api.restoreSession())
    } catch (error) {
      setRestoreError(errorMessage(error))
    } finally {
      setInitializing(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login({ email, password })
    setUser(u)
    setRestoreError(null)
    return u
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const u = await api.register({ name, email, password })
    setUser(u)
    setRestoreError(null)
    return u
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
    setRestoreError(null)
  }, [])

  const value = useMemo(
    () => ({ user, initializing, restoreError, login, register, logout, restore }),
    [user, initializing, restoreError, login, register, logout, restore],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import * as api from '../api'
import type { DemoRole, User } from '../types'

interface SessionValue {
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** Prototype only: become the seeded person who holds a role in a community. */
  switchRole: (communityId: string, role: DemoRole) => Promise<User>
}

const SessionContext = createContext<SessionValue | null>(null)

/** Holds the signed-in user. The session lives in React state only, so reloading the page signs out. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login({ email, password })
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const u = await api.register({ name, email, password })
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const switchRole = useCallback(async (communityId: string, role: DemoRole) => {
    const u = await api.switchDemoRole(communityId, role)
    setUser(u)
    return u
  }, [])

  const value = useMemo(() => ({ user, login, register, logout, switchRole }), [user, login, register, logout, switchRole])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

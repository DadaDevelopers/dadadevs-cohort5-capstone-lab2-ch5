import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import type { Community, Membership, Wallet } from '../types'
import { useSession } from './SessionContext'

interface CommunityValue {
  communities: Community[]
  community: Community | null
  wallet: Wallet | null
  membership: Membership | null
  loading: boolean
  /** True once the first load for the current user has finished. */
  ready: boolean
  error: string | null
  /** Reloads the community, wallet and membership, for example after signing or creating the wallet. */
  refresh: () => Promise<void>
  /** Loads an accessible community atomically and returns it only on success. */
  selectCommunity: (id: string) => Promise<Community | null>
  /** Clears all in-memory and tab-scoped state owned by the current user. */
  clear: () => void
}

const CommunityContext = createContext<CommunityValue | null>(null)
const selectedCommunityKey = (userId: string) => `communitysafe.community.${userId}`

/** Holds the community the user is looking at, its wallet, and what the user may do there. */
export function CommunityProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const [communities, setCommunities] = useState<Community[]>([])
  const [community, setCommunity] = useState<Community | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const generation = useRef(0)
  const lastUserId = useRef<string | null>(null)

  const clearState = useCallback((userId?: string | null) => {
    generation.current += 1
    if (userId) sessionStorage.removeItem(selectedCommunityKey(userId))
    setCommunities([])
    setCommunity(null)
    setWallet(null)
    setMembership(null)
    setLoading(false)
    setError(null)
    setLoadedUserId(null)
  }, [])

  const load = useCallback(async (preferredId: string | null, userId: string) => {
    const requestGeneration = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const list = await api.listMyCommunities()
      if (requestGeneration !== generation.current) return null
      setCommunities(list)
      const storedId = sessionStorage.getItem(selectedCommunityKey(userId))
      const requestedId = preferredId ?? storedId
      const current = list.find((c) => c.id === requestedId) ?? (preferredId ? null : list[0] ?? null)
      if (!current) {
        if (preferredId) {
          setError('You no longer have access to that community. Choose another community.')
          return null
        }
        sessionStorage.removeItem(selectedCommunityKey(userId))
        setCommunity(null)
        setWallet(null)
        setMembership(null)
        return null
      }
      const context = await api.loadCommunityContext(current.id)
      if (requestGeneration !== generation.current) return null
      sessionStorage.setItem(selectedCommunityKey(userId), current.id)
      setCommunity(context.community)
      setWallet(context.wallet)
      setMembership(context.membership)
      setCommunities((items) => items.map((item) => item.id === current.id ? context.community : item))
      return context.community
    } catch (err) {
      if (requestGeneration === generation.current) setError(errorMessage(err))
      return null
    } finally {
      if (requestGeneration === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      clearState(lastUserId.current)
      lastUserId.current = null
      return
    }
    const userId = user.id
    if (lastUserId.current !== userId) clearState(lastUserId.current)
    lastUserId.current = userId
    void load(null, userId).then(() => {
      if (lastUserId.current === userId) setLoadedUserId(userId)
    })
    // Reload whenever the signed-in person changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const refresh = useCallback(async () => { if (user) await load(null, user.id) }, [load, user])
  const selectCommunity = useCallback((id: string) => user ? load(id, user.id) : Promise.resolve(null), [load, user])
  const clear = useCallback(() => clearState(user?.id ?? lastUserId.current), [clearState, user?.id])

  const ready = user !== null && loadedUserId === user.id
  const value = useMemo(
    () => ({ communities, community, wallet, membership, loading, ready, error, refresh, selectCommunity, clear }),
    [communities, community, wallet, membership, loading, ready, error, refresh, selectCommunity, clear],
  )
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>
}

export function useCommunity(): CommunityValue {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity must be used inside CommunityProvider')
  return ctx
}

/** For screens that only render once a community is loaded (inside AppLayout). */
export function useActiveCommunity() {
  const ctx = useCommunity()
  if (!ctx.community || !ctx.wallet || !ctx.membership) throw new Error('No active community')
  return { ...ctx, community: ctx.community, wallet: ctx.wallet, membership: ctx.membership }
}

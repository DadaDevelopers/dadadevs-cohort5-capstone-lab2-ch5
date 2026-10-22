import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  selectCommunity: (id: string) => Promise<void>
}

const CommunityContext = createContext<CommunityValue | null>(null)

/** Holds the community the user is looking at, its wallet, and what the user may do there. */
export function CommunityProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const [communities, setCommunities] = useState<Community[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [community, setCommunity] = useState<Community | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)

  const load = useCallback(async (preferredId: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listMyCommunities()
      setCommunities(list)
      const current = list.find((c) => c.id === preferredId) ?? list[0] ?? null
      if (!current) {
        setCommunity(null)
        setWallet(null)
        setMembership(null)
        setSelectedId(null)
        return
      }
      const [w, m] = await Promise.all([api.getWallet(current.id), api.getMembership(current.id)])
      setSelectedId(current.id)
      setCommunity(current)
      setWallet(w)
      setMembership(m)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setCommunities([])
      setCommunity(null)
      setWallet(null)
      setMembership(null)
      return
    }
    const userId = user.id
    void load(selectedId).then(() => setLoadedUserId(userId))
    // Reload whenever the signed-in person changes (login or role switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const refresh = useCallback(() => load(selectedId), [load, selectedId])
  const selectCommunity = useCallback((id: string) => load(id), [load])

  const ready = user !== null && loadedUserId === user.id
  const value = useMemo(
    () => ({ communities, community, wallet, membership, loading, ready, error, refresh, selectCommunity }),
    [communities, community, wallet, membership, loading, ready, error, refresh, selectCommunity],
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

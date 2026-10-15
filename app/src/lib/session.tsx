import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { supabase } from './supabase'

/** A UI selection only. Campaign authority always comes from server membership. */
export type Seat = { type: 'gm'; name: string } | { type: 'character'; id: string; name: string }
export interface Session {
  campaignId: string
  campaignName: string
  userId: string
  role: 'gm' | 'player'
  seat: Seat | null
}
type Result = { ok: boolean; error?: string }
interface SessionContextValue {
  session: Session | null
  loading: boolean
  sessionId: string
  createCampaign: (name: string) => Promise<Result>
  joinCampaign: (invitation: string) => Promise<Result>
  refreshMembership: () => Promise<void>
  claimSeat: (seat: Seat) => void
  releaseSeat: () => void
  leaveCampaign: () => void
}
const STORAGE_KEY = 'bitd.activeCampaign'
const SessionContext = createContext<SessionContextValue | null>(null)
// Context and its consumer hook intentionally share the campaign boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used within SessionProvider')
  return value
}
let identityPromise: Promise<string> | null = null
async function identity(): Promise<string> {
  if (!identityPromise) identityPromise = (async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (session) return session.user.id
    const signed = await supabase.auth.signInAnonymously()
    if (signed.error) throw signed.error
    return signed.data.user!.id
  })().finally(() => { identityPromise = null })
  return identityPromise
}
function selectedCampaign() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function selectCampaign(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('bitd.session') // Old claimed seats never establish authority.
  } catch { /* Browser persistence may be unavailable; current session still works. */ }
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionId] = useState(() => crypto.randomUUID())
  const refreshMembership = useCallback(async () => {
    const campaignId = selectedCampaign()
    if (!campaignId) { setSession(null); setLoading(false); return }
    try {
      const userId = await identity()
      const [campaign, member] = await Promise.all([
        supabase.from('campaigns').select('id,name').eq('id', campaignId).maybeSingle(),
        supabase.from('campaign_members').select('role').eq('campaign_id', campaignId).eq('user_id', userId).maybeSingle(),
      ])
      if (campaign.error) throw campaign.error
      if (member.error) throw member.error
      if (!campaign.data || !member.data) { selectCampaign(null); setSession(null); return }
      setSession({ campaignId, campaignName: campaign.data.name, userId, role: member.data.role, seat: null })
    } catch {
      // A failed restore must never display cached, potentially overprivileged state.
      setSession(null)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void supabase.auth.getSession().then(() => refreshMembership())
    const refresh = () => { void refreshMembership() }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh) }
  }, [refreshMembership])

  const enter = useCallback(async (operation: 'create_campaign' | 'join_campaign', value: string): Promise<Result> => {
    try {
      const userId = await identity()
      const args = operation === 'create_campaign' ? { p_name: value.trim() } : { p_invitation: value.trim() }
      const { data, error } = await supabase.rpc(operation, args)
      if (error) throw error
      selectCampaign(data.id)
      setSession({ campaignId: data.id, campaignName: data.name, userId, role: data.role, seat: null })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error || (error && typeof error === 'object' && 'message' in error) ? String(error.message) : 'Could not reach the server. Try again.' }
    }
  }, [])
  const createCampaign = useCallback((name: string) => enter('create_campaign', name), [enter])
  const joinCampaign = useCallback((invitation: string) => enter('join_campaign', invitation), [enter])
  const claimSeat = useCallback((seat: Seat) => {
    setSession(previous => previous && (seat.type !== 'gm' || previous.role === 'gm') ? { ...previous, seat } : previous)
  }, [])
  const releaseSeat = useCallback(() => setSession(previous => previous ? { ...previous, seat: null } : null), [])
  const leaveCampaign = useCallback(() => { selectCampaign(null); setSession(null) }, [])
  return <SessionContext.Provider value={{ session, loading, sessionId, createCampaign, joinCampaign, refreshMembership, claimSeat, releaseSeat, leaveCampaign }}>{children}</SessionContext.Provider>
}

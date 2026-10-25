import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

export interface Session {
  campaignId: string
  campaignName: string
  userId: string
  role: 'gm' | 'player'
}
type Result = { ok: boolean; error?: string }
interface SessionContextValue {
  session: Session | null
  loading: boolean
  accessError: string
  createCampaign: (name: string) => Promise<Result>
  joinCampaign: (invitation: string) => Promise<Result>
  refreshMembership: () => Promise<void>
  leaveCampaign: () => void
  account: User | null
  campaigns: { id: string; name: string; role: string }[]
  campaignListError: string
  accountError: string
  openCampaign: (id: string) => Promise<void>
  signOut: () => Promise<Result>
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
let identityPromise: Promise<User> | null = null
async function identity(): Promise<User> {
  if (!identityPromise) identityPromise = (async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (session) {
      const verified = await supabase.auth.getUser()
      if (verified.error || !verified.data.user) throw verified.error ?? new Error('Sign in again.')
      return verified.data.user
    }
    const signed = await supabase.auth.signInAnonymously()
    if (signed.error) throw signed.error
    return signed.data.user!
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
  const [accessError, setAccessError] = useState('')
  const [account, setAccount] = useState<User | null>(null)
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; role: string }[]>([])
  const [campaignListError, setCampaignListError] = useState('')
  const [accountError, setAccountError] = useState('')
  const accountId = useRef<string | null>(null)
  const generation = useRef(0)
  const entering = useRef(false)
  const refreshMembership = useCallback(async () => {
    if (entering.current) return
    const request = ++generation.current
    try {
      const stored = await supabase.auth.getSession()
      if (stored.error) throw stored.error
      const verified = stored.data.session ? await supabase.auth.getUser() : null
      if (verified?.error) throw verified.error
      if (request !== generation.current) return
      const user = verified?.data.user ?? null
      if (accountId.current && accountId.current !== user?.id) { selectCampaign(null); setSession(null); setCampaigns([]) }
      accountId.current = user?.id ?? null; setAccount(user)
      if (!user) { selectCampaign(null); setSession(null); setCampaigns([]); return }
      if (!user.is_anonymous) {
        const [tables, memberships] = await Promise.all([
          supabase.from('campaigns').select('id,name').order('created_at'),
          supabase.from('campaign_members').select('campaign_id,role').eq('user_id', user.id),
        ])
        if (request !== generation.current) return
        if (tables.error || memberships.error) { setCampaigns([]); setCampaignListError('Could not load your campaigns. Reconnect and retry.') }
        else {
          const roles = new Map(memberships.data.map(member => [member.campaign_id, member.role]))
          setCampaigns(tables.data.filter(table => roles.has(table.id)).map(table => ({ ...table, role: roles.get(table.id)! })))
          setCampaignListError('')
        }
      } else setCampaigns([])
      const campaignId = selectedCampaign()
      if (!campaignId) { setSession(null); return }
      const userId = user.id
      const [campaign, member] = await Promise.all([
        supabase.from('campaigns').select('id,name').eq('id', campaignId).maybeSingle(),
        supabase.from('campaign_members').select('role').eq('campaign_id', campaignId).eq('user_id', userId).maybeSingle(),
      ])
      if (request !== generation.current) return
      if (campaign.error) throw campaign.error
      if (member.error) throw member.error
      if (!campaign.data || !member.data) { selectCampaign(null); setSession(null); setAccessError('Campaign access is no longer authorized. Ask your GM for an invitation.'); return }
      setAccessError('')
      setSession({ campaignId, campaignName: campaign.data.name, userId, role: member.data.role })
    } catch {
      if (request !== generation.current) return
      setAccount(null); setCampaigns([])
      setAccessError('Could not verify campaign access. Reconnect and retry, or rejoin with your invitation.')
      // A failed restore must never display cached, potentially overprivileged state.
      setSession(null)
    } finally { if (request === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    const timers = new Set<number>()
    void supabase.auth.initialize().then(result => {
      if (!active) return
      if (result.error) {
        setAccountError('Google sign-in could not be completed. Your existing access was kept. Try again; if that Google account is already linked, use a different account or ask the GM to recover ownership.')
        const address = new URL(window.location.href)
        for (const key of ['error', 'error_code', 'error_description', 'code']) address.searchParams.delete(key)
        if (address.hash.includes('error=')) address.hash = ''
        window.history.replaceState(null, '', address.pathname + address.search + address.hash)
      }
      void refreshMembership()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT' || (accountId.current && accountId.current !== next?.user.id)) {
        generation.current++; entering.current = false; selectCampaign(null)
        accountId.current = null; setSession(null); setAccount(null); setCampaigns([])
      }
      // SDK auth callbacks must not await another auth call while its lock is held.
      const timer = window.setTimeout(() => { timers.delete(timer); if (active) void refreshMembership() }, 0)
      timers.add(timer)
    })
    const refresh = () => { void refreshMembership() }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      active = false
      // Invalidate every outstanding request at cleanup, using the latest counter.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      subscription.unsubscribe(); timers.forEach(timer => window.clearTimeout(timer)); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
    }
  }, [refreshMembership])

  const enter = useCallback(async (operation: 'create_campaign' | 'join_campaign', value: string): Promise<Result> => {
    const request = ++generation.current
    entering.current = true
    try {
      const user = await identity(), userId = user.id
      const args = operation === 'create_campaign' ? { p_name: value.trim() } : { p_invitation: value.trim() }
      const { data, error } = await supabase.rpc(operation, args)
      if (request !== generation.current) return { ok: false, error: 'Campaign selection changed. Try again.' }
      if (error) throw error
      setAccessError(''); setLoading(false)
      selectCampaign(data.id)
      accountId.current = userId; setAccount(user)
      setSession({ campaignId: data.id, campaignName: data.name, userId, role: data.role })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error || (error && typeof error === 'object' && 'message' in error) ? String(error.message) : 'Could not reach the server. Try again.' }
    } finally { if (request === generation.current) entering.current = false }
  }, [])
  const createCampaign = useCallback((name: string) => enter('create_campaign', name), [enter])
  const joinCampaign = useCallback((invitation: string) => enter('join_campaign', invitation), [enter])
  const leaveCampaign = useCallback(() => { generation.current++; entering.current = false; selectCampaign(null); setSession(null); setAccessError(''); void refreshMembership() }, [refreshMembership])
  const openCampaign = useCallback(async (id: string) => { selectCampaign(id); await refreshMembership() }, [refreshMembership])
  const signOut = useCallback(async (): Promise<Result> => {
    generation.current++; entering.current = true; selectCampaign(null); setSession(null); setCampaigns([])
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    entering.current = false
    if (error) { setAccountError('Sign out did not finish. Reconnect and retry Sign out.'); return { ok: false, error: 'Sign out did not finish.' } }
    accountId.current = null; setAccount(null); setAccessError(''); setAccountError('')
    return { ok: true }
  }, [])
  return <SessionContext.Provider value={{ session, loading, accessError, createCampaign, joinCampaign, refreshMembership, leaveCampaign, account, campaigns, campaignListError, accountError, openCampaign, signOut }}>{children}</SessionContext.Provider>
}

import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './session'

export interface CharacterSummary {
  id: string; owner_id: string | null; name: string; alias: string; playbook: string
  condition_kind: string | null; stress: number; stress_capacity: number; stacks: number; bank: number; load: string
  harm: { passing: number; major: number; critical: number; mortal: number }
}
export interface CrewSummary { id: string; name: string; type: string; reputation: string; tier: number; hold: string; rep: number; heat: number; wanted: number; stacks: number; xp: number }
interface Authority { actor: string; role: 'gm' | 'player' }
export interface OverviewSnapshot extends Authority { characters: CharacterSummary[]; crew: CrewSummary | null }
export interface Participant extends Authority { remaining_ms: number }
interface PresenceSnapshot extends Authority { participants: Participant[] }
const LEASE_MS = 2000

/** Short local access leases reject late authorized responses after disconnect,
 * role change or campaign switch. No peer payload ever enters these snapshots. */
function useTableSnapshot<T extends Authority>(kind: 'overview' | 'presence', joined: boolean) {
  const { session, refreshMembership } = useSession()
  const campaign = session!.campaignId, actor = session!.userId, role = session!.role
  const [snapshot, setSnapshot] = useState<T | null>(null), [error, setError] = useState('')
  const retry = useRef<() => void>(() => {})
  useEffect(() => {
    let active = true, pending = false, generation = 0, expires = 0
    const connection = crypto.randomUUID(), controller = new AbortController()
    let completion: Promise<void> = Promise.resolve()
    const clear = () => { setSnapshot(null); setError(`${kind === 'overview' ? 'Overview' : 'Presence'} unavailable. Reconnect or retry to verify current campaign access.`) }
    const leave = () => {
      if (kind === 'presence' && joined) void supabase.rpc('leave_campaign_presence', { p_campaign: campaign, p_connection: connection }).abortSignal(AbortSignal.timeout(LEASE_MS)).then(() => {})
    }
    async function poll() {
      if (!active || pending) return
      if (!navigator.onLine) { generation++; clear(); return }
      pending = true
      const request = generation, start = Date.now()
      try {
        const operation = kind === 'overview' ? 'get_campaign_overview' : joined ? 'touch_campaign_presence' : 'get_campaign_presence'
        const args = kind === 'presence' && joined ? { p_campaign: campaign, p_connection: connection } : { p_campaign: campaign }
        const result = await supabase.rpc(operation, args).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(LEASE_MS)]))
        if (!active || request !== generation) return
        if (result.error || Date.now() >= start + LEASE_MS) {
          clear()
          if (result.status === 401 || result.status === 403 || result.error?.code === '42501') void refreshMembership()
          return
        }
        const next = result.data as T
        if (next.actor !== actor || next.role !== role) { generation++; clear(); void refreshMembership(); return }
        expires = start + LEASE_MS
        setSnapshot(next); setError('')
      } catch { if (active && request === generation) clear() }
      finally { pending = false }
    }
    const load = () => { completion = poll() }
    const offline = () => { generation++; clear() }
    retry.current = load
    const initial = setTimeout(load, 0), timer = setInterval(load, 1000)
    const expiry = setInterval(() => { if (expires && expires <= Date.now()) { expires = 0; generation++; clear() } }, 200)
    window.addEventListener('online', load); window.addEventListener('focus', load); window.addEventListener('offline', offline); window.addEventListener('pagehide', leave)
    return () => {
      active = false; generation++; retry.current = () => {}; controller.abort()
      clearTimeout(initial); clearInterval(timer); clearInterval(expiry)
      window.removeEventListener('online', load); window.removeEventListener('focus', load); window.removeEventListener('offline', offline); window.removeEventListener('pagehide', leave)
      void completion.finally(leave)
    }
  }, [campaign, actor, role, refreshMembership, kind, joined])
  return { snapshot, error, retry: () => retry.current() }
}
export function useCampaignOverview() { return useTableSnapshot<OverviewSnapshot>('overview', false) }
export function useCampaignPresence(joined: boolean) { return useTableSnapshot<PresenceSnapshot>('presence', joined) }

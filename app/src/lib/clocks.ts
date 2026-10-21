import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const clockSegments = [4, 6, 8, 10, 12] as const
export interface ClockData {
  name: string; notes: string; segments: number; progress: number
  scope: 'campaign' | 'score'; active: boolean; visible_to_players: boolean; scoreId: string | null
}
export interface ClockRecord { id: string; campaign_id: string; data: ClockData; revision: number; updated_at: string }
export async function loadClocks(campaign: string): Promise<ClockRecord[]> {
  const { data, error } = await supabase.from('clocks').select('id,campaign_id,data,revision,updated_at').eq('campaign_id', campaign).order('updated_at', { ascending: true }).retry(false)
  if (error) throw error
  return data ?? []
}
export async function createClock(campaign: string, data: Partial<ClockData>): Promise<ClockRecord> {
  const result = await supabase.rpc('create_clock', { p_campaign: campaign, p_data: data })
  if (result.error) throw result.error
  return result.data
}
export async function updateClock(id: string, patch: Partial<ClockData>, expected: Partial<ClockData>): Promise<ClockRecord> {
  const result = await supabase.rpc('update_clock', { p_clock: id, p_patch: patch, p_expected: expected })
  if (result.error) throw result.error
  return result.data
}
export async function deleteClock(id: string, revision: number): Promise<void> {
  const result = await supabase.rpc('delete_clock', { p_clock: id, p_revision: revision })
  if (result.error) throw result.error
}
export function clockError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not reach the server.'
}
/** Replace whole authorized snapshots so unshared/deleted rows leave connected views. */
export function useClocks(campaign: string) {
  const [clocks, setClocks] = useState<ClockRecord[]>([])
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true), epoch = useRef(0), request = useRef(0), accepted = useRef(0)
  const refresh = useCallback(async () => {
    const currentEpoch = epoch.current, sequence = ++request.current
    try {
      const rows = await loadClocks(campaign)
      if (!active.current || currentEpoch !== epoch.current || sequence < accepted.current) return false
      accepted.current = sequence; setClocks(rows); setHasSnapshot(true); setError('')
      return true
    } catch {
      if (active.current && currentEpoch === epoch.current && sequence >= accepted.current) {
        accepted.current = sequence; setHasSnapshot(false)
        setError('Clock refresh failed. Reconnect or retry to see the current permitted clocks.')
      }
      return false
    }
  }, [campaign])
  useEffect(() => {
    active.current = true
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { void refresh() }, 1200)
    const reconnect = () => { void refresh() }
    window.addEventListener('focus', reconnect); window.addEventListener('online', reconnect)
    return () => { active.current = false; window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('focus', reconnect); window.removeEventListener('online', reconnect) }
  }, [refresh])
  function accept(row: ClockRecord) {
    epoch.current++
    // A late accepted save may refer to a clock cleared or unshared since then.
    // Recheck current permission and existence rather than resurrect its payload.
    if (active.current && row.campaign_id === campaign) void refresh()
  }
  function remove(id: string) {
    epoch.current++
    if (active.current) setClocks(previous => previous.filter(row => row.id !== id))
  }
  return { clocks, hasSnapshot, error, refresh, accept, remove }
}

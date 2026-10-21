import { useCallback, useState } from 'react'
import { useSnapshotPolling } from './snapshot-polling'
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
  const read = useCallback(async (acceptSnapshot: () => boolean) => {
    try {
      const rows = await loadClocks(campaign)
      if (!acceptSnapshot()) return false
      setClocks(rows); setHasSnapshot(true); setError('')
      return true
    } catch {
      if (acceptSnapshot()) {
        setHasSnapshot(false)
        setError('Clock refresh failed. Reconnect or retry to see the current permitted clocks.')
      }
      return false
    }
  }, [campaign])
  const { refresh, invalidate } = useSnapshotPolling(read, 1200)
  function accept(row: ClockRecord) {
    const active = invalidate()
    // A late accepted save may refer to a clock cleared or unshared since then.
    // Recheck current permission and existence rather than resurrect its payload.
    if (active && row.campaign_id === campaign) void refresh()
  }
  function remove(id: string) {
    if (invalidate()) setClocks(previous => previous.filter(row => row.id !== id))
  }
  return { clocks, hasSnapshot, error, refresh, accept, remove }
}

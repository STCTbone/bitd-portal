import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export const ASSISTANCE = [
  ['assist', 'Assist', '+1d on an action'], ['effect', 'Greater effect', 'As a push for effect'],
  ['equipment', 'Equipment loan', 'Faction Tier in Quality'], ['intelligence', 'Intelligence', 'Gather information with Tier dice'],
  ['downtime', 'Downtime improvement', '+1 result level'], ['information', 'Information reward', '1 stack for information of interest'],
  ['consequence', 'Consequence intervention', 'Within the faction’s powers'], ['diplomacy', 'Diplomatic intervention', 'Within the faction’s powers'],
] as const
export type Assistance = typeof ASSISTANCE[number][0]
export interface SupportCycle { label: string; used: Assistance[]; notes: string }
export interface BackingRecord {
  id: string; campaign_id: string; character_id: string; faction_id: string | null; faction_name: string; faction_tier: number
  active: boolean; shared: boolean; mission: string; mission_state: 'pending' | 'active' | 'complete' | 'failed'; failure: number
  prestige: string; choices: string; return_favor: string; notes: string; cycles: SupportCycle[]; version: number; updated_at: string
}
export type BackingPatch = Partial<Pick<BackingRecord, 'faction_id' | 'active' | 'shared' | 'mission' | 'mission_state' | 'failure' | 'prestige' | 'choices' | 'return_favor' | 'notes' | 'cycles'>>
export interface BackingFaction { id: string; name: string; tier: number }
export function backingError(e: unknown) { return e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Reconnect and retry.' }
export async function createBacking(character: string, faction: string): Promise<BackingRecord> {
  const r = await supabase.rpc('create_backing', { p_character: character, p_faction: faction }); if (r.error) throw r.error; return r.data
}
export async function patchBacking(row: BackingRecord, patch: BackingPatch, version: number): Promise<BackingRecord> {
  const r = await supabase.rpc('patch_backing', { p_backing: row.id, p_patch: patch, p_expected_version: version }); if (r.error) throw r.error; return r.data
}
/** Only permitted REST reads; no hidden clocks, GM faction notes, or peer data. */
export function useBacking(character: string, campaign: string) {
  const [records, setRecords] = useState<BackingRecord[]>([]), [factions, setFactions] = useState<BackingFaction[]>([])
  const [error, setError] = useState(''), [loaded, setLoaded] = useState(false)
  const active = useRef(true), request = useRef(0), accepted = useRef(0), epoch = useRef(0)
  const refresh = useCallback(async () => {
    const seq = ++request.current, start = epoch.current
    const results = await Promise.all([
      supabase.from('backing_records').select('*').eq('character_id', character).order('updated_at').retry(false),
      supabase.from('faction_records').select('id,name,tier').eq('campaign_id', campaign).order('name').retry(false),
    ])
    if (!active.current || start !== epoch.current || seq < accepted.current) return
    accepted.current = seq
    if (results.some(r => r.error)) { setError('Backing refresh failed. Saved cards are concealed until the next permitted snapshot; local drafts remain available.'); setLoaded(false); return }
    setRecords(results[0].data as unknown as BackingRecord[]); setFactions(results[1].data as unknown as BackingFaction[]); setLoaded(true); setError('')
  }, [character, campaign])
  useEffect(() => {
    active.current = true
    const initial = window.setTimeout(() => { void refresh() }, 0), timer = window.setInterval(() => { void refresh() }, 1200)
    const online = () => { void refresh() }
    window.addEventListener('online', online); window.addEventListener('focus', online)
    return () => { active.current = false; window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('focus', online) }
  }, [refresh])
  function accept(row: BackingRecord) { epoch.current++; setRecords(rows => [...rows.filter(r => r.id !== row.id), row]); setLoaded(true); setError('') }
  return { records, factions, error, loaded, refresh, accept }
}

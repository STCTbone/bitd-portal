import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export const noteCategories = ['people', 'places', 'items', 'factions', 'lore'] as const
export interface NoteData { title: string; body: string; category: typeof noteCategories[number] }
export interface SharedNote { id: string; campaign_id: string; data: NoteData; revision: number; updated_at: string }
export async function createSharedNote(campaign: string, data: NoteData): Promise<SharedNote> {
  const result = await supabase.rpc('create_shared_note', { p_campaign: campaign, p_data: data })
  if (result.error) throw result.error
  return result.data
}
export async function updateSharedNote(id: string, patch: Partial<NoteData>, expected: Partial<NoteData>): Promise<SharedNote> {
  const result = await supabase.rpc('update_shared_note', { p_note: id, p_patch: patch, p_expected: expected })
  if (result.error) throw result.error
  return result.data
}
export async function deleteSharedNote(id: string, revision: number): Promise<void> {
  const result = await supabase.rpc('delete_shared_note', { p_note: id, p_revision: revision })
  if (result.error) throw result.error
}
export function noteError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not reach the server.'
}
/** Whole RLS snapshots remove deleted/revoked notes. Generations, request order and
 * mutation epochs prevent delayed reads from replacing a newer authorized state.
 * Mutation payloads never enter the visible collection: a fresh read rechecks access. */
export function useSharedNotes(campaign: string) {
  const [notes, setNotes] = useState<SharedNote[]>([])
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), epoch = useRef(0), requested = useRef(0), settled = useRef(0)
  const refresh = useCallback(async () => {
    const currentGeneration = generation.current, currentEpoch = epoch.current, sequence = ++requested.current
    const result = await supabase.from('codex').select('id,campaign_id,data,revision,updated_at').eq('campaign_id', campaign).order('updated_at', { ascending: true }).order('id').retry(false)
    if (currentGeneration !== generation.current || currentEpoch !== epoch.current || sequence < settled.current) return false
    settled.current = sequence
    if (result.error) {
      if (['401', '403', '42501'].includes(String(result.status === 401 || result.status === 403 ? result.status : result.error.code))) setNotes([])
      setError('Note refresh failed. Your drafts are kept; reconnect or retry for the current shared reference.')
      return false
    }
    setNotes(result.data ?? []); setReady(true); setError(''); return true
  }, [campaign])
  useEffect(() => {
    const effectGeneration = generation.current
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { void refresh() }, 1200)
    const reconnect = () => { void refresh() }
    window.addEventListener('focus', reconnect); window.addEventListener('online', reconnect)
    return () => { generation.current = effectGeneration + 1; window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('focus', reconnect); window.removeEventListener('online', reconnect) }
  }, [refresh])
  const synchronize = () => { epoch.current++; return refresh() }
  return { notes, ready, error, refresh, synchronize }
}

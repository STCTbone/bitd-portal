import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
export interface MapToken { id: string; campaign_id: string; label: string; character_id: string | null; controller_id: string | null; x: number; y: number; revision: number; can_move: boolean }
export interface MapSelection { campaign_id: string; asset_id: string | null; revision: number }
export interface MapState { role: 'gm' | 'player'; map: MapSelection | null; tokens: MapToken[] }
export type MapPoint = { x: number; y: number }
/** Normalized image coordinates. Transient overlays may use this geometry; never token mutators. */
export function mapPoint(clientX: number, clientY: number, bounds: DOMRect): MapPoint {
  return { x: Math.min(100, Math.max(0, (clientX - bounds.left) / bounds.width * 100)), y: Math.min(100, Math.max(0, (clientY - bounds.top) / bounds.height * 100)) }
}
export function useCampaignMap(campaign: string) {
  const [state, setState] = useState<MapState | null>(null), [error, setError] = useState('')
  const active = useRef(false), epoch = useRef(0), request = useRef(0), accepted = useRef(0)
  const refresh = useCallback(async () => {
    const currentEpoch = epoch.current, sequence = ++request.current
    const result = await supabase.rpc('get_map_state', { p_campaign: campaign }).abortSignal(AbortSignal.timeout(8000))
    if (!active.current || currentEpoch !== epoch.current || sequence < accepted.current) return
    accepted.current = sequence
    if (result.error) {
      if (result.error.code === '42501') setState(null)
      setError('Map sync unavailable. Showing last accepted token positions; reconnect or retry to load current permitted state.'); return
    }
    const saved = result.data as MapState
    setState({ ...saved, tokens: [...saved.tokens].sort((a,b) => a.id.localeCompare(b.id)) }); setError('')
  }, [campaign])
  useEffect(() => {
    active.current = true
    const lifecycle = epoch
    const initial = setTimeout(() => { void refresh() }, 0)
    const timer = setInterval(() => { void refresh() }, 1000)
    const reconnect = () => { void refresh() }
    window.addEventListener('focus', reconnect); window.addEventListener('online', reconnect)
    return () => { active.current = false; lifecycle.current++; clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', reconnect); window.removeEventListener('online', reconnect) }
  }, [refresh])
  async function mutate(operation: string, args: Record<string, unknown>) {
    epoch.current++
    const result = await supabase.rpc(operation, args).abortSignal(AbortSignal.timeout(10000))
    epoch.current++
    if (result.error) { void refresh(); throw result.error }
    await refresh()
    return result.data
  }
  return { state, error, refresh, mutate }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { MapPoint } from './maps'
export type GestureKind = 'cursor' | 'ping' | 'stroke'
export type MapActivity = { actor: string; role: 'gm' | 'player'; kind: GestureKind; points: MapPoint[]; expires: number }
const LEASE_MS = 2000
/** Server-authenticated geometry channel, deliberately independent of durable map state. */
export function useMapActivity(campaign: string, asset: string) {
  const [activity, setActivity] = useState<MapActivity[]>([]), [connected, setConnected] = useState(false)
  const sender = useRef<(kind: GestureKind, points: MapPoint[]) => void>(() => {})
  useEffect(() => {
    let active = true, polling = false, sending = false
    const controller = new AbortController(), pending = new Map<GestureKind, MapPoint[]>()
    let sendCompletion: Promise<void> = Promise.resolve()
    const args = { p_campaign: campaign, p_asset: asset }
    async function flush() {
      if (sending || !active) return
      sending = true
      try {
        while (active && pending.size) {
          const [kind, points] = pending.entries().next().value!
          pending.delete(kind)
          const result = await supabase.rpc('send_map_activity', { ...args, p_kind: kind, p_points: points }).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(LEASE_MS)]))
          if (active && result.error) { pending.clear(); setActivity([]); setConnected(false) }
        }
      } finally { sending = false }
    }
    sender.current = (kind, points) => { pending.set(kind, points); if (!sending) sendCompletion = flush() }
    async function poll() {
      if (!active || polling) return
      if (document.hidden || !navigator.onLine) { setActivity([]); setConnected(false); return }
      polling = true
      const start = Date.now()
      try {
        const result = await supabase.rpc('read_map_activity', args).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(LEASE_MS)]))
        if (!active) return
        if (result.error || Date.now() >= start + LEASE_MS) { setActivity([]); setConnected(false); return }
        // This response is authoritative RPC output, never a peer event or a saved token.
        const rows = result.data as { actor: string; role: 'gm' | 'player'; kind: GestureKind; points: MapPoint[]; remaining_ms: number }[]
        setActivity(rows.map(row => ({ ...row, expires: start + Math.min(LEASE_MS, row.remaining_ms) }))); setConnected(true)
      } finally { polling = false }
    }
    const tick = setInterval(() => { void poll() }, 250)
    const expiry = setInterval(() => setActivity(rows => rows.filter(row => row.expires > Date.now())), 100)
    const offline = () => { pending.clear(); setActivity([]); setConnected(false) }
    const visibility = () => { if (document.hidden) offline(); else void poll() }
    window.addEventListener('offline', offline); window.addEventListener('online', poll); window.addEventListener('focus', poll)
    document.addEventListener('visibilitychange', visibility)
    void poll()
    return () => {
      active = false; sender.current = () => {}; pending.clear(); controller.abort()
      clearInterval(tick); clearInterval(expiry)
      window.removeEventListener('offline', offline); window.removeEventListener('online', poll); window.removeEventListener('focus', poll)
      document.removeEventListener('visibilitychange', visibility)
      // Best effort leave. Abrupt disconnect is covered by server gesture expiry.
      void sendCompletion.finally(() => { void supabase.rpc('leave_map_activity', args).abortSignal(AbortSignal.timeout(2000)).then(() => {}) })
    }
  }, [campaign, asset])
  const send = useCallback((kind: GestureKind, points: MapPoint[]) => sender.current(kind, points), [])
  return { activity, connected, send }
}

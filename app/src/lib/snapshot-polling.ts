import { useCallback, useEffect, useRef } from 'react'

/** Order permitted snapshots around local mutations; features own reads and failure policy. */
export function useSnapshotPolling<T>(read: (acceptSnapshot: () => boolean) => Promise<T>, interval: number) {
  const active = useRef(false), epoch = useRef(0), request = useRef(0), accepted = useRef(0)
  const refresh = useCallback(() => {
    const currentEpoch = epoch.current, sequence = ++request.current
    return read(() => {
      if (!active.current || currentEpoch !== epoch.current || sequence < accepted.current) return false
      accepted.current = sequence
      return true
    })
  }, [read])
  useEffect(() => {
    active.current = true
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { void refresh() }, interval)
    const reconnect = () => { void refresh() }
    window.addEventListener('focus', reconnect); window.addEventListener('online', reconnect)
    return () => {
      active.current = false
      window.clearTimeout(initial); window.clearInterval(timer)
      window.removeEventListener('focus', reconnect); window.removeEventListener('online', reconnect)
    }
  }, [refresh, interval])
  const invalidate = useCallback(() => { epoch.current++; return active.current }, [])
  return { refresh, invalidate }
}

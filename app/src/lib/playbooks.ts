import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
export interface CampaignPlaybook { name: string; paranormal: boolean; enabled: boolean }
export function useCampaignPlaybooks(campaignId: string) {
  const [entries, setEntries] = useState<CampaignPlaybook[]>([])
  const [error, setError] = useState('')
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const generation = ++request.current
    const result = await supabase.rpc('get_campaign_playbooks', { p_campaign: campaignId })
    if (generation !== request.current) return
    if (result.error) { setError('Playbook availability unavailable. Reconnect and retry.'); return }
    setEntries(result.data); setError('')
  }, [campaignId])
  useEffect(() => {
    const requests = request; let stopped = false
    const load = () => { if (!stopped) void refresh() }
    load()
    const interval = window.setInterval(load, 1000)
    return () => { stopped = true; requests.current++; window.clearInterval(interval) }
  }, [refresh])
  return { entries, error, refresh }
}

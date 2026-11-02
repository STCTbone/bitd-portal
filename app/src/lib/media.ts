import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export const ASSET_BUCKET = 'campaign-assets'
export const ASSET_LEASE_MS = 10_000
export interface CampaignAsset {
  id: string; campaign_id: string; character_id: string | null; kind: 'portrait' | 'avatar' | 'image' | 'audio'
  object_path: string; mime_type: string; byte_size: number; title: string; annotation: string
  shared: boolean; state: 'pending' | 'ready' | 'removed'; revision: number
}
export interface ArtSelection { character_id: string; kind: 'portrait' | 'avatar'; asset_id: string }
const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Reconnect and retry.'
export const mediaError = message

/** RLS snapshots only; no asset bytes, annotations or URLs travel over peer events. */
export function useAssetLibrary(campaignId: string) {
  const [snapshot, setSnapshot] = useState<{ assets: CampaignAsset[]; art: ArtSelection[]; role: string | null; expires: number }>({ assets: [], art: [], role: null, expires: 0 })
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current, started = Date.now()
    const [assets, art, role] = await Promise.all([
      supabase.from('campaign_assets').select('*').eq('campaign_id', campaignId).eq('state', 'ready').order('created_at'),
      supabase.from('character_art').select('*'),
      supabase.rpc('campaign_role', { p_campaign: campaignId }),
    ])
    if (request !== generation.current || Date.now() - started >= ASSET_LEASE_MS) return
    if (assets.error || art.error || role.error || !role.data) {
      setSnapshot({ assets: [], art: [], role: null, expires: 0 }); setError('Media access could not be refreshed. Previews cleared; reconnect or retry.'); return
    }
    setSnapshot({ assets: assets.data as CampaignAsset[], art: art.data as ArtSelection[], role: role.data, expires: started + ASSET_LEASE_MS }); setError('')
  }, [campaignId])
  useEffect(() => {
    const requests = generation
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { void refresh() }, 1000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus); window.addEventListener('online', focus)
    return () => { requests.current++; clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('online', focus) }
  }, [refresh])
  useEffect(() => {
    if (!snapshot.expires) return
    const timer = window.setTimeout(() => {
      generation.current++
      setSnapshot({ assets: [], art: [], role: null, expires: 0 }); setError('Media access expired. Previews cleared; reconnect or retry.')
    }, Math.max(0, snapshot.expires - Date.now()))
    return () => clearTimeout(timer)
  }, [snapshot.expires])
  return { ...snapshot, error, refresh }
}

/** A blob stays mounted only while an authenticated Storage info check renews its lease.
 * The lease starts before the request, so a late response cannot extend revoked access. */
export function useProtectedAsset(asset: CampaignAsset) {
  const [preview, setPreview] = useState<{ url: string; id: string; path: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stopped = false, currentURL = '', generation = 0, expiryTimer = 0
    const clear = () => { if (currentURL) URL.revokeObjectURL(currentURL); currentURL = ''; setPreview(null) }
    async function verify() {
      const request = ++generation, started = Date.now()
      const result = currentURL ? await supabase.storage.from(ASSET_BUCKET).info(asset.object_path) : await supabase.storage.from(ASSET_BUCKET).download(asset.object_path, {}, { cache: 'no-store' })
      if (stopped || request !== generation || Date.now() - started >= ASSET_LEASE_MS) return
      if (result.error) { clear(); setError('File unavailable or access changed. Retry after reconnecting.'); return }
      if (!currentURL && result.data instanceof Blob) currentURL = URL.createObjectURL(result.data)
      clearTimeout(expiryTimer)
      expiryTimer = window.setTimeout(() => { generation++; clear(); setError('File preview expired; checking current access.') }, Math.max(0, started + ASSET_LEASE_MS - Date.now()))
      setPreview({ url: currentURL, id: asset.id, path: asset.object_path }); setError('')
    }
    void verify()
    const check = window.setInterval(() => { void verify() }, 3000)
    return () => { stopped = true; generation++; clearInterval(check); clearTimeout(expiryTimer); if (currentURL) URL.revokeObjectURL(currentURL) }
  }, [asset.id, asset.object_path])
  return { url: preview?.id === asset.id && preview.path === asset.object_path ? preview.url : '', error }
}

export async function reserveAsset(campaignId: string, kind: CampaignAsset['kind'], characterId: string | null, file: File, title: string) {
  const { data, error } = await supabase.rpc('reserve_asset', { p_campaign: campaignId, p_kind: kind, p_character: characterId, p_mime: file.type, p_size: file.size, p_title: title })
  if (error) throw error
  return data as CampaignAsset
}
export async function uploadReservedAsset(asset: CampaignAsset, file: File) {
  const uploaded = await supabase.storage.from(ASSET_BUCKET).upload(asset.object_path, file, { contentType: file.type, cacheControl: '0', upsert: false })
  // A lost upload response may still have committed. Finish validates the actual file.
  const finished = await supabase.rpc('finish_asset', { p_asset: asset.id })
  if (finished.error) throw uploaded.error ?? finished.error
  return finished.data as CampaignAsset
}
export async function removeAsset(asset: CampaignAsset) {
  const { error } = await supabase.rpc('remove_asset', { p_asset: asset.id, p_revision: asset.revision })
  if (error) throw error
  // Revocation commits first. Failed physical cleanup can never keep a file readable.
  const cleanup = await supabase.storage.from(ASSET_BUCKET).remove([asset.object_path])
  if (cleanup.error) throw new Error('Access removed. File cleanup could not finish; an operator can remove the inaccessible object later.')
}

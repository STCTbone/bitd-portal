import { supabase } from './supabase'
import { type CampaignData } from './demo-data'
import type { Character, Crew, Clock, Faction, Score, MapToken, Media, CodexEntry } from './types'

// The Supabase client is configured with the `bitd` schema. Each entity table
// stores the full typed object in a `data` jsonb column keyed by its own id.

export interface CampaignRow {
  id: string
  name: string
  map_image_url: string | null
}

type EntityTable = 'characters' | 'crews' | 'clocks' | 'factions' | 'scores' | 'map_tokens' | 'media' | 'codex'

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id,name,map_image_url')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as CampaignRow) ?? null
}

async function loadTable<T>(table: EntityTable, campaignId: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('data').eq('campaign_id', campaignId)
  if (error) throw error
  return (data ?? []).map((r) => (r as { data: T }).data)
}

export async function loadCampaignData(campaignId: string): Promise<CampaignData> {
  const [characters, crews, clocks, factions, scores, mapTokens, media, codex] = await Promise.all([
    loadTable<Character>('characters', campaignId),
    loadTable<Crew>('crews', campaignId),
    loadTable<Clock>('clocks', campaignId),
    loadTable<Faction>('factions', campaignId),
    loadTable<Score>('scores', campaignId),
    loadTable<MapToken>('map_tokens', campaignId),
    loadTable<Media>('media', campaignId),
    loadTable<CodexEntry>('codex', campaignId),
  ])
  // A campaign has at most one active/planning score; the rest are completed
  // history, newest first.
  const currentScore = scores.find((s) => s.status !== 'completed') ?? null
  const scoreHistory = scores
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at))
  return {
    characters,
    crew: crews[0] ?? null,
    clocks,
    factions,
    currentScore,
    scoreHistory,
    mapTokens,
    media,
    codex,
  }
}

export async function saveEntity(table: EntityTable, campaignId: string, entity: { id: string }): Promise<void> {
  const { error } = await supabase
    .from(table)
    .upsert({ id: entity.id, campaign_id: campaignId, data: entity, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function saveEntities(table: EntityTable, campaignId: string, entities: { id: string }[]): Promise<void> {
  if (entities.length === 0) return
  const { error } = await supabase
    .from(table)
    .upsert(entities.map((e) => ({ id: e.id, campaign_id: campaignId, data: e, updated_at: new Date().toISOString() })))
  if (error) throw error
}

// Concurrent-safe partial write: shallow-merges `patch` into the row's `data`
// jsonb server-side (top-level keys win) via the bitd.merge_entity RPC. Unlike
// saveEntity, two clients editing different fields of the same entity won't
// clobber each other, because neither sends the whole (possibly stale) object.
export async function mergeEntity(
  table: EntityTable, campaignId: string, id: string, patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc('merge_entity', {
    p_table: table, p_id: id, p_campaign: campaignId, p_patch: patch,
  })
  if (error) throw error
}

export async function deleteEntity(table: EntityTable, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

export async function setCampaignMap(campaignId: string, url: string | null): Promise<void> {
  const { error } = await supabase.from('campaigns').update({ map_image_url: url }).eq('id', campaignId)
  if (error) throw error
}

// Upload a custom map image to the shared `maps` storage bucket and return its
// public URL. Previously the app used URL.createObjectURL(), a blob: URL only
// valid in the uploader's own tab — so other players (and the uploader after a
// reload) saw a broken image. A real uploaded URL is sharable and persistent.
export async function uploadMapImage(campaignId: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  const path = `${campaignId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('maps')
    .upload(path, file, { contentType: file.type || 'image/png', upsert: true })
  if (error) throw error
  return supabase.storage.from('maps').getPublicUrl(path).data.publicUrl
}

// Upload character art (full image) or a cropped avatar to the shared `maps`
// storage bucket and return its public URL. We reuse the existing public bucket
// (separate path prefixes) so no new bucket/policies are needed. Accepts a File
// (original art) or a Blob (canvas-cropped avatar).
export async function uploadCharacterImage(
  characterId: string,
  file: Blob,
  kind: 'art' | 'avatar',
): Promise<string> {
  const fromName = file instanceof File && file.name.includes('.') ? file.name.split('.').pop() : ''
  const ext = fromName || file.type.split('/')[1] || 'png'
  const path = `char-${kind}/${characterId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('maps')
    .upload(path, file, { contentType: file.type || 'image/png', upsert: true })
  if (error) throw error
  return supabase.storage.from('maps').getPublicUrl(path).data.publicUrl
}

// Upload a piece of GM media (image or audio) to the shared public `maps`
// bucket and return its public URL.
export async function uploadMediaFile(campaignId: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'bin')
  const path = `media/${campaignId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('maps')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true })
  if (error) throw error
  return supabase.storage.from('maps').getPublicUrl(path).data.publicUrl
}

// Compatibility entry point; fresh campaigns must never seed implicitly.
export const loadOrSeedCampaign = loadCampaignData

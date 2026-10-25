import { supabase } from '@/lib/supabase'

export interface FactionRecord {
  id: string
  campaign_id: string
  name: string
  description: string
  tier: number
  hold: 'weak' | 'strong'
  status: number
  category: string
  known_information: string
  shared_notes: string
  source: string
  version: number
}
export type FactionPatch = Partial<Pick<FactionRecord, 'name' | 'description' | 'tier' | 'hold' | 'status' | 'category' | 'known_information' | 'shared_notes'>>

export async function loadFactions(campaignId: string): Promise<FactionRecord[]> {
  const { data, error } = await supabase.from('faction_records').select('*').eq('campaign_id', campaignId).order('name')
  if (error) throw error
  return data ?? []
}
export async function patchFaction(faction: FactionRecord, patch: FactionPatch): Promise<FactionRecord> {
  const { data, error } = await supabase.rpc('patch_faction', { p_id: faction.id, p_patch: patch, p_expected_version: faction.version })
  if (error) throw error
  return data
}

export interface PrivateFactionNote { note: string; version: number }
export async function loadPrivateFactionNote(id: string): Promise<PrivateFactionNote> {
  const { data, error } = await supabase.rpc('get_faction_private_note', { p_id: id })
  if (error) throw error
  return data
}
export async function savePrivateFactionNote(id: string, note: string, version: number): Promise<PrivateFactionNote> {
  const { data, error } = await supabase.rpc('save_faction_private_note', { p_id: id, p_note: note, p_expected_version: version })
  if (error) throw error
  return data
}
export async function publishFactionInformation(faction: FactionRecord, text: string): Promise<FactionRecord> {
  const { data, error } = await supabase.rpc('publish_faction_information', { p_id: faction.id, p_text: text, p_expected_version: faction.version })
  if (error) throw error
  return data
}

export async function createFaction(campaignId: string, name: string): Promise<FactionRecord> {
  const { data, error } = await supabase.rpc('create_faction', { p_campaign: campaignId, p_name: name })
  if (error) throw error
  return data
}
export async function deleteFaction(faction: FactionRecord) {
  const { error } = await supabase.rpc('delete_faction', { p_id: faction.id, p_expected_version: faction.version })
  if (error) throw error
}

import { supabase } from '@/lib/supabase'

export const crewTypes = ['Dealers', 'Hit Squad', 'Militants', 'Racers', 'Shadows', 'Utopians'] as const
export type CrewType = typeof crewTypes[number]
export interface DealerBusiness {
  product: string; units: number; supply: string; demand: string; distribution: string; competitiveAdvantages: string
}
export interface MilitantCause { cause: string; enemies: [string, string] }
export interface CrewData {
  dealerBusiness: DealerBusiness; militantCause: MilitantCause
  abilities: CrewAbility[]; upgrades: CrewUpgrade[]; claims: CrewClaim[]; cohorts: CrewCohort[]
  name: string; type: CrewType; reputation: string; tier: number; hold: 'weak' | 'strong'
  rep: number; turf: number; heat: number; wanted: number; stacks: number; vaults: number
  xp: number; advances: number; base: string; baseDistrict: string; flair: string
  huntingGrounds: string; preferredOperations: string; wardBoss: string; anger: number
  titheNotes: string; advancementNotes: string
}
export interface CrewDossier { id: string; campaign_id: string; data: CrewData; revision: number; updated_at: string }
export async function loadCrew(campaign: string): Promise<CrewDossier | null> {
  const { data, error } = await supabase.from('crews').select('id,campaign_id,data,revision,updated_at').eq('campaign_id', campaign).maybeSingle().retry(false)
  if (error) throw error
  return data
}
export async function createCrew(campaign: string, name: string, type: CrewType): Promise<CrewDossier> {
  const { data, error } = await supabase.rpc('create_crew', { p_campaign: campaign, p_name: name, p_type: type })
  if (error) throw error
  return data
}
export async function updateCrew(campaign: string, patch: Partial<CrewData>, expected: Partial<CrewData>): Promise<CrewDossier> {
  const { data, error } = await supabase.rpc('update_crew', { p_campaign: campaign, p_patch: patch, p_expected: expected })
  if (error) throw error
  return data
}
export function crewError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not reach the server.'
}

export interface CrewAbility { id: string; catalogId: string; choice: string; notes: string }
export interface CrewUpgrade { id: string; catalogId: string; marks: number; notes: string }
export interface CrewClaim { catalogId: string; notes: string }
export interface CrewCohort {
  id: string; name: string; kind: 'gang' | 'expert' | 'vehicle'; types: string; edges: string; flaws: string
  quality: number; scale: number; condition: 'healthy' | 'weakened' | 'impaired' | 'broken' | 'dead'
  armor: 'none' | 'available' | 'totaled'; assignment: string; notes: string
}

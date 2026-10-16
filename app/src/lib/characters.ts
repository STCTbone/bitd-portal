import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export const ACTION_GROUPS = {
  Insight: ['hunt', 'study', 'survey', 'tinker'],
  Prowess: ['finesse', 'prowl', 'skirmish', 'wreck'],
  Resolve: ['attune', 'command', 'consort', 'sway'],
} as const
export const HOUND_ABILITIES = ['Hound’s Instincts', 'Learn the Hard Way', 'Just a Scratch', 'Fixer', 'In Too Deep', 'Echo Pet', 'Dogged Persistence', 'Versatile'] as const
export const ECHO_PET_CHOICES = ['time-glitching', 'mind-link', 'mirror-field'] as const
export interface Relationship { name: string; relationship: string; notes: string }
export interface VersatileAbility { name: string; source: string; notes: string }
export interface HoundPet {
  name: string; kind: string; edges: string; flaws: string; abilities: string; notes: string
  weak: boolean; impaired: boolean; broken: boolean; armor: boolean
}
export interface CharacterKey { name: string; hits: number }
export interface CharacterDeadlock { name: string; formerKey: string; notes: string }
export interface CharacterHarm { passing: string[]; major: string[]; critical: string[]; mortal: string[] }
export interface CharacterHealing { progress: number; permanent: number }
export interface CharacterCondition {
  stress: number; stressCapacity: number; keyCapacity: number; keyCapacityReason: string
  keys: CharacterKey[]; deadlocks: CharacterDeadlock[]; harm: CharacterHarm; healing: CharacterHealing
  recoveryNotes: string; conditionNotes: string
}
export type ConditionPatch = Partial<Pick<CharacterCondition, 'stress' | 'keys' | 'deadlocks' | 'recoveryNotes' | 'conditionNotes'>> & { harm?: Partial<CharacterHarm>; healing?: Partial<CharacterHealing> }
export interface CharacterDossier extends CharacterCondition {
  name: string; playbook: string; alias: string; playerName: string; look: string; wearing: string
  heritage: string; heritageDetails: string; background: string; backgroundDetails: string
  vice: string; viceHookup: string; notes: string; abilityNotes: string
  actions: Record<string, number>; abilities: string[]; echoPet: string[]; versatile: VersatileAbility[]
  relationships: Relationship[]; pet: HoundPet
}
export interface CharacterRecord {
  id: string; campaign_id: string; owner_id: string | null; data: CharacterDossier; updated_at: string
}
export type CharacterPatch = Partial<Omit<CharacterDossier, 'playbook' | 'pet' | 'harm' | 'healing' | 'stressCapacity' | 'keyCapacity' | 'keyCapacityReason'>> & { pet?: Partial<HoundPet>; harm?: Partial<CharacterHarm>; healing?: Partial<CharacterHealing> }

/** Only accepted server snapshots enter this boundary. Polling never trusts peer state. */
export function useCharacters(campaignId: string) {
  const [records, setRecords] = useState<CharacterRecord[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    const { data, error } = await supabase.from('characters').select('*').eq('campaign_id', campaignId).order('id')
    if (request !== generation.current) return
    setLoaded(true)
    if (error) { setError('Character sync unavailable. Showing the last saved records; reconnect or retry.'); return }
    setRecords(data as CharacterRecord[])
    setError('')
  }, [campaignId])
  useEffect(() => {
    let stopped = false
    const requests = generation
    const load = () => { if (!stopped) void refresh() }
    load()
    const interval = window.setInterval(load, 1000)
    window.addEventListener('online', load)
    window.addEventListener('focus', load)
    return () => { stopped = true; requests.current++; window.clearInterval(interval); window.removeEventListener('online', load); window.removeEventListener('focus', load) }
  }, [refresh])
  const mutate = useCallback(async (operation: string, args: Record<string, unknown>) => {
    generation.current++
    const { data, error } = await supabase.rpc(operation, args)
    if (error) { void refresh(); throw new Error(error.message) }
    await refresh()
    return data as CharacterRecord | null
  }, [refresh])
  const patch = useCallback(async (id: string, changes: CharacterPatch) => {
    await mutate('patch_character', { p_character: id, p_patch: changes })
  }, [mutate])
  return { records, error, loaded, refresh, patch, mutate }
}

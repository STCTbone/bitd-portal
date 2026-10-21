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
/** stress is the sole condition-resource value; Hull sheets interpret it as Drain. */
export interface CharacterCondition {
  stress: number; stressCapacity: number; keyCapacity: number; keyCapacityReason: string
  keys: CharacterKey[]; deadlocks: CharacterDeadlock[]; harm: CharacterHarm; healing: CharacterHealing
  recoveryNotes: string; conditionNotes: string
}
export type ConditionPatch = Partial<Pick<CharacterCondition, 'stress' | 'keys' | 'deadlocks' | 'recoveryNotes' | 'conditionNotes'>> & { harm?: Partial<CharacterHarm>; healing?: Partial<CharacterHealing> }
export interface CharacterItem { name: string; load: number; quantity: number; uses: number; carried: boolean; source: string; notes: string }
export interface CharacterResource { name: string; used: number; capacity: number; source: string; notes: string }
export interface CharacterLoadout { mode: 'Quiet' | 'Loud'; carriedStacks: number }
export interface CharacterArmor { kind: 'none' | 'armor' | 'light' | 'built-in'; worn: boolean; totaled: boolean; source: string; notes: string }
export interface CharacterWealth { stacks: number; bank: number }
export interface CharacterXP { playbook: number; insight: number; prowess: number; resolve: number }
export interface CharacterSheetRules { abilities: string[]; quiet: number; loud: number; wallet: number; bank: number; playbookXp: number; attributeXp: number; builtInArmor: boolean; actionMax: number; harmSlots: Record<keyof CharacterHarm, number>; source: string; conditionKind?: 'hull'; creation?: string; abilityChoiceGuidance?: string; fixedAbilities?: string[]; xpTrigger?: string; contacts?: string[]; keys?: string[]; backgroundLabel?: string; backgroundSuggestions?: string[]; abilityGuidance?: string; resourceGuidance?: string; explosives?: string[] }
export interface CharacterEquipment {
  equipment: CharacterItem[]; resources: CharacterResource[]; loadout: CharacterLoadout; armor: CharacterArmor
  wealth: CharacterWealth; xp: CharacterXP; advancementNotes: string; equipmentNotes: string
}
export type EquipmentPatch = Partial<Pick<CharacterEquipment, 'equipment' | 'resources' | 'advancementNotes' | 'equipmentNotes'>> & { loadout?: Partial<CharacterLoadout>; armor?: Partial<CharacterArmor>; wealth?: Partial<CharacterWealth>; xp?: Partial<CharacterXP> }
export interface OperativeRecord { controlAction: string; coverIdentity: string; coverNotes: string; dropEntity: string; dropLoad: number; dropAssetUsed: boolean; sleeperUsed: boolean; operations: string }
export interface RadicalWork { name: string; progress: number; circulating: boolean; contribution: string; notes: string }
export interface RadicalRecord { radicalizedBy: string; cause: string; supplier: string; bandoliers: string[][]; works: RadicalWork[]; praxis: string; dedication: string; operations: string }
export interface VeteranRecord { tours: string; damage: string; helps: string; hobby: string; assistance: string; operations: string }
export interface HumanPlaybookPatch { operative?: Partial<OperativeRecord>; radical?: Partial<RadicalRecord>; veteran?: Partial<VeteranRecord> }
export interface CompanionConditions { name: string; edges: string; flaws: string; origin: string; notes: string; weak: boolean; impaired: boolean; broken: boolean }
export interface Sparkmind extends CompanionConditions { types: string[]; housing: '' | 'Small' | 'Large'; advancedChoices: string[] }
export interface ResonanceEntity extends CompanionConditions { type: 'Paranormal Assistant'; kind: string; abilities: string; armor: boolean }
export interface Autopod extends CompanionConditions { type: '' | 'Racing' | 'Impressing' | 'Surprising'; style: string }
export interface IntellectualRecord { fieldsOfStudy: string; gadgetDecisions: string; operations: string }
export interface ParanormalistRecord { precognitionUsed: number; projectionRank: number; projectionActive: boolean; experiments: string; operations: string }
export interface SwingerRecord { sideHustle: string; hustleActivityGranted: boolean; partyAssistAvailable: boolean; twinSummoned: boolean; twinFeatures: string[]; twinNotes: string; operations: string }
export interface CompanionPatch { sparkmind?: Partial<Sparkmind>; resonanceEntity?: Partial<ResonanceEntity>; autopod?: Partial<Autopod>; intellectual?: Partial<IntellectualRecord>; paranormalist?: Partial<ParanormalistRecord>; swinger?: Partial<SwingerRecord> }
export interface HullMemory { progress: number; memory: string; contact: string; ability: string; source: string; notes: string }
export interface HullRecord { controller: string; owningFaction: string; suspicion: number; frameFeatures: string[]; frameUpgrade: number; frameDetails: string; den: string; pet: string; operations: string; memories: HullMemory[] }
export interface HullPatch { hull?: Partial<HullRecord> }
export interface CharacterDossier extends CharacterCondition, CharacterEquipment {
  sparkmind?: Sparkmind; resonanceEntity?: ResonanceEntity; autopod?: Autopod; intellectual?: IntellectualRecord; paranormalist?: ParanormalistRecord; swinger?: SwingerRecord
  hull?: HullRecord
  sheet: CharacterSheetRules
  operative?: OperativeRecord; radical?: RadicalRecord; veteran?: VeteranRecord
  name: string; playbook: string; alias: string; playerName: string; look: string; wearing: string
  heritage: string; heritageDetails: string; background: string; backgroundDetails: string
  vice: string; viceHookup: string; notes: string; abilityNotes: string
  actions: Record<string, number>; abilities: string[]; echoPet: string[]; versatile: VersatileAbility[]
  relationships: Relationship[]; pet: HoundPet
}
export interface CharacterRecord {
  id: string; campaign_id: string; owner_id: string | null; data: CharacterDossier; updated_at: string
}
export type CharacterPatch = Partial<Omit<CharacterDossier, 'playbook' | 'sheet' | 'pet' | 'harm' | 'healing' | 'loadout' | 'armor' | 'wealth' | 'xp' | 'stressCapacity' | 'keyCapacity' | 'keyCapacityReason' | 'operative' | 'radical' | 'veteran' | 'sparkmind' | 'resonanceEntity' | 'autopod' | 'intellectual' | 'paranormalist' | 'swinger' | 'hull'>> & { pet?: Partial<HoundPet>; harm?: Partial<CharacterHarm>; healing?: Partial<CharacterHealing> } & EquipmentPatch & HumanPlaybookPatch & CompanionPatch & HullPatch

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

/** Accepted native selections, sourced Versatile and completed sourced Hull memories grant abilities. */
export function hasCharacterAbility(data: CharacterDossier, name: string) {
  return data.abilities.includes(name) || (data.abilities.includes('Versatile') && data.versatile.some(a => a.name === name && Boolean(a.source.trim()))) || (data.playbook === 'Hull' && Boolean(data.hull?.memories.some(m => m.progress === 8 && m.ability === name && m.source.trim())))
}

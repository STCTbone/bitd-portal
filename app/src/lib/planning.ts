import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { CharacterRecord } from './characters'
import type { CrewCohort, CrewDossier } from './crew/dossier'
export const phases = { personal_business: 'Personal Business', planning_meeting: 'Planning Meeting', score: 'Score', aftermath: 'Aftermath' } as const
export const activities = ['Free play', 'Indulge Vice', 'Long-Term Project', 'Recover', 'Reduce Heat', 'Acquire Asset', 'Training Montage'] as const
export const approaches = { Assault: 'The attack point', Deception: 'The misdirection or disguise', Paranormal: 'The strange power', Social: 'The social connection', Speed: 'The moment of impact', Stealth: 'The entry point' } as const
export interface ActivityData { activity: string; description: string; outcome: string; roll: string; helper: string; spend: string; finalResult: string; proposedEffects: string }
export interface OpportunityData { client: string; target: string; operation: string; targetTier: number | null; difficulty: string; payout: number | null; payoutRoll: string; planningDetails: string; held: boolean }
export interface ScoreRecordData { activeNotes: string; outcome: string; recap: string; startedAt: string | null; finishedAt: string | null; status: 'planned' | 'active' | 'completed' | 'cancelled' }
export interface ScoreActivityData extends ScoreRecordData { kind: 'participation' | 'secondary'; cohort: CrewCohort; opportunity: OpportunityData }
export interface ScoreActivityRecord extends Saved<ScoreActivityData> { score_id: string; crew_id: string; cohort_id: string; opportunity_id: string | null }
export interface ScoreEvent { id: string; campaign_id: string; score_id: string; activity_id: string | null; actor_id: string; data: Partial<ScoreRecordData> & { revision: number }; created_at: string }
export interface ScoreData extends ScoreRecordData { name: string; opportunity: OpportunityData; approach: string; openingGambit: string; loadout: string; engagementDetails: string; engagementResult: string; planningNotes: string }
export interface Saved<T> { id: string; campaign_id: string; data: T; revision: number; updated_at: string }
export interface ActivityRecord extends Saved<ActivityData> { character_id: string }
export interface OpportunityRecord extends Saved<OpportunityData> { owner_id: string }
export interface ScoreRecord extends Saved<ScoreData> { opportunity_id: string }
export interface CampaignCycle { campaign_id: string; phase: keyof typeof phases; selected_score_id: string | null; revision: number; updated_at: string }
interface Snapshot { cycle: CampaignCycle | null; activities: ActivityRecord[]; opportunities: OpportunityRecord[]; scores: ScoreRecord[]; characters: CharacterRecord[]; crews: CrewDossier[]; scoreActivities: ScoreActivityRecord[]; events: ScoreEvent[] }
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await supabase.rpc(name, args)
  if (result.error) throw result.error
  return result.data
}
export const createActivity = (character: string, data: Partial<ActivityData>) => rpc<ActivityRecord>('create_personal_business', { p_character: character, p_data: data })
export const updateActivity = (id: string, patch: Partial<ActivityData>, expected: Partial<ActivityData>) => rpc<ActivityRecord>('update_personal_business', { p_record: id, p_patch: patch, p_expected: expected })
export const deleteActivity = (id: string, revision: number) => rpc<void>('delete_personal_business', { p_record: id, p_revision: revision })
export const createOpportunity = (campaign: string, data: Partial<OpportunityData>) => rpc<OpportunityRecord>('create_opportunity', { p_campaign: campaign, p_data: data })
export const updateOpportunity = (id: string, patch: Partial<OpportunityData>, expected: Partial<OpportunityData>) => rpc<OpportunityRecord>('update_opportunity', { p_opportunity: id, p_patch: patch, p_expected: expected })
export const selectOpportunity = (id: string, revision: number, cycleRevision: number) => rpc<ScoreRecord>('select_opportunity', { p_opportunity: id, p_revision: revision, p_cycle_revision: cycleRevision })
export const updateScorePlan = (id: string, patch: Partial<ScoreData>, expected: Partial<ScoreData>) => rpc<ScoreRecord>('update_score_plan', { p_score: id, p_patch: patch, p_expected: expected })
export const transitionScore = (id: string, status: string, revision: number) => rpc<ScoreRecord>('transition_score', { p_score: id, p_status: status, p_revision: revision })
export const updateScoreRecord = (id: string, patch: Partial<ScoreRecordData>, expected: Partial<ScoreRecordData>) => rpc<ScoreRecord>('update_score_record', { p_score: id, p_patch: patch, p_expected: expected })
export const createScoreActivity = (score: string, crew: string, cohort: string, opportunity: string | null, kind: string) => rpc<ScoreActivityRecord>('create_score_activity', { p_score: score, p_crew: crew, p_cohort: cohort, p_opportunity: opportunity, p_kind: kind })
export const updateScoreActivity = (id: string, patch: Partial<ScoreRecordData>, expected: Partial<ScoreRecordData>) => rpc<ScoreActivityRecord>('update_score_activity', { p_activity: id, p_patch: patch, p_expected: expected })
export const transitionScoreActivity = (id: string, status: string, revision: number) => rpc<ScoreActivityRecord>('transition_score_activity', { p_activity: id, p_status: status, p_revision: revision })
export const setCampaignPhase = (campaign: string, phase: string, revision: number) => rpc<CampaignCycle>('set_campaign_phase', { p_campaign: campaign, p_phase: phase, p_revision: revision })
export function planningError(error: unknown) { return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not reach the server.' }
export function usePlanning(campaign: string) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ cycle: null, activities: [], opportunities: [], scores: [], characters: [], crews: [], scoreActivities: [], events: [] })
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  const active = useRef(false), epoch = useRef(0), request = useRef(0), accepted = useRef(0)
  const refresh = useCallback(async () => {
    const version = epoch.current, sequence = ++request.current
    try {
      const results = await Promise.all(['campaign_cycles', 'personal_business', 'opportunities', 'scores', 'characters', 'crews', 'score_activities', 'score_events'].map(table => supabase.from(table).select('*').eq('campaign_id', campaign).retry(false)))
      for (const result of results) if (result.error) throw result.error
      if (!active.current || version !== epoch.current || sequence < accepted.current) return false
      accepted.current = sequence
      setSnapshot({ cycle: results[0].data![0], activities: results[1].data!, opportunities: results[2].data!, scores: results[3].data!, characters: results[4].data!, crews: results[5].data!, scoreActivities: results[6].data!, events: results[7].data! }); setReady(true); setError(''); return true
    } catch {
      if (active.current && version === epoch.current && sequence >= accepted.current) { accepted.current = sequence; setReady(false); setError('Cycle refresh failed. Reconnect or retry to see the current permitted records.') }
      return false
    }
  }, [campaign])
  useEffect(() => {
    active.current = true
    const first = setTimeout(() => { void refresh() }, 0), timer = setInterval(() => { void refresh() }, 1400)
    const reconnect = () => { void refresh() }
    window.addEventListener('online', reconnect); window.addEventListener('focus', reconnect)
    return () => { active.current = false; clearTimeout(first); clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect) }
  }, [refresh])
  function accept<K extends keyof Snapshot>(kind: K, value: Snapshot[K] extends (infer T)[] ? T : Snapshot[K]) {
    epoch.current++
    if (!active.current) return
    setSnapshot(previous => {
      if (kind === 'cycle') return { ...previous, cycle: value as CampaignCycle }
      const rows = previous[kind] as Saved<unknown>[]
      const row = value as Saved<unknown>
      return { ...previous, [kind]: [...rows.filter(existing => existing.id !== row.id), row] }
    }); setReady(true); setError('')
  }
  function removeActivity(id: string) { epoch.current++; setSnapshot(previous => ({ ...previous, activities: previous.activities.filter(row => row.id !== id) })) }
  return { ...snapshot, ready, error, refresh, accept, removeActivity }
}

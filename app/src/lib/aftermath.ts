import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
export type EffectKind = 'crew' | 'character' | 'faction'
export interface AftermathEffect { kind: EffectKind; id: string; field: string; expected: unknown; value: unknown }
export interface AftermathProposal { id: string; campaign_id: string; score_id: string; score_revision: number; effects: AftermathEffect[]; recap: string; reason: string; correction_of: string | null; created_at: string }
export interface AftermathReceipt extends Omit<AftermathProposal, 'score_revision'> { proposal_id: string; actor_id: string }
export interface AftermathManual { id: string; campaign_id: string; score_id: string; kind: string; title: string; notes: string; shared: boolean; revision: number }
export interface AftermathFaction { id: string; name: string; status: number }
interface Snapshot { proposals: AftermathProposal[]; receipts: AftermathReceipt[]; manual: AftermathManual[]; factions: AftermathFaction[] }
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const result = await supabase.rpc(name, args); if (result.error) throw result.error; return result.data }
export const proposeAftermath = (score: string, effects: AftermathEffect[], recap: string, reason: string, correction: string | null) => rpc<AftermathProposal>('propose_aftermath', { p_score: score, p_effects: effects, p_recap: recap, p_reason: reason, p_correction_of: correction })
export const confirmAftermath = (proposal: string) => rpc<AftermathReceipt>('confirm_aftermath', { p_proposal: proposal })
export const saveAftermathManual = (score: string, data: Pick<AftermathManual, 'kind' | 'title' | 'notes' | 'shared'>, id: string | null, revision: number) => rpc<AftermathManual>('save_aftermath_manual', { p_score: score, p_id: id, p_revision: revision, p_kind: data.kind, p_title: data.title, p_notes: data.notes, p_shared: data.shared })
export function useAftermath(campaign: string, gm: boolean) {
 const [snapshot, setSnapshot] = useState<Snapshot>({ proposals: [], receipts: [], manual: [], factions: [] })
 const [error, setError] = useState(''), active = useRef(false), sequence = useRef(0), accepted = useRef(0)
 const refresh = useCallback(async () => {
  const request = ++sequence.current
  try {
   const tables = gm ? ['aftermath_receipts', 'aftermath_manual', 'faction_records', 'aftermath_proposals'] : ['aftermath_receipts', 'aftermath_manual', 'faction_records']
   const results = await Promise.all(tables.map(table => supabase.from(table).select('*').eq('campaign_id', campaign).retry(false)))
   for (const result of results) if (result.error) throw result.error
   if (!active.current || request < accepted.current) return false
   accepted.current = request
   setSnapshot({ receipts: results[0].data!, manual: results[1].data!, factions: results[2].data!, proposals: results[3]?.data ?? [] }); setError(''); return true
  } catch {
   if (active.current && request >= accepted.current) { accepted.current = request; setError('Aftermath refresh failed. Reconnect or retry to load permitted records. Drafts are kept.') }
   return false
  }
 }, [campaign, gm])
 useEffect(() => { active.current = true; const first = setTimeout(() => { void refresh() }, 0), timer = setInterval(() => { void refresh() }, 1400); const reconnect = () => { void refresh() }; window.addEventListener('online', reconnect); window.addEventListener('focus', reconnect); return () => { active.current = false; clearTimeout(first); clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect) } }, [refresh])
 return { ...snapshot, error, refresh }
}

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { confirmAftermath, proposeAftermath, saveAftermathManual, useAftermath } from '../lib/aftermath'
import type { AftermathEffect, AftermathManual, EffectKind } from '../lib/aftermath'
import { planningError } from '../lib/planning'
import type { usePlanning } from '../lib/planning'
const fields: Record<EffectKind, string[]> = { crew: ['stacks', 'rep', 'heat', 'wanted', 'anger'], character: ['wealth.stacks', 'wealth.bank', 'stress', 'harm.passing', 'harm.major', 'harm.critical', 'harm.mortal', 'healing.progress'], faction: ['status'] }
const fieldLabels: Record<string, string> = { stacks: 'Crew stacks', rep: 'Rep', heat: 'Heat', wanted: 'Wanted', anger: 'Ward-boss Anger', 'wealth.stacks': 'Personal stacks', 'wealth.bank': 'Bank', stress: 'Stress', 'harm.passing': 'Passing Harm', 'harm.major': 'Major Harm', 'harm.critical': 'Critical Harm', 'harm.mortal': 'Mortal Harm', 'healing.progress': 'Healing progress', status: 'Faction status' }
const display = (value: unknown) => Array.isArray(value) ? value.map(item => item || 'empty slot').join(' / ') : String(value)
function Effects({ effects, name, label }: { effects: AftermathEffect[]; name: (effect: AftermathEffect) => string; label: (effect: AftermathEffect) => string }) { return effects.length ? <ul>{effects.map(effect => <li key={`${effect.kind}:${effect.id}:${effect.field}`}><strong>{name(effect)}</strong> · {label(effect)}: {display(effect.expected)} → {display(effect.value)}</li>)}</ul> : <p>No sheet changes proposed. Confirm records the shared recap only.</p> }
export function CampaignAftermath({ campaign, gm, planning }: { campaign: string; gm: boolean; planning: ReturnType<typeof usePlanning> }) {
 const state = useAftermath(campaign, gm), completed = planning.scores.filter(score => score.data.status === 'completed')
 const [scoreId, setScoreId] = useState('')
 const score = completed.find(row => row.id === scoreId) ?? completed[0]
 return <section className="aftermath-panel" aria-label="Aftermath review"><h3>Aftermath review</h3>
  {state.error && <p role="alert">{state.error}<button onClick={() => { void state.refresh() }}>Retry Aftermath refresh</button></p>}
  <details className="planning-guidance"><summary>Published Aftermath reference and manual procedures</summary>
   <p>Blades ’68 v1.0.1 pp. 190–195, Trouble Engine pp. 197–203; recovery pp. 169–170; Wanted pp. 216–217. Baseline excludes Deep Cuts. Payout, Rep and faction status use the table’s recorded negotiated outcomes. No payout, XP advance, load or Armor reset is automatic.</p>
   <p>Tithe applies where there is a ward boss: crew Tier + 1 stacks. If unpaid, add one tick to four-segment Anger; each fill loses one boss status and may bring reprisals. New Horizon has no ward boss. Record applicability, payment and any wrap/status changes explicitly.</p>
   <p>Heat exposure: 0 smooth/quiet, 2 contained, 4 loud/chaotic, 6 devastating. Judge target prominence (examples +1/+3), hostile turf +1, war +1, killing +2, explosives +1, military weapons +1, and any claims/abilities. Loud loadout informs judgment. At 9 Heat, review Wanted +1 and Heat clearing explicitly; record any interrogation/arrest Trouble or the decision to skip it.</p>
   <p>Harm Complications: roll dice equal to the sum of Harm levels and use the highest Harm table; Hull has a separate table (pp. 192–193). Record roll, table, result, next-score/next-recharge effect and whether consumed. Temporary penalties do not permanently remove action dots.</p>
   <p>Unwind: a player chooses the group scene; each participating PC clears 1 Stress. Quarters also clears passing Harm. Select participants and propose their actual resulting values; this never clears all Stress by default.</p>
   <p>Recover: roll marks 1/2/3/5 and clears passing Harm; a filled four-clock lowers remaining Harm one level, with excess rolling over. Hospitals and Hull repair differ; consult pp. 169–170 and edit the reviewed results deliberately. Mortal survival needs adjudication.</p>
   <p>Trouble can be skipped or run flexibly between cycles. Preserve faction updates, Crew Trouble, Local Trouble, ongoing Trouble and escalation in manual records. Do not escalate a newly introduced Trouble immediately. Mandates and GM notes stay private until you deliberately share a manual record; they are never copied into a receipt.</p>
  </details>
  {score ? <><label>Aftermath score<select aria-label="Aftermath score" value={score.id} onChange={event => setScoreId(event.target.value)}>{completed.map(row => <option key={row.id} value={row.id}>{row.data.name}</option>)}</select></label>
   <Review key={score.id} score={score.id} gm={gm} planning={planning} state={state} />
  </> : <p>Complete a primary score to review Aftermath.</p>}
 </section>
}
function Review({ score, gm, planning, state }: { score: string; gm: boolean; planning: ReturnType<typeof usePlanning>; state: ReturnType<typeof useAftermath> }) {
 const [kind, setKind] = useState<EffectKind>('crew'), [target, setTarget] = useState(''), [field, setField] = useState('stacks'), [value, setValue] = useState('')
 const [effects, setEffects] = useState<AftermathEffect[]>([]), [recap, setRecap] = useState(''), [reason, setReason] = useState(''), [correction, setCorrection] = useState<string | null>(null)
 const [participants, setParticipants] = useState<string[]>([]), [quarters, setQuarters] = useState(false)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
 const receipts = state.receipts.filter(row => row.score_id === score).sort((a, b) => a.created_at.localeCompare(b.created_at)), latest = receipts[receipts.length - 1]
 const pending = state.proposals.filter(row => row.score_id === score && !state.receipts.some(receipt => receipt.proposal_id === row.id) && (latest ? row.correction_of === latest.id : row.correction_of === null))
 const records = kind === 'crew' ? planning.crews.map(row => ({ id: row.id, name: row.data.name, data: row.data as unknown })) : kind === 'character' ? planning.characters.map(row => ({ id: row.id, name: row.data.name, data: row.data as unknown })) : state.factions.map(row => ({ id: row.id, name: row.name, data: { status: row.status } as unknown }))
 const record = records.find(row => row.id === target) ?? records[0]
 const selectedCondition = kind === 'character' ? planning.characters.find(row => row.id === record?.id)?.data.sheet.conditionKind : undefined
 const selectedHull = selectedCondition === 'hull'
 const availableFields = fields[kind].filter(key => !(selectedHull && key === 'harm.mortal'))
 function fieldLabel(key: string, condition: string | undefined) {
  if (key === 'stress') return condition === 'hull' || condition === 'ghost' ? 'Drain' : condition === 'future' || condition === 'past' ? 'Instability' : 'Stress'
  return condition === 'hull' ? key === 'healing.progress' ? 'Repair progress' : fieldLabels[key].replace('Harm', 'Damage') : fieldLabels[key]
 }
 function label(effect: AftermathEffect) { return fieldLabel(effect.field, effect.kind === 'character' ? planning.characters.find(row => row.id === effect.id)?.data.sheet.conditionKind : undefined) }
 const currentValue = field.split('.').reduce<unknown>((saved, key) => (saved as Record<string, unknown>)?.[key], record?.data)
 function name(effect: AftermathEffect) { return effect.kind === 'crew' ? planning.crews.find(row => row.id === effect.id)?.data.name ?? effect.id : effect.kind === 'character' ? planning.characters.find(row => row.id === effect.id)?.data.name ?? effect.id : state.factions.find(row => row.id === effect.id)?.name ?? effect.id }
 function add(effect: AftermathEffect) { setEffects(previous => [...previous.filter(row => !(row.kind === effect.kind && row.id === effect.id && row.field === effect.field)), effect]) }
 async function run(action: () => Promise<void>) { setBusy(true); setError(''); setStatus(''); try { await action(); setStatus('Saved.'); await state.refresh(); await planning.refresh() } catch (cause) { setError(`Aftermath was not saved: ${planningError(cause)} Your draft/review is kept. Retry or prepare a fresh review after reconciling changed records.`) } finally { setBusy(false) } }
 function addEffect(event: FormEvent) {
  event.preventDefault(); if (!record) return
  add({ kind, id: record.id, field, expected: currentValue, value: field.startsWith('harm.') ? value.split('\n') : Number(value) }); setValue('')
 }
 return <div>
  {gm && (!latest || correction) && <div className="planning-card"><h4>{correction ? 'Prepare an explicit correction' : 'Prepare Aftermath proposal'}</h4>
   <form onSubmit={addEffect}><fieldset disabled={busy}><legend>Add an intended change</legend><div className="planning-fields">
    <label>Effect record type<select aria-label="Effect record type" value={kind} onChange={event => { const next = event.target.value as EffectKind; setKind(next); setTarget(''); setField(fields[next][0]); setValue('') }}>{Object.keys(fields).map(key => <option key={key} value={key}>{key[0].toUpperCase() + key.slice(1)}</option>)}</select></label>
    <label>Effect target<select aria-label="Effect target" value={record?.id ?? ''} onChange={event => { setTarget(event.target.value); setField(fields[kind][0]); setValue('') }}>{records.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label>Effect field<select aria-label="Effect field" value={field} onChange={event => { setField(event.target.value); setValue('') }}>{availableFields.map(key => <option key={key} value={key}>{fieldLabel(key, selectedCondition)}</option>)}</select></label>
    <label>Proposed value{field.startsWith('harm.') ? <textarea aria-label="Proposed value" placeholder="One injury per line, including empty slots" value={value} onChange={event => setValue(event.target.value)} /> : <input aria-label="Proposed value" type="number" step={1} value={value} onChange={event => setValue(event.target.value)} />}</label>
   </div><p>Saved {fieldLabel(field, selectedCondition)}: {display(currentValue ?? 'unavailable')}</p><button disabled={!record || value === ''}>Add reviewed effect</button></fieldset></form>
   <p>Numbers are final values, not additions.</p>
   <details><summary>Propose selected Unwind participants</summary><fieldset disabled={busy}>{planning.characters.map(row => <label key={row.id}><input type="checkbox" checked={participants.includes(row.id)} onChange={event => setParticipants(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} />{row.data.name}</label>)}<label><input type="checkbox" checked={quarters} onChange={event => setQuarters(event.target.checked)} />Include passing Harm clearing: table verified Quarters applies</label><button type="button" onClick={() => { for (const row of planning.characters.filter(row => participants.includes(row.id))) { add({ kind: 'character', id: row.id, field: 'stress', expected: row.data.stress, value: Math.max(0, row.data.stress - 1) }); if (quarters) add({ kind: 'character', id: row.id, field: 'harm.passing', expected: row.data.harm.passing, value: row.data.harm.passing.map(() => '') }) } }}>Propose Unwind changes</button></fieldset></details>
   {correction && <button className="planning-secondary" disabled={busy} onClick={() => { setCorrection(null); setEffects([]); setRecap(''); setReason('') }}>Discard correction draft</button>}<Effects effects={effects} name={name} label={label} />{effects.map((effect, index) => <button className="planning-secondary" key={`${effect.kind}:${effect.id}:${effect.field}`} disabled={busy} onClick={() => setEffects(previous => previous.filter((_, i) => i !== index))}>Remove {name(effect)} · {label(effect)}</button>)}
   <form onSubmit={event => { event.preventDefault(); void run(async () => { await proposeAftermath(score, effects, recap, reason, correction); setEffects([]); setRecap(''); setReason(''); setCorrection(null) }) }}><fieldset disabled={busy}><legend>Save the complete review</legend><label>Shared Aftermath recap<textarea aria-label="Shared Aftermath recap" maxLength={5000} value={recap} onChange={event => setRecap(event.target.value)} /></label>{correction && <label>Correction reason<textarea aria-label="Correction reason" required maxLength={5000} value={reason} onChange={event => setReason(event.target.value)} /></label>}<p>The recap, correction reason and listed changes will be shared with players.</p><button>Save proposal for review</button></fieldset></form>
  </div>}
  <div hidden={Boolean(state.error)}>{gm && pending.map(proposal => <article className="planning-card" key={proposal.id} aria-label="Pending Aftermath proposal"><h4>Pending GM review</h4><Effects effects={proposal.effects} name={name} label={label} /><p className="planning-notes">{proposal.recap}</p>{proposal.correction_of && <p>Correction of {proposal.correction_of}: {proposal.reason}</p>}<button disabled={busy} onClick={() => { void run(async () => { await confirmAftermath(proposal.id) }) }}>Confirm all reviewed changes</button></article>)}
  {receipts.map(receipt => <article className="planning-card" key={receipt.id} aria-label="Aftermath receipt"><h4>{receipt.correction_of ? 'Aftermath correction' : 'Confirmed Aftermath'}</h4><small>{new Date(receipt.created_at).toLocaleString()}</small>{receipt.correction_of && <p>Corrects {receipt.correction_of} · Reason: {receipt.reason}</p>}<Effects effects={receipt.effects} name={name} label={label} /><p className="planning-notes">{receipt.recap}</p>{gm && receipt.id === latest?.id && !correction && <button disabled={busy} onClick={() => { setCorrection(receipt.id); setEffects([]); setRecap(''); setReason('') }}>Prepare correction</button>}</article>)}
  </div>{status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  <h4>Manual consequences and procedures</h4>
  <div hidden={Boolean(state.error)}>{state.manual.filter(row => row.score_id === score).map(row => <ManualRecord key={row.id} row={row} score={score} gm={gm} refresh={state.refresh} />)}</div>
  {gm && <ManualRecord score={score} gm={gm} refresh={state.refresh} />}
 </div>
}
function ManualRecord({ row, score, gm, refresh }: { row?: AftermathManual; score: string; gm: boolean; refresh: () => Promise<boolean> }) {
 const defaults = { kind: 'Trouble', title: '', notes: '', shared: false }, base = row ?? defaults
 const [edits, setEdits] = useState<Partial<typeof defaults>>({}), revision = useRef<number | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
 const values = { ...base, ...edits }
 function change(key: keyof typeof defaults, value: string | boolean) { revision.current ??= row?.revision ?? 0; setEdits(previous => ({ ...previous, [key]: value })) }
 return <article className="planning-card" aria-label={row ? `Manual consequence · ${row.title}` : 'New manual consequence'}>{row && <h5>{row.title}</h5>}{row && <p>{row.shared ? 'Shared with players' : 'GM only'}</p>}
  {gm ? <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void saveAftermathManual(score, values, row?.id ?? null, revision.current ?? row?.revision ?? 0).then(async () => { setEdits({}); revision.current = null; await refresh() }).catch(cause => setError(`Manual record was not saved: ${planningError(cause)} Draft kept.`)).finally(() => setBusy(false)) }}><fieldset disabled={busy}><legend>{row ? 'Edit manual record' : 'New private manual record'}</legend><label>Manual record type<select aria-label="Manual record type" value={values.kind} onChange={event => change('kind', event.target.value)}>{['Trouble', 'Ward boss', 'Recovery', 'Harm complication', 'Mandate', 'Other'].map(kind => <option key={kind}>{kind}</option>)}</select></label><label>Manual record title<input aria-label="Manual record title" required maxLength={200} value={values.title} onChange={event => change('title', event.target.value)} /></label><label>Manual record notes<textarea aria-label="Manual record notes" rows={4} maxLength={10000} value={values.notes} onChange={event => change('notes', event.target.value)} /></label><label><input aria-label="Share entire manual record" type="checkbox" checked={values.shared} onChange={event => change('shared', event.target.checked)} />Share entire manual record with players</label><button>Save manual record</button><button type="button" className="planning-secondary" onClick={() => { void refresh().then(ok => { if (ok) { setEdits({}); revision.current = null; setError('') } }) }}>Reload manual record (discard draft)</button></fieldset></form> : <p className="planning-notes">{row?.notes}</p>}{error && <p role="alert">{error}</p>}
 </article>
}

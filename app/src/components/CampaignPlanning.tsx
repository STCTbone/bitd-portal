import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { activities, approaches, phases, createActivity, createOpportunity, deleteActivity, planningError, selectOpportunity, setCampaignPhase, updateActivity, updateOpportunity, updateScorePlan, usePlanning, type ActivityData, type OpportunityData, type ScoreData } from '@/lib/planning'
import './CampaignPlanning.css'

type Field<T> = { key: keyof T; label: string; type?: 'number' | 'checkbox' | 'select'; options?: readonly string[]; gmOnly?: boolean }
const activityFields: Field<ActivityData>[] = [{ key: 'activity', label: 'Activity', type: 'select', options: activities }, { key: 'description', label: 'Activity description' }, { key: 'outcome', label: 'Activity outcome' }, { key: 'roll', label: 'Base roll' }, { key: 'helper', label: 'Helper' }, { key: 'spend', label: 'Agreed spending' }, { key: 'finalResult', label: 'Final result' }, { key: 'proposedEffects', label: 'Proposed effects' }]
const opportunityFields: Field<OpportunityData>[] = [{ key: 'client', label: 'Client' }, { key: 'target', label: 'Target' }, { key: 'operation', label: 'Operation type' }, { key: 'targetTier', label: 'Target Tier', type: 'number', gmOnly: true }, { key: 'difficulty', label: 'Difficulty', gmOnly: true }, { key: 'payout', label: 'Potential payout', type: 'number', gmOnly: true }, { key: 'payoutRoll', label: 'Payout roll and modifiers', gmOnly: true }, { key: 'planningDetails', label: 'Planning details' }, { key: 'held', label: 'Hold for later', type: 'checkbox' }]
const scoreFields: Field<ScoreData>[] = [{ key: 'approach', label: 'Approach', type: 'select', options: ['', ...Object.keys(approaches)] }, { key: 'openingGambit', label: 'Opening gambit' }, { key: 'loadout', label: 'Score loadout', type: 'select', options: ['', 'Quiet', 'Loud'] }, { key: 'engagementDetails', label: 'Engagement details' }, { key: 'engagementResult', label: 'Engagement result' }, { key: 'planningNotes', label: 'Shared planning notes' }]

/** One accepted-record form pattern, with independent drafts and field-level conflict checks. */
function RecordEditor<T extends object>({ title, data, fields, canEdit, gm, saveLabel, save, refresh, children }: {
  title: string; data: T; fields: Field<T>[]; canEdit: boolean; gm: boolean; saveLabel: string
  save: (patch: Partial<T>, expected: Partial<T>) => Promise<void>; refresh: () => Promise<boolean>
  children?: (run: (action: () => Promise<void>) => void, disabled: boolean) => ReactNode
}) {
  const [edits, setEdits] = useState<Partial<T>>({}), expected = useRef<Partial<T>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const values = { ...data, ...edits }, dirty = Object.keys(edits).length > 0
  function change(key: keyof T, value: unknown) {
    if (!(key in expected.current)) expected.current[key] = data[key]
    setEdits(previous => ({ ...previous, [key]: value })); setStatus('Unsaved changes.')
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action(); setStatus('Saved.') }
    catch (cause) { setError(`Record was not saved: ${planningError(cause)} Your changes are kept.`) }
    finally { setBusy(false) }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => { await save(edits, expected.current); setEdits({}); expected.current = {} })
  }
  return <article className="planning-card" aria-label={title}><h4>{title}</h4>
    <form onSubmit={submit}><fieldset disabled={busy}><legend className="planning-sr-only">{title}</legend><div className="planning-fields">{fields.map(field => <label key={String(field.key)}>
      {field.label}{field.type === 'select' ? <select aria-label={field.label} disabled={!canEdit || (field.gmOnly && !gm)} value={String(values[field.key] ?? '')} onChange={event => change(field.key, event.target.value)}>{field.options!.map(value => <option key={value} value={value}>{value || 'Choose when ready'}</option>)}</select>
        : field.type === 'checkbox' ? <input aria-label={field.label} disabled={!canEdit} type="checkbox" checked={Boolean(values[field.key])} onChange={event => change(field.key, event.target.checked)} />
        : field.type === 'number' ? <input aria-label={field.label} disabled={!canEdit || (field.gmOnly && !gm)} type="number" min={0} max={field.key === 'targetTier' ? 99 : 9999} step={1} value={values[field.key] === null ? '' : String(values[field.key])} onChange={event => change(field.key, event.target.value === '' ? null : event.target.valueAsNumber)} />
        : <textarea aria-label={field.label} disabled={!canEdit || (field.gmOnly && !gm)} rows={2} maxLength={5000} value={String(values[field.key] ?? '')} onChange={event => change(field.key, event.target.value)} />}
    </label>)}</div></fieldset>
      {canEdit && <div className="planning-actions"><button disabled={busy || !dirty} type="submit">{saveLabel}</button><button disabled={busy} className="planning-secondary" type="button" onClick={() => { void run(async () => { if (!await refresh()) throw new Error('Could not reload.'); setEdits({}); expected.current = {} }) }}>Reload record{dirty ? ' (discard unsaved)' : ''}</button></div>}
    </form>
    {children?.(action => { void run(action) }, busy || dirty)}
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </article>
}

export function CampaignPlanning() {
  const { session } = useSession()
  return session ? <Planning key={`${session.campaignId}:${session.role}:${session.userId}`} campaign={session.campaignId} user={session.userId} gm={session.role === 'gm'} /> : null
}
function Planning({ campaign, user, gm }: { campaign: string; user: string; gm: boolean }) {
  const state = usePlanning(campaign)
  const [character, setCharacter] = useState(''), [activity, setActivity] = useState('Free play'), [description, setDescription] = useState('')
  const [client, setClient] = useState(''), [target, setTarget] = useState(''), [operation, setOperation] = useState('')
  const [phase, setPhase] = useState<{ value: string; revision: number } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const owned = state.characters.filter(row => gm || row.owner_id === user)
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setStatus('')
    try { await action(); setStatus('Saved. Campaign consequences remain manual.') }
    catch (cause) { setError(`Action was not saved: ${planningError(cause)} Your entries are kept.`) }
    finally { setBusy(false) }
  }
  function addActivity(event: FormEvent) { event.preventDefault(); void run(async () => { state.accept('activities', await createActivity(character || owned[0]?.id, { activity, description })); setDescription('') }) }
  function sketch(event: FormEvent) { event.preventDefault(); void run(async () => { state.accept('opportunities', await createOpportunity(campaign, { client, target, operation })); setClient(''); setTarget(''); setOperation('') }) }
  return <section className="campaign-planning" aria-label="Campaign cycle">
    <header><p className="planning-kicker">PERSONAL BUSINESS → PLANNING MEETING → SCORE → AFTERMATH</p><h2>Campaign cycle</h2><p>Shared records for the table. Move between phases whenever the fiction calls for it; planning can happen during Personal Business.</p></header>
    {state.error && <div role="alert"><p>{state.error}</p><button onClick={() => { void state.refresh() }}>Retry cycle refresh</button></div>}
    {!state.ready && !state.error && <p role="status">Loading campaign cycle…</p>}
    {state.cycle && <div className="planning-phase"><p>Current phase: {phases[state.cycle.phase]}</p>{gm && <form onSubmit={event => { event.preventDefault(); if (phase) void run(async () => { state.accept('cycle', await setCampaignPhase(campaign, phase.value, phase.revision)); setPhase(null) }) }}><label>Campaign phase<select aria-label="Campaign phase" disabled={busy} value={phase?.value ?? state.cycle.phase} onChange={event => setPhase({ value: event.target.value, revision: phase?.revision ?? state.cycle!.revision })}>{Object.entries(phases).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button disabled={busy || !phase}>Set phase</button>{phase && <button className="planning-secondary" type="button" disabled={busy} onClick={() => { void run(async () => { if (!await state.refresh()) throw new Error('Could not reload phase.'); setPhase(null) }) }}>Reload phase (discard unsaved)</button>}</form>}<small>Phase changes only update this shared reference. They do not start, complete or erase scores or change anyone’s sheet.</small></div>}
    <h3>Personal Business</h3><p>Two free downtime activities; additional activities cost 1 stack or 1 Rep by agreement. Record rolls, helpers, spending and outcomes here; apply agreed changes deliberately in their own records.</p>
    <div className="planning-list">{state.activities.map(row => {
      const owner = state.characters.find(value => value.id === row.character_id)
      const canEdit = gm || owner?.owner_id === user
      return <RecordEditor key={row.id} title={`${row.data.activity} · ${owner?.data.name ?? 'Character'}`} data={row.data} fields={activityFields} gm={gm} canEdit={canEdit} saveLabel="Save activity" refresh={state.refresh} save={async (patch, expected) => { state.accept('activities', await updateActivity(row.id, patch, expected)) }}>{canEdit ? (run, disabled) => <button type="button" className="planning-secondary" disabled={disabled} onClick={() => run(async () => { await deleteActivity(row.id, row.revision); state.removeActivity(row.id) })}>Remove activity</button> : undefined}</RecordEditor>
    })}</div>
    {state.ready && owned.length > 0 && <form className="planning-create" onSubmit={addActivity}><fieldset disabled={busy}><legend>Record individual activity</legend><label>Activity character<select aria-label="Activity character" value={character || owned[0].id} onChange={event => setCharacter(event.target.value)}>{owned.map(row => <option key={row.id} value={row.id}>{row.data.name}</option>)}</select></label><label>New activity<select aria-label="New activity" value={activity} onChange={event => setActivity(event.target.value)}>{activities.map(value => <option key={value}>{value}</option>)}</select></label><label>Activity description<textarea aria-label="Activity description" value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} /></label><button>Record activity</button></fieldset></form>}
    {state.ready && owned.length === 0 && <p>Create or claim a character to record their Personal Business.</p>}
    <h3>Planning Meeting</h3><p>Start with a client, target or operation. The GM records target Tier before selection, difficulty and potential payout. Compare opportunities below, hold some for later, and agree on a primary score together.</p>
    <p className="planning-guidance">Payout reference: roll crew Tier dice, add target Tier. Enter the negotiated result; potential payout is not awarded here. Difficulty examples: 2 minor · 4 small · 6 standard · 8 big · 10+ major. Payout modifiers do not change difficulty.</p>
    <div className="planning-list">{state.opportunities.map(row => {
      const selected = state.scores.find(score => score.opportunity_id === row.id)
      return <RecordEditor key={row.id} title={`Opportunity · ${row.data.operation || row.data.target || row.data.client}`} data={row.data} fields={opportunityFields} canEdit={gm || row.owner_id === user} gm={gm} saveLabel="Save opportunity" refresh={state.refresh} save={async (patch, expected) => { state.accept('opportunities', await updateOpportunity(row.id, patch, expected)) }}>{(run, disabled) => <>{selected && <p>Selected score retained separately. Later opportunity edits do not replace its planning snapshot.</p>}{gm && (!selected || selected.id !== state.cycle?.selected_score_id) && <button type="button" disabled={disabled || !state.cycle} onClick={() => run(async () => { state.accept('scores', await selectOpportunity(row.id, row.revision, state.cycle!.revision)); await state.refresh() })}>Select as primary score</button>}</>}</RecordEditor>
    })}</div>
    {state.ready && <form className="planning-create" onSubmit={sketch}><fieldset disabled={busy}><legend>Sketch a new opportunity</legend><label>Opportunity client<input aria-label="Opportunity client" value={client} maxLength={5000} onChange={event => setClient(event.target.value)} /></label><label>Opportunity target<input aria-label="Opportunity target" value={target} maxLength={5000} onChange={event => setTarget(event.target.value)} /></label><label>Opportunity operation<input aria-label="Opportunity operation" value={operation} maxLength={5000} onChange={event => setOperation(event.target.value)} /></label><button disabled={!client.trim() && !target.trim() && !operation.trim()}>Sketch opportunity</button></fieldset></form>}
    <h3>Selected score plans</h3><p>Choose the approach and opening gambit, then Quiet (3 load) or Loud (6 load), with playbook and rigging exceptions. Record engagement details and the table’s result. No roll or load reset happens here.</p>
    <div className="planning-list">{state.scores.map(row => <RecordEditor key={row.id} title={`Score plan · ${row.data.name}`} data={row.data} fields={scoreFields} gm={gm} canEdit={true} saveLabel="Save plan" refresh={state.refresh} save={async (patch, expected) => { state.accept('scores', await updateScorePlan(row.id, patch, expected)) }}>{() => <div><p>{row.id === state.cycle?.selected_score_id ? 'Current primary selection' : 'Retained score'} · {row.data.status}</p><p>Selection snapshot: {row.data.opportunity.client || 'No client yet'} / {row.data.opportunity.target || 'Target to define'} / Tier {row.data.opportunity.targetTier} / potential {row.data.opportunity.payout ?? 'unrecorded'} stacks</p><p>Opening gambits: {Object.entries(approaches).map(([key, value]) => `${key} — ${value.toLowerCase()}`).join('; ')}.</p></div>}</RecordEditor>)}</div>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
    <footer>Source: Blades ’68 v1.0.1, Personal Business pp. 164–171; Planning Meeting and Score pp. 180–189. Published baseline, excluding Deep Cuts. These are editable records: rewards, Heat, recovery, Armor restoration and other consequences require deliberate table decisions.</footer>
  </section>
}

import { useState } from 'react'
import type { CharacterDossier, HullPatch, HullRecord, HullMemory } from '@/lib/characters'

const FEATURES = ['Advanced Visual Sensors', 'Lifelike Appearance', 'Hidden Compartment', 'Smokescreen Emitter', 'Surveillance Hardware', 'Jet Propulsion']
const QUESTIONS = ['What was my name and heritage?', 'What did I leave unfinished?', 'What was my background? Who or what did I love most in life?', 'What crime was I sentenced to be Reformed for?']
function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join('; ') || '(none)'
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([key, v]) => `${key}: ${describe(v)}`).join(' · ')
  return String(value ?? '(empty)')
}

/** Scalar Hull subfields merge independently; the ordered four-memory list saves atomically. */
export function HullRecords({ data, editable, patch }: { data: CharacterDossier; editable: boolean; patch: (changes: HullPatch) => Promise<void> }) {
  const [draft, setDraft] = useState<Partial<HullRecord>>({})
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (data.playbook !== 'Hull' || !data.hull) return null
  const current = { ...data.hull, ...draft }
  const completed = data.hull.memories.filter(m => m.progress === 8).length
  function change(changes: Partial<HullRecord>) { setDraft(previous => ({ ...previous, ...changes })); setReview(false); setError('') }
  function memory(index: number, changes: Partial<HullMemory>) { change({ memories: current.memories.map((m, i) => i === index ? { ...m, ...changes } : m) }) }
  async function confirm() {
    setBusy(true); setError('')
    try { await patch({ hull: draft }); setDraft({}); setReview(false) }
    catch (e) { setError(`Hull records were not saved. Saved records remain in use. ${e instanceof Error ? e.message : 'Reconnect and retry.'}`) }
    finally { setBusy(false) }
  }
  const text = (label: string, value: string, save: (value: string) => void, multiline = false) => <label key={label}>{label}{multiline ? <textarea aria-label={label} rows={3} value={value} maxLength={12000} onChange={e => save(e.target.value)} /> : <input aria-label={label} value={value} maxLength={12000} onChange={e => save(e.target.value)} />}</label>
  const number = (label: string, value: number, max: number, save: (value: number) => void) => <label key={label}>{label}<select aria-label={label} value={value} onChange={e => save(Number(e.target.value))}>{Array.from({ length: max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label>
  return <section aria-label="Hull records" className="condition-records">
    <h4>Hull / Controller, frame & human memories</h4>
    <p className="dossier-source">Hull v6, page 2; Blades ’68 v1.0.1 pp. 30–36, 170, 193. These records are deliberate table decisions.</p>
    <p className="condition-saved">Saved: {data.hull.controller || '(no controller)'} · {data.hull.owningFaction || '(no owning faction)'} · Suspicion {data.hull.suspicion} / 4 · {completed} / 4 completed memories. {data.hull.operations}</p>
    <p>Your owning faction and controller are fictional relationships. They grant no portal permissions. Spend an activity going On Program; skipping it ticks Suspicion. At four, the GM decides consequences and generator access. Record work, skipped duties, access and negotiated changes below.</p>
    <fieldset disabled={!editable || busy}><legend>Hull draft</legend>
      <div className="dossier-grid">
        {text('Controller', current.controller, controller => change({ controller }))}
        {text('Owning faction', current.owningFaction, owningFaction => change({ owningFaction }))}
        {number('Suspicion', current.suspicion, 4, suspicion => change({ suspicion }))}
        {text('Frame details', current.frameDetails, frameDetails => change({ frameDetails }), true)}
      </div>
      <h5>Frame features</h5><p>Begin with two. Each Frame Upgrade selection adds two; select it at most twice. Sensors cover night/heat/zoom/resonance vision; Lifelike Appearance can pass casual scrutiny; Hidden Compartment defeats thorough searches and X-rays; Smokescreen fills a large room; Surveillance Hardware records distant audio and includes a secure radio; Jet Propulsion provides limited flight.</p>
      {number('Frame Upgrade selections', current.frameUpgrade, 2, frameUpgrade => change({ frameUpgrade }))}
      <div className="dossier-options">{FEATURES.map(feature => <label className="dossier-check" key={feature}><input type="checkbox" aria-label={`Frame ${feature}`} checked={current.frameFeatures.includes(feature)} onChange={e => change({ frameFeatures: e.target.checked ? [...current.frameFeatures, feature] : current.frameFeatures.filter(f => f !== feature) })} />{feature}</label>)}</div>
      {data.abilities.includes('A Room of Your Own') && <><h5>A Room of Your Own</h5><p>Banking is available with this trait. Caring for your pet costs one activity and marks three ticks in a chosen memory; record the agreed ticks below.</p><div className="dossier-grid">{text('Secret den', current.den, den => change({ den }))}{text('Hull pet', current.pet, pet => change({ pet }))}</div></>}
      <h5>Human memories · four eight-segment clocks</h5>
      <p>Whenever you would mark XP, you may tick a memory instead (book p.34 allows any XP; v6 says playbook XP). At completion, record the remembered life, one human Key in conditions, a contact, and an ability from another playbook with its source. Roll 1d8 down that playbook’s abilities or choose with the table; record associated items in equipment. The first three contacts are former friends; the fourth is a dangerous rival. The portal awards nothing automatically.</p>
      <p>Keys and their later Deadlocks share the condition slots with robotic Deadlocks. Up to one human Key or its Deadlock is supported by each completed memory. When all four complete, the first XP trigger becomes freeing yourself from your owners/controller or addressing a challenge with humanity. Book pacing variants require an explicit table decision; clocks here retain the eight-segment baseline.</p>
      {current.memories.map((m, index) => <fieldset key={index}><legend>{index + 1}. {QUESTIONS[index]}</legend><div className="dossier-grid">
        {number(`Memory ${index + 1} progress`, m.progress, 8, progress => memory(index, { progress }))}
        {text(`Memory ${index + 1} remembered life`, m.memory, value => memory(index, { memory: value }), true)}
        {text(`Memory ${index + 1} human contact`, m.contact, contact => memory(index, { contact }))}
        {text(`Memory ${index + 1} ability`, m.ability, ability => memory(index, { ability }))}
        {text(`Memory ${index + 1} ability source`, m.source, source => memory(index, { source }))}
        {text(`Memory ${index + 1} decisions and items`, m.notes, notes => memory(index, { notes }), true)}
      </div></fieldset>)}
      {text('Hull operations and outcomes', current.operations, operations => change({ operations }), true)}
    </fieldset>
    {editable && Object.keys(draft).length > 0 && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review Hull records</button>}
      {review && <div className="condition-review" role="region" aria-label="Review Hull records"><h5>Review entered changes</h5><p>Only these fields will save. Confirm Suspicion, frame, memory and ability decisions with the table. Coordinate edits to the memory list; the whole list saves together.</p><dl>{Object.entries(draft).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>Saved: {describe(data.hull![field as keyof HullRecord])}<br />Proposed: {describe(value)}</dd></div>)}</dl><button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving Hull records…' : error ? 'Retry Hull records' : 'Confirm Hull records'}</button><button disabled={busy} onClick={() => setReview(false)}>Keep editing Hull records</button></div>}
      <button disabled={busy} onClick={() => { setDraft({}); setReview(false); setError('') }}>Discard Hull records</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
  </section>
}

import { useState } from 'react'
import { ASSISTANCE, backingError, createBacking, patchBacking, useBacking, type BackingFaction, type BackingPatch, type BackingRecord } from '@/lib/backing'
import { hasCharacterAbility, type CharacterRecord } from '@/lib/characters'

export function CharacterBacking({ character, editable }: { character: CharacterRecord; editable: boolean }) {
  const { records, factions, error, loaded, refresh, accept } = useBacking(character.id, character.campaign_id)
  const [faction, setFaction] = useState(''), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState('')
  const limit = hasCharacterAbility(character.data, 'Double Agent') ? 2 : 1
  async function create() {
    setBusy(true); setSaveError('')
    try { accept(await createBacking(character.id, faction)) } catch (e) { setSaveError(`Backing was not saved. ${backingError(e)}`) } finally { setBusy(false) }
  }
  return <section aria-label="Backing factions" className="condition-records">
    <h4>Backing factions / obligations</h4>
    <p className="dossier-source">Blades ’68 book v1.0.1 pp.236–241; Operative v6. One active backing per character; Double Agent (native Operative, selected sourced Versatile a completed sourced Hull memory or a sourced Future Shock advancement paired with a selected native trait) permits two. Crew faction status is independent, including hostile status.</p>
    <p>Agree backing and mission outcomes with the GM. Gaining or restoring backing ordinarily uses a long-term project: Tier 1–2 → 4 segments, 3–4 → 6, 5 → 8, 6 → 10. Operatives start with a backing. Record project decisions in notes; these controls record an agreed relationship.</p>
    <p>Each assistance type is available once per labeled cycle of crew and personal business. Add a new labeled cycle deliberately; earlier use stays recorded. Support records never apply equipment, rewards or status changes.</p>
    <details><summary>Mission, prestige and Return the Favor guidance</summary><p>At Personal Business, review Return the Favor using help received since the last roll and any carried die. Record the roll, result and decisions below. Minor favor, mission, urgent mission and existing-mission exceptions need table review. Failure has four segments: review one tick each downtime an active mission remains unfinished. Filled Failure loses backing; mark it inactive explicitly. A satisfied mission grants prestige and +1 crew status; review and apply that status separately through GM controls or Aftermath. Losing backing may leave training intact; agree access changes with the GM. Incomplete or special procedures stay editable records.</p></details>
    {error && <p role="alert" className="dossier-error">{error}<button onClick={() => void refresh()}>Retry backing sync</button></p>}
    {saveError && <p role="alert" className="dossier-error">{saveError}</p>}
    {loaded && records.length === 0 && <p>No backing records visible to you.</p>}
    {editable && <fieldset disabled={busy || !loaded}><legend>Record agreed backing</legend><label>Public backing faction<select aria-label="Public backing faction" value={faction} onChange={e => setFaction(e.target.value)}><option value="">Choose a campaign faction</option>{factions.map(f => <option key={f.id} value={f.id}>{f.name} · Tier {f.tier}</option>)}</select></label><p>{records.filter(r => r.active).length} / {limit} active. GM creates public factions in the faction dossier. New backing records are private to the current owner and GM.</p><button disabled={!faction} onClick={() => void create()}>{busy ? 'Saving backing…' : 'Record backing'}</button></fieldset>}
    {records.map(row => <BackingEditor key={row.id} row={row} editable={editable} factions={factions} concealed={!loaded} accept={accept} refresh={refresh} />)}
  </section>
}
function describe(value: unknown) { return typeof value === 'string' ? value || '(empty)' : JSON.stringify(value) }
function BackingEditor({ row, editable, factions, concealed, accept, refresh }: { row: BackingRecord; editable: boolean; factions: BackingFaction[]; concealed: boolean; accept: (row: BackingRecord) => void; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<BackingPatch>({}), [version, setVersion] = useState(row.version)
  const [review, setReview] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const value = { ...row, ...draft }, linked = factions.find(f => f.id === value.faction_id)
  const hasDraft = Object.keys(draft).length > 0
  function change(patch: BackingPatch) { if (!hasDraft) setVersion(row.version); setDraft(d => ({ ...d, ...patch })); setReview(false); setError('') }
  async function save() {
    setBusy(true); setError('')
    try { accept(await patchBacking(row, draft, version)); setDraft({}); setReview(false) }
    catch (e) { setError(`Backing changes were not saved. ${backingError(e)}`) } finally { setBusy(false) }
  }
  function discard() { setDraft({}); setReview(false); setError(''); void refresh() }
  const text = (label: string, field: 'mission' | 'prestige' | 'choices' | 'return_favor' | 'notes') => <label>{label}<textarea aria-label={label} rows={2} value={value[field]} maxLength={12000} onChange={e => change({ [field]: e.target.value })} /></label>
  // A failed authorized refresh conceals saved cards while preserving local drafts.
  if (concealed && !hasDraft) return null
  return <section aria-label={`${linked?.name ?? row.faction_name} backing`} className="backing-card">
    <h5>{linked?.name ?? row.faction_name} · {value.active ? 'Active backing' : 'Inactive history'} · {value.shared ? 'Shared with campaign' : 'Owner and GM only'}</h5>
    {!linked && <p>Unlinked retained history (recorded Tier {row.faction_tier}). Select the exact public faction to link it; names are never matched automatically.</p>}
    <fieldset disabled={!editable || busy}><legend>{concealed ? 'Local backing draft · reconnect before saving' : 'Backing record'}</legend>
      <div className="dossier-grid">
        <label>Linked public faction<select aria-label="Linked public faction" value={value.faction_id ?? ''} onChange={e => change({ faction_id: e.target.value })}><option value="" disabled>Unlinked retained history</option>{factions.map(f => <option key={f.id} value={f.id}>{f.name} · Tier {f.tier}</option>)}</select></label>
        <label className="dossier-check"><input type="checkbox" checked={value.active} onChange={e => change({ active: e.target.checked })} />Active backing</label>
        {text('Personal mission', 'mission')}
        <label>Mission state<select aria-label="Mission state" value={value.mission_state} onChange={e => change({ mission_state: e.target.value as BackingRecord['mission_state'] })}>{['pending', 'active', 'complete', 'failed'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Failure progress<select aria-label="Failure progress" value={value.failure} onChange={e => change({ failure: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n} / 4 · {'●'.repeat(n)}{'○'.repeat(4 - n)}</option>)}</select></label>
        {text('Prestige ability', 'prestige')}{text('Prestige choices and decisions', 'choices')}{text('Return the Favor roll and decisions', 'return_favor')}{text('Backing history and notes', 'notes')}
      </div>
      <label className="dossier-check"><input type="checkbox" checked={value.shared} onChange={e => change({ shared: e.target.checked })} />Share entire backing record with campaign</label>
      <p>Sharing includes mission, Failure, prestige, choices and all support history. This Failure clock belongs to this record; it does not link or reveal any GM-only campaign clock.</p>
      {value.cycles.map((cycle, i) => {
        const update = (patch: Partial<typeof cycle>) => change({ cycles: value.cycles.map((c, n) => n === i ? { ...c, ...patch } : c) })
        return <fieldset key={i}><legend>Support cycle {i + 1}</legend><label>Support cycle {i + 1} label<input aria-label={`Support cycle ${i + 1} label`} maxLength={100} value={cycle.label} onChange={e => update({ label: e.target.value })} /></label><div className="dossier-grid">{ASSISTANCE.map(([id, label, guidance]) => <label className="dossier-check" key={id}><input aria-label={`Cycle ${i + 1} · ${label}`} type="checkbox" checked={cycle.used.includes(id)} onChange={e => update({ used: e.target.checked ? [...cycle.used, id] : cycle.used.filter(k => k !== id) })} /><span>{label}<small className="backing-help">{guidance}</small></span></label>)}</div><label>Support cycle {i + 1} notes<textarea value={cycle.notes} maxLength={12000} onChange={e => update({ notes: e.target.value })} /></label></fieldset>
      })}
      <button disabled={value.cycles.length >= 100} onClick={() => change({ cycles: [...value.cycles, { label: '', used: [], notes: '' }] })}>Add labeled support cycle</button>
    </fieldset>
    {editable && hasDraft && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review backing changes</button>}
      {review && <div className="condition-review" role="region" aria-label="Review backing changes"><p>Confirm these records after table review. No mission consequences, faction status, resource changes or support resets will be applied.</p><dl>{Object.entries(draft).map(([key, proposed]) => <div key={key}><dt>{key}</dt><dd>Saved: {describe(row[key as keyof BackingRecord])}<br />Proposed: {describe(proposed)}</dd></div>)}</dl><button disabled={busy} onClick={() => void save()}>{busy ? 'Saving backing changes…' : error ? 'Retry backing changes' : 'Confirm backing changes'}</button><button disabled={busy} onClick={() => setReview(false)}>Keep editing backing changes</button></div>}
      <button disabled={busy} onClick={discard}>Discard backing changes</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}<button disabled={busy} onClick={discard}>Reload saved backing</button></p>}
  </section>
}

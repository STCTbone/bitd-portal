import { useState } from 'react'
import { type CharacterDossier, type CompanionPatch, type Sparkmind, type ResonanceEntity, type Autopod, type IntellectualRecord, type ParanormalistRecord, type SwingerRecord } from '@/lib/characters'

function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join('; ') || '(none)'
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([k, v]) => `${k}: ${describe(v)}`).join(' · ')
  return String(value ?? '(empty)')
}

/** Each draft submits only changed subfields; separate accepted edits survive retry. */
export function CompanionRecords({ data, editable, patch }: { data: CharacterDossier; editable: boolean; patch: (changes: CompanionPatch) => Promise<void> }) {
  const [draft, setDraft] = useState<CompanionPatch>({})
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = data.playbook === 'Intellectual' ? 'sparkmind' : data.playbook === 'Paranormalist' ? 'resonanceEntity' : data.playbook === 'Swinger' ? 'autopod' : null
  if (!field) return null
  const sparkmind = { ...data.sparkmind, ...draft.sparkmind } as Sparkmind
  const entity = { ...data.resonanceEntity, ...draft.resonanceEntity } as ResonanceEntity
  const autopod = { ...data.autopod, ...draft.autopod } as Autopod
  const intellectual = { ...data.intellectual, ...draft.intellectual } as IntellectualRecord
  const paranormalist = { ...data.paranormalist, ...draft.paranormalist } as ParanormalistRecord
  const swinger = { ...data.swinger, ...draft.swinger } as SwingerRecord
  const companion = { sparkmind, resonanceEntity: entity, autopod }[field]
  const title = field === 'sparkmind' ? 'Sparkmind assistant' : field === 'resonanceEntity' ? 'Loyal resonance entity' : 'Two-seat autopod'
  function change(changes: CompanionPatch) {
    setDraft(previous => ({ ...previous, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, { ...previous[key as keyof CompanionPatch], ...value }])) }))
    setReview(false); setError('')
  }
  async function confirm() {
    setBusy(true); setError('')
    try { await patch(draft); setDraft({}); setReview(false) }
    catch (e) { setError(`Companion records were not saved. Saved records remain in use. ${e instanceof Error ? e.message : 'Reconnect and retry.'}`) }
    finally { setBusy(false) }
  }
  const text = (label: string, value: string, save: (value: string) => void, multiline = false, suggestions?: string[]) => <label key={label}>{label}{multiline ? <textarea aria-label={label} rows={3} value={value} maxLength={12000} onChange={e => save(e.target.value)} /> : <input aria-label={label} value={value} maxLength={12000} placeholder={suggestions?.join(' · ')} onChange={e => save(e.target.value)} />}</label>
  const check = (label: string, value: boolean, save: (value: boolean) => void) => <label key={label} className="dossier-check"><input aria-label={label} type="checkbox" checked={value} onChange={e => save(e.target.checked)} />{label}</label>
  const select = (label: string, value: string, options: string[], save: (value: string) => void) => <label key={label}>{label}<select aria-label={label} value={value} onChange={e => save(e.target.value)}>{options.map(o => <option key={o} value={o}>{o || 'Choose…'}</option>)}</select></label>
  const operationsField = field === 'sparkmind' ? 'intellectual' : field === 'resonanceEntity' ? 'paranormalist' : 'swinger'
  return <section aria-label="Companion records" className="condition-records">
    <h4>{title}</h4>
    <p>Expert playbook cohort. Quality is crew Tier +1 when its expertise applies. It can act, join group actions and help during downtime; it cannot perform secondary scores. Conditions, recovery and outcomes are recorded deliberately with the table.</p>
    <p>Accepted companion: {data[field]?.name || '(unnamed)'} · {data[field]?.impaired ? 'Impaired' : data[field]?.broken ? 'Broken' : data[field]?.weak ? 'Weak' : 'No conditions marked'}. {data[field]?.notes}</p>
    <fieldset disabled={!editable || busy}>
      <div className="dossier-grid">
        {text('Companion name', companion.name, name => change({ [field]: { name } }))}
        {text('Companion edges', companion.edges, edges => change({ [field]: { edges } }))}
        {text('Companion flaws', companion.flaws, flaws => change({ [field]: { flaws } }))}
        {text('Companion origin and relationship', companion.origin, origin => change({ [field]: { origin } }), true)}
      </div>
      <div className="dossier-options">{(['weak', 'impaired', 'broken'] as const).map(condition => check(`Companion ${condition}`, companion[condition], value => change({ [field]: { [condition]: value } })))}</div>
      {field === 'sparkmind' && <>
        <p>Research gathers information; Analysis covers study and invention; Ingress covers system hacking. Small housing is portable but less powerful; Large is room-sized, stronger and immobile. Choose one initial expertise. Each Advanced Sparkmind selection adds a type or edge or removes a flaw, up to two selections. Edit edges/flaws above to record the result.</p>
        <div className="dossier-grid">
          {text('Fields of study', intellectual.fieldsOfStudy, fieldsOfStudy => change({ intellectual: { fieldsOfStudy } }), false, data.sheet.backgroundSuggestions)}
          {select('Sparkmind housing', sparkmind.housing, ['', 'Small', 'Large'], housing => change({ sparkmind: { housing: housing as Sparkmind['housing'] } }))}
          {[0, 1].map(i => select(`Advanced Sparkmind choice ${i + 1}`, sparkmind.advancedChoices[i] ?? '', ['', 'additional-type', 'add-edge', 'remove-flaw'], value => {
            const choices = [...sparkmind.advancedChoices]; choices[i] = value
            change({ sparkmind: { advancedChoices: choices.filter(Boolean) } })
          }))}
        </div>
        <div className="dossier-options">{['Research', 'Analysis', 'Ingress'].map(type => check(`Sparkmind ${type}`, sparkmind.types.includes(type), enabled => change({ sparkmind: { types: enabled ? [...sparkmind.types, type] : sparkmind.types.filter(t => t !== type) } })))}</div>
        {text('Gadget load and crafting decisions', intellectual.gadgetDecisions, gadgetDecisions => change({ intellectual: { gadgetDecisions } }), true)}
      </>}
      {field === 'resonanceEntity' && <>
        <p>Expert: Paranormal Assistant — research, equipment handling, field support and similar agreed help; fighting is outside its ordinary expertise. The entity inhabits the resonance field and may manifest weakly in the physical world. It is vulnerable to paranormal and electroplasmic effects. Its Armor below is separate from your own Armor and Echo Projection.</p>
        <div className="dossier-grid">
          {text('Entity form', entity.kind, kind => change({ resonanceEntity: { kind } }))}
          {text('Entity abilities', entity.abilities, abilities => change({ resonanceEntity: { abilities } }), true)}
          <label>Precognition assists used<input aria-label="Precognition assists used" type="number" min={0} max={2} step={1} value={paranormalist.precognitionUsed} onChange={e => change({ paranormalist: { precognitionUsed: Number(e.target.value) } })} /></label>
          {select('Echo Projection selections', String(paranormalist.projectionRank), ['0', '1', '2'], value => change({ paranormalist: { projectionRank: Number(value) } }))}
        </div>
        <div className="dossier-options">{check('Entity Armor', entity.armor, armor => change({ resonanceEntity: { armor } }))}{check('Echo Projection active', paranormalist.projectionActive, projectionActive => change({ paranormalist: { projectionActive } }))}</div>
        {text('Paranormal experiments and preparation', paranormalist.experiments, experiments => change({ paranormalist: { experiments } }), true)}
      </>}
      {field === 'autopod' && <>
        <p>Two seats. Racing is built for speed; Impressing helps when showing it off; Surprising has hidden gadgets. Record the chosen gadget fiction in the notes. Fine clothes worn cost 0 load; carrying a second outfit costs 2 — adjust the equipment record deliberately. Echo Twin has no mechanical Stress or Harm track.</p>
        <div className="dossier-grid">
          {select('Autopod type', autopod.type, ['', 'Racing', 'Impressing', 'Surprising'], type => change({ autopod: { type: type as Autopod['type'] } }))}
          {text('Autopod style', autopod.style, style => change({ autopod: { style } }))}
          {text('Side hustle', swinger.sideHustle, sideHustle => change({ swinger: { sideHustle } }))}
          {text('Echo Twin identity and outcomes', swinger.twinNotes, twinNotes => change({ swinger: { twinNotes } }), true)}
        </div>
        <div className="dossier-options">
          {check('Hustle extra activity granted', swinger.hustleActivityGranted, hustleActivityGranted => change({ swinger: { hustleActivityGranted } }))}
          {check('Party assist available', swinger.partyAssistAvailable, partyAssistAvailable => change({ swinger: { partyAssistAvailable } }))}
          {check('Echo Twin summoned', swinger.twinSummoned, twinSummoned => change({ swinger: { twinSummoned } }))}
          {['scene', 'solid', 'obedient'].map(feature => check(`Twin ${feature}`, swinger.twinFeatures.includes(feature), enabled => change({ swinger: { twinFeatures: enabled ? [...swinger.twinFeatures, feature] : swinger.twinFeatures.filter(f => f !== feature) } })))}
        </div>
      </>}
      {text('Companion notes', companion.notes, notes => change({ [field]: { notes } }), true)}
      {text('Playbook companion operations and outcomes', { intellectual, paranormalist, swinger }[operationsField].operations, operations => change({ [operationsField]: { operations } }), true)}
    </fieldset>
    {editable && Object.keys(draft).length > 0 && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review companion records</button>}
      {review && <div className="condition-review" role="region" aria-label="Review companion records"><h5>Review companion changes</h5><p>Only changed subfields below will be saved. Expertise, improvement and twin-feature lists each save as a complete list; coordinate edits to the same list. Check consequences with your table.</p><dl>{Object.entries(draft).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>Saved: {describe(data[key as keyof CompanionPatch])}<br />Proposed: {describe(value)}</dd></div>)}</dl><button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving companion records…' : error ? 'Retry companion records' : 'Confirm companion records'}</button><button disabled={busy} onClick={() => setReview(false)}>Keep editing companion records</button></div>}
      <button disabled={busy} onClick={() => { setDraft({}); setReview(false); setError('') }}>Discard companion records</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
  </section>
}

import { useState } from 'react'
import { ACTION_GROUPS, type CharacterDossier, type HumanPlaybookPatch, type OperativeRecord, type RadicalRecord, type VeteranRecord } from '@/lib/characters'

function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join('; ') || '(none)'
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([k, v]) => `${k}: ${describe(v)}`).join(' · ')
  return String(value ?? '(empty)')
}

/** Drafts retain only changed subfields, so accepted edits by another editor survive retry. */
export function HumanPlaybookRecords({ data, editable, patch }: { data: CharacterDossier; editable: boolean; patch: (changes: HumanPlaybookPatch) => Promise<void> }) {
  const [draft, setDraft] = useState<HumanPlaybookPatch>({})
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = data.playbook === 'Operative' ? 'operative' : data.playbook === 'Radical' ? 'radical' : data.playbook === 'Veteran' ? 'veteran' : null
  if (!field) return null
  const operative = { ...data.operative, ...draft.operative } as OperativeRecord
  const radical = { ...data.radical, ...draft.radical } as RadicalRecord
  const veteran = { ...data.veteran, ...draft.veteran } as VeteranRecord
  function change(changes: HumanPlaybookPatch) {
    setDraft(previous => ({ ...previous, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, { ...previous[key as keyof HumanPlaybookPatch], ...value }])) }))
    setReview(false); setError('')
  }
  async function confirm() {
    setBusy(true); setError('')
    try { await patch(draft); setDraft({}); setReview(false) }
    catch (e) { setError(`Playbook records were not saved. Saved records remain in use. ${e instanceof Error ? e.message : 'Reconnect and retry.'}`) }
    finally { setBusy(false) }
  }
  const text = (label: string, value: string, save: (value: string) => void, multiline = false, suggestions?: string[]) => <label key={label}>{label}{multiline ? <textarea aria-label={label} rows={3} value={value} maxLength={12000} onChange={e => save(e.target.value)} /> : <input aria-label={label} value={value} maxLength={12000} placeholder={suggestions?.join(' · ')} onChange={e => save(e.target.value)} />}</label>
  const number = (label: string, value: number, max: number, save: (value: number) => void) => <label key={label}>{label}<input aria-label={label} type="number" min={0} max={max} step={1} value={value} onChange={e => save(Number(e.target.value))} /></label>
  const check = (label: string, value: boolean, save: (value: boolean) => void) => <label key={label} className="dossier-check"><input aria-label={label} type="checkbox" checked={value} onChange={e => save(e.target.checked)} />{label}</label>
  return <section aria-label="Playbook records" className="condition-records">
    <h4>{data.playbook} / specialized records</h4>
    <p className="dossier-source">{data.sheet.source}. Record table-approved outcomes explicitly. Drafts stay local until reviewed and confirmed.</p>
    <details className="condition-saved"><summary>Saved playbook records</summary><p>{describe(data[field])}</p></details>
    <fieldset disabled={!editable || busy}><legend>Playbook record draft</legend>
      {field === 'operative' && <>
        <h5>Cover, Control & operations</h5>
        <div className="dossier-grid">
          <label>Control action<select aria-label="Control action" value={operative.controlAction} onChange={e => change({ operative: { controlAction: e.target.value } })}><option value="">Choose after selecting Control</option>{Object.values(ACTION_GROUPS).flat().map(action => <option key={action}>{action}</option>)}</select></label>
          {text('Cover identity', operative.coverIdentity, coverIdentity => change({ operative: { coverIdentity } }))}
          {text('Cover identity decisions', operative.coverNotes, coverNotes => change({ operative: { coverNotes } }), true)}
          {text('Dead Drop entity', operative.dropEntity, dropEntity => change({ operative: { dropEntity } }))}
          {number('Dead Drop load delivered', operative.dropLoad, 2, dropLoad => change({ operative: { dropLoad } }))}
          {check('Dead Drop free asset activity used', operative.dropAssetUsed, dropAssetUsed => change({ operative: { dropAssetUsed } }))}
          {check('Sleeper Agents used this score', operative.sleeperUsed, sleeperUsed => change({ operative: { sleeperUsed } }))}
        </div>
        <h5>Backing factions</h5><p>Start with one backing faction. Double Agent permits a second. Record each faction’s help and Return the Favor separately; its four-segment mission Failure clock, prestige and faction relationship remain deliberate records. Help, mission and prestige decisions do not change crew status automatically. Book pp. 48, 50–51, 236–241.</p>
        {operative.backingFactions.map((backing, i) => {
          const save = (changes: Partial<typeof backing>) => change({ operative: { backingFactions: operative.backingFactions.map((b, n) => n === i ? { ...b, ...changes } : b) } })
          return <div key={i} className="dossier-grid dossier-row">
            {text(`Backing ${i + 1} name`, backing.name, name => save({ name }))}
            {number(`Backing ${i + 1} Tier`, backing.tier, 6, tier => save({ tier }))}
            {text(`Backing ${i + 1} personal mission`, backing.mission, mission => save({ mission }), true)}
            {number(`Backing ${i + 1} Failure`, backing.failure, 4, failure => save({ failure }))}
            {text(`Backing ${i + 1} prestige ability`, backing.prestige, prestige => save({ prestige }), true)}
            {text(`Backing ${i + 1} help and Return the Favor`, backing.help, help => save({ help }), true)}
            {text(`Backing ${i + 1} notes`, backing.notes, notes => save({ notes }), true)}
            {editable && <button onClick={() => change({ operative: { backingFactions: operative.backingFactions.filter((_, n) => n !== i) } })}>Remove backing faction {i + 1}</button>}
          </div>
        })}
        {editable && <button disabled={operative.backingFactions.length >= (data.abilities.includes('Double Agent') ? 2 : 1)} onClick={() => change({ operative: { backingFactions: [...operative.backingFactions, { name: '', tier: 0, mission: '', failure: 0, prestige: '', help: '', notes: '' }] } })}>Add backing faction</button>}
      </>}
      {field === 'radical' && <>
        <div className="dossier-grid">
          {text('Radicalized by', radical.radicalizedBy, radicalizedBy => change({ radical: { radicalizedBy } }), false, data.sheet.backgroundSuggestions)}
          {text('Cause and ideology', radical.cause, cause => change({ radical: { cause } }), true)}
          {text('Explosives supplier', radical.supplier, supplier => change({ radical: { supplier } }))}
          {text('Praxis next Personal Business', radical.praxis, praxis => change({ radical: { praxis } }), true)}
          {text('Total Dedication decisions', radical.dedication, dedication => change({ radical: { dedication } }), true)}
        </div>
        <h5>Explosive bandoliers · three slots each</h5><p>Record explosives used from each bandolier. Each bandolier costs 1 load; mark it carried in equipment. Fine explosives have crew Tier +1 Quality; scale depends on the fiction. Refill during downtime when you have reasonable access to your supplier, recording the reset deliberately. Explosives add +1 Heat in Aftermath; record the agreed change separately.</p>
        <p>Suggestions: {data.sheet.explosives?.join(' · ')}. Custom explosives remain editable.</p>
        <div className="dossier-grid">{radical.bandoliers.map((slots, i) => slots.map((slot, j) => text(`Bandolier ${i + 1} slot ${j + 1}`, slot, value => change({ radical: { bandoliers: radical.bandoliers.map((s, n) => n === i ? s.map((v, m) => m === j ? value : v) : s) } }))))}</div>
        <h5>Revolutionary works</h5><p>Pamphleteer uses four-segment projects. At most four completed works circulate effectively. Coordinate same-list edits. Record each work’s contribution to revolutionary projects in Personal Business; a work cannot write another work.</p>
        {radical.works.map((work, i) => {
          const save = (changes: Partial<typeof work>) => change({ radical: { works: radical.works.map((w, n) => n === i ? { ...w, ...changes } : w) } })
          return <div key={i} className="dossier-grid dossier-row">
            {text(`Work ${i + 1} name`, work.name, name => save({ name }))}
            {number(`Work ${i + 1} progress`, work.progress, 4, progress => save({ progress }))}
            {check(`Work ${i + 1} circulating`, work.circulating, circulating => save({ circulating }))}
            {text(`Work ${i + 1} project contribution`, work.contribution, contribution => save({ contribution }), true)}
            {text(`Work ${i + 1} notes`, work.notes, notes => save({ notes }), true)}
            {editable && <button onClick={() => change({ radical: { works: radical.works.filter((_, n) => n !== i) } })}>Remove revolutionary work {i + 1}</button>}
          </div>
        })}
        {editable && <button disabled={radical.works.length >= 30} onClick={() => change({ radical: { works: [...radical.works, { name: '', progress: 0, circulating: false, contribution: '', notes: '' }] } })}>Add revolutionary work</button>}
      </>}
      {field === 'veteran' && <>
        <p>You start with one deadlocked Key; name it and its former Key in Condition records. Permanent service damage is separate from temporary Harm. Something that helps and assistance record your own circumstances; no automatic penalty is imposed. Creative Community’s hobby vice and civilian relationships stay separate from your ordinary vice.</p>
        <div className="dossier-grid">
          {text('Tours of duty', veteran.tours, tours => change({ veteran: { tours } }), false, data.sheet.backgroundSuggestions)}
          {text('Permanent damage', veteran.damage, damage => change({ veteran: { damage } }), true)}
          {text('Something that helps', veteran.helps, helps => change({ veteran: { helps } }), true)}
          {text('Assistance details', veteran.assistance, assistance => change({ veteran: { assistance } }), true)}
          {text('Creative hobby vice', veteran.hobby, hobby => change({ veteran: { hobby } }))}
        </div>
      </>}
      {text('Playbook operations and outcomes', ({ operative, radical, veteran }[field]).operations, operations => change({ [field]: { operations } }), true)}
    </fieldset>
    {editable && Object.keys(draft).length > 0 && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review playbook records</button>}
      {review && <div className="condition-review" role="region" aria-label="Review playbook records"><h5>Review entered changes</h5><p>Only changed subfields below will be saved. Check consequences with your table. Backing factions, bandoliers and works are each saved as a complete list; coordinate edits to the same list.</p><dl>{Object.entries(draft).map(([key, value]) => <div key={key}><dt>{data.playbook}</dt><dd>Saved: {describe(data[key as keyof HumanPlaybookPatch])}<br />Proposed: {describe(value)}</dd></div>)}</dl><button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving playbook records…' : error ? 'Retry playbook records' : 'Confirm playbook records'}</button><button disabled={busy} onClick={() => setReview(false)}>Keep editing playbook records</button></div>}
      <button disabled={busy} onClick={() => { setDraft({}); setReview(false); setError('') }}>Discard playbook records</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
  </section>
}

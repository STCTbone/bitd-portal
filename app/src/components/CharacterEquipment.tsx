import { useState } from 'react'
import type { CharacterDossier, CharacterItem, EquipmentPatch } from '@/lib/characters'

function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join('; ') || '(none)'
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([k, v]) => `${k}: ${describe(v)}`).join(' · ')
  return String(value ?? '(empty)')
}
const TITLES: Record<keyof EquipmentPatch, string> = { loadout: 'Load choice / carried cash', armor: 'Armor', equipment: 'Equipment', resources: 'Limited resources', wealth: 'Stacks / bank', xp: 'XP tracks', advancementNotes: 'Advancement record', equipmentNotes: 'Equipment decisions' }

/** Deliberate drafts submit only changed fields; nested patches retain other accepted edits. */
export function CharacterEquipment({ data, editable, patch }: { data: CharacterDossier; editable: boolean; patch: (changes: EquipmentPatch) => Promise<void> }) {
  const [draft, setDraft] = useState<EquipmentPatch>({})
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = { ...data, ...draft, loadout: { ...data.loadout, ...draft.loadout }, armor: { ...data.armor, ...draft.armor }, wealth: { ...data.wealth, ...draft.wealth }, xp: { ...data.xp, ...draft.xp } }
  function change(changes: EquipmentPatch) { setDraft(d => ({ ...d, ...changes })); setReview(false); setError('') }
  async function confirm() {
    setBusy(true); setError('')
    try { await patch(draft); setDraft({}); setReview(false) }
    catch (e) { setError(`Equipment and advancement were not saved. Saved records remain in use. ${e instanceof Error ? e.message : 'Reconnect and retry.'}`) }
    finally { setBusy(false) }
  }
  const armorLoad = current.armor.worn ? current.armor.kind === 'armor' ? 3 : current.armor.kind === 'light' ? 2 : 0 : 0
  const carried = current.equipment.reduce((sum, item) => sum + (item.carried ? item.load * item.quantity : 0), 0) + current.loadout.carriedStacks + armorLoad
  const capacity = current.loadout.mode === 'Quiet' ? data.sheet.quiet : data.sheet.loud
  const entries = Object.entries(draft) as [keyof EquipmentPatch, unknown][]
  const text = (label: string, value: string, save: (v: string) => void, multiline = false) => <label>{label}{multiline ? <textarea aria-label={label} value={value} rows={3} maxLength={12000} onChange={e => save(e.target.value)} /> : <input aria-label={label} value={value} maxLength={12000} onChange={e => save(e.target.value)} />}</label>
  const number = (label: string, value: number, max: number, save: (v: number) => void, min = 0) => <label key={label}>{label}<input aria-label={label} type="number" min={min} max={max} step={1} value={value} onChange={e => save(Number(e.target.value))} /></label>
  const check = (label: string, value: boolean, save: (v: boolean) => void) => <label key={label} className="dossier-check"><input aria-label={label} type="checkbox" checked={value} onChange={e => save(e.target.checked)} />{label}</label>
  function itemChange(i: number, changes: Partial<CharacterItem>) { change({ equipment: current.equipment.map((item, n) => i === n ? { ...item, ...changes } : item) }) }
  return <section aria-label="Equipment and advancement records" className="condition-records">
    <h4>07 / Equipment, wealth & advancement</h4>
    <p className="dossier-source">{data.sheet.source}. Common load costs and Hound items: current v6 sheet. Changes remain drafts until reviewed and confirmed.</p>
    <p className="condition-saved" aria-live="polite">Saved: {data.loadout.mode} · {data.wealth.stacks} stacks · bank {data.wealth.bank} · playbook XP {data.xp.playbook}. Armor: {data.armor.kind}{data.armor.totaled ? ' · totaled' : ''}.</p>
    <fieldset disabled={!editable || busy}><legend>Equipment and advancement draft</legend>
      <h5>Quiet / Loud load</h5>
      <p>Choose before engagement. Each carried stack costs 1 load. Listed Armor contributes its load here; do not duplicate it as another item. Italic Hound items are free. Quantity multiplies item load. RF radio handset follows the current nonitalic v6 listing (1 load); book p.25 says 0. Confirm and record your table’s choice. Record rigging, concealment and table-agreed exceptions in the item’s source/notes; label house rules explicitly.</p>
      <div className="dossier-grid"><label>Load choice<select aria-label="Load choice" value={current.loadout.mode} onChange={e => change({ loadout: { ...draft.loadout, mode: e.target.value as 'Quiet' | 'Loud' } })}><option value="Quiet">Quiet · {data.sheet.quiet}</option><option value="Loud">Loud · {data.sheet.loud}</option></select></label>{number('Carried stacks', current.loadout.carriedStacks, current.wealth.stacks, carriedStacks => change({ loadout: { ...draft.loadout, carriedStacks } }))}</div>
      <p data-testid="carried-load">Draft load: {carried} / {capacity} · {current.loadout.mode}</p>
      {carried > capacity && <p role="status">Over listed load. Review your equipment and any sourced exception with the table.</p>}
      <h5>Armor · worn and totaled</h5>
      <p>Ordinary Armor (3 load) repeatedly reduces applicable physical Harm by one level while worn. Totaling it resists one instance entirely; level 3 physical Harm remaining after Armor/resistance also totals it and cancels that Harm. GM decides applicability. Totaled Armor provides no further benefit for the score. Light Armor (2 load) cancels one instance then totals, and requires Acquire Asset or invention. Hull built-in Armor costs 0. Record these decisions and Personal Business restoration explicitly.</p>
      <div className="dossier-grid"><label>Armor kind<select aria-label="Armor kind" value={current.armor.kind} onChange={e => change({ armor: { ...draft.armor, kind: e.target.value as typeof current.armor.kind } })}><option value="none">None available</option><option value="armor">Armor · 3 load</option><option value="light">Acquired / invented Light Armor · 2 load</option>{data.sheet.builtInArmor && <option value="built-in">Built-in Armor · 0 load</option>}</select></label>{text('Armor source', current.armor.source, source => change({ armor: { ...draft.armor, source } }))}{check('Armor worn', current.armor.worn, worn => change({ armor: { ...draft.armor, worn } }))}{check('Armor totaled', current.armor.totaled, totaled => change({ armor: { ...draft.armor, totaled } }))}{text('Armor decisions', current.armor.notes, notes => change({ armor: { ...draft.armor, notes } }), true)}</div>
      <h5>Carried items</h5>
      {current.equipment.map((item, i) => <details key={i} className="equipment-item"><summary>{item.name || `Item ${i + 1}`} · {item.load} load × {item.quantity}{item.carried ? ' · carried' : ''}</summary><div className="dossier-grid">
        {text(`Item ${item.name || i + 1} name`, item.name, name => itemChange(i, { name }))}
        {number(`Item ${item.name || i + 1} load`, item.load, 100, load => itemChange(i, { load }))}
        {number(`Item ${item.name || i + 1} quantity`, item.quantity, 100, quantity => itemChange(i, { quantity }), 1)}
        {number(`Item ${item.name || i + 1} uses recorded`, item.uses, 100, uses => itemChange(i, { uses }))}
        {check(`Item ${item.name || i + 1} carried`, item.carried, carried => itemChange(i, { carried }))}
        {text(`Item ${item.name || i + 1} source`, item.source, source => itemChange(i, { source }))}
        {text(`Item ${item.name || i + 1} notes`, item.notes, notes => itemChange(i, { notes }), true)}
      </div>{editable && <button onClick={() => change({ equipment: current.equipment.filter((_, n) => i !== n) })}>Remove item {item.name}</button>}</details>)}
      {editable && <button onClick={() => change({ equipment: [...current.equipment, { name: 'New item', load: 0, quantity: 1, uses: 0, carried: false, source: '', notes: '' }] })}>Add carried item</button>}
      <h5>Limited resources</h5><p>Hound’s Dogged Persistence grants two Tenacity uses per score; restore them at the start of downtime (book p.28). Mark use/restoration deliberately. Other resources require a named source; no phase change spends or restores them.</p>
      {current.resources.map((resource, i) => { const save = (changes: Partial<typeof resource>) => change({ resources: current.resources.map((r, n) => i === n ? { ...r, ...changes } : r) }); return <div className="dossier-grid dossier-row" key={i}>
        {text(`Resource ${i + 1} name`, resource.name, name => save({ name }))}{number(`Resource ${i + 1} used`, resource.used, resource.capacity, used => save({ used }))}{number(`Resource ${i + 1} capacity`, resource.capacity, 100, capacity => save({ capacity }))}{text(`Resource ${i + 1} source`, resource.source, source => save({ source }))}{text(`Resource ${i + 1} notes`, resource.notes, notes => save({ notes }), true)}
        {editable && <button onClick={() => change({ resources: current.resources.filter((_, n) => i !== n) })}>Remove resource {i + 1}</button>}
      </div> })}
      {editable && <button onClick={() => change({ resources: [...current.resources, { name: '', used: 0, capacity: 0, source: '', notes: '' }] })}>Add limited resource</button>}
      {text('Equipment decisions', current.equipmentNotes, equipmentNotes => change({ equipmentNotes }), true)}
      <h5>Stacks / bank</h5><p>Wallet capacity {data.sheet.wallet}; bank {data.sheet.bank}. Each full bank row of 10 gives 1 lifestyle Quality. Withdrawal ordinarily costs 2 bank per 1 cash; source-specific abilities differ. Enter both agreed values explicitly. No automatic transfer, debit or score payout.</p>
      <div className="dossier-grid">{number('Stacks in wallet', current.wealth.stacks, data.sheet.wallet, stacks => change({ wealth: { ...draft.wealth, stacks } }))}{number('Bank', current.wealth.bank, data.sheet.bank, bank => change({ wealth: { ...draft.wealth, bank } }))}</div>
      <p>Lifestyle Quality: {Math.floor(current.wealth.bank / 10)}</p>
      <h5>XP / advances</h5><p>Record desperate and zero-dot action XP on any track (book p.160); the v6 sheet footer instead says attribute tracks. Keep placement editable and resolve that source discrepancy with your table. Keys collectively grant at most 1 XP/session. A filled track calls for clearing marks and an advance: special ability for playbook, an action dot under the attribute otherwise. Record each agreed change explicitly; filling a track does not apply it automatically. Actions and ability choices are above.</p>
      <div className="dossier-grid">{(['playbook','insight','prowess','resolve'] as const).map(track => number(`${track[0].toUpperCase() + track.slice(1)} XP`, current.xp[track], track === 'playbook' ? data.sheet.playbookXp : data.sheet.attributeXp, value => change({ xp: { ...draft.xp, [track]: value } })))}</div>
      {text('Advancement record', current.advancementNotes, advancementNotes => change({ advancementNotes }), true)}
    </fieldset>
    {editable && entries.length > 0 && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review equipment and advancement</button>}
      {review && <div className="condition-review" role="region" aria-label="Review equipment and advancement"><h5>Review entered changes</h5><p>Only the fields below will be saved. Confirm protection, resource use, transfers and advances with your table. Item/resource lists are saved together; coordinate simultaneous edits to the same list.</p><dl>{entries.map(([field, value]) => <div key={field}><dt>{TITLES[field]}</dt><dd>Saved: {describe(data[field])}<br />Proposed: {describe(value)}</dd></div>)}</dl><button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving equipment…' : error ? 'Retry equipment and advancement' : 'Confirm equipment and advancement'}</button><button disabled={busy} onClick={() => setReview(false)}>Keep editing equipment</button></div>}
      <button disabled={busy} onClick={() => { setDraft({}); setReview(false); setError('') }}>Discard equipment and advancement</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
  </section>
}

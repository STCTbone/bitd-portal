import { useId, useState } from 'react'
import { hasCharacterAbility, type CharacterDossier, type CharacterHarm, type ConditionPatch } from '@/lib/characters'

const HARM_LEVELS = { mortal: 'Mortal', critical: 'Critical', major: 'Major', passing: 'Passing' } as const
const TITLES: Record<keyof ConditionPatch, string> = { stress: 'Stress marked', keys: 'Keys / hit marks', deadlocks: 'Deadlocks', harm: 'Harm', healing: 'Healing clock', recoveryNotes: 'Recovery notes', conditionNotes: 'Condition decisions' }
function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join('; ') || '(none)'
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([k, v]) => `${k}: ${describe(v)}`).join(' · ')
  return String(value || (value === 0 ? '0' : '(empty)'))
}

/** Only changed fields are submitted, after review. Accepted state stays visible. */
export function CharacterCondition({ data, editable, patch, isGM, setKeyCapacity }: {
  data: CharacterDossier; editable: boolean; patch: (changes: ConditionPatch) => Promise<void>
  isGM: boolean; setKeyCapacity: (capacity: number, reason: string) => Promise<void>
}) {
  const hull = data.sheet.conditionKind === 'hull'
  const ghost = data.sheet.conditionKind === 'ghost'
  const vampire = data.sheet.conditionKind === 'vampire'
  const traveler = data.sheet.conditionKind === 'future' || data.sheet.conditionKind === 'past'
  const paranormal = ghost || vampire || traveler
  const deadlockLabel = ghost ? 'Echo irregularity' : traveler ? 'Temporal glitch' : 'Deadlock'
  const specializedChoices = ghost ? ['Chaotic','Destructive','Furious','Obsessive','Territorial','Sadistic'] : ['Body Phasing','Hallucinations','Lagging','Headaches','Flashbacks','Time Skips']
  const resource = hull || ghost ? 'Drain' : traveler ? 'Instability' : 'Stress'
  const damage = hull ? 'Damage' : 'Harm'
  const recovery = hull ? 'Repair' : 'Healing'
  const completed = data.hull?.memories.filter(m => m.progress === 8).length ?? 0
  const robotic = ['Brutal', 'Detached', 'Ruthless', 'Unstable']
  const id = useId()
  const [draft, setDraft] = useState<ConditionPatch>({})
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [capacity, setCapacity] = useState<number | null>(null)
  const [capacitySource, setCapacitySource] = useState('')
  const [capacityError, setCapacityError] = useState('')
  const current = { ...data, ...draft, harm: { ...data.harm, ...draft.harm }, healing: { ...data.healing, ...draft.healing } }
  const occupied = current.keys.length + current.deadlocks.length
  const entries = Object.entries(draft) as [keyof ConditionPatch, unknown][]
  function change(value: ConditionPatch) { setDraft(previous => ({ ...previous, ...value })); setReview(false); setError('') }
  async function confirm() {
    setBusy(true); setError('')
    try { await patch(draft); setDraft({}); setReview(false) }
    catch (e) { setError(`Condition changes were not saved. Saved records remain in use. ${e instanceof Error ? e.message : 'Reconnect and retry.'}`) }
    finally { setBusy(false) }
  }
  const number = (label: string, value: number, max: number, save: (value: number) => void) => <label key={label}>{label}<select aria-label={label} value={value} onChange={e => save(Number(e.target.value))}>{Array.from({ length: max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label>
  const text = (label: string, value: string, save: (value: string) => void, multiline = false) => <label key={label}>{label}{multiline ? <textarea aria-label={label} rows={3} value={value} maxLength={12000} onChange={e => save(e.target.value)} /> : <input aria-label={label} value={value} maxLength={12000} onChange={e => save(e.target.value)} />}</label>
  return <section aria-label="Condition records" className="condition-records">
    <h4>06 / Keys, {resource} & {damage}</h4>{data.sheet.keys && <p>Key suggestions: {data.sheet.keys.join(' · ')}. You may create your own.</p>}
    <details className="rules-reference"><summary>Keys and crisis rules</summary><p className="dossier-source">Published baseline: Blades ’68 v1.0.1, pp. 84, 152–157, 169–170, 334–340; playbooks v6.</p>
    {paranormal ? <>
      <p>Keys and their replacements share the sheet’s slots. Across all Keys combined, earn at most 1 XP per session; Vampire starts with four filled Deadlocks and earns no Key XP.</p>
      <p>{ghost ? 'You cannot turn Keys. At full Drain strike out a Key and choose an echo irregularity. Satisfying the resonance need requires Possess; consuming a living victim’s essence clears half Drain, rounded down.' : vampire ? 'At mortal Harm or another Deadlock, you are overwhelmed: record Critical Harm Incapacitated until feeding recovers you. Paranormal Harm while incapacitated destroys you. Four starting Deadlocks do not retire a Vampire.' : 'At full Instability, strike out a Key and choose a temporal glitch; recall a mission detail. Four glitches mean departure after the next score. Restabilizing spends an activity and alluvium to clear 5 Instability; cannot overindulge.'}</p>
    </> : hull ? <>
      <p>Begin with no human Keys. Complete a human memory before adding its Key. Robotic Deadlocks are Brutal, Detached, Ruthless and Unstable. Human Keys and their Deadlocks use the same slots; identify the former Key when deadlocking one. Across all Keys combined, earn at most 1 XP per session; record XP separately.</p>
      <p>Drain replaces Stress. Recharging from an industrial generator costs one downtime activity and clears 5 Drain. At the last Drain box, immediately go On Program and resolve a Deadlock with the GM; if you have no Keys, choose a robotic Deadlock.</p>
    </> : <>
      <p>Keys share four slots with Deadlocks, unless a crew upgrade adds one. Across all Keys combined, earn at most 1 XP per session; three hit marks saturate a Key but do not stop its XP. Record XP separately. Turning a fully marked Key is declared before rolling; record the agreed Deadlock and Stress change together.</p>
      <p>At the last Stress box, resolve the crisis with your table. Four ordinary Deadlocks mean retirement; exceptions apply.</p>
    </>}</details>
    <p className="condition-saved" aria-live="polite">Saved: {data.stress} / {data.stressCapacity} {resource} · {data.keys.length} Keys · {data.deadlocks.length} {ghost ? 'echo irregularities' : traveler ? 'temporal glitches' : 'Deadlocks'} · {recovery.toLowerCase()} {data.healing.progress} + {data.healing.permanent} permanent / 4.</p>
    <fieldset disabled={!editable || busy}>
      <legend>Condition draft</legend>
      <div className="dossier-grid">{number(`${resource} marked`, current.stress, data.stressCapacity, stress => change({ stress }))}{text('Condition decisions', current.conditionNotes, conditionNotes => change({ conditionNotes }), true)}</div>
      <p>{occupied} / {data.keyCapacity} Key and {ghost || traveler ? deadlockLabel.toLowerCase() : deadlockLabel} slots occupied</p>
      {current.keys.map((key, i) => <div className="dossier-grid dossier-row" key={i}>
        {text(`Key ${i + 1} name`, key.name, name => change({ keys: current.keys.map((k, n) => n === i ? { ...k, name } : k) }))}
        {number(`Key ${i + 1} hits`, key.hits, 3, hits => change({ keys: current.keys.map((k, n) => n === i ? { ...k, hits } : k) }))}
        {editable && <button onClick={() => change({ keys: current.keys.filter((_, n) => n !== i) })}>Remove Key {i + 1}</button>}
      </div>)}
      {editable && !vampire && <button disabled={occupied >= data.keyCapacity || (hull && current.keys.length + current.deadlocks.filter(d => d.formerKey?.trim()).length >= completed)} onClick={() => change({ keys: [...current.keys, { name: '', hits: 0 }] })}>Add Key</button>}
      {current.deadlocks.map((deadlock, i) => <div className="dossier-grid dossier-row" key={i}>
        {((hull && !deadlock.formerKey?.trim()) || ghost || traveler) ? <label>{deadlockLabel} {i + 1} name<select aria-label={`${deadlockLabel} ${i + 1} name`} value={deadlock.name} onChange={e => change({ deadlocks: current.deadlocks.map((d, n) => n === i ? { ...d, name: e.target.value } : d) })}>{(hull ? robotic : specializedChoices).map(name => <option key={name}>{name}</option>)}</select></label> : text(`${deadlockLabel} ${i + 1} name`, deadlock.name, name => change({ deadlocks: current.deadlocks.map((d, n) => n === i ? { ...d, name } : d) }))}
        {(!hull || deadlock.formerKey?.trim()) && text(`${deadlockLabel} ${i + 1} former Key`, deadlock.formerKey ?? '', formerKey => change({ deadlocks: current.deadlocks.map((d, n) => n === i ? { ...d, formerKey } : d) }))}
        {text(`${deadlockLabel} ${i + 1} notes`, deadlock.notes ?? '', notes => change({ deadlocks: current.deadlocks.map((d, n) => n === i ? { ...d, notes } : d) }), true)}
        {editable && !vampire && <button onClick={() => change({ deadlocks: current.deadlocks.filter((_, n) => n !== i) })}>Remove {deadlockLabel.toLowerCase()} {i + 1}</button>}
      </div>)}
      {editable && !vampire && <button disabled={occupied >= data.keyCapacity} onClick={() => change({ deadlocks: [...current.deadlocks, { name: hull ? 'Brutal' : ghost || traveler ? specializedChoices[0] : '', formerKey: '', notes: '' }] })}>{hull ? 'Add robotic Deadlock' : `Add ${ghost || traveler ? deadlockLabel.toLowerCase() : deadlockLabel}`}</button>}
      {hull && editable && <button disabled={occupied >= data.keyCapacity || current.keys.length + current.deadlocks.filter(d => d.formerKey?.trim()).length >= completed} onClick={() => change({ deadlocks: [...current.deadlocks, { name: '', formerKey: 'Remembered Key', notes: '' }] })}>Add human Deadlock</button>}
      <h5>{damage} · {hull ? 'three levels' : 'four levels'}</h5>
      <details className="rules-reference"><summary>Harm rules</summary>{ghost || vampire ? <p>{vampire ? 'Mortal Harm or another Deadlock overwhelms you with Critical Incapacitated. Paranormal Harm while incapacitated destroys you; resolve the fictional situation with the GM.' : 'Record paranormal Harm and agreed effects with the GM. Resonance Echo changes how you interact with the physical world; do not apply an ordinary living-character death procedure automatically.'}</p> : hull ? <p>Your frame can be repaired even after destruction. The v6 sheet has Passing, Major and Critical Damage, with no mortal slot. Record destruction, repair and Hull Damage Complications with the GM in recovery/condition notes.</p> : <p>Unless an ability says otherwise, Harm informs fictional effect; there are no fixed action-dice penalties. {data.playbook === 'Hound' && 'Just a Scratch prevents Harm affecting effect during a score, while mortal Harm and complications still apply.'} Level 4 is rapidly lethal without exceptional intervention. Record agreed survival and complications with the GM.</p>}</details>
      <div className="dossier-grid">{(Object.keys(HARM_LEVELS) as (keyof CharacterHarm)[]).map(level => <div key={level}>{current.harm[level].map((injury, i) => <div key={i}>{text(`${HARM_LEVELS[level]} ${damage} ${i + 1}`, injury, value => change({ harm: { ...draft.harm, [level]: current.harm[level].map((v, n) => n === i ? value : v) } }))}</div>)}</div>)}</div>
      <h5>Recovery · four-segment {recovery.toLowerCase()} clock</h5>
      <details className="rules-reference"><summary>Recovery rules</summary>{ghost || vampire ? <p>{vampire ? 'Feeding is the only way to heal: Hunt prey as one downtime activity, clear highest-die Stress and mark four healing-clock ticks. Record Harm reduction and rollover deliberately.' : 'Resolve paranormal Harm and recovery with the GM. Satisfying the resonance need clears Drain as specified; record any separate recovery decision explicitly.'}</p> : hull ? <p>Hull Repair uses a sparktech acquired as an asset, or another PC’s Tinker (no special ability; the Hull spends the activity). Alternatively, the controller repairs all Damage and ticks Suspicion once. Regular healers and hospitals do not apply. A completed sourced memory of Get Back In There permits one deliberately recorded permanent Repair segment. Repair uses the four-segment clock; record agreed Damage reduction and rollover. Any Hull Repair also replaces totaled built-in Armor; record its restoration in equipment. Hull Damage Complications can affect the next recharge or Armor availability (book p.193).</p> : <p>Recover clears passing Harm; the healer’s result marks 1 / 2 / 3 / 5 segments. Filling four reduces remaining Harm one level; extra ticks carry over. Record those changes together after review. Get Back In There’s permanent segment is distinct from ordinary progress. Hull repairs use their own procedure.</p>}</details>
      <div className="dossier-grid">
        {number(`${recovery} progress`, current.healing.progress, 4, progress => change({ healing: { ...draft.healing, progress } }))}
        {(!hull || hasCharacterAbility(data, 'Get Back In There') || data.healing.permanent > 0) && number(hull ? 'Permanent repair segments' : 'Permanent healing segments', current.healing.permanent, 1, permanent => change({ healing: { ...draft.healing, permanent } }))}
        {text('Recovery notes', current.recoveryNotes, recoveryNotes => change({ recoveryNotes }), true)}
      </div>
    </fieldset>
    {editable && entries.length > 0 && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review condition changes</button>}
      {review && <div className="condition-review" role="region" aria-label="Review condition changes">
        <h5>Review changes</h5>
        <dl>{entries.map(([field, value]) => <div key={field}><dt>{field === 'deadlocks' ? ghost ? 'Echo irregularities' : traveler ? 'Temporal glitches' : 'Deadlocks' : field === 'stress' ? `${resource} marked` : field === 'harm' ? damage : field === 'healing' ? `${recovery} clock` : TITLES[field]}</dt><dd>Saved: {describe(data[field])}<br />Proposed: {describe(value)}</dd></div>)}</dl>
        <button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving conditions…' : error ? 'Retry condition changes' : 'Confirm condition changes'}</button>
        <button disabled={busy} onClick={() => setReview(false)}>Keep editing conditions</button>
      </div>}
      <button disabled={busy} onClick={() => { setDraft({}); setReview(false); setError('') }}>Discard condition changes</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
    <p>Key capacity source: {data.keyCapacityReason}</p>
    {isGM && !vampire && <fieldset disabled={busy}><legend>GM · verified Key capacity exception</legend><p>A crew upgrade can add a fifth Key/Deadlock slot. Reducing capacity cannot discard occupied records.</p>
      <label htmlFor={`${id}-capacity`}>Key/Deadlock capacity</label><select id={`${id}-capacity`} value={capacity ?? data.keyCapacity} onChange={e => setCapacity(Number(e.target.value))}><option value={4}>4 · baseline</option><option value={5}>5 · crew upgrade</option></select>
      <label htmlFor={`${id}-source`}>Key capacity source</label><input id={`${id}-source`} value={capacitySource} maxLength={1000} onChange={e => setCapacitySource(e.target.value)} />
      <button disabled={!capacitySource.trim()} onClick={async () => { setBusy(true); setCapacityError(''); try { await setKeyCapacity(capacity ?? data.keyCapacity, capacitySource); setCapacity(null); setCapacitySource('') } catch (e) { setCapacityError(`Capacity was not saved. ${e instanceof Error ? e.message : 'Retry after reconnecting.'}`) } finally { setBusy(false) } }}>Confirm Key capacity</button>
      {capacityError && <p role="alert" className="dossier-error">{capacityError}</p>}
    </fieldset>}
  </section>
}

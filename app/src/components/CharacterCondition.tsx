import { useId, useState } from 'react'
import type { CharacterCondition as Condition, CharacterHarm, ConditionPatch } from '@/lib/characters'

const HARM_LEVELS = { mortal: 'Mortal', critical: 'Critical', major: 'Major', passing: 'Passing' } as const
const TITLES: Record<keyof ConditionPatch, string> = { stress: 'Stress marked', keys: 'Keys / hit marks', deadlocks: 'Deadlocks', harm: 'Harm', healing: 'Healing clock', recoveryNotes: 'Recovery notes', conditionNotes: 'Condition decisions' }
function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join('; ') || '(none)'
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([k, v]) => `${k}: ${describe(v)}`).join(' · ')
  return String(value || (value === 0 ? '0' : '(empty)'))
}

/** Only changed fields are submitted, after review. Accepted state stays visible. */
export function CharacterCondition({ data, editable, patch, isGM, setKeyCapacity }: {
  data: Condition; editable: boolean; patch: (changes: ConditionPatch) => Promise<void>
  isGM: boolean; setKeyCapacity: (capacity: number, reason: string) => Promise<void>
}) {
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
    <h4>06 / Keys, Stress & Harm</h4>
    <p className="dossier-source">Published baseline: Blades ’68 v1.0.1, pp. 152–157, 169–170; playbooks v6. Changes below stay in your draft until reviewed and confirmed.</p>
    <p>Keys share four slots with Deadlocks, unless a crew upgrade adds one. Across all Keys combined, earn at most 1 XP per session; three hit marks saturate a Key but do not stop its XP. Record XP separately. Turning a fully marked Key is declared before rolling; record the agreed Deadlock and Stress change together.</p>
    <p>At the last Stress box, resolve the crisis with your table. Four ordinary Deadlocks mean retirement; exceptions apply. These records do not clear Stress, replace Keys, retire a character, or award XP automatically.</p>
    <p className="condition-saved" aria-live="polite">Saved: {data.stress} / {data.stressCapacity} Stress · {data.keys.length} Keys · {data.deadlocks.length} Deadlocks · healing {data.healing.progress} + {data.healing.permanent} permanent / 4.</p>
    <fieldset disabled={!editable || busy}>
      <legend>Condition draft</legend>
      <div className="dossier-grid">{number('Stress marked', current.stress, data.stressCapacity, stress => change({ stress }))}{text('Condition decisions', current.conditionNotes, conditionNotes => change({ conditionNotes }), true)}</div>
      <p>{occupied} / {data.keyCapacity} Key and Deadlock slots occupied</p>
      {current.keys.map((key, i) => <div className="dossier-grid dossier-row" key={i}>
        {text(`Key ${i + 1} name`, key.name, name => change({ keys: current.keys.map((k, n) => n === i ? { ...k, name } : k) }))}
        {number(`Key ${i + 1} hits`, key.hits, 3, hits => change({ keys: current.keys.map((k, n) => n === i ? { ...k, hits } : k) }))}
        {editable && <button onClick={() => change({ keys: current.keys.filter((_, n) => n !== i) })}>Remove Key {i + 1}</button>}
      </div>)}
      {editable && <button disabled={occupied >= data.keyCapacity} onClick={() => change({ keys: [...current.keys, { name: '', hits: 0 }] })}>Add Key</button>}
      {current.deadlocks.map((deadlock, i) => <div className="dossier-grid dossier-row" key={i}>
        {(['name', 'formerKey', 'notes'] as const).map(field => text(`Deadlock ${i + 1} ${field === 'formerKey' ? 'former Key' : field}`, deadlock[field] ?? '', value => change({ deadlocks: current.deadlocks.map((d, n) => n === i ? { ...d, [field]: value } : d) }), field === 'notes'))}
        {editable && <button onClick={() => change({ deadlocks: current.deadlocks.filter((_, n) => n !== i) })}>Remove Deadlock {i + 1}</button>}
      </div>)}
      {editable && <button disabled={occupied >= data.keyCapacity} onClick={() => change({ deadlocks: [...current.deadlocks, { name: '', formerKey: '', notes: '' }] })}>Add Deadlock</button>}
      <h5>Harm · four levels</h5>
      <p>Unless an ability says otherwise, Harm informs fictional effect; there are no fixed action-dice penalties. Just a Scratch prevents Harm affecting effect during a score, while mortal Harm and complications still apply. Level 4 is rapidly lethal without exceptional intervention. Record agreed survival and complications with the GM. Resistance and Armor outcomes are deliberate table decisions.</p>
      <div className="dossier-grid">{(Object.keys(HARM_LEVELS) as (keyof CharacterHarm)[]).map(level => <div key={level}>{current.harm[level].map((injury, i) => <div key={i}>{text(`${HARM_LEVELS[level]} Harm ${i + 1}`, injury, value => change({ harm: { ...draft.harm, [level]: current.harm[level].map((v, n) => n === i ? value : v) } }))}</div>)}</div>)}</div>
      <h5>Recovery · four-segment healing clock</h5>
      <p>Recover clears passing Harm; the healer’s result marks 1 / 2 / 3 / 5 segments. Filling four reduces remaining Harm one level; extra ticks carry over. Record those changes together after review. Get Back In There’s permanent segment is distinct from ordinary progress. Hull repairs use their own procedure.</p>
      <div className="dossier-grid">
        {number('Healing progress', current.healing.progress, 4, progress => change({ healing: { ...draft.healing, progress } }))}
        {number('Permanent healing segments', current.healing.permanent, 1, permanent => change({ healing: { ...draft.healing, permanent } }))}
        {text('Recovery notes', current.recoveryNotes, recoveryNotes => change({ recoveryNotes }), true)}
      </div>
    </fieldset>
    {editable && entries.length > 0 && <>
      {!review && <button disabled={busy} onClick={() => setReview(true)}>Review condition changes</button>}
      {review && <div className="condition-review" role="region" aria-label="Review condition changes">
        <h5>Review with your table</h5><p>Only these entered changes will be saved. Check crisis, retirement, mortal survival, recovery and ability decisions before confirming.</p>
        <dl>{entries.map(([field, value]) => <div key={field}><dt>{TITLES[field]}</dt><dd>Saved: {describe(data[field])}<br />Proposed: {describe(value)}</dd></div>)}</dl>
        <button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving conditions…' : error ? 'Retry condition changes' : 'Confirm condition changes'}</button>
        <button disabled={busy} onClick={() => setReview(false)}>Keep editing conditions</button>
      </div>}
      <button disabled={busy} onClick={() => { setDraft({}); setReview(false); setError('') }}>Discard condition changes</button>
    </>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
    <p>Key capacity source: {data.keyCapacityReason}</p>
    {isGM && <fieldset disabled={busy}><legend>GM · verified Key capacity exception</legend><p>A published crew upgrade can add a fifth Key/Deadlock slot. Record the source and confirm; reducing capacity cannot discard occupied records.</p>
      <label htmlFor={`${id}-capacity`}>Key/Deadlock capacity</label><select id={`${id}-capacity`} value={capacity ?? data.keyCapacity} onChange={e => setCapacity(Number(e.target.value))}><option value={4}>4 · baseline</option><option value={5}>5 · crew upgrade</option></select>
      <label htmlFor={`${id}-source`}>Key capacity source</label><input id={`${id}-source`} value={capacitySource} maxLength={1000} onChange={e => setCapacitySource(e.target.value)} />
      <button disabled={!capacitySource.trim()} onClick={async () => { setBusy(true); setCapacityError(''); try { await setKeyCapacity(capacity ?? data.keyCapacity, capacitySource); setCapacity(null); setCapacitySource('') } catch (e) { setCapacityError(`Capacity was not saved. ${e instanceof Error ? e.message : 'Retry after reconnecting.'}`) } finally { setBusy(false) } }}>Confirm Key capacity</button>
      {capacityError && <p role="alert" className="dossier-error">{capacityError}</p>}
    </fieldset>}
  </section>
}

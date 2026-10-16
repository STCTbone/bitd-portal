import { useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/lib/session'
import { clockError, clockSegments, createClock, deleteClock, updateClock, useClocks, type ClockData, type ClockRecord } from '@/lib/clocks'
import { ClockDisplay } from './trackers/ClockDisplay'
import './CampaignClocks.css'

export function CampaignClocks() {
  const { session } = useSession()
  return session ? <Clocks key={`${session.campaignId}:${session.role}`} campaign={session.campaignId} canManage={session.role === 'gm'} /> : null
}
function Clocks({ campaign, canManage }: { campaign: string; canManage: boolean }) {
  const state = useClocks(campaign)
  const [name, setName] = useState(''), [segments, setSegments] = useState(4)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { state.accept(await createClock(campaign, { name, segments })); setName('') }
    catch (cause) { setError(`Clock was not created: ${clockError(cause)}`) }
    finally { setBusy(false) }
  }
  return <section className="campaign-clocks" aria-label="Campaign clocks">
    <header><p className="clock-kicker">SITUATIONS / PROGRESS / CONSEQUENCES</p><h2>Campaign clocks</h2><p>{canManage ? 'New clocks start hidden. Share only the names and notes you want players to receive.' : 'Clocks deliberately shared by your Game Master.'}</p></header>
    {state.error && <div role="alert"><p>{state.error}</p><button onClick={() => { void state.refresh() }}>Retry clock refresh</button></div>}
    {!state.hasSnapshot && !state.error && <p role="status">Loading clocks…</p>}
    {state.hasSnapshot && state.clocks.length === 0 && <p>{canManage ? 'No clocks have been created.' : 'No clocks are shared with you.'}</p>}
    <div className="clock-list">{state.clocks.map(row => <ClockCard key={row.id} row={row} canManage={canManage} unavailable={!state.hasSnapshot} onSaved={state.accept} onRemoved={state.remove} refresh={state.refresh} />)}</div>
    {state.hasSnapshot && canManage && <form className="clock-create" onSubmit={create}>
      <label>New clock name<input aria-label="New clock name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
      <label>New clock segments<select aria-label="New clock segments" value={segments} onChange={event => setSegments(Number(event.target.value))} disabled={busy}>{clockSegments.map(size => <option key={size}>{size}</option>)}</select></label>
      <button disabled={busy} type="submit">Create clock</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    <footer>Blades ’68 v1.0.1, pp. 166, 173, 191: negotiated projects and 4 / 6 / 8 / 10 / 12-segment examples. Progress is a manual record. Completing a clock applies no campaign consequences. Score clocks can be linked from the score workspace when available.</footer>
  </section>
}
function ClockCard({ row, canManage, unavailable, onSaved, onRemoved, refresh }: {
  row: ClockRecord; canManage: boolean; unavailable: boolean
  onSaved: (row: ClockRecord) => void; onRemoved: (id: string) => void; refresh: () => Promise<boolean>
}) {
  const [edits, setEdits] = useState<Partial<ClockData>>({}), expected = useRef<Partial<ClockData>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const values = { ...row.data, ...edits }, hasEdits = Object.keys(edits).length > 0
  function change<K extends keyof ClockData>(field: K, value: ClockData[K]) {
    if (!(field in expected.current)) expected.current[field] = row.data[field]
    setEdits(previous => ({ ...previous, [field]: value })); setStatus('Unsaved clock changes.')
  }
  async function save(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError('')
    try { onSaved(await updateClock(row.id, edits, expected.current)); setEdits({}); expected.current = {}; setStatus('Clock saved.') }
    catch (cause) { setError(`Clock was not saved: ${clockError(cause)} Your changes are kept.`) }
    finally { setBusy(false) }
  }
  async function complete() {
    setBusy(true); setError('')
    try { onSaved(await updateClock(row.id, { segments: row.data.segments, progress: row.data.segments, active: false }, { segments: row.data.segments, progress: row.data.progress, active: row.data.active })); setStatus('Clock completed. No consequences applied.') }
    catch (cause) { setError(`Clock was not completed: ${clockError(cause)}`) }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError('')
    try { await deleteClock(row.id, row.revision); onRemoved(row.id) }
    catch (cause) { setError(`Clock was not removed: ${clockError(cause)}`); setBusy(false) }
  }
  async function reload() {
    setBusy(true)
    if (await refresh()) { setEdits({}); expected.current = {}; setError(''); setStatus('Latest clock loaded; local changes discarded.') }
    else setError('Could not reload the clock. Your changes are kept.')
    setBusy(false)
  }
  // Players stop displaying stale snapshots on read failure. GM drafts remain
  // visible for retry; the next authorized snapshot removes revoked rows.
  if (unavailable && !canManage) return null
  return <article className="clock-card" aria-label={row.data.name}>
    <div className="clock-card-heading"><ClockDisplay segments={row.data.segments} filled={row.data.progress} size={88} readonly /><div><h3>{row.data.name}</h3><p>{row.data.progress} / {row.data.segments} segments</p><p>{row.data.progress === row.data.segments ? 'Complete' : 'In progress'} · {row.data.active ? 'Active' : 'Inactive'} · {row.data.scope === 'score' ? 'Score' : 'Campaign'}</p>{canManage && <strong>{row.data.visible_to_players ? 'Shared with players' : 'GM only'}</strong>}</div></div>
    {!canManage ? <p className="clock-notes">{row.data.notes}</p> : <form onSubmit={save}>
      <fieldset disabled={busy}>
        <legend className="clock-sr-only">Edit {row.data.name}</legend>
        <label>Clock name<input aria-label="Clock name" required maxLength={100} value={values.name} onChange={event => change('name', event.target.value)} /></label>
        <div className="clock-fields">
          <label>Clock segments<select aria-label="Clock segments" value={values.segments} onChange={event => change('segments', Number(event.target.value))}>{clockSegments.map(size => <option key={size}>{size}</option>)}</select></label>
          <label>Clock progress<input aria-label="Clock progress" type="number" min={0} max={values.segments} step={1} required value={values.progress} onChange={event => change('progress', event.target.valueAsNumber)} /></label>
          <label>Clock scope<select aria-label="Clock scope" value={values.scope} onChange={event => change('scope', event.target.value as ClockData['scope'])}><option value="campaign">Campaign</option><option value="score">Score</option></select></label>
        </div>
        <label>Clock notes<textarea aria-label="Clock notes" maxLength={5000} rows={3} value={values.notes} onChange={event => change('notes', event.target.value)} /></label>
        <div className="clock-switches"><label><input aria-label="Clock active" type="checkbox" checked={values.active} onChange={event => change('active', event.target.checked)} />Active</label><label><input aria-label="Shared with players" type="checkbox" checked={values.visible_to_players} onChange={event => change('visible_to_players', event.target.checked)} />Shared with players</label></div>
      </fieldset>
      <div className="clock-actions"><button disabled={busy || !hasEdits} type="submit">Save clock changes</button><button disabled={busy || hasEdits || (row.data.progress === row.data.segments && !row.data.active)} type="button" onClick={() => { void complete() }}>Complete clock</button><button disabled={busy} type="button" className="clock-secondary" onClick={() => { void reload() }}>Reload clock{hasEdits ? ' (discard unsaved)' : ''}</button><button disabled={busy || hasEdits} type="button" className="clock-secondary" onClick={() => { void remove() }}>Remove clock</button></div>
    </form>}
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </article>
}

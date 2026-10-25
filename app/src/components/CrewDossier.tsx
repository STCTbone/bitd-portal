import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/lib/session'
import { createCrew, crewError, crewTypes, loadCrew, updateCrew, type CrewData, type CrewDossier as CrewRecord, type CrewType } from '@/lib/crew/dossier'
import './CrewDossier.css'
import { CrewTools } from './CrewTools'
import { CrewBusiness } from './CrewBusiness'
import { CrewCircles } from './CrewCircles'

const textFields = [
  ['reputation', 'Reputation'], ['base', 'Base'], ['baseDistrict', 'Base district'], ['flair', 'Base flair'],
  ['huntingGrounds', 'Hunting grounds'], ['preferredOperations', 'Preferred operations'], ['wardBoss', 'Ward boss'],
  ['titheNotes', 'Tithe notes'], ['advancementNotes', 'Advancement notes'],
] as const
const tracks = [
  ['tier', 'Tier', 99], ['rep', 'Rep', 12], ['turf', 'Turf', 12], ['heat', 'Heat', 9], ['wanted', 'Wanted level', 4],
  ['stacks', 'Stacks', 9999], ['vaults', 'Vault expansions', 2], ['xp', 'Crew XP', 10], ['advances', 'Advances recorded', 9999], ['anger', 'Anger', 4],
] as const

/** Shared crew records and verified selections; consequential changes stay explicit. */
export function CrewDossier() {
  const { session } = useSession()
  if (!session) return null
  // A campaign/role change discards pending drafts and previously authorized state.
  return <CampaignCrew key={`${session.campaignId}:${session.role}`} campaign={session.campaignId} canManage={session.role === 'gm'} />
}
function CampaignCrew({ campaign, canManage }: { campaign: string; canManage: boolean }) {
  const [crew, setCrew] = useState<CrewRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<CrewType>('Dealers')
  const [edits, setEdits] = useState<Partial<CrewData>>({})
  const expected = useRef<Partial<CrewData>>({})
  const active = useRef(true)
  const readEpoch = useRef(0)
  const accept = useCallback((next: CrewRecord | null) => {
    if (!active.current) return
    setCrew(previous => previous && next && previous.revision > next.revision ? previous : next)
  }, [])
  const refresh = useCallback(async () => {
    const epoch = readEpoch.current
    try {
      const next = await loadCrew(campaign)
      if (active.current && epoch === readEpoch.current) {
        accept(next); setLoading(false); setHasSnapshot(true)
        setError(previous => previous.startsWith('Crew refresh failed.') ? '' : previous)
      }
    } catch { if (active.current && epoch === readEpoch.current) { setLoading(false); setError(previous => previous && !previous.startsWith('Crew refresh failed.') ? previous : 'Crew refresh failed. Your unsaved changes are kept. Retry or reconnect.'); } }
  }, [campaign, accept])
  useEffect(() => {
    active.current = true
    const initial = window.setTimeout(() => { void refresh() }, 0)
    // Authorized snapshots, not peer payloads, supply durable state. Polling also
    // removes revoked rows; focus/online trigger an immediate reconnect refresh.
    const interval = window.setInterval(() => { void refresh() }, 1800)
    const reconnect = () => { void refresh() }
    window.addEventListener('online', reconnect); window.addEventListener('focus', reconnect)
    return () => {
      active.current = false; window.clearInterval(interval); window.clearTimeout(initial)
      window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect)
    }
  }, [refresh])
  function change<K extends keyof CrewData>(field: K, value: CrewData[K]) {
    if (!crew) return
    if (!(field in expected.current)) expected.current[field] = crew.data[field]
    setEdits(previous => ({ ...previous, [field]: value }))
    setStatus('Unsaved crew changes.')
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setStatus('Creating crew…')
    try {
      const saved = await createCrew(campaign, name, type)
      if (active.current) { readEpoch.current++; accept(saved); setHasSnapshot(true); setStatus('Crew created.') }
    } catch (cause) { if (active.current) { setError(`Crew was not created: ${crewError(cause)}`); setStatus(''); } }
    finally { if (active.current) setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setStatus('Saving crew…')
    try {
      const saved = await updateCrew(campaign, edits, expected.current)
      if (active.current) { readEpoch.current++; accept(saved); setEdits({}); expected.current = {}; setStatus('Crew saved.') }
    } catch (cause) {
      if (active.current) { setError(`Crew was not saved: ${crewError(cause)} Your changes are kept.`); setStatus('Unsaved crew changes.'); void refresh() }
    } finally { if (active.current) setBusy(false) }
  }
  async function reload() {
    setBusy(true)
    try {
      const latest = await loadCrew(campaign)
      if (active.current) { readEpoch.current++; accept(latest); setEdits({}); expected.current = {}; setError(''); setStatus('Latest crew loaded; local changes discarded.'); setLoading(false); setHasSnapshot(true) }
    } catch { if (active.current) setError('Could not reload the crew. Your unsaved changes are kept.') }
    finally { if (active.current) setBusy(false) }
  }
  const values = crew ? { ...crew.data, ...edits } : null
  const hasEdits = Object.keys(edits).length > 0
  return <section id="crew-dossier" tabIndex={-1} className="crew-dossier" aria-label="Crew dossier">
    <header><p className="crew-kicker">DOSKVOL / SHARED CREW RECORD</p><h2>{crew?.data.name ?? 'Crew dossier'}</h2></header>
    {loading && <p role="status">Loading crew…</p>}
    {!loading && hasSnapshot && !crew && <>
      <p>No crew has been created.</p>
      {canManage && <form onSubmit={create} className="crew-create">
        <label htmlFor="new-crew-name">Crew name<input id="new-crew-name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
        <label htmlFor="new-crew-type">Crew type<select aria-label="Crew type" id="new-crew-type" value={type} onChange={event => setType(event.target.value as CrewType)} disabled={busy}>{crewTypes.map(value => <option key={value}>{value}</option>)}</select></label>
        <details className="rules-reference"><summary>Rules reference</summary><p>New crews begin at Tier 0, strong Hold, 0 Rep and 2 stacks.</p></details>
        <button disabled={busy} type="submit">Create crew</button>
      </form>}
    </>}
    {crew && values && <form onSubmit={save}>
      <fieldset disabled={!canManage || busy}>
        <legend>Identity & standing</legend>
        <div className="crew-fields">
          <label htmlFor="crew-name">Crew name<input id="crew-name" required maxLength={100} value={values.name} onChange={event => change('name', event.target.value)} /></label>
          <label htmlFor="crew-type">Crew type<select aria-label="Crew type" id="crew-type" value={values.type} onChange={event => change('type', event.target.value as CrewType)}>{crewTypes.map(value => <option key={value}>{value}</option>)}</select></label>
          <label htmlFor="crew-hold">Hold<select aria-label="Hold" id="crew-hold" value={values.hold} onChange={event => change('hold', event.target.value as 'weak' | 'strong')}><option value="weak">Weak</option><option value="strong">Strong</option></select></label>
        </div>
        <div className="crew-tracks">{tracks.map(([field, label, maximum]) => <label key={field} htmlFor={`crew-${field}`}>{label}<input aria-label={label} id={`crew-${field}`} type="number" min={0} max={maximum} step={1} required value={values[field]} onChange={event => change(field, event.target.valueAsNumber)} />{['rep','heat','wanted','xp','anger'].includes(field) && <small>of {maximum}</small>}</label>)}</div>
        <details className="rules-reference"><summary>Rules reference</summary><p>Vault capacity: 4 / 8 / 16 stacks with 0 / 1 / 2 expansions.</p></details>
        <div className="crew-fields">{textFields.map(([field, label]) => <label htmlFor={`crew-${field}`} key={field}>{label}<textarea aria-label={label} id={`crew-${field}`} maxLength={5000} rows={field.endsWith('Notes') || field === 'flair' ? 3 : 2} value={values[field]} onChange={event => change(field, event.target.value)} /></label>)}</div>
        <CrewBusiness values={values} change={change} />
        <CrewCircles values={values} change={change} canManage={canManage} />
        <CrewTools values={values} change={change} canManage={canManage} />
      </fieldset>
      {canManage && <div className="crew-actions"><button type="submit" disabled={busy || !hasEdits}>Save crew changes</button><button type="button" className="crew-secondary" disabled={busy} onClick={() => { void reload() }}>Reload latest crew{hasEdits ? ' (discard unsaved)' : ''}</button></div>}
    </form>}
    {status && <p role="status" className="crew-save-status">{status}</p>}
    {error && <div role="alert" className="crew-error"><p>{error}</p><button type="button" disabled={busy} onClick={() => { void refresh(); setError('') }}>Retry crew refresh</button></div>}
    <details className="rules-reference"><summary>Sources</summary><footer>Blades ’68 v1.0.1, pp. 88–90; official crew sheets v6.</footer></details>
  </section>
}

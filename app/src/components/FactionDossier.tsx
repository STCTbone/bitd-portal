import { useEffect, useState } from 'react'
import { useSession } from '@/lib/session'
import { initializeFactions, loadFactions, patchFaction, createFaction, deleteFaction, type FactionRecord } from '@/lib/factions/api'
import './FactionDossier.css'
import { FactionPrivateNotes } from './FactionPrivateNotes'

function Editor({ faction, isGM, saved }: { faction: FactionRecord; isGM: boolean; saved: () => Promise<void> }) {
  const [draft, setDraft] = useState(faction)
  const [base, setBase] = useState(faction)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  if (faction.version > base.version && !dirty) {
    setDraft(faction); setBase(faction)
  }
  async function save() {
    setSaving(true); setMessage('')
    try {
      const result = await patchFaction(base, isGM ? {
        name: draft.name, description: draft.description, tier: draft.tier, hold: draft.hold,
        status: draft.status, category: draft.category, known_information: draft.known_information,
        shared_notes: draft.shared_notes,
      } : { shared_notes: draft.shared_notes })
      setDraft(result); setBase(result); await saved(); setMessage(isGM ? 'Public dossier saved.' : 'Shared notes saved.')
    } catch (error) { setMessage(`Save failed: ${(error as Error).message}. Reload the dossier before retrying.`) }
    finally { setSaving(false) }
  }
  async function remove() {
    setSaving(true); setMessage('')
    try { await deleteFaction(faction); await saved() }
    catch (error) { setMessage(`Delete failed: ${(error as Error).message}`) }
    finally { setSaving(false) }
  }
  return <article className="faction-editor" aria-label="Faction dossier">
    <h3>{faction.name}</h3>
    {faction.source && <p className="faction-source">{faction.source}. <a href="https://evilhat.com/wp-content/uploads/2026/06/b68_playergazette_v4.pdf" target="_blank" rel="noreferrer">Published reference</a></p>}
    <label>Name<input disabled={!isGM || saving} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <label>Description<textarea aria-label="Description" disabled={!isGM || saving} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
    <div className="faction-columns">
      <label>Tier<input type="number" min="0" max="6" disabled={!isGM || saving} value={draft.tier} onChange={e => setDraft({ ...draft, tier: Number(e.target.value) })} /></label>
      <label>Hold<select aria-label="Hold" disabled={!isGM || saving} value={draft.hold} onChange={e => setDraft({ ...draft, hold: e.target.value as 'weak' | 'strong' })}><option value="weak">Weak</option><option value="strong">Strong</option></select></label>
      <label>Crew status<select aria-label="Crew status" disabled={!isGM || saving} value={draft.status} onChange={e => setDraft({ ...draft, status: Number(e.target.value) })}>{[-3,-2,-1,0,1,2,3].map(n => <option key={n} value={n}>{n > 0 ? '+' : ''}{n}</option>)}</select></label>
    </div>
    <label>Category<input disabled={!isGM || saving} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} /></label>
    <label>Known information<textarea aria-label="Known information" disabled={!isGM || saving} value={draft.known_information} onChange={e => setDraft({ ...draft, known_information: e.target.value })} /></label>
    <label>Shared notes<textarea aria-label="Shared notes" disabled={saving} value={draft.shared_notes} onChange={e => setDraft({ ...draft, shared_notes: e.target.value })} /></label>
    {base.version !== faction.version && <p role="alert">This dossier changed elsewhere. <button onClick={() => { setDraft(faction); setBase(faction); setMessage('') }}>Reload dossier</button></p>}
    <button disabled={saving || !dirty} onClick={save}>{isGM ? 'Save public dossier' : 'Save shared notes'}</button>
    {message && <p role="status">{message}</p>}
    {isGM && <><FactionPrivateNotes key={faction.id} faction={faction} publicSaved={saved} />
      <div className="faction-delete"><label><input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} />Delete this faction and its GM-private notes</label>
      <button disabled={!confirmDelete || saving} onClick={remove}>Delete faction</button></div>
    </>}
  </article>
}

export function FactionDossier() {
  const { session } = useSession()
  const campaignId = session?.campaignId
  const [factions, setFactions] = useState<FactionRecord[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  async function refresh() {
    if (!session) return
    setFactions(await loadFactions(session.campaignId))
  }
  useEffect(() => {
    if (!campaignId) return
    let active = true
    const load = async () => {
      try {
        const data = await loadFactions(campaignId)
        if (active) { setFactions(data); setError('') }
      } catch (error) { if (active) { setFactions([]); setError(`Could not load factions: ${(error as Error).message}`) } }
    }
    void load()
    // Authoritative replacement catches deletions and lost membership without exposing old rows.
    const timer = window.setInterval(load, 2000)
    window.addEventListener('focus', load)
    window.addEventListener('online', load)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('online', load) }
  }, [campaignId])
  if (!session) return null
  const current = factions.find(f => f.id === selected)
  async function initialize() {
    setBusy(true); setError('')
    try { await initializeFactions(session!.campaignId); await refresh() }
    catch (error) { setError(`Could not initialize factions: ${(error as Error).message}`) }
    finally { setBusy(false) }
  }
  async function create() {
    setBusy(true); setError('')
    try { const faction = await createFaction(session!.campaignId, newName); setNewName(''); await refresh(); setSelected(faction.id) }
    catch (error) { setError(`Could not create faction: ${(error as Error).message}`) }
    finally { setBusy(false) }
  }
  return <section className="access-panel factions" id="campaign-factions" tabIndex={-1} aria-label="Factions">
    <p className="access-kicker">DOSKVOL / FACTION ROLODEX</p><h2>Factions</h2>
    {!factions.length ? <><p>No factions have been added.</p>{session.role === 'gm' && <><p>Add the 56-faction Player Gazette roster with neutral crew status.</p><button disabled={busy} onClick={initialize}>Add Blades ’68 Gazette factions</button></>}</> : <>
      <p>{factions.length} factions</p>
      <label>Find a faction<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="faction-layout"><nav aria-label="Faction list">{factions.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).map(f => <button key={f.id} aria-pressed={selected === f.id} onClick={() => setSelected(f.id)}>{f.name}</button>)}</nav>
        {current ? <Editor key={`${current.id}:${session.role}`} faction={current} isGM={session.role === 'gm'} saved={refresh} /> : <p>Select a faction to open its dossier.</p>}
      </div>
    </>}
    {session.role === 'gm' && <form onSubmit={e => { e.preventDefault(); void create() }} className="faction-create">
      <label>New faction name<input value={newName} maxLength={120} onChange={e => setNewName(e.target.value)} /></label>
      <button disabled={busy || !newName.trim()}>Create faction</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>
}

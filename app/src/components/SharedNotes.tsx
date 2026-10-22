import { useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/lib/session'
import { createSharedNote, deleteSharedNote, noteCategories, noteError, updateSharedNote, useSharedNotes, type NoteData, type SharedNote } from '@/lib/shared-notes'
import './SharedNotes.css'

export function SharedNotes() {
  const { session } = useSession()
  return session ? <Notes key={`${session.campaignId}:${session.role}`} campaign={session.campaignId} /> : null
}
function Notes({ campaign }: { campaign: string }) {
  const state = useSharedNotes(campaign)
  const [title, setTitle] = useState(''), [category, setCategory] = useState<NoteData['category']>('lore'), [body, setBody] = useState('')
  const [filter, setFilter] = useState('all'), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await createSharedNote(campaign, { title, body, category }); await state.synchronize(); setTitle(''); setBody('') }
    catch (cause) { setError(`Note was not created: ${noteError(cause)} Your draft is kept.`) }
    finally { setBusy(false) }
  }
  return <section className="shared-notes" id="campaign-notes" tabIndex={-1} aria-label="Shared campaign notes">
    <header><p className="note-kicker">PEOPLE / PLACES / ITEMS / FACTIONS / LORE</p><h2>Shared campaign notes</h2><p>The table’s collective reference. Everyone in this campaign can read, edit and remove these notes.</p></header>
    {state.error && <div role="alert"><p>{state.error}</p><button onClick={() => { void state.refresh() }}>Retry note refresh</button></div>}
    {!state.ready && !state.error && <p role="status">Loading shared notes…</p>}
    {state.ready && <>
      <label className="note-filter">Category<select aria-label="Filter notes by category" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All categories</option>{noteCategories.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      {state.notes.length === 0 && <p>No shared notes yet.</p>}
      {state.notes.length > 0 && !state.notes.some(row => filter === 'all' || row.data.category === filter) && <p>No notes in this category.</p>}
      <div className="note-list">{state.notes.map(row => <NoteCard key={row.id} row={row} hidden={filter !== 'all' && row.data.category !== filter} synchronize={state.synchronize} />)}</div>
    </>}
    <form className="note-create" onSubmit={create}>
      <h3>Add to the reference</h3><fieldset disabled={busy}>
        <label>New note title<input aria-label="New note title" required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>New note category<select aria-label="New note category" value={category} onChange={event => setCategory(event.target.value as NoteData['category'])}>{noteCategories.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label>New note body<textarea aria-label="New note body" rows={3} maxLength={20000} value={body} onChange={event => setBody(event.target.value)} /></label>
      </fieldset><button disabled={busy} type="submit">Create shared note</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </section>
}
function NoteCard({ row, hidden, synchronize }: { row: SharedNote; hidden: boolean; synchronize: () => Promise<boolean> }) {
  const [editing, setEditing] = useState(false), [edits, setEdits] = useState<Partial<NoteData>>({})
  const expected = useRef<Partial<NoteData>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [confirm, setConfirm] = useState(false)
  const values = { ...row.data, ...edits }, dirty = Object.keys(edits).length > 0
  function change<K extends keyof NoteData>(field: K, value: NoteData[K]) {
    if (!(field in expected.current)) expected.current[field] = row.data[field]
    setEdits(previous => ({ ...previous, [field]: value })); setStatus('Unsaved note changes.')
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await updateSharedNote(row.id, edits, expected.current); await synchronize(); setEdits({}); expected.current = {}; setStatus('Note saved.') }
    catch (cause) { setError(`Note was not saved: ${noteError(cause)} Your changes are kept.`) }
    finally { setBusy(false) }
  }
  async function reload() {
    setBusy(true)
    if (await synchronize()) { setEdits({}); expected.current = {}; setError(''); setStatus('Latest note loaded; local changes discarded.') }
    else setError('Could not reload the note. Your changes are kept.')
    setBusy(false)
  }
  async function remove() {
    setBusy(true); setError('')
    try { await deleteSharedNote(row.id, row.revision); await synchronize() }
    catch (cause) { setError(`Note was not removed: ${noteError(cause)}`) }
    finally { setBusy(false); setConfirm(false) }
  }
  return <article className="note-card" aria-label={row.data.title} hidden={hidden}>
    <p className="note-category">{row.data.category}</p><h3>{row.data.title}</h3>
    {!editing ? <><p className="note-body">{row.data.body || 'No details recorded yet.'}</p><button className="note-secondary" onClick={() => setEditing(true)}>Edit note</button></> : <form onSubmit={save}>
      <fieldset disabled={busy}><legend className="note-sr-only">Edit {row.data.title}</legend>
        <label>Title<input aria-label="Note title" required maxLength={120} value={values.title} onChange={event => change('title', event.target.value)} /></label>
        <label>Category<select aria-label="Note category" value={values.category} onChange={event => change('category', event.target.value as NoteData['category'])}>{noteCategories.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label>Body<textarea aria-label="Note body" rows={5} maxLength={20000} value={values.body} onChange={event => change('body', event.target.value)} /></label>
      </fieldset><div className="note-actions"><button disabled={busy || !dirty} type="submit">Save note changes</button><button className="note-secondary" disabled={busy} type="button" onClick={() => { void reload() }}>Reload note{dirty ? ' (discard unsaved)' : ''}</button><button className="note-secondary" disabled={busy || dirty} type="button" onClick={() => { setEditing(false); setError(''); setStatus('') }}>Read note</button></div>
    </form>}
    <div className="note-actions">{confirm ? <><p>Remove this note for everyone?</p><button disabled={busy} onClick={() => { void remove() }}>Confirm removal</button><button disabled={busy} className="note-secondary" onClick={() => setConfirm(false)}>Keep note</button></> : <button disabled={busy || dirty} className="note-secondary" onClick={() => setConfirm(true)}>Remove note</button>}</div>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </article>
}

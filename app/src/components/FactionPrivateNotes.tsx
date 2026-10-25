import { useEffect, useState } from 'react'
import { loadPrivateFactionNote, savePrivateFactionNote, publishFactionInformation, type FactionRecord, type PrivateFactionNote } from '@/lib/factions/api'

function NoteEditor({ faction, note, saved }: { faction: FactionRecord; note: PrivateFactionNote; saved: () => Promise<void> }) {
  const [draft, setDraft] = useState(note.note)
  const [base, setBase] = useState(note)
  if (note.version > base.version && draft === base.note) { setDraft(note.note); setBase(note) }
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true); setMessage('')
    try { const result = await savePrivateFactionNote(faction.id, draft, base.version); setBase(result); setDraft(result.note); await saved(); setMessage('Private notes saved.') }
    catch (error) { setMessage(`Private save failed: ${(error as Error).message}`) }
    finally { setBusy(false) }
  }
  async function publish() {
    setBusy(true); setMessage('')
    try { await publishFactionInformation(faction, selected); setSelected(''); await saved(); setMessage('Selected text published to known information.') }
    catch (error) { setMessage(`Publication failed: ${(error as Error).message}`) }
    finally { setBusy(false) }
  }
  return <>
    <label>GM-private notes<textarea aria-label="GM-private notes" disabled={busy} value={draft} onChange={e => setDraft(e.target.value)} /></label>
    <button disabled={busy || draft === base.note} onClick={save}>Save private notes</button>
    <p>Only the text below will be shared with players.</p>
    <label>Selected text to share<textarea aria-label="Selected text to share" disabled={busy} value={selected} onChange={e => setSelected(e.target.value)} /></label>
    <button disabled={busy || !selected.trim()} onClick={publish}>Publish selected text</button>
    {message && <p role="status">{message}</p>}
  </>
}

/** Never mounted for players; the backend independently verifies GM membership on every read. */
export function FactionPrivateNotes({ faction, publicSaved }: { faction: FactionRecord; publicSaved: () => Promise<void> }) {
  const [note, setNote] = useState<PrivateFactionNote | null>(null)
  const [error, setError] = useState('')
  async function refresh() { setNote(await loadPrivateFactionNote(faction.id)); await publicSaved() }
  useEffect(() => {
    let active = true
    const load = async () => {
      try { const result = await loadPrivateFactionNote(faction.id); if (active) { setNote(result); setError('') } }
      catch { if (active) { setNote(null); setError('Private notes unavailable. Verify your GM membership and retry.') } }
    }
    void load()
    const timer = window.setInterval(load, 2000)
    window.addEventListener('focus', load); window.addEventListener('online', load)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('online', load) }
  }, [faction.id])
  return <section aria-label="GM faction notebook"><h4>GM notebook</h4>
    {note && <NoteEditor key={faction.id} faction={faction} note={note} saved={refresh} />}
    {error && <p role="alert">{error}</p>}
  </section>
}

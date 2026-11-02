import { useId, useState } from 'react'

/** Drafts stay local until accepted. Failed drafts remain visible with retry/discard. */
export function DossierField({ label, value, save, disabled, multiline = false, suggestions }: {
  label: string; value: string; save: (value: string) => Promise<void>; disabled: boolean
  multiline?: boolean; suggestions?: readonly string[]
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function commit() {
    if (draft === null || saving) return
    if (draft === value) { setDraft(null); setError(''); return }
    setSaving(true)
    try { await save(draft); setDraft(null); setError('') }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not reach the server.') }
    finally { setSaving(false) }
  }
  const control = { id, value: draft ?? value, disabled: disabled || saving, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value), onBlur: () => { if (!error) void commit() }, 'aria-describedby': `${id}-status` }
  return <div className="dossier-field">
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...control} rows={3} /> : <input {...control} list={suggestions ? `${id}-suggestions` : undefined} maxLength={label === 'Character name' ? 100 : 12000} />}
    {suggestions && <datalist id={`${id}-suggestions`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>}
    <span id={`${id}-status`} aria-live="polite">{saving ? 'Saving…' : error ? '' : draft !== null ? 'Unsaved edit; leave this field to save.' : ''}</span>
    {error && <div className="dossier-error" role="alert"><p>{label} was not saved. {error}</p><p>Saved value: {value || '(empty)'}</p>
      <button type="button" onClick={() => void commit()} disabled={saving || disabled}>Retry {label}</button>
      <button type="button" onClick={() => { setDraft(null); setError('') }}>Discard {label} edit</button>
    </div>}
  </div>
}

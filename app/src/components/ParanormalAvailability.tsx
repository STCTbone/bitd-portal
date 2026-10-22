import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CampaignPlaybook } from '@/lib/playbooks'
export function ParanormalAvailability({ campaignId, entries, refresh }: { campaignId: string; entries: CampaignPlaybook[]; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<{ name: string; enabled: boolean } | null>(null)
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!draft) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('set_paranormal_playbook', { p_campaign: campaignId, p_playbook: draft.name, p_enabled: draft.enabled })
    if (error) setError(`Availability was not saved. Your proposed choice is retained. ${error.message}`)
    else { setDraft(null); setReview(false) }
    await refresh(); setBusy(false)
  }
  return <section className="condition-records" aria-label="GM paranormal availability"><h4>GM / Paranormal playbooks</h4><p>Standard playbooks stay available. Enable paranormal characters with your table. Disabling stops new creation; existing dossiers and ownership remain available.</p>
    <fieldset disabled={busy}><legend>Campaign availability</legend><div className="dossier-options">{entries.filter(e => e.paranormal).map(entry => <label key={entry.name} className="dossier-check"><input type="checkbox" aria-label={`Allow ${entry.name}`} checked={draft?.name === entry.name ? draft.enabled : entry.enabled} disabled={Boolean(draft && draft.name !== entry.name)} onChange={e => { setDraft({ name: entry.name, enabled: e.target.checked }); setReview(false); setError('') }} />{entry.name} · saved {entry.enabled ? 'enabled' : 'disabled'}</label>)}</div></fieldset>
    {draft && <>{!review ? <button onClick={() => setReview(true)}>Review paranormal availability</button> : <div className="condition-review" role="region" aria-label="Review paranormal availability"><p>{draft.enabled ? 'Enable' : 'Disable'} {draft.name} for new characters in this campaign?</p><button disabled={busy} onClick={() => void save()}>{error ? 'Retry paranormal availability' : 'Confirm paranormal availability'}</button></div>}<button disabled={busy} onClick={() => { setDraft(null); setReview(false); setError('') }}>Discard paranormal availability</button></>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
  </section>
}

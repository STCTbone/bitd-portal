import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
interface Preview { id: string; action: 'sample' | 'clear'; changes: string; preserves: string; counts: Record<string, number> }
const describeError = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not reach the server.'
/** Accepted backend actions only; retained previews make a lost-response retry
 * idempotent. Unmount discards delayed results across campaign/identity changes. */
export function CampaignSetup() {
  const { session } = useSession()
  const [preview, setPreview] = useState<Preview | null>(null), [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  if (!session || session.role !== 'gm') return null
  const review = async (action: Preview['action']) => {
    setBusy(true); setError(''); setStatus('')
    const result = await supabase.rpc('preview_campaign_setup', { p_campaign: session.campaignId, p_action: action })
    if (!live.current) return
    setBusy(false)
    if (result.error) { setError(describeError(result.error)); return }
    setPreview(result.data); setPhrase('')
  }
  const apply = async () => {
    if (!preview) return
    setBusy(true); setError(''); setStatus('')
    const result = await supabase.rpc('apply_campaign_setup', { p_request: preview.id, p_confirmation: phrase })
    if (!live.current) return
    setBusy(false)
    if (result.error) { setError(`Action not confirmed. Your review and confirmation text are kept. ${describeError(result.error)} Retry this review after a connection failure; if it changed or expired, cancel and review again.`); return }
    setStatus(preview.action === 'sample' ? 'Sample setup saved. Campaign views will refresh automatically.' : 'Clocks, notes and map markers cleared. Preserved records remain saved; campaign views will refresh automatically.')
    setPreview(null); setPhrase('')
  }
  return <section className="access-panel" aria-label="Campaign setup">
    <p className="access-kicker">DELIBERATE GM CONTROLS</p><h2>Campaign setup</h2>
    <p>New campaigns are empty. Loading or reloading never adds sample records. To start another empty campaign, use Switch campaign and Create campaign.</p>
    <p>Optional Night Wire sample: invented ’68 fiction with two unclaimed Hounds, a Shadows crew, factions, clocks and shared notes. Published v6 sheet defaults supply capacities; no rewards, book secrets or artwork are imported. Players deliberately claim their sample character. Available only while game content is empty.</p>
    <div className="setup-actions"><button disabled={busy || Boolean(preview)} onClick={() => void review('sample')}>Review optional sample</button><button className="access-secondary" disabled={busy || Boolean(preview)} onClick={() => void review('clear')}>Review clocks, notes and markers clear</button></div>
    <p>This scoped clear removes all campaign/score clock records, shared notes and map markers, including hidden clocks and transient drawings. It preserves sheets, history and uploads. It does not create a fresh campaign.</p>
    {preview && <div className="setup-review" role="region" aria-label="Review campaign setup">
      <h3>{preview.action === 'sample' ? 'Review optional sample setup' : 'Review clocks, notes and markers clear'}</h3>
      <p>{preview.changes}</p><p>{preview.preserves}</p>
      {preview.action === 'clear' && <p>Saved counts at preview: {preview.counts.clocks} clocks, {preview.counts.codex} shared notes, {preview.counts.map_tokens} map markers. Transient drawings, cursors and pings present when confirmed are also cleared.</p>}
      <p>Game record changes invalidate this review. Review expires after 15 minutes. Confirmation applies once; retrying the same review recovers a lost response.</p>
      <label htmlFor="setup-confirmation">Confirmation phrase</label>
      <input id="setup-confirmation" value={phrase} onChange={event => setPhrase(event.target.value)} autoComplete="off" disabled={busy} />
      <small>Type {preview.action === 'sample' ? 'LOAD SAMPLE' : 'CLEAR WORKSPACE'} exactly to confirm these changes.</small>
      <div className="setup-actions"><button disabled={busy || phrase !== (preview.action === 'sample' ? 'LOAD SAMPLE' : 'CLEAR WORKSPACE')} onClick={() => void apply()}>{busy ? 'Applying reviewed action…' : preview.action === 'sample' ? 'Confirm sample setup' : 'Confirm clocks, notes and markers clear'}</button><button className="access-secondary" disabled={busy} onClick={() => { setPreview(null); setPhrase(''); setError(''); setStatus('Review cancelled. No campaign records changed.') }}>Cancel setup review</button></div>
    </div>}
    {error && <p role="alert" className="access-error">{error}</p>}{status && <p role="status">{status}</p>}
  </section>
}

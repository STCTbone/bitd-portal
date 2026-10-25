import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CharacterRecord } from '@/lib/characters'

type Participant = { user_id: string; role: 'gm' | 'player' }
export function CharacterOwnership({ character, assign }: { character: CharacterRecord; assign: (owner: string | null, expected: string | null) => Promise<void> }) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [owner, setOwner] = useState(character.owner_id ?? '')
  const [review, setReview] = useState<{ owner: string | null; expected: string | null } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_campaign_participants', { p_campaign: character.campaign_id })
    if (error) { setError('Could not load current participants. Retry the participant list.'); setParticipants([]) }
    else { setParticipants(data); setError('') }
  }, [character.campaign_id])
  useEffect(() => {
    let active = true
    void supabase.rpc('list_campaign_participants', { p_campaign: character.campaign_id }).then(({ data, error }) => {
      if (!active) return
      if (error) { setError('Could not load current participants. Retry the participant list.'); setParticipants([]) }
      else { setParticipants(data); setError('') }
    })
    return () => { active = false }
  }, [character.campaign_id])
  async function confirm() {
    if (!review) return
    setBusy(true); setError('')
    try { await assign(review.owner, review.expected); setReview(null) }
    catch (error) { setError(`Ownership was not changed. ${error instanceof Error ? error.message : 'Reconnect and retry.'}`) }
    finally { setBusy(false) }
  }
  return <section className="character-ownership" aria-label="Character ownership">
    <h3>Character ownership</h3>
    <p>Current owner: <strong>{character.owner_id ?? 'Unclaimed'}</strong></p>
    <button type="button" onClick={() => void load()}>Refresh participant list</button>
    <label>Assign character to<select aria-label="Assign character to" value={owner} disabled={busy} onChange={e => { setOwner(e.target.value); setReview(null) }}>
      <option value="">Unclaimed · any campaign member may claim</option>
      {participants.map(p => <option key={p.user_id} value={p.user_id}>{p.user_id} · {p.role === 'gm' ? 'Game Master' : 'Player'}</option>)}
    </select></label>
    <button type="button" disabled={busy || owner === (character.owner_id ?? '') || (!!owner && !participants.some(p => p.user_id === owner))} onClick={() => { setReview({ owner: owner || null, expected: character.owner_id }); setError('') }}>Review ownership change</button>
    {review && <div className="dossier-review" role="group" aria-label="Review ownership change">
      <p>Transfer {character.data.name} from {review.expected ?? 'Unclaimed'} to {review.owner ?? 'Unclaimed'}. The previous owner loses editing access. The GM keeps access.{!review.owner && ' Any current member can claim this character.'}</p>
      <button disabled={busy} onClick={() => void confirm()}>Confirm ownership change</button>
      <button disabled={busy} onClick={() => setReview(null)}>Cancel ownership change</button>
    </div>}
    {error && <div role="alert" className="dossier-error"><p>{error}</p>{review && <><button disabled={busy} onClick={() => void confirm()}>Retry ownership change</button><button disabled={busy} onClick={() => { setReview(null); setError('') }}>Discard ownership change</button></>}</div>}
  </section>
}

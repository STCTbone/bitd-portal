import { useState, type FormEvent } from 'react'
import { useSession } from '@/lib/session'

export function LoginGate() {
  const { createCampaign, joinCampaign, accessError, refreshMembership } = useSession()
  const [name, setName] = useState('')
  const [invitation, setInvitation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent, action: () => Promise<{ ok: boolean; error?: string }>) {
    event.preventDefault()
    setBusy(true); setError('')
    const result = await action()
    if (!result.ok) setError(result.error ?? 'Could not connect. Try again.')
    setBusy(false)
  }
  return <main className="access-page">
    <div className="access-brand"><span>DOSKVOL / 1968</span><h1>Blades ’68</h1><p>Your crew. One frequency.</p></div>
    <section className="access-panel" aria-label="Campaign access">
      <p className="access-kicker">CAMPAIGN TERMINAL · 01</p>
      <h2>Gather the crew</h2>
      <p>No email account needed. This browser remembers your identity.</p>
      {accessError && <div role="alert"><p>{accessError}</p><button disabled={busy} onClick={() => void refreshMembership()}>Retry campaign access</button></div>}
      <details><summary>Returning after browser data loss?</summary><p>Join with the player invitation to get a new identity. Your previous character stays protected. Give your new participant ID (shown after joining) to your GM and ask them to reassign the character after confirming who you are. No email is needed. For lost GM access, use your saved secret GM invitation or ask another GM. Keep invitations somewhere safe outside this browser.</p></details>
      <form onSubmit={event => void submit(event, () => createCampaign(name))}>
        <label htmlFor="campaign-name">Campaign name</label>
        <input id="campaign-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="A new signal in Doskvol" />
        <button disabled={busy || !name.trim()}>Create campaign</button>
        <small>Start empty as the Game Master, then share invitations.</small>
      </form>
      <div className="access-divider">OR JOIN YOUR TABLE</div>
      <form onSubmit={event => void submit(event, () => joinCampaign(invitation))}>
        <label htmlFor="invitation">Invitation</label>
        <input id="invitation" value={invitation} onChange={event => setInvitation(event.target.value)} required autoComplete="off" spellCheck={false} placeholder="Paste your player or secret GM invitation" />
        <button disabled={busy || !invitation.trim()}>Join campaign</button>
      </form>
      {error && <p role="alert" className="access-error">{error}</p>}
    </section>
    <footer>Keep your secret GM invitation private. A player invitation grants player access.</footer>
  </main>
}

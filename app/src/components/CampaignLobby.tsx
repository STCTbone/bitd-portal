import { useEffect, useState } from 'react'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { CampaignPlanning } from './CampaignPlanning'
import { CampaignSetup } from './CampaignSetup'
import { SharedNotes } from './SharedNotes'
import { CampaignClocks } from './CampaignClocks'
import { CrewDossier } from './CrewDossier'
import { FactionDossier } from './FactionDossier'
import { CampaignMedia, CampaignMediaProvider } from './ProtectedMedia'
import { CampaignMap } from './CampaignMap'
import { CharacterDossiers } from './CharacterDossiers'

/** Authenticated campaign landing. Features enter here only after their backend contract is migrated. */
export function CampaignLobby() {
  const { session, leaveCampaign } = useSession()
  const [invitations, setInvitations] = useState<{ player: string; gm: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (session?.role === 'gm') {
      supabase.rpc('get_campaign_invitations', { p_campaign: session.campaignId }).then(({ data, error }) => {
        if (!active) return
        if (error) setError('Could not load invitations. Reload to retry.')
        else setInvitations(data)
      })
    }
    return () => { active = false }
  }, [session?.campaignId, session?.role])
  if (!session) return null
  return <main className="access-page">
    <div className="access-brand"><span>BLADES ’68 / CAMPAIGN DOSSIER</span><h1>{session.campaignName}</h1><p data-testid="campaign-role">{session.role === 'gm' ? 'Game Master' : 'Player'}</p></div>
    <section className="access-panel" aria-label="Campaign overview">
      <p className="access-kicker">CAMPAIGN ACCESS</p><h2>Your campaign workspace</h2>
      <p>Fresh campaigns start without sample characters, crew, factions, or clocks.</p>
      {session.role === 'gm' && invitations && <div className="invitation-list">
        <label htmlFor="player-invite">Player invitation</label>
        <input id="player-invite" readOnly value={invitations.player} onFocus={event => event.target.select()} />
        <small>Share this with your players.</small>
        <label htmlFor="gm-invite">Secret GM invitation</label>
        <input id="gm-invite" readOnly value={invitations.gm} onFocus={event => event.target.select()} />
        <small>Grants full GM authority. Share only with another GM.</small>
      </div>}
      <label htmlFor="participant-id">Your participant ID</label>
      <input id="participant-id" readOnly value={session.userId} onFocus={event => event.target.select()} />
      <small>For character recovery, send this ID to your GM after rejoining. It identifies this browser identity; it grants no access by itself.</small>
      <details><summary>Recover campaign or character access</summary><p>Reloading this browser restores current membership. Switching campaigns keeps your identity. After clearing browser data or moving to another browser, rejoin with the player invitation, then ask your GM to assign your character to the participant ID above. Your previous identity keeps ownership until the GM confirms the transfer. Save your invitation outside this browser. Lost GM access needs the secret GM invitation or help from another GM; there is no email reset.</p></details>
      {error && <p role="alert" className="access-error">{error}</p>}
      <button className="access-secondary" onClick={leaveCampaign}>Switch campaign</button>
    </section>
    <CampaignSetup key={`setup:${session.campaignId}:${session.userId}:${session.role}`} />
    <FactionDossier key={`${session.campaignId}:${session.role}`} />
    <CampaignMediaProvider key={`media:${session.campaignId}:${session.role}`}><CharacterDossiers /><CampaignMedia /></CampaignMediaProvider>
    <CampaignMap key={`map:${session.campaignId}:${session.role}`} />
    <CrewDossier />
    <CampaignPlanning />
    <CampaignClocks />
    <SharedNotes />
    <footer>Access is remembered in this browser. Keep your invitation to rejoin from another browser.</footer>
  </main>
}

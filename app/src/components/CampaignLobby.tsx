import { useEffect, useState, type ReactNode } from 'react'
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
import { CampaignOverview } from './CampaignOverview'
import { CharacterDossiers } from './CharacterDossiers'
import { AccountPanel } from './AccountPanel'

const sections = [
  ['campaign-state-overview', 'Overview'], ['character-dossiers', 'Characters'],
  ['crew-dossier', 'Crew'], ['campaign-cycle', 'Cycle'], ['campaign-factions', 'Factions'],
  ['campaign-map', 'Map'], ['campaign-clocks', 'Clocks'], ['campaign-notes', 'Notes'],
  ['campaign-media', 'Media'], ['campaign-account', 'Account'], ['campaign-setup', 'Setup'],
] as const
type Section = typeof sections[number][0]
function sectionFromAddress(isGM: boolean): Section {
  const id = window.location.hash.slice(1)
  return sections.find(([key]) => key === id && (isGM || key !== 'campaign-setup'))?.[0] ?? 'campaign-state-overview'
}

/** Authenticated campaign landing. Features enter here only after their backend contract is migrated. */
export function CampaignLobby() {
  const { session, leaveCampaign } = useSession()
  const [invitations, setInvitations] = useState<{ player: string; gm: string } | null>(null)
  const [error, setError] = useState('')
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const isGM = session?.role === 'gm'
  const [activeSection, setActiveSection] = useState<Section>(() => sectionFromAddress(isGM))
  useEffect(() => {
    const followAddress = () => setActiveSection(sectionFromAddress(isGM))
    window.addEventListener('hashchange', followAddress)
    window.addEventListener('popstate', followAddress)
    return () => { window.removeEventListener('hashchange', followAddress); window.removeEventListener('popstate', followAddress) }
  }, [isGM])
  function openSection(id: Section, focusPanel = false) {
    setActiveSection(id)
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`)
    window.scrollTo(0, 0)
    if (focusPanel) requestAnimationFrame(() => document.getElementById(`panel-${id}`)?.focus({ preventScroll: true }))
  }
  // Keep editors mounted so switching tabs retains their drafts and selections.
  function panel(id: Section, children: ReactNode) {
    return <div key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} tabIndex={0} hidden={activeSection !== id} className="campaign-tab-panel">{children}</div>
  }
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
  const tabs = sections.filter(([id]) => isGM || id !== 'campaign-setup')
  return <main className="access-page campaign-page">
    <div className="access-brand"><span>BLADES ’68 / CAMPAIGN DOSSIER</span><h1>{session.campaignName}</h1><p data-testid="campaign-role">{session.role === 'gm' ? 'Game Master' : 'Player'}</p></div>
    <nav className="campaign-sections" aria-label="Campaign sections">
      <div role="tablist" aria-label="Campaign sections">{tabs.map(([id, label], index) => <button key={id} type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={activeSection === id} tabIndex={activeSection === id ? 0 : -1} onClick={() => openSection(id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
        if (next === null) return
        event.preventDefault(); openSection(tabs[next][0]); document.getElementById(`tab-${tabs[next][0]}`)?.focus()
      }}>{label}</button>)}</div>
    </nav>
    <CampaignMediaProvider key={`media:${session.campaignId}:${session.role}`}>
    {panel('campaign-state-overview', <CampaignOverview openCharacter={id => { setSelectedCharacter(id); openSection('character-dossiers', true) }} openCrew={() => openSection('crew-dossier', true)} />)}
    {panel('character-dossiers', <CharacterDossiers selectedCharacter={selectedCharacter} onSelectCharacter={setSelectedCharacter} />)}
    {panel('crew-dossier', <CrewDossier />)}
    {panel('campaign-cycle', <CampaignPlanning />)}
    {panel('campaign-factions', <FactionDossier key={`${session.campaignId}:${session.role}`} />)}
    {panel('campaign-map', <CampaignMap key={`map:${session.campaignId}:${session.role}`} />)}
    {panel('campaign-clocks', <CampaignClocks />)}
    {panel('campaign-notes', <SharedNotes />)}
    {panel('campaign-media', <CampaignMedia />)}
    {panel('campaign-account', <><AccountPanel />
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
      <details><summary>Recover campaign or character access</summary><p>After linking Google, sign in with the same Google account on another device and open My campaigns. Switching campaigns keeps your identity. If an unlinked guest loses browser access, rejoin with an invitation and ask the GM to assign the character to the new participant ID. Your previous identity keeps ownership until that transfer is confirmed. Lost guest GM access needs the secret GM invitation or another GM.</p></details>
      {error && <p role="alert" className="access-error">{error}</p>}
      <button className="access-secondary" onClick={leaveCampaign}>Switch campaign</button>
    </section></>)}
    {isGM && panel('campaign-setup', <CampaignSetup key={`setup:${session.campaignId}:${session.userId}:${session.role}`} />)}
    </CampaignMediaProvider>
  </main>
}

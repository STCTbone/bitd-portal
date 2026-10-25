import { useState } from 'react'
import { useSession } from '@/lib/session'
import { useCampaignOverview, useCampaignPresence, type CharacterSummary } from '@/lib/overview'
import './CampaignOverview.css'

const resourceLabel = (kind: string | null) => kind === 'hull' || kind === 'ghost' ? 'Drain' : kind === 'future' || kind === 'past' ? 'Instability' : 'Stress'

export function CampaignOverview({ openCharacter, openCrew }: { openCharacter: (id: string) => void; openCrew: () => void }) {
  const { session } = useSession()
  const overview = useCampaignOverview()
  const [joined, setJoined] = useState(true)
  const presence = useCampaignPresence(joined)
  const characters = overview.snapshot?.characters ?? []
  const crew = overview.snapshot?.crew
  function ownership(character: CharacterSummary) {
    return character.owner_id === session!.userId ? 'Yours' : character.owner_id ? 'Owned by another participant' : 'Unclaimed'
  }
  return <section className="campaign-summary" id="campaign-state-overview" tabIndex={-1} aria-label="Campaign state overview">
    <header><p className="summary-kicker">THE TABLE / SAVED CAMPAIGN STATE</p><h2>Campaign at a glance</h2></header>
    {overview.error && <div role="alert"><p>{overview.error}</p><button onClick={overview.retry}>Retry overview</button></div>}
    {!overview.snapshot && !overview.error && <p role="status">Loading campaign summary…</p>}
    {overview.snapshot && <>
      <div className="summary-cards">
        {crew ? <article aria-label="Crew summary" className="summary-crew"><p className="summary-kicker">{crew.type} / CREW</p><h3 aria-label={`${crew.name} crew summary`}>{crew.name}</h3>{crew.reputation && <p>{crew.reputation}</p>}
          <ul className="summary-tracks"><li>Tier {crew.tier} · {crew.hold} Hold</li><li>Rep {crew.rep}</li><li>Heat {crew.heat}</li><li>Wanted {crew.wanted}</li><li>Stacks {crew.stacks}</li><li>Crew XP {crew.xp}</li></ul><a href="#crew-dossier" onClick={event => { event.preventDefault(); openCrew() }}>Open crew dossier</a>
        </article> : <article aria-label="Crew summary"><h3>Crew</h3><p>No crew yet.</p><a href="#crew-dossier" onClick={event => { event.preventDefault(); openCrew() }}>Open crew dossier</a></article>}
        {characters.map(character => <article key={character.id} aria-label={`${character.name} summary`}><p className="summary-kicker">{character.playbook} / {ownership(character)}</p><h3>{character.alias || character.name}</h3>{character.alias && <p>{character.name}</p>}
          <ul className="summary-tracks"><li>{resourceLabel(character.condition_kind)} {character.stress}/{character.stress_capacity}</li><li>{character.load} load</li><li>Stacks {character.stacks}</li><li>Bank {character.bank}</li></ul>
          <p>{character.condition_kind === 'hull' ? 'Damage' : 'Harm'}: {(['passing', 'major', 'critical', 'mortal'] as const).filter(kind => character.condition_kind !== 'hull' || kind !== 'mortal').map(kind => `${character.harm[kind]} ${kind}`).join(' · ')}</p>
          <a href="#character-dossiers" onClick={event => { event.preventDefault(); openCharacter(character.id) }}>Open {character.name} dossier</a>
        </article>)}
      </div>
      {characters.length === 0 && <p>No characters yet.</p>}
    </>}
    <section className="table-presence" aria-label="Online table">
      <h3>Online table</h3>
      {presence.error && <div role="alert"><p>{presence.error}</p><button onClick={presence.retry}>Retry presence</button></div>}
      {!presence.snapshot && !presence.error && <p role="status">Checking the table…</p>}
      {presence.snapshot && <><p role="status">{presence.snapshot.participants.length} online {joined ? '· You are at the table' : '· You have left the online table'}</p>
        <ul className="presence-list">{presence.snapshot.participants.map(person => <li key={person.actor} data-presence-actor={person.actor}><strong>{person.role === 'gm' ? 'Game Master' : 'Player'}</strong><span>Participant {person.actor.slice(0, 8)}{person.actor === session!.userId ? ' · You' : ''}</span><span>{characters.filter(character => character.owner_id === person.actor).map(character => character.alias || character.name).join(', ') || 'No character owned'}</span></li>)}</ul>
      </>}
      <button onClick={() => setJoined(value => !value)}>{joined ? 'Leave online table' : 'Join online table'}</button>
    </section>
  </section>
}

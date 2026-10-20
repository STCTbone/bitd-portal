import { useEffect, useState, type FormEvent } from 'react'
import { useSession } from '@/lib/session'
import { ACTION_GROUPS, ECHO_PET_CHOICES, useCharacters, type CharacterPatch, type CharacterRecord } from '@/lib/characters'
import { DossierField } from './DossierField'
import { supabase } from '@/lib/supabase'
import { CharacterOwnership } from './CharacterOwnership'
import { CharacterEquipment } from './CharacterEquipment'
import { HumanPlaybookRecords } from './HumanPlaybookRecords'
import { CharacterMedia } from './ProtectedMedia'
import { CharacterCondition } from './CharacterCondition'
import './dossier.css'

const HERITAGES = ['Akoros', 'The Dagger Isles', 'Iruvia', 'Severos', 'Tycheros', 'USC']
const BACKGROUNDS = ['Learned', 'Underworld', 'Performer', 'Trade', 'Professional', 'Aristocrat', 'Military', 'Labor']
const VICES = ['Faith', 'Gambling', 'Luxury', 'Obligation', 'Pleasure', 'Gettin’ Fucked Up', 'Weird']

export function CharacterDossiers() {
  const { session } = useSession()
  const { records, error: syncError, loaded, refresh, patch, mutate } = useCharacters(session!.campaignId)
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [playbooks, setPlaybooks] = useState<string[]>([])
  const [playbook, setPlaybook] = useState('Hound')
  const [unclaimed, setUnclaimed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { let stopped = false; void supabase.from('character_playbooks').select('name').order('name').then(({ data, error }) => { if (stopped) return; if (error) setError('Playbook catalog unavailable. Reconnect and reload.'); else setPlaybooks(data.map(p => p.name)) }); return () => { stopped = true } }, [])
  const character = records.find(c => c.id === selected)
  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const created = await mutate('create_character', { p_campaign: session!.campaignId, p_name: name, p_unclaimed: unclaimed, p_playbook: playbook })
      setName(''); setSelected(created!.id)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not create character.') }
    finally { setBusy(false) }
  }
  async function action(operation: string, id: string) {
    setError(''); setBusy(true)
    try { await mutate(operation, { p_character: id }); setConfirmDelete(false) }
    catch (error) { setError(error instanceof Error ? error.message : 'Change was not saved.') }
    finally { setBusy(false) }
  }
  return <section className="dossier-workspace" aria-label="Character dossiers">
    <header className="dossier-heading"><p>YOUR PEOPLE / THEIR STORIES</p><h2>Character dossiers</h2><p>Saved changes are shared with campaign members. Only the owner and GM may edit.</p></header>
    {syncError && <div role="alert" className="dossier-error">{syncError} <button onClick={() => void refresh()}>Retry character sync</button></div>}
    {error && <p role="alert" className="dossier-error">{error}</p>}
    <div className="dossier-roster">
      {!loaded ? <p role="status">Loading characters…</p> : records.length === 0 ? <p>No characters yet. Create your first character.</p> : records.map(c => <div key={c.id}>
        <button onClick={() => { setSelected(c.id); setConfirmDelete(false) }} aria-pressed={selected === c.id} aria-label={`Open ${c.data.name}`}>{c.data.name} <small>{c.data.playbook} · {c.owner_id === session!.userId ? 'Yours' : c.owner_id ? 'Owned' : 'Unclaimed'}</small></button>
        {c.owner_id === null && <button disabled={busy} onClick={() => { setSelected(c.id); void action('claim_character', c.id) }}>Claim {c.data.name}</button>}
      </div>)}
    </div>
    <form className="dossier-create" onSubmit={e => void create(e)}>
      <label>New character name<input value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></label>
      <label>Playbook<select aria-label="Playbook" value={playbook} onChange={e => setPlaybook(e.target.value)}>{playbooks.map(p => <option key={p}>{p}</option>)}</select></label>
      {session!.role === 'gm' && <label className="dossier-check"><input type="checkbox" checked={unclaimed} onChange={e => setUnclaimed(e.target.checked)} />Leave unclaimed for a player</label>}
      <button disabled={busy || !name.trim() || !playbooks.includes(playbook)}>Create {playbook}</button>
    </form>
    {character && <>
      {session!.role === 'gm' && <CharacterOwnership key={`ownership:${character.id}`} character={character} assign={async (owner, expected) => { await mutate('assign_character_owner', { p_character: character.id, p_owner: owner, p_expected_owner: expected }) }} />}
      <Dossier key={character.id} character={character} editable={session!.role === 'gm' || character.owner_id === session!.userId} patch={changes => patch(character.id, changes)} isGM={session!.role === 'gm'} setKeyCapacity={async (capacity, reason) => { await mutate('set_character_key_capacity', { p_character: character.id, p_capacity: capacity, p_reason: reason }) }} />
      {(session!.role === 'gm' || character.owner_id === session!.userId) && <div className="dossier-danger">
        {!confirmDelete ? <button onClick={() => setConfirmDelete(true)}>Delete character</button> : <><p>Delete {character.data.name} permanently? This cannot be undone.</p><button disabled={busy} onClick={() => void action('delete_character', character.id)}>Confirm delete {character.data.name}</button><button onClick={() => setConfirmDelete(false)}>Keep character</button></>}
      </div>}
    </>}
  </section>
}

function Dossier({ character, editable, patch, isGM, setKeyCapacity }: { character: CharacterRecord; editable: boolean; patch: (changes: CharacterPatch) => Promise<void>; isGM: boolean; setKeyCapacity: (capacity: number, reason: string) => Promise<void> }) {
  const d = character.data
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function change(changes: CharacterPatch) {
    setPending(true); setError('')
    try { await patch(changes) }
    catch (error) { setError(`Change was not saved. The last saved selection is shown. ${error instanceof Error ? error.message : 'Reconnect and retry.'}`) }
    finally { setPending(false) }
  }
  const text = (label: string, field: keyof CharacterPatch, suggestions?: readonly string[], multiline = false) => <DossierField key={field} label={label} value={String(d[field as keyof typeof d] ?? '')} disabled={!editable} suggestions={suggestions} multiline={multiline} save={value => patch({ [field]: value })} />
  return <article className="character-dossier" aria-label={`${d.name} dossier`}>
    <div className="dossier-title"><span>{d.playbook.toUpperCase()} / CHARACTER DOSSIER</span><h3>{d.alias || d.name}</h3><p>{editable ? 'You can edit this dossier.' : 'Read only · follow the owner’s saved changes.'}</p></div>
    <p className="dossier-source">Published baseline: {d.sheet.source}. <a href="https://evilhat.com/wp-content/uploads/2026/07/Crew-Sheets-and-Playbooks.zip" target="_blank" rel="noreferrer">Official reference sheets</a>. Records are edited deliberately; abilities do not apply automatic consequences.</p>
    {error && <p role="alert" className="dossier-error">{error}</p>}
    <CharacterMedia character={character} editable={editable} />
    <section aria-label="Identity"><h4>01 / Identity</h4><div className="dossier-grid">{text('Character name', 'name')}{text('Alias', 'alias')}{text('Player name', 'playerName')}{text('Look', 'look')}{text('Wearing', 'wearing')}{text('Heritage', 'heritage', HERITAGES)}{text('Heritage details', 'heritageDetails')}{(!d.sheet.backgroundLabel || d.sheet.backgroundLabel === 'Background') && <>{text('Background', 'background', d.sheet.backgroundSuggestions ?? BACKGROUNDS)}{text('Background details', 'backgroundDetails')}</>}{text('Vice', 'vice', VICES)}{text('Vice hookup', 'viceHookup')}</div></section>
    <section aria-label="Actions"><h4>02 / Actions</h4><p>{d.sheet.creation ?? (d.playbook === 'Hound' ? 'Hound starts with Survey 1 and Consort 2. At creation add four dots, at most 2 in any action.' : 'Follow your playbook’s starting dots and creation choices.')} Later maximum is 3 (4 with Mastery); record table-approved exceptions deliberately.</p><div className="dossier-actions">{Object.entries(ACTION_GROUPS).map(([group, actions]) => <fieldset key={group}><legend>{group}</legend>{actions.map(action => <label key={action}>{action[0].toUpperCase() + action.slice(1)}<select aria-label={`${action[0].toUpperCase() + action.slice(1)} rating`} disabled={!editable || pending} value={d.actions[action]} onChange={e => void change({ actions: { [action]: Number(e.target.value) } })}>{Array.from({ length: d.sheet.actionMax + 1 }, (_, n) => n).map(n => <option key={n} value={n}>{n} · {'●'.repeat(n) || '—'}</option>)}</select></label>)}</fieldset>)}</div></section>
    <section aria-label="Special abilities"><h4>03 / Special abilities</h4><p>{d.sheet.abilityChoiceGuidance ?? 'Choose one at creation.'} Record later advances and ability decisions with your table.</p><div className="dossier-options">{d.sheet.abilities.map(ability => <label className="dossier-check" key={ability}><input type="checkbox" checked={d.abilities.includes(ability)} disabled={!editable || pending || d.sheet.fixedAbilities?.includes(ability)} onChange={e => void change({ abilities: e.target.checked ? [...d.abilities, ability] : d.abilities.filter(a => a !== ability) })} />{ability}</label>)}</div>
      {d.abilities.includes('Echo Pet') && <fieldset><legend>Echo Pet choices</legend><p>Take Echo Pet again to choose another paranormal ability. Record each chosen ability below; potency and effects remain table decisions.</p>{ECHO_PET_CHOICES.map(choice => <label key={choice} className="dossier-check"><input type="checkbox" checked={d.echoPet.includes(choice)} disabled={!editable || pending} onChange={e => void change({ echoPet: e.target.checked ? [...d.echoPet, choice] : d.echoPet.filter(c => c !== choice) })} />{choice}</label>)}</fieldset>}
      {d.abilities.includes('Versatile') && <><p>Choose an ability from another source; retain its name and source.</p>{d.versatile.map((ability, index) => <div className="dossier-grid dossier-row" key={index}>{(['name', 'source', 'notes'] as const).map(field => <DossierField key={field} label={`Versatile ${index + 1} ${field}`} value={ability[field]} disabled={!editable} save={value => patch({ versatile: d.versatile.map((a, i) => i === index ? { ...a, [field]: value } : a) })} />)}{editable && <button onClick={() => void change({ versatile: d.versatile.filter((_, i) => i !== index) })}>Remove Versatile {index + 1}</button>}</div>)}{editable && <button disabled={pending} onClick={() => void change({ versatile: [...d.versatile, { name: '', source: '', notes: '' }] })}>Add Versatile ability</button>}</>}
      {d.sheet.abilityGuidance && <p>{d.sheet.abilityGuidance}</p>}
      {text('Ability decisions and bonds', 'abilityNotes', undefined, true)}
    </section>
    {d.playbook === 'Hound' && <section aria-label="Loyal clever pet"><h4>04 / Loyal, clever pet</h4><p>Expert cohort · Hunter. Quality is crew Tier +1 when Hunter applies. Record edges, flaws, conditions and abilities; a playbook cohort cannot take secondary scores.</p><div className="dossier-grid">{(['name', 'kind', 'edges', 'flaws', 'abilities', 'notes'] as const).map(field => <DossierField key={field} label={`Pet ${field}`} value={d.pet[field]} disabled={!editable} save={value => patch({ pet: { [field]: value } })} />)}</div><div className="dossier-options">{(['weak', 'impaired', 'broken', 'armor'] as const).map(field => <label key={field} className="dossier-check"><input type="checkbox" checked={d.pet[field]} disabled={!editable || pending} onChange={e => void change({ pet: { [field]: e.target.checked } })} />Pet {field}</label>)}</div></section>}
    <section aria-label="Relationships"><h4>05 / Shady friends & other relationships</h4><p>Use any friend, rival or contact, including your own. Current v6 sheets suggest two close friends and one rival; the older creation v3 reference suggests one close friend. No fixed count is imposed.</p><p>Suggestions: {(d.sheet.contacts ?? (d.playbook === 'Hound' ? ['Vanden', 'Mira', 'Hendrik', 'Chatterley', 'Zam'] : [])).join(' · ')}.</p>{d.relationships.map((relationship, index) => <div className="dossier-grid dossier-row" key={index}>{(['name', 'relationship', 'notes'] as const).map(field => <DossierField key={field} label={`Relationship ${index + 1} ${field === 'relationship' ? 'kind' : field}`} value={relationship[field]} disabled={!editable} suggestions={field === 'relationship' ? ['Close friend', 'Rival', 'Contact', 'Intimate bond'] : undefined} save={value => patch({ relationships: d.relationships.map((r, i) => i === index ? { ...r, [field]: value } : r) })} />)}{editable && <button disabled={pending} onClick={() => void change({ relationships: d.relationships.filter((_, i) => i !== index) })}>Remove relationship {index + 1}</button>}</div>)}{editable && <button disabled={pending} onClick={() => void change({ relationships: [...d.relationships, { name: '', relationship: '', notes: '' }] })}>Add relationship</button>}</section>
    <HumanPlaybookRecords data={d} editable={editable} patch={patch} />
    <CharacterCondition data={d} editable={editable} patch={patch} isGM={isGM} setKeyCapacity={setKeyCapacity} />
    <CharacterEquipment data={d} editable={editable} patch={patch} />
    <section aria-label="General notes"><h4>08 / Case notes</h4>{text('General notes', 'notes', undefined, true)}</section>
  </article>
}

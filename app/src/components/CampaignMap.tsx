import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { useCharacters } from '@/lib/characters'
import { useAssetLibrary, useProtectedAsset, reserveAsset, uploadReservedAsset, mediaError, type CampaignAsset } from '@/lib/media'
import { useCampaignMap, type MapToken } from '@/lib/maps'
import { supabase } from '@/lib/supabase'
import './CampaignMap.css'
import { MapCollaboration } from './MapCollaboration'

type Mutate = ReturnType<typeof useCampaignMap>['mutate']
type Authority = { value: string; label: string }
const assignment = (value: string) => ({ p_character: value.startsWith('character:') ? value.slice(10) : null, p_controller: value.startsWith('participant:') ? value.slice(12) : null })
const tokenAuthority = (token: MapToken) => token.character_id ? `character:${token.character_id}` : token.controller_id ? `participant:${token.controller_id}` : ''

/** #23 extension seam: render bounded ephemeral overlays as children inside the exact
 * image rectangle. Overlay peers must never call durable mutators or supply tokens. */
export function MapSurface({ asset, tokens, children }: { asset: CampaignAsset; tokens: MapToken[]; children?: ReactNode }) {
  const { url, error } = useProtectedAsset(asset)
  return url ? <div className="campaign-map-surface" data-map-surface data-asset-id={asset.id}>
    <img alt="Saved campaign map" src={url} draggable={false} />
    {tokens.map((token, index) => <span className={`map-marker ${token.can_move ? 'map-marker-owned' : ''}`} key={token.id} data-map-token={token.id} style={{ left: `${token.x}%`, top: `${token.y}%` }} title={`${token.label}: ${token.x}%, ${token.y}%`} aria-label={`${token.label} map position`}>{index + 1}</span>)}
    {children}
  </div> : <p role="status">{error || 'Checking map image access…'}</p>
}
function AuthoritySelect({ name, value, options, change }: { name: string; value: string; options: Authority[]; change: (value: string) => void }) {
  return <label>{name}<select aria-label={name} value={value} onChange={event => change(event.target.value)}><option value="">GM only</option>{value && !options.some(option => option.value === value) && <option value={value} disabled>Unavailable assignment · choose current authority</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}
function TokenCard({ token, index, gm, options, mutate }: { token: MapToken; index: number; gm: boolean; options: Authority[]; mutate: Mutate }) {
  const [move, setMove] = useState<{ x: string; y: string; revision: number } | null>(null)
  const [edit, setEdit] = useState<{ label: string; authority: string; revision: number } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [removing, setRemoving] = useState(false)
  async function saveMove(event?: FormEvent) {
    event?.preventDefault(); if (!move) return
    setBusy(true); setError('')
    try { await mutate('move_map_token', { p_token: token.id, p_x: Number(move.x), p_y: Number(move.y), p_revision: move.revision }); setMove(null) }
    catch (error) { setError(`Move not saved; draft retained. ${mediaError(error)}`) }
    finally { setBusy(false) }
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!edit) return
    setBusy(true); setError('')
    try { await mutate('manage_map_token', { p_token: token.id, p_label: edit.label, ...assignment(edit.authority), p_revision: edit.revision }); setEdit(null) }
    catch (error) { setError(`Token not saved; draft retained. ${mediaError(error)}`) }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError('')
    try { await mutate('remove_map_token', { p_token: token.id, p_revision: token.revision }); setRemoving(false) }
    catch (error) { setError(`Removal not saved. ${mediaError(error)}`) }
    finally { setBusy(false) }
  }
  const moveDraft = () => move ?? { x: String(token.x), y: String(token.y), revision: token.revision }
  const editDraft = () => edit ?? { label: token.label, authority: tokenAuthority(token), revision: token.revision }
  return <article className="map-token-card" aria-label={`Token ${token.label}`}>
    <h4><span className="map-token-number">{index + 1}</span> {token.label}</h4>
    <p>Saved position: {token.x}%, {token.y}%</p>
    <small>{token.character_id ? 'Movement follows current character ownership.' : token.controller_id ? `Assigned participant: ${token.controller_id}` : 'GM movement only.'}</small>
    {token.can_move && <form onSubmit={event => void saveMove(event)}>
      <div className="map-coordinate-fields"><label>Horizontal position<input aria-label="Horizontal position" type="number" min="0" max="100" step="0.1" required disabled={busy} value={move?.x ?? token.x} onChange={event => setMove({ ...moveDraft(), x: event.target.value })} /></label>
      <label>Vertical position<input aria-label="Vertical position" type="number" min="0" max="100" step="0.1" required disabled={busy} value={move?.y ?? token.y} onChange={event => setMove({ ...moveDraft(), y: event.target.value })} /></label></div>
      <button disabled={busy || !move}>Move token</button>
    </form>}
    {gm && <details><summary>Manage token</summary><form onSubmit={event => void saveEdit(event)}>
      <label>Token label<input aria-label="Token label" required maxLength={80} value={edit?.label ?? token.label} onChange={event => setEdit({ ...editDraft(), label: event.target.value })} /></label>
      <AuthoritySelect name="Token movement authority" value={edit?.authority ?? tokenAuthority(token)} options={options} change={authority => setEdit({ ...editDraft(), authority })} />
      <button disabled={busy || !edit}>Save token</button>
    </form><button disabled={busy} onClick={() => setRemoving(true)}>Remove token</button>
    {removing && <div><p>Remove {token.label} from the campaign map?</p><button disabled={busy} onClick={() => void remove()}>Confirm remove token</button><button onClick={() => setRemoving(false)}>Cancel removal</button></div>}</details>}
    {error && <div role="alert"><p>{error}</p>{move && token.can_move && <button disabled={busy} onClick={() => void saveMove()}>Retry move</button>}</div>}
    {(move || edit || error) && <button disabled={busy} onClick={() => { setMove(null); setEdit(null); setError('') }}>Reload saved token / discard draft</button>}
  </article>
}
export function CampaignMap() {
  const { session } = useSession()
  const campaign = session!.campaignId, map = useCampaignMap(campaign), library = useAssetLibrary(campaign), characters = useCharacters(campaign)
  const [participants, setParticipants] = useState<Authority[]>([])
  const [choice, setChoice] = useState<{ asset: string; revision: number } | null>(null)
  const [file, setFile] = useState<File | null>(null), [reservation, setReservation] = useState<CampaignAsset | null>(null)
  const [label, setLabel] = useState(''), [authority, setAuthority] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const gm = map.state?.role === 'gm', images = library.assets.filter(asset => asset.kind === 'image' && !asset.character_id && asset.shared && asset.state === 'ready')
  const selected = images.find(asset => asset.id === map.state?.map?.asset_id)
  const options = [...characters.records.map(character => ({ value: `character:${character.id}`, label: `Character: ${character.data.name}` })), ...participants]
  async function loadParticipants() {
    const result = await supabase.rpc('list_campaign_participants', { p_campaign: campaign })
    if (result.error) { setError(`Participants unavailable. ${mediaError(result.error)}`); return }
    setParticipants(result.data.map((person: { user_id: string; role: string }) => ({ value: `participant:${person.user_id}`, label: `Participant: ${person.user_id} · ${person.role}` })))
  }
  useEffect(() => {
    if (!gm) return
    let active = true
    const load = () => { void supabase.rpc('list_campaign_participants', { p_campaign: campaign }).then(result => {
      if (!active) return
      if (result.error) setError('Participants unavailable. Refresh token participants to retry.')
      else setParticipants(result.data.map((person: { user_id: string; role: string }) => ({ value: `participant:${person.user_id}`, label: `Participant: ${person.user_id} · ${person.role}` })))
    }) }
    load(); const timer = setInterval(load, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [gm, campaign])
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (error) { setError(`Map change not completed; draft retained. ${mediaError(error)}`) }
    finally { setBusy(false) }
  }
  async function selectMap() {
    if (!choice) return
    await map.mutate('set_campaign_map', { p_campaign: campaign, p_asset: choice.asset || null, p_revision: choice.revision }); setChoice(null)
  }
  async function upload() {
    if (!file) return
    const expected = choice?.revision ?? map.state?.map?.revision ?? 0
    const reserved = reservation ?? await reserveAsset(campaign, 'image', null, file, file.name.slice(0,100))
    setReservation(reserved)
    const ready = await uploadReservedAsset(reserved, file)
    const shared = await supabase.rpc('update_asset', { p_asset: ready.id, p_title: ready.title, p_annotation: ready.annotation, p_shared: true, p_revision: ready.revision })
    if (shared.error) throw shared.error
    setChoice({ asset: ready.id, revision: expected })
    await map.mutate('set_campaign_map', { p_campaign: campaign, p_asset: ready.id, p_revision: expected })
    await library.refresh(); setFile(null); setReservation(null); setChoice(null)
  }
  return <section className="access-panel campaign-map" id="campaign-map" tabIndex={-1} aria-label="Campaign map">
    <p className="access-kicker">SHARED TABLE</p><h2>Campaign map</h2>
    <p>Use Show cursor, Ping map or Draw on map to share temporary gestures. Cursors fade after 3 seconds, pings after 4 and drawings after 8; leaving clears your activity. Coordinates are percentages of the image, from its top left. Use each permitted token’s position controls to move it. Saved changes appear for the whole table.</p>
    {map.error && <div role="alert">{map.error}<button onClick={() => void map.refresh()}>Retry map sync</button></div>}
    {selected ? <MapCollaboration key={`${campaign}:${selected.id}`} campaign={campaign} asset={selected.id}>{overlay => <MapSurface asset={selected} tokens={map.state?.tokens ?? []}>{overlay}</MapSurface>}</MapCollaboration> : <p role="status">{map.state?.map?.asset_id ? 'Selected map unavailable. Its image may have been unshared or removed.' : 'No map selected. The GM can upload or select a shared campaign image.'}</p>}
    <p className="map-access-note">Protected images recheck current access; previews expire within 10 seconds when access cannot be renewed.</p>
    {gm && <div className="map-gm-tools">
      <label>Saved campaign image<select aria-label="Saved campaign image" disabled={busy} value={choice?.asset ?? map.state?.map?.asset_id ?? ''} onChange={event => setChoice({ asset: event.target.value, revision: choice?.revision ?? map.state?.map?.revision ?? 0 })}><option value="">No map</option>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>
      <button disabled={busy || !choice} onClick={() => void run(selectMap)}>Use selected map</button>
      <label>Upload map image<input aria-label="Upload map image" type="file" disabled={busy || !!reservation} accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { setFile(event.target.files?.[0] ?? null); setError('') }} /></label>
      <small>PNG, JPEG, WebP or GIF; maximum 10 MiB. Uploading here explicitly shares the image with this campaign.</small>
      <button disabled={busy || !file} onClick={() => void run(upload)}>Upload and use map</button>
      <button disabled={busy} onClick={() => void loadParticipants()}>Refresh token participants</button>
      <form onSubmit={event => { event.preventDefault(); void run(async () => { await map.mutate('create_map_token', { p_campaign: campaign, p_label: label, ...assignment(authority) }); setLabel('') }) }}>
        <label>New token label<input aria-label="New token label" value={label} maxLength={80} required onChange={event => setLabel(event.target.value)} /></label>
        <div onFocus={() => { if (!participants.length) void loadParticipants() }}><AuthoritySelect name="New token movement authority" options={options} value={authority} change={setAuthority} /></div>
        <button disabled={busy || !label.trim()}>Create token</button>
      </form>
      {(choice || error) && <button disabled={busy} onClick={() => { setChoice(null); setError(''); void map.refresh() }}>Reload saved map / discard selection</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <div className="map-token-list">{map.state?.tokens.map((token, index) => <TokenCard key={token.id} token={token} index={index} gm={!!gm} options={options} mutate={map.mutate} />)}</div>
    {map.state && !map.state.tokens.length && <p>No tokens yet.</p>}
  </section>
}

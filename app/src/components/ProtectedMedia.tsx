import { createContext, useContext, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { useAssetLibrary, useProtectedAsset, reserveAsset, uploadReservedAsset, removeAsset, mediaError, type CampaignAsset } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import type { CharacterRecord } from '@/lib/characters'
import './ProtectedMedia.css'

type Library = ReturnType<typeof useAssetLibrary>
const MediaContext = createContext<Library | null>(null)
export function CampaignMediaProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const library = useAssetLibrary(session!.campaignId)
  return <MediaContext.Provider value={library}>{children}</MediaContext.Provider>
}
function useMedia() {
  const media = useContext(MediaContext)
  if (!media) throw new Error('Campaign media provider required')
  return media
}
export function ProtectedAssetPreview({ asset, label }: { asset: CampaignAsset; label?: string }) {
  const { url, error } = useProtectedAsset(asset)
  return <div className={`protected-preview protected-${asset.kind}`}>
    {url ? asset.kind === 'audio' ? <audio aria-label={label || asset.title} controls preload="metadata" src={url} /> : <img alt={label || asset.title} src={url} /> : <p role="status">{error || 'Checking file access…'}</p>}
  </div>
}
function AssetUpload({ kind, characterId = null, name, onSaved }: { kind?: 'portrait' | 'avatar'; characterId?: string | null; name?: string; onSaved: () => Promise<void> }) {
  const { session } = useSession()
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState('')
  const [reservation, setReservation] = useState<CampaignAsset | null>(null)
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true); setError(''); setStatus('')
    try {
      const reserved = reservation ?? await reserveAsset(session!.campaignId, kind ?? (file.type.startsWith('audio/') ? 'audio' : 'image'), characterId, file, kind ? `${name} ${kind}` : title)
      setReservation(reserved)
      await uploadReservedAsset(reserved, file)
      await onSaved(); setReservation(null); setFile(null); setTitle(''); if (input.current) input.current.value = ''
      setStatus(`${kind || 'Media'} saved.`)
    } catch (error) { setError(`Upload was not completed. Your file is retained for retry. ${mediaError(error)}`) }
    finally { setBusy(false) }
  }
  async function discard() {
    setBusy(true)
    try { if (reservation) await removeAsset(reservation); setReservation(null); setFile(null); setError(''); if (input.current) input.current.value = '' }
    catch (error) { setError(mediaError(error)) }
    finally { setBusy(false) }
  }
  return <form className="asset-upload" onSubmit={event => void upload(event)}>
    {!kind && <label>New media title<input value={title} maxLength={100} required disabled={busy || !!reservation} onChange={e => setTitle(e.target.value)} /></label>}
    <label>{kind ? `Choose ${kind} file` : 'New media file'}<input ref={input} type="file" disabled={busy || !!reservation} accept={kind ? 'image/png,image/jpeg,image/webp,image/gif' : 'image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/wav,audio/ogg,audio/webm'} onChange={e => { setFile(e.target.files?.[0] ?? null); setStatus(''); setError('') }} /></label>
    <button disabled={busy || !file}>{busy ? 'Saving file…' : `Upload ${kind || 'media'}`}</button>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {file && error && <button type="button" disabled={busy} onClick={() => void discard()}>Discard upload</button>}
  </form>
}
export function CharacterMedia({ character, editable }: { character: CharacterRecord; editable: boolean }) {
  const library = useMedia()
  const [error, setError] = useState('')
  return <section aria-label="Character art" className="character-media"><h4>Portrait & avatar</h4><p>Campaign members can view saved art. PNG, JPEG, WebP or GIF; maximum 10 MiB.</p>
    {error && <p role="alert">{error}</p>}
    <div className="character-media-grid">{(['portrait', 'avatar'] as const).map(kind => {
      const selected = library.art.find(s => s.character_id === character.id && s.kind === kind)
      const asset = library.assets.find(a => a.id === selected?.asset_id)
      return <div key={kind}><h5>{kind === 'portrait' ? 'Portrait' : 'Avatar'}</h5>
        {asset ? <ProtectedAssetPreview key={asset.id} asset={asset} label={`${character.data.name} ${kind}`} /> : <p>No {kind} saved.</p>}
        {editable && library.role && <><AssetUpload key={`${character.id}:${kind}`} kind={kind} characterId={character.id} name={character.data.name} onSaved={library.refresh} />
        {asset && <button onClick={() => { void removeAsset(asset).then(library.refresh).catch(error => setError(mediaError(error))) }}>Remove {kind}</button>}</>}
      </div>
    })}</div>
  </section>
}
export function CampaignMedia() {
  const library = useMedia()
  const isGM = library.role === 'gm'
  const assets = library.assets.filter(a => !a.character_id)
  return <section className="campaign-media dossier-workspace" aria-label="Campaign media">
    <header className="dossier-heading"><p>THE TABLE / SOUND & VISION</p><h2>Campaign media</h2><p>The GM chooses which images and audio to share. New uploads start private.</p></header>
    <p>Images: PNG, JPEG, WebP, GIF up to 10 MiB. Audio: MP3, WAV, Ogg, WebM up to 20 MiB. Private previews clear when access changes or its 10-second check expires. Copies already downloaded cannot be recalled.</p>
    {library.error && <p role="alert">{library.error} <button onClick={() => void library.refresh()}>Retry media access</button></p>}
    {isGM && <AssetUpload onSaved={library.refresh} />}
    {!assets.length && <p>{isGM ? 'No campaign media uploaded.' : 'No media is shared with you.'}</p>}
    <div className="media-gallery">{assets.map(asset => <MediaCard key={`${asset.id}:${isGM}`} asset={asset} isGM={isGM} refresh={library.refresh} />)}</div>
  </section>
}
function MediaCard({ asset, isGM, refresh }: { asset: CampaignAsset; isGM: boolean; refresh: () => Promise<void> }) {
  const annotationId = useId()
  const [draft, setDraft] = useState(asset), [dirty, setDirty] = useState(false)
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const current = dirty ? draft : asset
  function change(patch: Partial<CampaignAsset>) { setDraft({ ...current, ...patch }); setDirty(true); setStatus('') }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setStatus('')
    try {
      const result = await supabase.rpc('update_asset', { p_asset: asset.id, p_title: current.title, p_annotation: current.annotation, p_shared: current.shared, p_revision: current.revision })
      if (result.error) throw result.error
      await refresh(); setDirty(false); setStatus('Media saved.')
    } catch (error) { setError(`Media was not saved. Your draft is retained. ${mediaError(error)}`) }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError('')
    try { await removeAsset(asset); await refresh() } catch (error) { setError(mediaError(error)); await refresh() } finally { setBusy(false) }
  }
  return <article className="media-card" aria-label={asset.title}>
    <h3>{asset.title}</h3><p>{asset.shared ? 'Shared with players' : 'GM only'} · {asset.kind === 'audio' ? 'Audio' : 'Image'}</p>
    <ProtectedAssetPreview asset={asset} />
    {isGM ? <form onSubmit={event => void save(event)}>
      <label>Media title<input value={current.title} maxLength={100} required disabled={busy} onChange={e => change({ title: e.target.value })} /></label>
      <label htmlFor={annotationId}>Media annotation</label><textarea id={annotationId} value={current.annotation} maxLength={10000} disabled={busy} onChange={e => change({ annotation: e.target.value })} />
      <label className="dossier-check"><input type="checkbox" checked={current.shared} disabled={busy} onChange={e => change({ shared: e.target.checked })} />Shared with players</label>
      <button disabled={busy}>Save media changes</button>
      {dirty && <button type="button" disabled={busy} onClick={() => { setDirty(false); setError(''); setStatus('') }}>Reload saved media (discard draft)</button>}
      {!confirm ? <button type="button" disabled={busy} onClick={() => setConfirm(true)}>Remove media</button> : <div><p>Remove this file and revoke access permanently?</p><button type="button" disabled={busy} onClick={() => void remove()}>Confirm remove media</button><button type="button" onClick={() => setConfirm(false)}>Keep media</button></div>}
    </form> : <p>{asset.annotation}</p>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </article>
}

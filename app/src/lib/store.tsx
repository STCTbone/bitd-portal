import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Character, Crew, Clock, Faction, CampaignRole, MapToken, Score, Media, CodexEntry } from './types'
import { supabase } from './supabase'
import {
  loadOrSeedCampaign, loadCampaignData, getCampaign,
  saveEntity, saveEntities, mergeEntity, deleteEntity, setCampaignMap,
} from './db'
import type { Seat } from './session'
import type { CampaignData } from './demo-data'
import { Toaster, type ToastItem } from '@/components/Toaster'

// ── Shared game state ──
// Loaded from Postgres on mount, scoped to a campaign. Every mutation applies
// locally, broadcasts to peers over the campaign realtime channel (instant
// sync), and write-throughs to Postgres (durability). Presence on the same
// channel powers "who's online".

export interface OnlinePlayer {
  seat: string // 'gm' or a character id
  name: string
  sessionId: string
}

interface PutPayload {
  characters?: Character[]
  crew?: Crew
  clocks?: Clock[]
  factions?: Faction[]
  score?: Score | null
  completedScore?: Score
  mapImageUrl?: string | null
  media?: Media[]
  codex?: CodexEntry[]
}
interface RemovePayload {
  clockIds?: string[]
  factionIds?: string[]
  characterIds?: string[]
  mediaIds?: string[]
  codexIds?: string[]
}

// A single-entity, single-field-set update. Broadcast for live edits so peers
// merge only the changed keys (see applyPatch) and persisted via the
// merge_entity RPC so the database row is merged, not overwritten.
type EntityKind = 'character' | 'crew' | 'clock' | 'faction' | 'score' | 'codex'
interface PatchPayload {
  entity?: EntityKind
  id?: string
  patch?: Record<string, unknown>
}

// Maps a patchable entity kind to its backing jsonb table for merge_entity.
const PATCH_TABLE: Record<EntityKind, 'characters' | 'crews' | 'clocks' | 'factions' | 'scores' | 'codex'> = {
  character: 'characters', crew: 'crews', clock: 'clocks', faction: 'factions', score: 'scores', codex: 'codex',
}

type ToastInput = Omit<ToastItem, 'id'>

const HARM_FIELDS: (keyof Character)[] = ['harm_level3', 'harm_level2_a', 'harm_level2_b', 'harm_level1_a', 'harm_level1_b']

// Coin capacity for the crew treasury and each character. Coin held above this
// is "ephemeral" overflow — it must be spent or stashed during downtime and is
// wiped (capped back to capacity) when the next score begins. Used both as the
// CoinTracker capacity threshold and the startScore wipe cap.
export const COIN_CAPACITY = 4

// Given an incoming (remote) 'put' payload and the pre-apply state, produce
// toasts only for changes to the PARTY (crew) or to the viewer's OWN character.
// Other players' changes intentionally produce nothing.
function buildToasts(p: PutPayload, prev: { characters: Character[]; crew: Crew | null }, myCharId: string | null): ToastInput[] {
  const out: ToastInput[] = []

  if (p.crew && prev.crew) {
    const a = prev.crew, b = p.crew
    if (b.coin !== a.coin) {
      const d = b.coin - a.coin
      out.push({ scope: 'party', tone: d > 0 ? 'good' : 'neutral', text: d > 0 ? `Party gained ${d} coin` : `Party spent ${-d} coin` })
    }
    if (b.rep !== a.rep) {
      const d = b.rep - a.rep
      out.push({ scope: 'party', tone: d > 0 ? 'good' : 'neutral', text: d > 0 ? `Party gained ${d} rep` : `Party lost ${-d} rep` })
    }
    if (b.heat !== a.heat) {
      const d = b.heat - a.heat
      out.push({ scope: 'party', tone: d > 0 ? 'bad' : 'good', text: d > 0 ? `Party heat +${d}` : `Party heat ${d}` })
    }
    if (b.wanted_level !== a.wanted_level) {
      out.push({ scope: 'party', tone: b.wanted_level > a.wanted_level ? 'bad' : 'good', text: `Wanted level → ${b.wanted_level}` })
    }
  }

  if (myCharId && p.characters) {
    const b = p.characters.find((c) => c.id === myCharId)
    const a = prev.characters.find((c) => c.id === myCharId)
    if (a && b) {
      if (b.stress !== a.stress) {
        const d = b.stress - a.stress
        out.push({ scope: 'self', tone: d > 0 ? 'bad' : 'good', text: d > 0 ? `You took ${d} stress` : `You cleared ${-d} stress` })
      }
      if (b.coin !== a.coin) {
        const d = b.coin - a.coin
        out.push({ scope: 'self', tone: d > 0 ? 'good' : 'neutral', text: d > 0 ? `You received ${d} coin` : `You spent ${-d} coin` })
      }
      if (b.trauma.length > a.trauma.length) {
        const added = b.trauma.filter((t) => !a.trauma.includes(t))
        out.push({ scope: 'self', tone: 'bad', text: `You gained trauma: ${added.join(', ')}` })
      }
      for (const f of HARM_FIELDS) {
        const av = a[f] as string | null
        const bv = b[f] as string | null
        if (!av && bv) out.push({ scope: 'self', tone: 'bad', text: `You suffered harm: ${bv}` })
        else if (av && !bv) out.push({ scope: 'self', tone: 'good', text: 'You recovered from harm' })
      }
    }
  }

  return out
}

interface GameState {
  loading: boolean
  loadError: string | null
  campaignId: string
  onlinePlayers: OnlinePlayer[]
  role: CampaignRole
  characters: Character[]
  crew: Crew | null
  clocks: Clock[]
  factions: Faction[]
  activeCharacterId: string | null
  mapTokens: MapToken[]
  mapImageUrl: string | null
  currentScore: Score | null
  scoreHistory: Score[]
  media: Media[]
  codex: CodexEntry[]
}

interface GameActions {
  setRole: (role: CampaignRole) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
  updateCrew: (updates: Partial<Crew>) => void
  updateClock: (id: string, updates: Partial<Clock>) => void
  addClock: (clock: Clock) => void
  deleteClock: (id: string) => void
  updateFaction: (id: string, updates: Partial<Faction>) => void
  addFaction: (faction: Faction) => void
  deleteFaction: (id: string) => void
  setActiveCharacter: (id: string | null) => void
  updateMapToken: (id: string, updates: Partial<MapToken>) => void
  addMapToken: (token: MapToken) => void
  removeMapToken: (id: string) => void
  commitMapToken: (id: string) => void
  editMapToken: (id: string, updates: Partial<MapToken>) => void
  setMapImage: (url: string | null) => void
  endScore: () => void
  startScore: () => void
  updateScore: (updates: Partial<Score>) => void
  wrapScore: () => void
  abandonScore: () => void
  addMedia: (item: Media) => void
  deleteMedia: (id: string) => void
  addCodexEntry: (entry: CodexEntry) => void
  updateCodexEntry: (id: string, updates: Partial<CodexEntry>) => void
  deleteCodexEntry: (id: string) => void
  resetGame: () => void
}

const GameContext = createContext<(GameState & GameActions) | null>(null)

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be inside GameProvider')
  return ctx
}

function upsertMany<T extends { id: string }>(prev: T[], items: T[]): T[] {
  const map = new Map(prev.map((x) => [x.id, x]))
  for (const it of items) map.set(it.id, it)
  return Array.from(map.values())
}

function resetForNewScore(c: Character): Character {
  return {
    ...c,
    load_level: null,
    items_carried: [],
    armor_used: false,
    heavy_armor_used: false,
    special_armor_used: false,
  }
}

function seatKey(seat: Seat): string {
  return seat.type === 'gm' ? 'gm' : seat.id
}

interface GameProviderProps {
  campaignId: string
  seat: Seat
  sessionId: string
  children: ReactNode
}

export function GameProvider({ campaignId, seat, sessionId, children }: GameProviderProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([])
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const pushToast = useCallback((t: ToastInput) => {
    setToasts((prev) => [...prev, { ...t, id: crypto.randomUUID() }].slice(-5))
  }, [])
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const [role, setRole] = useState<CampaignRole>(seat.type === 'gm' ? 'gm' : 'player')
  const [characters, setCharacters] = useState<Character[]>([])
  const [crew, setCrew] = useState<Crew | null>(null)
  const [clocks, setClocks] = useState<Clock[]>([])
  const [factions, setFactions] = useState<Faction[]>([])
  const [activeCharacterId, setActiveCharacter] = useState<string | null>(
    seat.type === 'character' ? seat.id : null,
  )
  const [mapTokens, setMapTokens] = useState<MapToken[]>([])
  const [mapImageUrl, setMapImage] = useState<string | null>(null)
  const [currentScore, setCurrentScore] = useState<Score | null>(null)
  const [scoreHistory, setScoreHistory] = useState<Score[]>([])
  const [media, setMedia] = useState<Media[]>([])
  const [codex, setCodex] = useState<CodexEntry[]>([])

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stateRef = useRef({ characters, crew, clocks, factions, currentScore, mapTokens })
  useEffect(() => {
    stateRef.current = { characters, crew, clocks, factions, currentScore, mapTokens }
  })

  // ── Local appliers (used for our own actions and peer broadcasts) ──
  const applyPut = useCallback((p: PutPayload) => {
    if (p.characters) setCharacters((prev) => upsertMany(prev, p.characters!))
    if (p.crew) setCrew(p.crew)
    if (p.clocks) setClocks((prev) => upsertMany(prev, p.clocks!))
    if (p.factions) setFactions((prev) => upsertMany(prev, p.factions!))
    if ('score' in p) setCurrentScore(p.score ?? null)
    if (p.completedScore) {
      const done = p.completedScore
      setScoreHistory((prev) => [done, ...prev.filter((s) => s.id !== done.id)])
    }
    if ('mapImageUrl' in p) setMapImage(p.mapImageUrl ?? null)
    if (p.media) setMedia((prev) => upsertMany(prev, p.media!))
    if (p.codex) setCodex((prev) => upsertMany(prev, p.codex!))
  }, [])

  const applyRemove = useCallback((p: RemovePayload) => {
    if (p.clockIds) setClocks((prev) => prev.filter((c) => !p.clockIds!.includes(c.id)))
    if (p.factionIds) setFactions((prev) => prev.filter((f) => !p.factionIds!.includes(f.id)))
    if (p.characterIds) setCharacters((prev) => prev.filter((c) => !p.characterIds!.includes(c.id)))
    if (p.mediaIds) setMedia((prev) => prev.filter((m) => !p.mediaIds!.includes(m.id)))
    if (p.codexIds) setCodex((prev) => prev.filter((e) => !p.codexIds!.includes(e.id)))
  }, [])

  // Field-level merge of a partial update into a single entity by id. Used for
  // both our own edits and incoming peer 'patch' ops, so two clients changing
  // different fields of the same entity don't clobber one another.
  const applyPatch = useCallback((entity: EntityKind, id: string, patch: Record<string, unknown>) => {
    switch (entity) {
      case 'character': setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))); break
      case 'crew': setCrew((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev)); break
      case 'clock': setClocks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))); break
      case 'faction': setFactions((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f))); break
      case 'score': setCurrentScore((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev)); break
      case 'codex': setCodex((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e))); break
    }
  }, [])

  const applyAction = useCallback((action: string, p: PutPayload & RemovePayload & PatchPayload) => {
    if (action === 'put') applyPut(p)
    else if (action === 'remove') applyRemove(p)
    else if (action === 'patch' && p.entity && p.id) applyPatch(p.entity, p.id, p.patch ?? {})
  }, [applyPut, applyRemove, applyPatch])

  // ── Durable backstop: apply Postgres row changes (postgres_changes) ──
  // Broadcasts give instant peer sync but are fire-and-forget — anything sent
  // while a client is briefly disconnected is lost. Subscribing to the DB
  // changefeed means every committed write reaches every client even if its
  // broadcast was missed, so clients converge instead of silently diverging.
  // Per-id updated_at guard drops stale echoes so a late older row can't revert
  // a newer applied one. These are silent (no toasts — broadcasts handle those).
  const lastSeenRef = useRef<Record<string, string>>({})
  type ServerTable = 'characters' | 'crews' | 'clocks' | 'factions' | 'scores' | 'map_tokens' | 'media' | 'codex'

  const upsertServerEntity = useCallback((table: ServerTable, data: { id: string; status?: string }, updatedAt?: string) => {
    const id = data?.id
    if (id && updatedAt) {
      const seen = lastSeenRef.current[id]
      if (seen && updatedAt < seen) return // strictly older echo — ignore
      lastSeenRef.current[id] = updatedAt
    }
    switch (table) {
      case 'characters': setCharacters((prev) => upsertMany(prev, [data as unknown as Character])); break
      case 'crews': setCrew(data as unknown as Crew); break
      case 'clocks': setClocks((prev) => upsertMany(prev, [data as unknown as Clock])); break
      case 'factions': setFactions((prev) => upsertMany(prev, [data as unknown as Faction])); break
      case 'map_tokens': setMapTokens((prev) => upsertMany(prev, [data as unknown as MapToken])); break
      case 'media': setMedia((prev) => upsertMany(prev, [data as unknown as Media])); break
      case 'codex': setCodex((prev) => upsertMany(prev, [data as unknown as CodexEntry])); break
      case 'scores': {
        const s = data as unknown as Score
        if (s.status === 'completed') {
          setScoreHistory((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
          setCurrentScore((prev) => (prev && prev.id === s.id ? null : prev))
        } else {
          setCurrentScore(s)
          setScoreHistory((prev) => prev.filter((x) => x.id !== s.id))
        }
        break
      }
    }
  }, [])

  const removeServerEntity = useCallback((table: ServerTable, id: string) => {
    switch (table) {
      case 'characters': setCharacters((prev) => prev.filter((c) => c.id !== id)); break
      case 'crews': setCrew((prev) => (prev && prev.id === id ? null : prev)); break
      case 'clocks': setClocks((prev) => prev.filter((c) => c.id !== id)); break
      case 'factions': setFactions((prev) => prev.filter((f) => f.id !== id)); break
      case 'map_tokens': setMapTokens((prev) => prev.filter((t) => t.id !== id)); break
      case 'media': setMedia((prev) => prev.filter((m) => m.id !== id)); break
      case 'codex': setCodex((prev) => prev.filter((e) => e.id !== id)); break
      case 'scores':
        setCurrentScore((prev) => (prev && prev.id === id ? null : prev))
        setScoreHistory((prev) => prev.filter((s) => s.id !== id))
        break
    }
  }, [])

  // Replace all local state from a freshly-fetched snapshot. Used for the
  // initial load and for the resync after a realtime reconnection.
  const hydrate = useCallback((data: CampaignData) => {
    setCharacters(data.characters)
    setCrew(data.crew)
    setClocks(data.clocks)
    setFactions(data.factions)
    setCurrentScore(data.currentScore)
    setScoreHistory(data.scoreHistory)
    setMapTokens(data.mapTokens)
    setMedia(data.media)
    setCodex(data.codex)
    setActiveCharacter((prev) => prev ?? (data.characters.find((c) => !c.deceased) ?? data.characters[0])?.id ?? null)
  }, [])

  const broadcast = useCallback((action: string, p: PutPayload | RemovePayload | PatchPayload) => {
    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'op',
        payload: { sender: sessionId, action, p },
      })
    } catch { /* realtime unavailable */ }
  }, [sessionId])

  // ── Persistence helpers (only the originating client writes) ──
  const onErr = (e: unknown) => { console.error('[bitd persist]', e) }
  const persistChars = useCallback((cs: Character[]) => { saveEntities('characters', campaignId, cs).catch(onErr) }, [campaignId])
  const persistCrew = useCallback((c: Crew) => { saveEntity('crews', campaignId, c).catch(onErr) }, [campaignId])
  const persistClocks = useCallback((cs: Clock[]) => { saveEntities('clocks', campaignId, cs).catch(onErr) }, [campaignId])
  const persistFactions = useCallback((fs: Faction[]) => { saveEntities('factions', campaignId, fs).catch(onErr) }, [campaignId])
  const persistScore = useCallback((s: Score) => { saveEntity('scores', campaignId, s).catch(onErr) }, [campaignId])
  const persistMedia = useCallback((ms: Media[]) => { saveEntities('media', campaignId, ms).catch(onErr) }, [campaignId])
  const persistCodex = useCallback((es: CodexEntry[]) => { saveEntities('codex', campaignId, es).catch(onErr) }, [campaignId])

  // Apply a single-field-set update locally, broadcast it to peers as a 'patch'
  // (they merge only these keys), and persist it via the merge_entity RPC so the
  // database row is field-merged rather than overwritten. This is the
  // concurrent-safe path used by all the live per-entity edits below.
  const commitPatch = useCallback((entity: EntityKind, id: string, patch: Record<string, unknown>) => {
    applyPatch(entity, id, patch)
    broadcast('patch', { entity, id, patch })
    mergeEntity(PATCH_TABLE[entity], campaignId, id, patch).catch(onErr)
  }, [applyPatch, broadcast, campaignId])

  // ── Public mutators ──
  const updateCharacter = useCallback((id: string, updates: Partial<Character>) => {
    if (!stateRef.current.characters.some((c) => c.id === id)) return
    commitPatch('character', id, updates as Record<string, unknown>)
  }, [commitPatch])

  const updateCrew = useCallback((updates: Partial<Crew>) => {
    const cur = stateRef.current.crew
    if (!cur) return
    commitPatch('crew', cur.id, updates as Record<string, unknown>)
  }, [commitPatch])

  const updateClock = useCallback((id: string, updates: Partial<Clock>) => {
    if (!stateRef.current.clocks.some((c) => c.id === id)) return
    commitPatch('clock', id, updates as Record<string, unknown>)
  }, [commitPatch])

  const addClock = useCallback((clock: Clock) => {
    const p = { clocks: [clock] }
    applyPut(p); broadcast('put', p); persistClocks([clock])
  }, [applyPut, broadcast, persistClocks])

  const deleteClock = useCallback((id: string) => {
    const p = { clockIds: [id] }
    applyRemove(p); broadcast('remove', p); deleteEntity('clocks', id).catch(onErr)
  }, [applyRemove, broadcast])

  const updateFaction = useCallback((id: string, updates: Partial<Faction>) => {
    if (!stateRef.current.factions.some((f) => f.id === id)) return
    commitPatch('faction', id, updates as Record<string, unknown>)
  }, [commitPatch])

  const addFaction = useCallback((faction: Faction) => {
    const p = { factions: [faction] }
    applyPut(p); broadcast('put', p); persistFactions([faction])
  }, [applyPut, broadcast, persistFactions])

  const deleteFaction = useCallback((id: string) => {
    const p = { factionIds: [id] }
    applyRemove(p); broadcast('remove', p); deleteEntity('factions', id).catch(onErr)
  }, [applyRemove, broadcast])

  // Media (GM-uploaded images/audio shared with the table).
  const addMedia = useCallback((item: Media) => {
    const p = { media: [item] }
    applyPut(p); broadcast('put', p); persistMedia([item])
  }, [applyPut, broadcast, persistMedia])

  const deleteMedia = useCallback((id: string) => {
    const p = { mediaIds: [id] }
    applyRemove(p); broadcast('remove', p); deleteEntity('media', id).catch(onErr)
  }, [applyRemove, broadcast])

  // Codex: shared free-form notes anyone can add/edit. Each note is its own row
  // (concurrent additions never clobber); edits field-merge via merge_entity.
  const addCodexEntry = useCallback((entry: CodexEntry) => {
    const p = { codex: [entry] }
    applyPut(p); broadcast('put', p); persistCodex([entry])
  }, [applyPut, broadcast, persistCodex])

  const updateCodexEntry = useCallback((id: string, updates: Partial<CodexEntry>) => {
    commitPatch('codex', id, updates as Record<string, unknown>)
  }, [commitPatch])

  const deleteCodexEntry = useCallback((id: string) => {
    const p = { codexIds: [id] }
    applyRemove(p); broadcast('remove', p); deleteEntity('codex', id).catch(onErr)
  }, [applyRemove, broadcast])

  // Map tokens: live drag sync runs on a dedicated channel inside GameMap
  // (throttled). Here we keep local state and persist on discrete events.
  const updateMapToken = useCallback((id: string, updates: Partial<MapToken>) => {
    setMapTokens((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }, [])

  const addMapToken = useCallback((token: MapToken) => {
    setMapTokens((prev) => (prev.some((t) => t.id === token.id) ? prev : [...prev, token]))
    saveEntity('map_tokens', campaignId, token).catch(onErr)
  }, [campaignId])

  const removeMapToken = useCallback((id: string) => {
    setMapTokens((prev) => prev.filter((t) => t.id !== id))
    deleteEntity('map_tokens', id).catch(onErr)
  }, [])

  const commitMapToken = useCallback((id: string) => {
    const t = stateRef.current.mapTokens.find((tok) => tok.id === id)
    if (t) saveEntity('map_tokens', campaignId, t).catch(onErr)
  }, [campaignId])

  // Apply a label/color edit to a chip and persist it immediately (unlike the
  // drag path, which persists only on pointer-up). Used by the chip editor.
  const editMapToken = useCallback((id: string, updates: Partial<MapToken>) => {
    const cur = stateRef.current.mapTokens.find((t) => t.id === id)
    if (!cur) return
    const next = { ...cur, ...updates }
    setMapTokens((prev) => prev.map((t) => (t.id === id ? next : t)))
    saveEntity('map_tokens', campaignId, next).catch(onErr)
  }, [campaignId])

  const setMapImageSynced = useCallback((url: string | null) => {
    const p = { mapImageUrl: url }
    applyPut(p); broadcast('put', p); setCampaignMap(campaignId, url).catch(onErr)
  }, [applyPut, broadcast, campaignId])

  const endScore = useCallback(() => {
    const resetChars = stateRef.current.characters.map((c) => (c.deceased ? c : resetForNewScore(c)))
    const resetScoreClocks = stateRef.current.clocks.filter((c) => c.scope === 'score').map((c) => ({ ...c, active: false }))
    const p: PutPayload = { characters: resetChars, clocks: resetScoreClocks }
    applyPut(p); broadcast('put', p)
    persistChars(resetChars); persistClocks(resetScoreClocks)
  }, [applyPut, broadcast, persistChars, persistClocks])

  const startScore = useCallback(() => {
    const score: Score = {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      title: 'New Score',
      target: null,
      plan_type: null,
      plan_detail: null,
      position: null,
      status: 'planning',
      outcome: null,
      payoff_coin: 0,
      rep_gained: 0,
      heat_gained: 0,
      notes: null,
      outcome_notes: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    }
    // Wipe ephemeral coin as the next score begins: cap the crew treasury and
    // every character's coin back to capacity, discarding any overflow that
    // wasn't spent or stashed during downtime. Bundled into the same atomic put
    // so it broadcasts to peers and persists alongside the new score.
    const crew = stateRef.current.crew
    const cappedCrew: Crew | null =
      crew && crew.coin > COIN_CAPACITY ? { ...crew, coin: COIN_CAPACITY } : null
    const cappedChars = stateRef.current.characters
      .filter((c) => !c.deceased && c.coin > COIN_CAPACITY)
      .map((c) => ({ ...c, coin: COIN_CAPACITY }))

    const p: PutPayload = { score }
    if (cappedCrew) p.crew = cappedCrew
    if (cappedChars.length) p.characters = cappedChars
    applyPut(p); broadcast('put', p)
    persistScore(score)
    if (cappedCrew) persistCrew(cappedCrew)
    if (cappedChars.length) persistChars(cappedChars)
  }, [applyPut, broadcast, persistScore, persistCrew, persistChars, campaignId])

  const updateScore = useCallback((updates: Partial<Score>) => {
    const cur = stateRef.current.currentScore
    if (!cur) return
    commitPatch('score', cur.id, updates as Record<string, unknown>)
  }, [commitPatch])

  const wrapScore = useCallback(() => {
    const score = stateRef.current.currentScore
    const crew = stateRef.current.crew
    const resetChars = stateRef.current.characters.map((c) => (c.deceased ? c : resetForNewScore(c)))
    const resetScoreClocks = stateRef.current.clocks.filter((c) => c.scope === 'score').map((c) => ({ ...c, active: false }))
    let newCrew: Crew | null = crew
    if (crew && score) {
      const totalHeat = crew.heat + score.heat_gained
      newCrew = {
        ...crew,
        coin: crew.coin + score.payoff_coin,
        rep: Math.min(12, crew.rep + score.rep_gained),
        heat: totalHeat % 9,
        wanted_level: Math.min(4, crew.wanted_level + Math.floor(totalHeat / 9)),
      }
    }
    // The wrapped score is kept as completed history, not deleted.
    const completed: Score | null = score
      ? { ...score, status: 'completed', completed_at: new Date().toISOString() }
      : null
    const p: PutPayload = { characters: resetChars, clocks: resetScoreClocks, score: null }
    if (completed) p.completedScore = completed
    if (newCrew) p.crew = newCrew
    applyPut(p); broadcast('put', p)
    persistChars(resetChars); persistClocks(resetScoreClocks)
    if (newCrew) persistCrew(newCrew)
    if (completed) persistScore(completed)
  }, [applyPut, broadcast, persistChars, persistClocks, persistCrew, persistScore])

  const abandonScore = useCallback(() => {
    const score = stateRef.current.currentScore
    const resetChars = stateRef.current.characters.map((c) => (c.deceased ? c : resetForNewScore(c)))
    const resetScoreClocks = stateRef.current.clocks.filter((c) => c.scope === 'score').map((c) => ({ ...c, active: false }))
    const p: PutPayload = { characters: resetChars, clocks: resetScoreClocks, score: null }
    applyPut(p); broadcast('put', p)
    persistChars(resetChars); persistClocks(resetScoreClocks)
    if (score) deleteEntity('scores', score.id).catch(onErr)
  }, [applyPut, broadcast, persistChars, persistClocks])

  // Retired original-game path. Current GM setup is server-confirmed and scoped.
  const resetGame = useCallback(() => {
    throw new Error('Legacy reset is retired. Use the reviewed Campaign setup controls.')
  }, [])

  // ── Load campaign data from Postgres ──
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadOrSeedCampaign(campaignId)
      .then((data) => {
        if (cancelled) return
        hydrate(data)
        setLoading(false)
      })
      .catch((e) => {
        console.error('[bitd load]', e)
        if (cancelled) return
        setLoadError('Could not load this campaign.')
        setLoading(false)
      })
    getCampaign(campaignId)
      .then((c) => { if (!cancelled && c) setMapImage(c.map_image_url) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [campaignId, hydrate])

  // ── Realtime channel: peer broadcasts + presence + DB changefeed ──
  // Three sync layers on one channel:
  //  • broadcast 'op'  — instant, low-latency peer sync + toasts (fast path)
  //  • postgres_changes — durable backstop so missed broadcasts still converge
  //  • presence        — who's online
  // On every (re)subscribe after the first we refetch a full snapshot, healing
  // any gap from a dropped connection (postgres_changes only flows while joined).
  useEffect(() => {
    let cancelled = false
    let subscribedOnce = false
    const ENTITY_TABLES: ServerTable[] = ['characters', 'crews', 'clocks', 'factions', 'scores', 'map_tokens', 'media', 'codex']

    const resync = () => {
      Promise.all([loadCampaignData(campaignId), getCampaign(campaignId)])
        .then(([data, camp]) => {
          if (cancelled) return
          hydrate(data)
          if (camp) setMapImage(camp.map_image_url)
        })
        .catch((e) => console.error('[bitd resync]', e))
    }

    let ch: ReturnType<typeof supabase.channel>
    try {
      ch = supabase.channel(`campaign:${campaignId}`, {
        config: { presence: { key: sessionId } },
      })
      channelRef.current = ch

      ch.on('broadcast', { event: 'op' }, ({ payload }) => {
        if (!payload || payload.sender === sessionId) return
        const p = (payload.p ?? {}) as PutPayload & RemovePayload & PatchPayload
        // Toast incoming changes that affect the party or my own character.
        const myCharId = seat.type === 'character' ? seat.id : null
        if (payload.action === 'put') {
          buildToasts(p, stateRef.current, myCharId).forEach(pushToast)
        } else if (payload.action === 'patch' && p.entity && p.id) {
          // Synthesize a put-shaped view of just this entity so the existing
          // toast logic (which diffs whole crew/character objects) still works.
          const synth: PutPayload = {}
          if (p.entity === 'crew' && stateRef.current.crew) {
            synth.crew = { ...stateRef.current.crew, ...p.patch }
          } else if (p.entity === 'character') {
            const cur = stateRef.current.characters.find((c) => c.id === p.id)
            if (cur) synth.characters = [{ ...cur, ...p.patch }]
          }
          buildToasts(synth, stateRef.current, myCharId).forEach(pushToast)
        }
        applyAction(payload.action as string, p)
      })

      // DB changefeed for every campaign-scoped entity table.
      for (const table of ENTITY_TABLES) {
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'bitd', table, filter: `campaign_id=eq.${campaignId}` },
          (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
            if (payload.eventType === 'DELETE') {
              const id = payload.old?.id as string | undefined
              if (id) removeServerEntity(table, id)
            } else {
              const row = payload.new
              const data = row?.data as { id: string; status?: string } | undefined
              if (data?.id) upsertServerEntity(table, data, row?.updated_at as string | undefined)
            }
          },
        )
      }
      // Campaign row carries the shared map image URL.
      ch.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'bitd', table: 'campaigns', filter: `id=eq.${campaignId}` },
        (payload: { new?: Record<string, unknown> }) => {
          setMapImage((payload.new?.map_image_url as string | null) ?? null)
        },
      )

      ch.on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState() as Record<string, Array<{ seat: string; name: string; sessionId: string }>>
          const players = Object.values(state).flat().map((m) => ({ seat: m.seat, name: m.name, sessionId: m.sessionId }))
          setOnlinePlayers(players)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            try {
              ch.track({ seat: seatKey(seat), name: seat.name, sessionId })
            } catch { /* ignore */ }
            // First join is covered by the initial load effect; later rejoins
            // (after a dropped socket) need a snapshot refetch to fill the gap.
            if (subscribedOnce) resync()
            subscribedOnce = true
          }
        })
      return () => { cancelled = true; ch.unsubscribe() }
    } catch {
      return () => { cancelled = true /* realtime unavailable */ }
    }
  }, [campaignId, sessionId, seat, applyAction, pushToast, hydrate, upsertServerEntity, removeServerEntity])

  return (
    <GameContext.Provider
      value={{
        loading, loadError, campaignId, onlinePlayers,
        role, setRole,
        characters, updateCharacter,
        crew, updateCrew,
        clocks, updateClock, addClock, deleteClock,
        factions, updateFaction, addFaction, deleteFaction,
        activeCharacterId, setActiveCharacter,
        mapTokens, updateMapToken, addMapToken, removeMapToken, commitMapToken, editMapToken,
        mapImageUrl, setMapImage: setMapImageSynced,
        endScore,
        currentScore, scoreHistory, startScore, updateScore, wrapScore, abandonScore,
        media, addMedia, deleteMedia,
        codex, addCodexEntry, updateCodexEntry, deleteCodexEntry,
        resetGame,
      }}
    >
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </GameContext.Provider>
  )
}

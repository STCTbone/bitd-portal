import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CharacterSheet } from '@/components/CharacterSheet'
import { CrewSheet } from '@/components/CrewSheet'
import { CodexPanel } from '@/components/CodexPanel'
import { ClockDashboard } from '@/components/ClockDashboard'
import { FactionTracker } from '@/components/FactionTracker'
import { Overview } from '@/components/Overview'
import { CharacterAvatar } from '@/components/CharacterAvatar'
import { CampaignMap } from '@/components/CampaignMap'
import { ScorePanel } from '@/components/ScorePanel'
import { LoginGate } from '@/components/LoginGate'
import { CampaignLobby } from '@/components/CampaignLobby'
import { useGame } from '@/lib/store'
import { SessionProvider, useSession } from '@/lib/session'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn, displayName } from '@/lib/utils'
import { Shield, Users, Clock, Swords, Eye, EyeOff, Plus, Home, Map, Target, Loader2, LogOut, TrendingUp, Flame, Coins, Wrench, RotateCcw, BookOpen, Skull } from 'lucide-react'
import type { Clock as ClockType, ClockScope, Character } from '@/lib/types'
import type { OnlinePlayer } from '@/lib/store'

function OnlinePlayers({ players, characters }: { players: OnlinePlayer[]; characters: Character[] }) {
  // de-dupe by seat (a seat may briefly appear twice during reconnects)
  const seen = new Set<string>()
  const unique = players.filter((p) => (seen.has(p.seat) ? false : (seen.add(p.seat), true)))
  if (unique.length === 0) return null
  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      {unique.slice(0, 6).map((p) => {
        if (p.name === 'Game Master') {
          return (
            <div
              key={p.seat}
              title="Game Master (online)"
              className="flex h-6 items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 text-[11px] font-medium text-green-700 dark:text-green-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              GM
            </div>
          )
        }
        // seat is the character id — prefer the character's nickname (alias)
        const char = characters.find((c) => c.id === p.seat)
        const label = char?.alias || p.name.split(' ')[0]
        return (
          <div
            key={p.seat}
            title={`${p.name} (online)`}
            className="flex h-6 items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 text-[11px] font-medium text-green-700 dark:text-green-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {label}
          </div>
        )
      })}
    </div>
  )
}

export function AppContent() {
  const {
    loading, loadError, onlinePlayers,
    campaignId,
    role,
    characters, updateCharacter,
    crew, updateCrew,
    clocks, updateClock, addClock, deleteClock,
    factions, updateFaction, addFaction, deleteFaction,
    activeCharacterId, setActiveCharacter,
    currentScore,
    media, addMedia, deleteMedia,
    endScore,
    resetGame,
  } = useGame()
  const { session, releaseSeat } = useSession()

  const [newClockOpen, setNewClockOpen] = useState(false)
  const [newClockName, setNewClockName] = useState('')
  const [newClockSegments, setNewClockSegments] = useState('4')
  const [newClockScope, setNewClockScope] = useState<ClockScope>('score')
  const [newClockVisible, setNewClockVisible] = useState(true)

  const [activeTab, setActiveTab] = useState('overview')
  const [resetConfirm, setResetConfirm] = useState(false)

  const isGM = role === 'gm'
  const setupMode = !!crew?.setup_mode
  const activeCharacter = characters.find((c) => c.id === activeCharacterId)
  // The character tied to this client's claimed seat (null for the GM seat).
  const mySeatCharId = session?.seat?.type === 'character' ? session.seat.id : null
  const visibleClocks = isGM ? clocks : clocks.filter((c) => c.visible_to_players)

  function navigateToCharacter(id: string) {
    setActiveCharacter(id)
    setActiveTab('characters')
  }

  function handleAddClock() {
    const clock: ClockType = {
      id: crypto.randomUUID(),
      campaign_id: session?.campaignId ?? 'demo',
      name: newClockName || 'New Clock',
      segments: parseInt(newClockSegments),
      filled: 0,
      clock_type: 'general',
      scope: newClockScope,
      visible_to_players: newClockVisible,
      active: true,
      notes: null,
      created_at: new Date().toISOString(),
    }
    addClock(clock)
    setNewClockName('')
    setNewClockSegments('4')
    setNewClockScope('score')
    setNewClockVisible(true)
    setNewClockOpen(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading campaign…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-destructive">{loadError}</p>
        <Button variant="outline" onClick={releaseSeat}>Back</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight">
              {session?.campaignName ?? 'Blades in the Dark'}
            </h1>
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
              isGM ? 'bg-amber-500/15 text-amber-600' : 'bg-blue-500/15 text-blue-600',
            )}>
              {isGM ? 'GM' : 'Player'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <OnlinePlayers players={onlinePlayers} characters={characters} />
            {isGM && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant={setupMode ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  title="Toggle campaign-wide Setup Mode. While on, players can freely edit their own character sheets."
                  onClick={() => updateCrew({ setup_mode: !setupMode })}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Setup {setupMode ? 'On' : 'Off'}</span>
                </Button>
                {resetConfirm ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => { resetGame(); setResetConfirm(false) }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Confirm Reset
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setResetConfirm(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    title="Delete all characters (players rebuild via the character creator) and reset the crew's tier, rep, heat, wanted, coin, XP, abilities, upgrades, and claims to a fresh setup. Does not touch the crew's name/type, clocks, scores, factions, or the map."
                    onClick={() => setResetConfirm(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Reset</span>
                  </Button>
                )}
              </div>
            )}
            <div className="hidden text-sm md:block">
              <span className="text-muted-foreground">You: </span>
              <span className="font-medium">{session?.seat?.name}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={releaseSeat}>
              <LogOut className="h-3.5 w-3.5" />
              Switch
            </Button>
          </div>
        </div>
      </header>

      {/* Setup Mode banner — visible to everyone, synced via the crew flag */}
      {setupMode && (
        <div className="border-b border-amber-500/40 bg-amber-500/10">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Wrench className="h-3.5 w-3.5 shrink-0" />
            Setup Mode — characters are freely editable.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Compact crew status bar — persistent across tabs */}
        {crew && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-card px-3 py-1.5">
            <button
              onClick={() => setActiveTab('crew')}
              className="text-sm font-bold hover:underline"
            >
              {crew.name}
            </button>
            {crew.crew_type && (
              <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase capitalize text-muted-foreground">
                {crew.crew_type}
              </span>
            )}
            {crew.reputation && <span className="text-xs text-muted-foreground">{crew.reputation}</span>}
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex items-center gap-1 text-xs" title="Tier">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-bold tabular-nums">{crew.tier}</span>
                <span className={cn(
                  'rounded px-1 py-0.5 text-[10px] font-medium',
                  crew.hold === 'strong' ? 'bg-green-500/15 text-green-700' : 'bg-yellow-500/15 text-yellow-700',
                )}>
                  {crew.hold}
                </span>
              </span>
              <span className="flex items-center gap-1 text-xs" title="Reputation">
                <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                <span className="font-bold tabular-nums">{crew.rep}</span>
                <span className="text-muted-foreground">/12</span>
              </span>
              <span className="flex items-center gap-1 text-xs" title="Heat">
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                <span className={cn('font-bold tabular-nums', crew.heat > 5 && 'text-orange-600')}>{crew.heat}</span>
                <span className="text-muted-foreground">/9</span>
              </span>
              {crew.wanted_level > 0 && (
                <span className="text-xs font-bold text-red-600" title="Wanted level">
                  Wanted {crew.wanted_level}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs" title="Coin">
                <Coins className="h-3.5 w-3.5 text-yellow-600" />
                <span className="font-bold tabular-nums text-yellow-700">{crew.coin}</span>
              </span>
            </div>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <Home className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="characters" className="gap-1.5">
              <Users className="h-4 w-4" />
              Characters
            </TabsTrigger>
            <TabsTrigger value="score" className="gap-1.5">
              <Target className="h-4 w-4" />
              Score
              {currentScore && (
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  currentScore.status === 'active' ? 'bg-red-500' : 'bg-amber-500',
                )} />
              )}
            </TabsTrigger>
            <TabsTrigger value="crew" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Crew
            </TabsTrigger>
            <TabsTrigger value="codex" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              Codex
            </TabsTrigger>
            <TabsTrigger value="clocks" className="gap-1.5">
              <Clock className="h-4 w-4" />
              Clocks
            </TabsTrigger>
            <TabsTrigger value="factions" className="gap-1.5">
              <Swords className="h-4 w-4" />
              Factions
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-1.5">
              <Map className="h-4 w-4" />
              Map
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <Overview
              characters={characters}
              crew={crew}
              clocks={visibleClocks}
              factions={isGM ? factions : undefined}
              currentScore={currentScore}
              media={media}
              campaignId={campaignId}
              isGM={isGM}
              onCharacterClick={navigateToCharacter}
              onCharacterUpdate={updateCharacter}
              onCrewUpdate={updateCrew}
              onClockUpdate={updateClock}
              onEndScore={endScore}
              onAddMedia={addMedia}
              onDeleteMedia={deleteMedia}
            />
          </TabsContent>

          {/* Characters Tab */}
          <TabsContent value="characters">
            <div className="mb-4 flex flex-wrap gap-2">
              {characters.filter((c) => !c.deceased).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCharacter(c.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium leading-tight transition-colors',
                    activeCharacterId === c.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted hover:border-primary/50',
                  )}
                >
                  <CharacterAvatar character={c} size="sm" />
                  <span className="flex flex-col items-start">
                    <span>
                      {displayName(c.name, c.alias)}
                      {c.playbook && (
                        <span className="ml-1.5 text-xs opacity-70">({c.playbook})</span>
                      )}
                    </span>
                    {c.player_name && (
                      <span className="mt-0.5 text-[11px] font-normal opacity-60">{c.player_name}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {/* Graveyard — fallen characters, with their cause of death */}
            {characters.some((c) => c.deceased) && (
              <div className="mb-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Skull className="h-3.5 w-3.5" />
                  Graveyard
                </h3>
                <div className="flex flex-wrap gap-2">
                  {characters.filter((c) => c.deceased).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCharacter(c.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm leading-tight transition-colors',
                        activeCharacterId === c.id
                          ? 'border-red-500/60 bg-red-500/10'
                          : 'border-muted hover:border-red-500/40',
                      )}
                    >
                      <span className="opacity-60">
                        <CharacterAvatar character={c} size="sm" />
                      </span>
                      <span className="flex flex-col items-start">
                        <span className="font-medium text-muted-foreground line-through decoration-1">
                          {displayName(c.name, c.alias)}
                        </span>
                        <span className="mt-0.5 text-[11px] font-normal text-red-600/80">
                          † {c.cause_of_death?.trim() || 'Cause unknown'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeCharacter && (
              <CharacterSheet
                character={activeCharacter}
                onUpdate={(updates) => updateCharacter(activeCharacter.id, updates)}
                isGM={isGM}
                readonly={!isGM && activeCharacter.id !== mySeatCharId}
              />
            )}
          </TabsContent>

          {/* Score Tab */}
          <TabsContent value="score">
            <ScorePanel isGM={isGM} />
          </TabsContent>

          {/* Crew Tab */}
          <TabsContent value="crew">
            {crew && (
              <CrewSheet
                crew={crew}
                onUpdate={updateCrew}
                readonly={!isGM}
              />
            )}
          </TabsContent>

          {/* Codex Tab */}
          <TabsContent value="codex">
            <CodexPanel />
          </TabsContent>

          {/* Clocks Tab */}
          <TabsContent value="clocks">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Progress Clocks</h2>
              {isGM && (
                <Dialog open={newClockOpen} onOpenChange={setNewClockOpen}>
                  <DialogTrigger
                    render={<Button size="sm" className="gap-1" />}
                  >
                    <Plus className="h-4 w-4" />
                    Add Clock
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Clock</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={newClockName}
                          onChange={(e) => setNewClockName(e.target.value)}
                          placeholder="Clock name..."
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Segments</Label>
                        <Select value={newClockSegments} onValueChange={(v) => { if (v) setNewClockSegments(v) }}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4">4 segments</SelectItem>
                            <SelectItem value="6">6 segments</SelectItem>
                            <SelectItem value="8">8 segments</SelectItem>
                            <SelectItem value="12">12 segments</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Scope</Label>
                        <div className="mt-1 flex gap-2">
                          {(['score', 'long-term'] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setNewClockScope(s)}
                              className={cn(
                                'rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                                newClockScope === s
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-muted-foreground/30',
                              )}
                            >
                              {s === 'score' ? 'Score' : 'Long-term'}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {newClockScope === 'score'
                            ? 'Cleared when the score ends.'
                            : 'Persists across sessions.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setNewClockVisible(!newClockVisible)}
                          className={cn(
                            'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                            newClockVisible
                              ? 'border-green-500/50 bg-green-500/10'
                              : 'border-red-500/50 bg-red-500/10',
                          )}
                        >
                          {newClockVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          {newClockVisible ? 'Visible to players' : 'GM only'}
                        </button>
                      </div>
                      <Button onClick={handleAddClock} className="w-full">
                        Create Clock
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <ClockDashboard
              clocks={visibleClocks}
              onUpdate={updateClock}
              onDelete={isGM ? deleteClock : undefined}
              isGM={isGM}
            />
          </TabsContent>

          {/* Factions Tab */}
          <TabsContent value="factions">
            <FactionTracker
              factions={factions}
              onUpdate={updateFaction}
              onAdd={isGM ? addFaction : undefined}
              onDelete={isGM ? deleteFaction : undefined}
              readonly={!isGM}
            />
          </TabsContent>

          {/* Map Tab */}
          <TabsContent value="map">
            <CampaignMap />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function Root() {
  const { session, loading } = useSession()
  if (loading) return <main className="access-page" role="status">Restoring campaign access…</main>
  if (!session) return <LoginGate />
  return <CampaignLobby key={`${session.campaignId}:${session.role}`} />
}

export default function App() {
  return (
    <TooltipProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </TooltipProvider>
  )
}

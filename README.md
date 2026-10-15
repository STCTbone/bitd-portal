# Blades ’68 campaign portal

A dedicated adaptation of the [Doskvol Portal](https://github.com/bsxp/bitd-portal) for our group's fresh Blades ’68 campaigns. Campaign creation, no-email identity, separate player/secret-GM invitations, and backend-enforced membership are implemented. The remaining character, crew, cycle, faction, clock, map, notes, and media modules are retained for the feature migrations described by [spec #1](https://github.com/STCTbone/bitd-portal/issues/1).

The application lives in [`app/`](app/). Follow [`app/README.md`](app/README.md) for reproducible local startup, tests, and the current backend contract.

---

## Retained upstream features awaiting adaptation

- **Characters** — full scoundrel sheets: the 12 action ratings, stress & trauma, harm & healing clock, armor, load & gear, coin/stash, the four XP tracks, special abilities (per playbook), contacts, and notes. Tracks who's playing each character ("Played by").
- **Crew** — crew type, tier & hold, rep, heat, wanted level, treasury, special abilities, upgrades, and claims (the per-crew-type claims map).
- **Scores** — run a heist through its lifecycle (planning → active → completed): target, plan & engagement position, payoff, heat/rep, and score-scoped clocks.
- **Clocks** — progress clocks (4/6/8/12 segments), long-term or score-scoped. The GM controls whether each is visible to players.
- **Factions** — the canonical Doskvol factions pre-loaded, with the −3…+3 status scale, tier, hold, and notes.
- **Map** — a draggable token/chip board over an uploadable map image of the city.
- **Overview** — an at-a-glance dashboard pulling the most important status from every section.

### Roles

Campaign creation grants the creator GM membership on the server. A player invitation grants player membership; a separate secret invitation grants GM membership. Browser seat selection is a UI choice and cannot grant authority. Unconverted feature modules are not mounted and their backend access is denied until they receive explicit authorization contracts.

---

## Tech stack

- **React 19** + **TypeScript**, bundled with **Vite**
- **Tailwind CSS v4** + **shadcn/ui** components, **lucide-react** icons
- **Supabase** (Postgres + Realtime) for storage and live sync
- Path alias `@/` → `app/src/`

State is held in a React context (`GameProvider`); there's no page router — the top-level views are tabs.

### Retained upstream sync design

Each campaign uses one Supabase Realtime channel with three layers:

1. **Broadcast** — instant fire-and-forget ops to peers for snappy updates.
2. **Postgres changefeed** — a durable backstop so a client that missed a broadcast still converges; an `updated_at` guard prevents stale echoes from reverting newer writes.
3. **Presence** — tracks who's online and which seat they hold.

Every entity (`characters`, `crews`, `factions`, `clocks`, `scores`, `map_tokens`) is one row in the Supabase `bitd` schema with a JSONB `data` column holding the full typed object. Field-level edits go through a `merge_entity` RPC that does a server-side shallow JSONB merge, so two people editing different fields of the same record don't clobber each other.

Fresh Blades ’68 campaigns never seed automatically. The upstream sync description above describes retained source modules; those modules stay inactive until their backend authorization and ’68 adaptations are complete.

---

## Running locally

Use the reproducible local Supabase setup and verification commands in [`app/README.md`](app/README.md). The fork's campaign-access flow uses no-email identities and separate player/secret-GM invitations. Fresh campaigns remain empty. Legacy feature editors are being migrated ticket by ticket behind backend authorization; the current entry point does not mount those editors.

## Deployment

Hosted on **AWS Amplify**, configured by [`amplify.yml`](amplify.yml). Amplify builds from the `app/` subdirectory: it runs `npm ci`, writes any `VITE_*` console variables into `.env` so Vite can inline them, runs `npm run build`, and publishes `app/dist`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Amplify console before deploying. Pushing to `main` triggers a build.

---

## Project layout

```
app/
  src/
    components/        # top-level views: Overview, CharacterSheet, CrewSheet,
                       # FactionTracker, ClockDashboard, GameMap, ScorePanel,
                       # CharacterCreate, LoginGate
      trackers/        # focused sub-widgets (stress, harm, XP, clocks, coin, …)
      ui/              # shadcn/ui primitives
    lib/
      supabase.ts      # Supabase client (bitd schema)
      db.ts            # saveEntity / mergeEntity / load helpers
      store.tsx        # GameProvider context + realtime wiring
      session.tsx      # join-code auth, seats, presence
      types.ts         # entity types + game enums
      game-data.ts     # canonical factions, playbook/crew abilities, XP triggers
      demo-data.ts     # starter campaign seed
  supabase/            # schema / RPC reference
```

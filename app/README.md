# Blades ’68 portal development

This fork targets fresh Blades ’68 campaigns. The initial campaign-access slice is live; legacy feature editors remain in the source for subsequent ticket migrations and are not mounted. Unconverted backend tables deny reads and writes, storage is private, and legacy durable broadcast consumers are inactive.

## Local startup

Prerequisites: Node 22.12+ (tested with 22.16), npm, and running Docker Desktop. No hosted Supabase account is needed. The first start downloads the pinned CLI's local images.

```sh
cd app
npm ci
npm run backend:start
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Create a campaign, then copy the appropriate invitation to a separate browser profile/context. Creation grants GM membership. Player invitations grant player membership; a secret GM invitation grants GM membership. Campaigns start empty.

The startup command applies versioned migrations and configures local Realtime to accept only private channels. It writes only the local API URL and public anonymous key to ignored `.env.local`. The CLI creates its Realtime tenant after migrations, so `scripts/configure-local.mjs` applies `private_only` afterward and invalidates the tenant cache. Run the full `backend:start` command after Docker/container restarts; do not bypass that configuration by using bare `supabase start`. All unconverted private channels are denied until a feature adds an explicit authorization policy.

```sh
npm run backend:reset  # Deletes this local project's data; reapplies migrations and transport settings.
npm run backend:stop
```

There is intentionally no automatic seed. Do not run the obsolete `supabase/migration.sql`; it documents the incompatible upstream model. The authoritative fresh setup is `supabase/config.toml` plus `supabase/migrations/`.

Anonymous identity credentials live in the browser's Supabase auth storage. Reload verifies the selected campaign against current server membership. Switching campaigns preserves identity. Clearing browser data loses that identity; an invitation can establish new membership, while character-ownership recovery is a separate feature. An invitation is a reusable bearer secret, so distribute the GM invitation only to GMs.

## Verification

```sh
npx playwright install chromium
npm run test:e2e
npm run build
npm run lint
```

Tests use real local Supabase and independent browser contexts, never mocks or a hosted database. They create fresh campaigns and check creation, both invitation roles, invalid invitations, reload, browser tampering, direct API forgery/isolation, unconverted legacy writes/storage, and realtime denial. The public API checks cannot run against an empty external service: start the committed local stack first. Existing unrelated lint failures in legacy editors are recorded in the implementation handoff.

## Concurrent worktrees

Never reset a shared backend while another worktree is using it. Each independent worktree can change its local `supabase/config.toml` project ID to a unique identifier (for example `bitd-ticket3`) and add a distinct offset to all three backend ports (`api.port`, `db.port`, `db.shadow_port`), then select a distinct frontend port and update `auth.site_url` accordingly. Example backend ports for offset 100: API 54421, DB 54422, shadow 54420. Use a unique frontend port such as 5273 and set `auth.site_url` to `http://127.0.0.1:5273`.

Then run `npm run backend:start` in that worktree; the configurator derives Docker container names from its project ID and writes the matching local API environment. Run tests with `PORTAL_PORT=5273 npm run test:e2e`, or development with `npm run dev -- --host 127.0.0.1 --port 5273 --strictPort`. Keep these per-worktree overrides out of commits; commit the canonical default configuration. An orchestrator may instead serialize migrations/tests against one local instance.

## Backend contract for subsequent slices

- `create_campaign(p_name)` and `join_campaign(p_invitation)` return `{id,name,role}` after granting membership to `auth.uid()`.
- `campaign_role(p_campaign)` returns only the caller's current role; `get_campaign_invitations(p_campaign)` returns `{player,gm}` only for a GM.
- Ordinary campaign rows contain no invitations. Membership reads expose only the caller's membership. No browser-supplied seat, user metadata, or role grants authority.
- Each unconverted JSONB entity table has `id`, `campaign_id`, `owner_id`, `data`, and `updated_at`, with RLS enabled and no access policy. Later migrations must add explicit safe read contracts and protected mutation RPCs. Do not restore arbitrary upsert/merge grants or trust durable peer broadcasts.
- `SessionProvider` exposes server-derived `role`/`userId`, campaign selection, and membership refresh. `CampaignLobby` is the authenticated feature entry. `Seat` is a UI selection only; it is never authorization.
- Realtime and storage access policies are separate from table RLS. The `maps` bucket is private and has no upload/read grants until its feature migration.

Local configuration follows [Supabase CLI configuration](https://supabase.com/docs/guides/local-development/cli/config) and [anonymous identities](https://supabase.com/docs/guides/auth/auth-anonymous). The private-only tenant cache operation is pinned to the [Realtime source shipped by this CLI](https://github.com/supabase/realtime/blob/v2.143.4/lib/realtime/tenants/cache.ex).

## Faction dossiers

Campaign creation still adds no factions. A GM can deliberately initialize the 56-faction **Blades ’68 Player Gazette v4 (June 2026)** roster once the faction list is empty. Defaults preserve that source's Tier/Hold, provide brief original reference summaries, and start crew status at neutral. The Gazette and full-book faction lists differ in places; this roster explicitly uses the current player reference. Campaign edits are records of table decisions, with no automatic change to character backing relationships.

GMs manage public descriptions, Tier, Hold, crew status, known information and the roster. Every campaign participant can edit shared notes. GM-private notes live separately from all player-readable faction data. A GM must explicitly enter the selected text and publish it to Known information. Editing Known information withdraws it from current views, but cannot make a participant forget already-read content.

Faction updates use version-checked, field-limited RPCs. Concurrent stale edits are rejected instead of silently replacing newer notes. The interface retains the draft and offers a reload; a rejected save is visibly marked. Table writes cannot bypass these contracts. Snapshot replacement polls authorized reads every two seconds and refetches on focus/reconnect. This removes deleted or newly forbidden records and clears a GM notebook when authorization fails; previously authorized in-flight responses may take a poll interval to reconcile. Neither public nor private faction tables enter raw realtime publications, and no durable faction state is sent through peer broadcasts. No faction snapshots are stored in browser persistence.
## Character dossiers

The authenticated campaign workspace now supports Hound dossiers. Campaign members may read shared dossiers; their owner and the GM may edit or delete them. A GM may explicitly leave a new character unclaimed; a campaign member can claim it once. Claiming an already-owned character does not transfer ownership. Recovery/reassignment belongs to its separate feature.

Identity, action ratings, abilities, pet records, relationships and notes persist through protected RPCs. The Hound baseline is the official playbooks v6 and the supplied Blades ’68 v1.0.1 book, pp.22–28. Creation guidance is visible, while action and ability adjustments remain deliberate records. Hound starts with Survey1/Consort2; no original Hound defaults or original-game ability descriptions are used. The current sheet's two-close-friend suggestion and the older creation reference's one-close-friend suggestion are identified without enforcing a count.

- `create_character(p_campaign,p_name,p_unclaimed=false,p_playbook='Hound')` derives campaign membership and ownership on the server.
- `claim_character(p_character)` atomically claims an unowned campaign character; `delete_character(p_character)` requires owner or GM.
- `patch_character(p_character,p_patch)` accepts only explicit dossier keys. It rejects arbitrary metadata, campaign/owner/role/playbook changes, invalid action names/ratings, and unknown ability/pet fields. Future character tickets extend the validator deliberately rather than reopening generic writes.
- Reads return `{id,campaign_id,owner_id,data,updated_at}` under membership RLS. Column metadata is immutable to ordinary table writes. Each patch locks the current row, merges only submitted fields, and merges individual `actions`, `pet`, `harm`, `healing`, `loadout`, `armor`, `wealth` and `xp` keys so distinct concurrent edits survive. Relationship and Versatile lists are each a single edited field; competing edits to the same list use the last accepted save.
- The character boundary fetches authorized snapshots every second and on focus/reconnect. It never accepts durable peer broadcasts. Failed text drafts stay visible with saved-value comparison, retry and discard; selection failures show the last accepted state. Other feature editors remain unmounted until converted.

Character browser/API tests cover GM plus two player identities, ownership and cross-campaign denial, explicit claims, nested concurrent updates, source-specific Hound choices, live followers, rejected/offline saves, retry/discard, reload, deletion and a390px responsive viewport.

### Character condition records

Character dossiers track Keys (up to three hits each), separate Deadlocks with former-Key notes, Stress, four Harm levels, and a four-segment healing clock with recovery notes. Owners and GMs draft these edits, review the saved/proposed values, then explicitly confirm. Saturated tracks never silently clear Stress, award XP, remove Harm, retire a character, or alter action ratings. Recovery, crisis, survival, resistance and retirement remain deliberate table decisions. Sources: baseline playbooks v6 and the user-supplied Blades ’68 v1.0.1, pp.152–157,169–170; Get Back In There p.84.

Ordinary sheets have nine Stress, four combined Key/Deadlock slots and Harm slots L1×2/L2×2/L3×1/L4×1. A GM can confirm a fifth Key slot for a published crew upgrade, recording its source; capacity cannot be reduced below occupied slots. Get Back In There supports one permanent healing segment, recorded distinctly from ordinary progress. On the Hound sheet, record its name in a Versatile ability before marking that segment. All these writes retain character-owner/GM authorization; capacity metadata cannot be changed through arbitrary dossier patches.

For future character slices, the condition migration composes validation with the existing identity validator and merges Harm levels/healing subfields at the locked current row. Extend that chain and the playbook-specific defaults deliberately; do not replace a validator with a stale full copy. Keys and Deadlocks are each atomic list fields; competing saves to the same list use the last accepted write. Different Harm levels and healing subfields merge independently. Rejected drafts remain visible for retry or discard while other participants continue seeing saved state.

## Common crew dossier

Campaign members can read the single shared crew. Current GM membership is required to create it or change it; direct table writes remain denied even to a GM. Creation explicitly chooses one of the six Blades ’68 types and starts at Tier 0, strong Hold, 0 Rep, and 2 stacks (book v1.0.1, p. 88). The form records changes deliberately; it does not infer advancement, tithe payments, faction changes, or resource resets.

`create_crew(p_campaign, p_name, p_type)` returns the saved crew. `update_crew(p_campaign, p_patch, p_expected)` accepts only common dossier fields and requires exactly the edited keys in `p_expected`, containing their values when editing began. Under a row lock, disjoint edits merge; a stale edit to the same field returns a conflict. Read rows include a server `revision`. The browser shows only accepted snapshots while retaining unsaved field drafts, displays failed/conflicting saves, and offers an explicit reload that discards drafts. Permitted snapshots refresh every 1.8 seconds and immediately on focus/online; private peer broadcasts never supply durable data. Read requests begun before an accepted mutation cannot replace it.

Crew abilities, upgrades, claims, cohorts, and crew-specific records are separate subsequent slices. Their migrations must extend the crew field validator rather than restore arbitrary JSON writes.

## Campaign clocks

The GM can create, edit, complete, reopen, share/unshare and remove clocks. New clocks are hidden by default. Available sizes 4/6/8/10/12 reflect Blades ’68 v1.0.1 examples (pp.166,173,191), including 10-segment Imperial Mandates. Progress, active state and campaign/score scope are independent deliberate records. Complete fills the current size and marks the clock inactive; it applies no Wanted, payout, faction or other consequences. Score selection/linking enters with the score workspace.

- Clock rows use membership/visibility RLS; hidden rows are absent from player reads even when the identifier is known. Outsiders and other campaigns receive no rows. Direct table writes are revoked, including for GMs.
- `create_clock(p_campaign,p_data)` validates an explicit clock shape and requires current GM membership. Data fields are name, notes, segments, progress, scope (`campaign`/`score`), active, visible_to_players and nullable scoreId. A nonnull scoreId must belong to the same campaign and use score scope. No score is required to record an unlinked score-scoped clock.
- `update_clock(p_clock,p_patch,p_expected)` checks exactly the edited fields against their saved values under a row lock, merges disjoint edits and rejects stale same-field changes. Metadata and unknown fields cannot be patched. Whole progress must stay between zero and size. `delete_clock(p_clock,p_revision)` rejects stale deletions. Server revisions/timestamps identify accepted state.
- Connected views replace authorized snapshots every1.2seconds and on focus/online; older responses cannot restore a row after a newer snapshot or mutation. Successful unshare/delete removes it from current player state. Player views conceal the last snapshot while reads fail and reconcile on reconnect; GM drafts survive failed saves/reads until deliberate retry or reload. Nothing caches clock rows in browser storage. Previously shared content already received by a participant cannot be withdrawn from that participant's historical network logs.
- No clock contents, old rows or deletes enter a participant broadcast or Postgres publication; clocks are explicitly excluded from `supabase_realtime`. Existing private-only transport and denied unconverted-topic policies remain intact. API reads always recheck current permissions; polling supplies collaboration without a secret-bearing subscription.

Clock behavior tests exercise GM/player/outsider/second-campaign APIs, both public/private channel denial with explicit reasons, complete lifecycle, visibility transitions, stale/disjoint concurrent edits, atomic rejection, real delayed-response races, offline failure/retry, reload and390px layout.


### Character equipment, wealth and advancement

Owners and GMs can draft, review and confirm Quiet/Loud load, equipment quantities/load/uses, worn/totaled Armor, sourced limited resources, wallet stacks, bank and four XP tracks. The current ordinary baseline is Quiet3/Loud6, wallet4/bank40, playbook XP8/attribute XP6. The Hound inventory includes verified v6 item costs, including zero-load italic items, and the two-use Tenacity record. RF radio handset defaults to the current nonitalic v6 listing (1 load); book25 explicitly lists0, and that discrepancy is visible with manual correction. Source guidance describes repeated ordinary Armor reduction, acquired/invented one-use Light Armor, banking and deliberate advancement; the book160/v6-sheet discrepancy in XP placement remains visible. Listed load may be exceeded when recording a sourced table exception; the interface flags it for review. Inventory Armor is recorded in its dedicated section to avoid counting it twice.

Only confirmed entered values are saved. Full tracks, changed load choices and resource marks do not spend money, clear tracks, add action dots/abilities, reduce Harm, restore equipment or start a new cycle. The existing action/ability editors remain deliberate owner/GM corrections. The old original-game automatic sheets and store are unmounted. Nested different-field edits survive; equipment and resource arrays are each atomic lists, so coordinate competing edits to the same list. Rejected/offline drafts remain visible for retry or discard while everyone else sees accepted records.

`character_playbooks` holds migration-owned definitions (`name`, `defaults`, `rules`); authenticated callers can read them but cannot change them, even as GM. The only creation signature is `create_character(uuid,text,boolean,text)`; its final two arguments default to false/Hound, preserving existing named-argument calls without an ambiguous overload. `character_00_playbook_defaults` applies the selected definition before the existing condition defaults. Protected saved `sheet` metadata supplies the UI, while validation selects authoritative rules using the stored playbook. Rules also supply `actionMax` and per-level `harmSlots`; Hound exercises four-dot correction and the ordinary 2/2/1/1 Harm shape. Later definitions can supply their verified shape without replacing shared Hound validators; conditional ability exceptions still require their own final-state checks. Later playbooks insert their own definition rows and extend specialized validation/defaults deliberately; they must preserve the complete existing validation chain and final-state triggers. No renamed granted creation helper remains callable.

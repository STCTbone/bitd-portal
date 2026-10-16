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

- `create_character(p_campaign,p_name,p_unclaimed=false)` derives campaign membership and ownership on the server.
- `claim_character(p_character)` atomically claims an unowned campaign character; `delete_character(p_character)` requires owner or GM.
- `patch_character(p_character,p_patch)` accepts only explicit dossier keys. It rejects arbitrary metadata, campaign/owner/role/playbook changes, invalid action names/ratings, and unknown ability/pet fields. Future character tickets extend the validator deliberately rather than reopening generic writes.
- Reads return `{id,campaign_id,owner_id,data,updated_at}` under membership RLS. Column metadata is immutable to ordinary table writes. Each patch locks the current row, merges only submitted fields, and merges individual `actions` and `pet` keys so distinct concurrent edits survive. Relationship and Versatile lists are each a single edited field; competing edits to the same list use the last accepted save.
- The character boundary fetches authorized snapshots every second and on focus/reconnect. It never accepts durable peer broadcasts. Failed text drafts stay visible with saved-value comparison, retry and discard; selection failures show the last accepted state. Other feature editors remain unmounted until converted.

Character browser/API tests cover GM plus two player identities, ownership and cross-campaign denial, explicit claims, nested concurrent updates, source-specific Hound choices, live followers, rejected/offline saves, retry/discard, reload, deletion and a390px responsive viewport.

## Common crew dossier

Campaign members can read the single shared crew. Current GM membership is required to create it or change it; direct table writes remain denied even to a GM. Creation explicitly chooses one of the six Blades ’68 types and starts at Tier 0, strong Hold, 0 Rep, and 2 stacks (book v1.0.1, p. 88). The form records changes deliberately; it does not infer advancement, tithe payments, faction changes, or resource resets.

`create_crew(p_campaign, p_name, p_type)` returns the saved crew. `update_crew(p_campaign, p_patch, p_expected)` accepts only common dossier fields and requires exactly the edited keys in `p_expected`, containing their values when editing began. Under a row lock, disjoint edits merge; a stale edit to the same field returns a conflict. Read rows include a server `revision`. The browser shows only accepted snapshots while retaining unsaved field drafts, displays failed/conflicting saves, and offers an explicit reload that discards drafts. Permitted snapshots refresh every 1.8 seconds and immediately on focus/online; private peer broadcasts never supply durable data. Read requests begun before an accepted mutation cannot replace it.

Crew abilities, upgrades, claims, cohorts, and crew-specific records are separate subsequent slices. Their migrations must extend the crew field validator rather than restore arbitrary JSON writes.

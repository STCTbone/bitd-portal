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

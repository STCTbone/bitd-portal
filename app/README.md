# Develop and run the Blades ’68 portal

## Reproducible local setup

Prerequisites: **Node 22.12+**, npm, Docker Desktop running, and ports **54320–54322 / 5173** free. The lockfile pins the Supabase CLI and browser test runtime. No upstream database, hosted account, email or paid project is needed. The first start downloads local container images.

```sh
cd app
npm ci
npm run backend:start
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173. Create a fresh campaign as GM, then join with the **player invitation** in separate browser profiles/contexts. Tabs in the same profile share one identity. The **secret GM invitation** grants GM authority; keep it outside player-visible notes, screenshots and messages. Invitations are reusable bearer secrets.

`backend:start` starts the selected local CLI project, configures Realtime private-only after its tenant exists, invalidates that tenant cache, and writes the local URL/public anonymous API key into ignored `.env.local`. Run this full script after container restarts; bare `supabase start` omits the post-start privacy configuration. The configurator targets only safe localhost URLs and containers for the selected `project_id`.

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
npm run backend:stop
```

The preview serves the built static frontend and still requires its configured Supabase backend. Restart/rebuild after changing build-time environment variables.

## Empty campaigns, sample fiction and resets

Creating or opening a campaign never seeds game content. A GM can **Review optional sample**, inspect the proposed fiction and enter `LOAD SAMPLE` to apply it to an empty campaign. It adds two unclaimed Hounds, a Shadows crew, invented factions, clocks and shared notes using ordinary protected APIs. Players deliberately claim characters; sample fiction is labeled and adds no automatic rewards or artwork.

**Review clocks, notes and markers clear** requires `CLEAR WORKSPACE`. It removes standalone campaign/score clocks (including hidden clocks), shared notes and durable/transient map markers in the selected campaign. It preserves every character/crew/faction sheet value and owner, embedded healing/backing tracks, backing records, private faction notes, planning/score/cycle records, Aftermath receipts/history/corrections, uploaded files, selected map, settings, identity, invitations and members. The preview lists exact counts and scope. Changed saved content makes an unaccepted review stale; retrying an accepted request returns its original result once. Cancel makes no game changes. Create another empty campaign for a fresh start.

For disposable **local development data only**:

```sh
npm run backend:reset
```

This destroys the selected local project's database contents across all its campaigns and reapplies committed migrations plus transport settings. It is different from the scoped in-app clear. Stop only your own project with `backend:stop`. Never run the historical `supabase/migration.sql`; fresh setup uses `supabase/config.toml` and `supabase/migrations/`. There is no automatic SQL seed.

## Identity, authorization and synchronization

**Google login:** follow the [Google setup guide](../docs/google-login.md) to create a web OAuth client and configure its backend-only credentials. Google is the primary recoverable account option; local guest campaigns still work before provider configuration. Link an existing guest before leaving its browser to retain the participant ID and owned characters. After signing in on another device, **My campaigns** lists server-authorized memberships; opening one rechecks its current role. **Switch campaign** keeps the account; **Sign out** removes access from this browser and its tabs. Google profile/email never grants a GM role. A Google account already linked to another participant cannot be silently merged with a guest; use another account or explicit GM-assisted recovery.

Guest sign-in creates a real authenticated identity without email. Its credentials remain in that browser's auth storage; `bitd.activeCampaign` stores only the selected campaign ID. Clearing browser data loses an unlinked guest identity: rejoin using an invitation and ask the GM to reassign your character. A Google-linked identity can sign in again instead. Reload verifies current identity and membership with the server. Browser storage remains a convenient session cache, rather than the only way to recover a linked identity.

Current backend membership determines GM/player authority. Character owner/GM mutations, invitation reads, hidden clocks, private faction/backing/Aftermath records and assets have separate protected contracts. Generic entity upserts/merge and durable peer broadcasts stay denied. Public browser configuration contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (a publishable key can occupy the latter variable on a future host). Never place service-role/secret keys, database passwords, auth tokens or invitations in `VITE_*` variables.

The static React workspace uses feature-specific authenticated API reads, version/expected-value conflicts and bounded polling, with focus/reconnect refreshes. Most durable snapshots refresh every 1–2 seconds; map gestures poll every 250ms and expire; online participants aggregate authenticated connection leases. Overview/presence and map transport use short access leases to discard stale responses. Snapshot failure conceals affected saved views and exposes recovery; changed drafts survive supported failed-save flows. Read each field's visible save status, retry or deliberately discard/reload a conflict. Suspended/offline browsers cannot promise instantaneous revocation; backend mutations always check current permission. Previously read information cannot be recalled.

Storage bucket `campaign-assets` stays private. Protected downloads check metadata and Storage RLS with no browser caching; revocation removes current views on recheck. Legacy `maps` bucket access and arbitrary object paths remain denied. No durable campaign snapshot is persisted in browser storage. See [feature contracts](../docs/backend-contracts.md) and [ADRs](../docs/adr/).

## Verification

```sh
npx playwright install chromium
npm run test:e2e
npm run lint
npm run build
```

Tests require the committed **local** backend. They use ordinary authenticated API/Storage/Realtime checks and independent real browser contexts; privileged local test setup never enters browser configuration. Playwright builds and launches its own production preview, refuses an existing server and runs one worker. Stop the interactive frontend on 5173 first, or choose `PORTAL_PORT=5273 npm run test:e2e`. Keep app source/config/docs frozen while tests run; retain traces/network evidence for a failure. Test output may contain credentials: keep `test-results/` and raw logs private and ignored.

[The coverage matrix](../docs/verification.md) maps catalogs, confidentiality, concurrency and end-to-end journeys to existing tests. Focused examples: `npm run test:e2e -- tests/portal-handoff.spec.ts` and `npm run test:e2e -- tests/campaign-access.spec.ts`. Full lint includes active source and tests; no legacy baseline failures are accepted. Build includes TypeScript checking.

## Concurrent worktrees

Install independent dependencies with `npm ci`. Give each isolated worktree a unique uncommitted `supabase/config.toml` `project_id`, three unique API/DB/shadow ports and matching `auth.site_url`; choose a separate frontend port. Example: `bitd-my-task`, API54421, DB54422, shadow54420, site URL http://127.0.0.1:5273. Then use `backend:start` and `PORTAL_PORT=5273 npm run test:e2e` or `npm run dev -- --host 127.0.0.1 --port 5273 --strictPort`. Never reset or stop another project's stack. Stop your isolated backend **before** restoring canonical config, and keep overrides/env/test artifacts out of commits.

## Troubleshooting

| Symptom | Recovery |
| --- | --- |
| Missing frontend environment variables / blank startup | Run `backend:start` from `app`, verify ignored `.env.local` exists, then restart Vite or rebuild. |
| Docker unavailable / port already in use | Start Docker, inspect `npx supabase status` for this project and choose unused isolated ports; stop only the project you own. |
| Local Realtime public channels unexpectedly work | Rerun `backend:start`; require the private-only configuration success message before use. |
| Anonymous signup denied or rate limited | Check local auth is enabled and anonymous sign-ins allowed. Reset disposable local data if needed; hosted limits are a separate deployment review. |
| Lost campaign / wrong profile | Rejoin with saved invitation; recover ownership using the new participant ID. Do not edit browser roles. |
| Save rejected / record changed elsewhere | Preserve the draft, inspect the error, retry after reconnect or explicitly reload/discard it; ask the GM to check current ownership. |
| Stale/expired setup review | Cancel and review again; after an uncertain accepted response retry the same request. |
| Browser tests cannot bind preview | Stop the interactive preview or set an unused `PORTAL_PORT`. Do not reuse the development server. |
| Reset fails midway | Read the first migration error, fix it and rerun local reset; a frontend build does not prove schema setup. |

## Future static frontend + hosted Supabase deployment

This is a reviewed plan, **not a claim of hosted validation or authorization to provision**. Local CLI configuration does not automatically configure a hosted project. Before spending or publishing, review host/region, auth abuse controls, polling cost, Storage limits, backup/retention and the application's confidentiality checks on staging.

1. Use a fresh dedicated Supabase project; preserve the migration ordering and application grants. From `app`, authenticate the CLI, run `npx supabase link --project-ref <reviewed-project-ref>`, inspect `npx supabase db push --dry-run`, then apply `npx supabase db push` only to that reviewed target. Never use local reset as a hosted migration command. The local Docker-only configurator is not a hosted setup script.
2. In hosted API settings expose the **bitd** schema. The migrations supply narrow schema/function/table privileges; do **not** copy broad `GRANT ALL` examples from generic schema tutorials. Enable anonymous sign-ins in Auth, set the deployed Site URL/allowed redirects, and review rate limits and CAPTCHA requirements before public traffic. The present UI has no CAPTCHA token flow, so a deployment requiring CAPTCHA needs that integration before launch. Keep email signup disabled if retaining the no-email experience.
3. In Realtime settings disable **Allow public access**. Retain migration-defined denial of peer channels and no raw sensitive-table publication. Confirm the migrated `campaign-assets` bucket remains private with its policies and size/type controls. Hosted schema/service differences must be resolved in staging; do not weaken permissions to make migration errors disappear.
4. Set the static build's public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; run `npm ci && npm run build` from `app` and serve **app/dist** over HTTPS. `amplify.yml` is an optional retained build recipe; its presence does not establish a running Amplify site. Vite inlines these values at build time. Keep secrets in backend-only tooling.
5. On staging verify anonymous creation/join/recovery, hidden data exclusion, ownership/role changes, private files, reconnect, concurrent saves, exactly-once Aftermath and reviewed sample/clear behavior with GM plus two independent players. Existing automated tests intentionally reject non-local URLs; adapt a separately reviewed staging harness rather than pointing destructive local tests at production. Publish only after that review.

Official references checked 2026-10-21: [environment migrations](https://supabase.com/docs/guides/deployment/managing-environments), [anonymous identities and abuse protection](https://supabase.com/docs/guides/auth/auth-anonymous), [custom schema exposure](https://supabase.com/docs/guides/api/using-custom-schemas), [Realtime authorization/private-only access](https://supabase.com/docs/guides/realtime/authorization). The tested local config remains pinned by the committed lockfile and CLI scripts.

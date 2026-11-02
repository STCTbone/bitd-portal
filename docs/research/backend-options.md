> Historical pre-adaptation research. File/line references below describe the upstream implementation; see [the current runtime guide](../../app/README.md) for the shipped architecture.

# Backend options for the Blades ’68 portal

Research checked 2026-10-15. Scope: adapt this existing application for one group's fresh campaigns, preserve the full portal, allow players to join without email accounts, protect GM information on the backend, and provide a local preview and repeatable setup before live hosting.

## Recommendation

**Keep Supabase and repair its authorization and reproducible setup.** This is an engineering recommendation based on the repository and the official capabilities below, not a vendor claim. Supabase already supplies each backend capability the portal uses: persisted campaign entities, concurrent updates, database subscriptions, ephemeral broadcasts, presence, and uploaded media. PocketBase offers a simpler single-process local server; Convex offers a simpler reactive programming model for a new app. Neither reduces the total work of adapting this repository enough to justify changing now.

The principal hosting caveat is material for a weekly game: **Supabase Free pauses projects after one week of inactivity**. Its published Pro plan starts at $25/month and does not pause for inactivity. A holiday or skipped session could therefore require restoring a free project before play. Start locally and make the hosted-plan decision at deployment; do not promise always-available free hosting or implement synthetic keepalive traffic. [Supabase pricing](https://supabase.com/pricing)

## Repository evidence

These observations describe committed code, not a verified production deployment:

| Concern | Existing implementation and implication |
| --- | --- |
| Persistence | [`app/src/lib/db.ts:37`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/db.ts) loads campaign entities as complete JSONB `data` objects. [`db.ts:91`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/db.ts) calls a server-side `merge_entity` RPC for shallow partial updates. We can retain this approach while tightening its allowed fields and role checks. |
| Shared sessions | [`app/src/lib/store.tsx:649`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/store.tsx) combines peer broadcasts, Postgres Changes, and presence, then refetches on reconnect. Replacing the backend means changing this synchronization path, not just swapping a database client. |
| Map interaction | [`app/src/components/GameMap.tsx:204`](https://github.com/bsxp/bitd-portal/blob/main/app/src/components/GameMap.tsx) subscribes to broadcasts for token motion, cursors, strokes, and pings. This is an existing use for ephemeral messaging. |
| Uploaded assets | [`app/src/lib/db.ts:114`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/db.ts) uploads maps, character art, avatars, and media to a shared public bucket. Confidential assets need a private access path. |
| Identity | [`app/src/lib/session.tsx:77`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/session.tsx) looks up a four-digit campaign code and [`session.tsx:98`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/session.tsx) claims a seat in local state. This is not backend authorization; a GM seat cannot remain a browser-selected privilege. |
| GM confidentiality | [`app/src/lib/types.ts:149`](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/types.ts) stores GM faction notes and player notes together; [`app/src/components/FactionTracker.tsx:334`](https://github.com/bsxp/bitd-portal/blob/main/app/src/components/FactionTracker.tsx) hides the GM editor through UI conditions. The loader reads the complete entity. Filtering the interface cannot protect these fields. |
| Repeatable setup | [`app/supabase/migration.sql:19`](https://github.com/bsxp/bitd-portal/blob/main/app/supabase/migration.sql) creates relational crew fields, whereas runtime expects `data` JSONB rows. The checked-in SQL does not define the runtime `join_code` field or `merge_entity` function. A correct fresh bootstrap is required even if Supabase is retained. |

## Comparison

The effort and operations assessments in this table are inferences from the repository and documented mechanisms, not measured implementation estimates.

| Dimension | Keep Supabase | Move to PocketBase | Move to Convex |
| --- | --- | --- | --- |
| Total adaptation effort | Lowest: preserve the adapter, map transport, and much of the state layer; build real authorization and coherent migrations. | Higher: replace persistence/merge RPCs, subscriptions, storage URLs, and identity; add custom ephemeral-message routes. | Higher: replace persistence and synchronization with queries/mutations; migrate uploads and auth; redesign map transient traffic. |
| Small-group operation | Managed cloud avoids running a server; free inactivity pause matters. | One server is compact, but someone owns its persistent disk, backups, upgrades, HTTPS, and availability. | Managed cloud avoids running a server; reactive queries reduce client subscription plumbing after migration. |
| No-email identity | Built-in anonymous sign-in plus server-validated campaign invites. | Custom invite redemption can issue an auth-record token; email UI is avoidable, but this is application work. | Convex Auth has an Anonymous provider; campaign invites and roles remain application work. |
| GM secrecy | Membership RLS for rows; split private fields out of publicly readable JSONB documents. | Collection rules protect records; split private content into separately protected records or carefully filter server responses. | Query/mutation functions authenticate, check membership/role, and return only permitted fields. |
| Live map | Reuse authorized Broadcast and Presence. | Record subscriptions use SSE; custom server broker messages are possible, requiring a client-to-server route and authorization. | Reactive data and Presence component cover shared state/status; existing broadcast protocol still needs replacement and transient traffic budgeting. |
| Files | Existing uploads can be adapted to private bucket policies and temporary access. | File fields support local disk/S3 and protected files. | Built-in upload URLs and storage IDs; private per-request delivery requires authorized HTTP actions. |
| Local setup | CLI plus Docker-compatible runtime; versioned migrations and seed/reset workflow. | Small executable and commit-able migrations are the simplest local footprint. | CLI local deployment supports accountless development; documented as beta and unsuitable as a production server. |

### Supabase: capabilities and required design

Anonymous sign-in creates an actual authenticated user ID without email, password, or OAuth. It is distinct from unauthenticated access using the public API key. Anonymous sessions cannot recover the same identity after sign-out, browser-data removal, or switching devices. Therefore the portal needs an explicit rejoin/recovery behavior, such as re-redeeming the appropriate invite and reclaiming a character through an authorized flow. [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)

Use server-issued campaign membership as the authority. The proposed application design is: separate high-entropy player and GM invites, server-side token verification, membership assigned to `auth.uid()`, and protected membership changes. Store invite hashes rather than exposing raw invite secrets through campaign reads. The UI may choose a character seat, but may never grant itself a GM role. This is a recommendation, not a feature Supabase automatically supplies.

RLS filters rows; column grants are a separate mechanism. A player-readable JSONB `data` column containing `notes` also reveals that nested key. **Recommended:** store GM-only fields in a separate table/record protected by GM RLS, and use visibility policies for whole hidden clocks. Protect both reads and writes, including partial-merge RPCs, character ownership, and membership role changes. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security)

Broadcast and Presence support RLS authorization on `realtime.messages`; private channels must be configured explicitly. Use separate campaign/member and GM-only topics where necessary, and never place GM payloads on a player channel. Also stop treating arbitrary peer messages as authoritative durable edits: authorization on joining a topic alone cannot validate every application-level field in its payload. Prefer server-confirmed database changes for durable confidential state; reserve client broadcasts for permitted transient map activity. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

Storage policies use RLS. Private files should use private buckets and authorized downloads or expiring signed access; GM material should not remain in the existing public `maps` bucket. SQL functions need explicit privilege review, especially any `SECURITY DEFINER` implementation. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [database functions](https://supabase.com/docs/guides/database/functions)

The usual local stack uses the CLI and a Docker-compatible container runtime. Supabase also documents experimental native-process commands on supported Linux/macOS systems. Capture the complete configuration, schema, policies, storage setup, and seeds in version control, and verify a clean local reset rather than relying on an upstream database. [Local development](https://supabase.com/docs/guides/local-development), [migrations and seed/reset workflow](https://supabase.com/docs/guides/local-development/database-migrations)

### PocketBase: simpler local footprint, more ownership

PocketBase combines SQLite, auth, subscriptions, and an admin dashboard in one executable. It generates `pb_data` and versionable `pb_migrations`. Its documentation still warns that pre-1.0 backward compatibility is not guaranteed and that production-critical users may need manual migration work. A game portal is not necessarily production-critical, so this is a maintenance consideration rather than a disqualifier. [Introduction](https://pocketbase.io/docs/)

Collection API rules filter accessible records. Server hooks can implement custom tokens, invite redemption, and validation. A server-created auth record/token can avoid email-based user onboarding, but it is a custom workflow to implement and test. [Rules](https://pocketbase.io/docs/api-rules-and-filters/), [authentication](https://pocketbase.io/docs/authentication/), [record tokens](https://pocketbase.io/docs/js-records/#generating-and-validating-tokens)

Standard record realtime events use SSE and collection view/list access rules. Arbitrary messages can be emitted by the server subscriptions broker. This permits a map channel, but it does not preserve Supabase's existing client broadcast API: implement an authorized route plus server fanout and presence cleanup. [Realtime API](https://pocketbase.io/docs/api-realtime/), [custom realtime messages](https://pocketbase.io/docs/js-realtime/)

Protected file fields enforce the record's view rule using short-lived file tokens; files otherwise default to public URLs. Files can live on local disk or S3-compatible storage. Production guidance includes persistent volumes and backup/restore procedures, so hosting simplicity transfers operational responsibility to the project owner. No universal hosted free-tier inactivity policy applies to the self-hosted software; the chosen host sets that policy. [Files](https://pocketbase.io/docs/files-handling/), [production operations](https://pocketbase.io/docs/going-to-production/)

### Convex: appealing for a new app, substantial rewrite here

Convex subscriptions automatically rerun queries when their database dependencies change. That can replace much of the current peer-sync/changefeed machinery. Authorization still belongs in server functions, which can inspect the authenticated identity and return a role-specific projection. The benefit would be a different, coherent data flow after doing the migration. [Realtime queries](https://docs.convex.dev/realtime), [auth in functions](https://docs.convex.dev/auth/functions-auth)

Convex Auth supports React/Vite apps and remains documented as beta. Its Anonymous provider supports sessions without conventional sign-in, but its own guide calls that an advanced feature. This can satisfy no-email players without a third-party identity service; it does not supply the portal's invite or role model. [Convex Auth](https://docs.convex.dev/auth/convex-auth), [Anonymous provider](https://labs.convex.dev/auth/config/anonymous)

The official Presence component supplies room-scoped status and cleanup through heartbeats/scheduled functions. It can carry metadata, but it is not a direct replacement for this app's broadcast protocol for strokes and token motion. Prototype and rate-limit a proposed cursor/stroke approach before migrating, and account for function calls and bandwidth. [Presence component](https://www.convex.dev/components/presence)

Uploads use generated URLs and saved storage IDs. Direct file URLs permit bearer access; authorized HTTP actions are the documented way to check access on each request. [Uploads](https://docs.convex.dev/file-storage/upload-files), [serving files](https://docs.convex.dev/file-storage/serve-files)

Local deployments can run without a Convex account, with state in `.convex`; they remain beta and are explicitly for development. Cloud quotas can eventually cause errors on the free plan. The current pricing/limits pages examined did not establish a Supabase-like one-week inactivity pause; absence from these pages is not an always-on guarantee. The documented 30-day “idle” definition concerns deployment fees and must not be presented as a free project auto-pause policy. [Local deployments](https://docs.convex.dev/cli/local-deployments), [limits](https://docs.convex.dev/production/state/limits), [pricing FAQ](https://www.convex.dev/pricing/faq)

## What would reopen the recommendation?

Choose PocketBase if the owner explicitly wants a single self-hosted server and accepts maintaining it; this is its strongest practical advantage. Choose Convex if the team deliberately wants a server-function/TypeScript rewrite and considers that programming model worth the migration. Neither choice eliminates backend authorization, confidential data separation, invite recovery, or end-to-end permission tests.

For the agreed first handoff, Supabase has the smallest implementation change. Required acceptance checks should include fresh setup from committed files; separate GM/player joins without email; direct API denial for GM notes, hidden clocks, and unauthorized writes; no private realtime leakage; permitted file access; concurrent edits; and reconnect convergence. These are proposed verification goals, not completed tests.

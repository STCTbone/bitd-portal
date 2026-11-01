# Database and uploaded-file recovery

## Coverage and current status

The production portal uses hosted Supabase project `rmwthxkqxyhmzjzfloxl` and a separately published Sites frontend. This follow-up adds local capture, verification and a disposable restore drill. **It does not establish live scheduled backups, off-device storage, provider retention or a production restore.** No production data was exported to test the tooling. Provider backup availability must be checked in the actual project's dashboard before relying on it.

Supabase [database backups](https://supabase.com/docs/guides/platform/backups) contain Storage metadata but exclude uploaded bytes. The portal therefore needs a paired recovery point:

| Component | Capture/recovery path |
| --- | --- |
| Campaigns, membership/roles, invitations, owned characters, GM-only records, scores/history, maps and asset references | Data-only SQL export of `bitd`, `auth`, `public`, preserving IDs; includes Auth users, identities and sessions |
| Schema, grants, protected RPCs and Storage policies | Exact migration files copied into each bundle; capture checks source applied migration versions; the fresh recovery target must match every bundled filename/hash and applied migration version |
| Image/audio bytes in private `campaign-assets` | Recursive, paginated backend-only download, per-object path/MIME/size/hash inventory; restore through Storage API into the same private bucket |
| Diagnostic schema/roles | `schema.sql` (`bitd`, `public`), `roles.sql` and source migration-history SQL archived for review; not blindly reapplied to a migrated target |
| Frontend | Git source plus Sites source/version record in [hosting](hosting.md); GitHub push alone does not publish or restore a Site |
| Provider configuration and secrets | Separate restricted inventory: Google client/secret custody, Auth provider/manual-linking flags, allowed return URLs, API schema exposure, Realtime private-only setting, project/region/version and key recovery procedure |

The tool intentionally does not copy the denied legacy `maps` bucket or arbitrary added buckets. Supported uploads use `campaign-assets`; if another bucket becomes active, extend capture and restore before relying on coverage. It rebuilds Storage object metadata via upload, preserving portal asset IDs/paths and authorization in `bitd`; raw Storage IDs/owners need not remain identical. It does not back up external Google accounts, encryption root keys/Vault, custom database roles/passwords or manual schema changes outside migrations. Inventory any such new dependencies before using this process.

## Capture and verify

Use the pinned dependencies (`cd app && npm ci`), Node 22.12+, Docker and the operator's authorized backend credentials. Local SQL exports use the pinned Supabase CLI; see [Supabase's restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Hosted exports use the tested PostgreSQL 17 client image `public.ecr.aws/supabase/postgres:17.11.0.004` with explicit libpq TLS because CLI 2.121.0 drops the URL's SSL mode when generating its dump command. The native client passes connection credentials in environment variables without shell interpolation and fails closed if the server cannot provide TLS. It buffers up to 256 MiB per SQL export; larger exports fail and need a reviewed streaming implementation. This portal's drill reconstructs grants/policies from its migrations, then restores data. All subprocess output is captured privately because CLI errors may include passwords.

```sh
cd app
npm run recovery -- backup backups/recovery-point
```

This default is a plan only: it reads no credentials, contacts no backend and writes no bundle. For an actual capture, supply `PORTAL_BACKUP_DB_URL`, `PORTAL_BACKUP_API_URL`, and `PORTAL_BACKUP_SERVICE_KEY` in the process environment from an approved secret source. Use a direct or session-pooler PostgreSQL connection, not transaction pooling. Hosted API and database project references must match, and the database URL must request `sslmode=require` or `sslmode=verify-full`. Never put these credentials into `VITE_*`, Git, shell command arguments/history, shared logs or browser code. The service key bypasses RLS and can read GM-only information; keep access limited to the backup operator.

1. Verify the API and database URLs belong to the same intended project. Arrange a maintenance window: stop all campaign edits/uploads, including background writers, until capture completes. The separate SQL dumps and Storage requests are not a cross-service atomic snapshot. `PORTAL_BACKUP_QUIESCED=1` is an operator assertion, not a server-enforced lock. Do not set it while play continues.
2. Choose a **new** bundle directory under ignored `app/backups/` on an encrypted disk or another approved private location. Parent directories must already exist. The tool refuses an existing bundle, writes directories as 0700/files as 0600 and writes `manifest.json` last. A missing manifest means incomplete. Local capture accepts loopback URLs; hosted capture additionally requires the explicit `--allow-remote` option. No hosted capture was run for this follow-up.
3. After the maintenance freeze and environment are in place:

   ```sh
   npm run recovery -- backup backups/recovery-point --execute
   # Hosted capture, only after the production backup destination/access decision:
   # npm run recovery -- backup backups/recovery-point --execute --allow-remote
   npm run recovery -- verify backups/recovery-point
   ```

4. Record completion UTC, source project, application revision, migration count, object count, duration and verification exit status in a private operations log. Compare expected campaign/identity/asset counts and ensure ready assets have matching objects. Freeze violations, missing bytes, changed inventory or subprocess failure require a fresh capture. An empty bucket is legitimate only if no expected asset needs bytes.
5. Encrypt and copy the complete paired bundle to the approved destination outside the source account/device. Verify the retrieved copy before pruning anything. The bundle itself is **not encrypted by this utility**. It contains all identities, invitation secrets and GM records; OS permissions alone are not off-device encryption or disaster protection. Checksums detect accidental corruption, not malicious replacement of a manifest. Keep a trusted digest or authenticated encrypted archive with the independent copy.

## Retention policy to activate

Proposed policy for this gaming group: capture daily and before migrations; retain the latest **14 complete daily recovery points** plus **8 weekly** and **3 monthly** points, pairing SQL and objects at every tier. Keep the last known-good restore-tested point until a newer point passes a drill. This targets at most 24 hours of lost play only once daily capture and failure alerts are actually operating. Recovery time has no production commitment until a drill at representative volume measures it.

`npm run recovery -- retention backups --keep=14` prints the newest verified bundles to keep, older candidates, and ignored incomplete/corrupt entries. It never deletes anything, never treats a failed/incomplete export as a replacement, and refuses to keep fewer than two. Weekly/monthly holds and the last restore-tested point must be protected separately by the operator before deleting daily candidates. Delete only after checking an independent retrieved copy and policy holds. Prune SQL and bytes together; do not expire individual live Storage objects as a backup policy. Document requested deletion of sensitive records and the date the last retained copy will expire.

No schedule, credential store, destination, monitoring or paid Supabase option is installed by these scripts. Production activation needs one concrete operator decision: **choose the encrypted backup destination and who/what will run the daily capture and handle failures**, or explicitly approve a paid managed alternative. Then confirm provider retention, run the first authorized paired capture and a recovery drill, and record the evidence. Until then the live coverage gap remains open.

## Restore into a disposable local target

Only use trusted bundles: `data.sql` is executable SQL. The utility supports a **local recovery drill**, and refuses remote restores and the canonical `bitd-portal` project. Never point it at the existing preview. Allocate a new directory/config with project ID `bitd-recovery-<unique-name>`, unique API/DB/shadow ports and a separate frontend URL. Copy the bundle's migration files into its `supabase/migrations/` and use compatible Supabase/PostgreSQL versions (currently PostgreSQL 17). Disable Google in this disposable config; do not copy real provider secrets. Start it with the pinned CLI's explicit `--workdir`.

The fresh target must have all bundle migrations applied, zero Auth users/campaigns and an empty private asset bucket. It may contain migration-created catalogs. Configure local Realtime private-only using `scripts/configure-local.mjs` from that disposable app directory before browser/transport checks. Run `supabase status --workdir <path> -o json` only in a private terminal; it prints privileged local credentials. Use its API URL/service key for `PORTAL_RESTORE_API_URL` / `PORTAL_RESTORE_SERVICE_KEY` in the restore process environment.

```sh
npm run recovery -- verify backups/recovery-point
npm run recovery -- restore-local backups/recovery-point
# After setting the disposable target environment:
npm run recovery -- restore-local backups/recovery-point --execute --workdir=/absolute/disposable/app
```

Restore verifies all files first and requires `http://127.0.0.1:<configured-api-port>`, a `bitd-recovery-*` project, exact migration files/hashes and matching applied migration versions. It checks for existing identities/campaigns **inside the SQL transaction** before clearing migration-seeded tables and loading data with triggers disabled. Storage uploads follow the SQL commit and each restored download is hash-checked. Database plus Storage restoration is not atomic: if a file fails, keep the target offline, discard/recreate the disposable target and retry the whole drill. Never call a partially restored target ready or widen policies to make a restore pass. Byte restore does not undelete records or change `shared`/`removed` flags in portal metadata.

Validate identities/ownership/invitations, campaign and asset counts, selected maps/history and a save/reload. Use independent GM/player/outsider sessions: require private notes/clocks/assets to stay denied, shared image/audio bytes to load, and revoked membership to deny reads/writes/downloads. Verify Google identity recovery in a separately authorized staging configuration; localhost fixtures cannot prove Google consent at a production origin. Confirm no raw sensitive publication or public Realtime access, and private `campaign-assets` policies. Production failover additionally requires target authorization, reviewed provider settings/OAuth redirects, frontend configuration and Sites publish approval, and rollback/downtime planning. This tool does not perform it.

## Repeatable checks

```sh
npm run test:recovery
# Real SQL and Storage, only on an already-started EMPTY disposable stack:
PORTAL_RECOVERY_WORKDIR=/absolute/disposable/app \
PORTAL_RECOVERY_BUNDLE_ROOT=/absolute/private/drill-bundles \
node scripts/recovery-drill.mjs
```

The synthetic drill creates three independent identities, a 56-faction campaign and private/shared PNGs; captures real SQL/bytes; resets only the checked disposable stack; restores; and checks identity IDs, invitations, roles, factions, GM/player/outsider boundaries, byte equality and membership revocation. It never reads production and leaves the synthetic target/bundle for inspection. After recording results, stop only that disposable stack with `supabase stop --workdir <path> --no-backup`, remove its private fixture bundles and clear transient credentials. Keep the canonical preview intact.

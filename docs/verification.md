# Portal assurance

The baseline is published Blades ’68 v6 playbook/crew sheets and the supplied v1.0.1 book. Full source PDFs/artwork and raw credential-bearing traces remain outside Git. Feature guidance records source discrepancies (including Hound radio load and relationship suggestions), native capacities, manual procedures and explicit house-rule/table-exception labels. Changing a track alone does not run original-game advancement, retirement, Heat rollover or resource expenditure.

## Public-boundary coverage matrix

Tests use authenticated API, Storage and Realtime boundaries and real browsers against local Supabase. Catalog permutations stay in focused suites; the handoff journey connects the experience without duplicating every shape.

| Assurance | Suites under `app/tests/` |
| --- | --- |
| Four distinct design compositions, remembered/blocked-storage preferences, sidebar keyboard navigation, retained drafts, long names, contrast and phone layouts | `design-schemes.spec.ts` |
| One workspace per tab, retained drafts, overview dossier links, keyboard/history/reload, GM/player tabs and narrow-screen layout | `campaign-tabs.spec.ts` |
| No-email creation/join; role invitations; browser tampering; campaign isolation; denied legacy writes/Storage/Realtime | `campaign-access.spec.ts` |
| Recoverable account across devices, current campaign list, guest-safe Google setup errors, cancelled callbacks, sign-out across tabs and failed identity checks | `google-login.spec.ts` |
| Ownership/recovery and delayed old membership/save boundaries | `ownership-recovery.spec.ts`, `character-dossier.spec.ts` |
| Hound, Operative, Radical, Veteran | `character-dossier.spec.ts`, `human-playbooks.spec.ts` |
| Intellectual, Paranormalist, Swinger | `companion-playbooks.spec.ts` |
| Hull capacity/memories/Drain; source-backed grants and permanent Repair | `hull-playbook.spec.ts`, `character-grants.spec.ts` |
| GM-controlled Ghost/Echo, Vampire, both Time Travelers; availability races and native conditions | `paranormal-playbooks.spec.ts` |
| Keys/Deadlocks, Stress/native conditions, Harm/recovery and source-whitespace rejection | `character-condition.spec.ts`, `character-grants.spec.ts` |
| Load/protection, stacks/bank, XP and explicit adjustments | `character-equipment.spec.ts` |
| All six crews, abilities/upgrades/claims/cohorts and special records | `crew-dossier.spec.ts`, `crew-tools.spec.ts`, `crew-business.spec.ts`, `crew-circles.spec.ts` |
| Default Gazette roster, retained edits/deletions, separate GM notes, disclosure and conflicts | `factions.spec.ts` |
| Private/shared backing, obligations, Failure and eligibility | `backing-records.spec.ts`, `character-grants.spec.ts` |
| Shared/hidden clocks, scope and stale/deleted updates | `clock-records.spec.ts`, `campaign-setup.spec.ts` |
| Three-input Personal Business activities, retained earlier details, Planning Meeting, concurrent plans and selected opportunities | `planning-cycle.spec.ts` |
| Score lifecycle, cohorts, corrections and immutable history | `active-scores.spec.ts` |
| Atomic Aftermath, duplicate/competing confirmation, corrections and private manual consequences | `aftermath.spec.ts` |
| Private art/media uploads, unshared/revoked bytes, outsiders and cleanup | `media.spec.ts` |
| Shared selected maps, marker ownership and image revocation | `maps.spec.ts` |
| Gesture bounds, current access, expiry/disconnect and late responses | `map-collaboration.spec.ts` |
| Shared notes, field conflicts, failed-save drafts and deletion | `shared-notes.spec.ts` |
| Safe overview, authenticated participants, role changes and reconnect | `overview-presence.spec.ts` |
| Reviewed sample/clear, rollback, duplicate/lost-response retry, racing writes, preservation and three-client convergence | `campaign-setup.spec.ts` |
| One complete GM + two independent player cycle, concurrent plans, failed save/reconnect, ownership transfer, keyboard/narrow viewport | `portal-handoff.spec.ts` |

## Reproduce and interpret

Follow [the development guide](../app/README.md). `npm run test:e2e` builds and launches a production preview against the committed local backend. Run `npm run lint` and `npm run build` separately. A successful frontend build does not establish migration or authorization correctness. Catalog, adversarial API and complete browser checks complement each other.

Independent profiles matter: two tabs in one profile share one anonymous identity. Assertions observe authorized responses and saved user-visible results. Local service credentials appear only in runners for explicit fault/permission fixtures, never in browser configuration.

Record exact commit, command, local project/ports, exit status, counts and screenshots in the implementation handoff. The original handoff assigned broad combined verification to the integration runner and the focused journey plus lint/build/visual checks to ticket #27. Raw traces can contain invitations/tokens; redact before sharing. Freeze app inputs during tests and retain failed-run evidence. Development hot reload previously reset editor selection; production-preview tests avoid that mechanism. A later isolated Hull-save occurrence has no established cause: preserve its regression and investigate any recurrence without weakening timeouts or treating a green retry as a fix.

## Recorded hosted evidence

The [hosting record](hosting.md) documents the 2026-10-31 public launch: native Sites frontend, 30 hosted migrations, real Google sign-in and a fresh campaign with 56 factions. Its 60-assertion smoke check used independent GM/two-player/outsider identities and covered authorization, ownership, concurrent writes, private/shared/revoked uploads and exactly-once Aftermath. A separate map exchange checked peer gestures, outsider denial and immediate membership revocation. Synthetic hosted fixtures were removed. These are recorded launch results; they do not imply a fresh hosted check or a full local regression run for subsequent changes. Local test guards continue to reject remote services.

## Recovery coverage

`npm run test:recovery` exercises synthetic export/restore orchestration, recursive Storage pagination, byte integrity, incomplete bundles, restore target guards and retention selection. The [recovery runbook](recovery.md) distinguishes fixture checks, a disposable real local recovery drill, and still-unverified live backup coverage. Recovery requires both database records and uploaded bytes; successful checksums alone are not proof of a usable database restore.


## Launch follow-up (2026-11-01)

The follow-up branch `followup/blades68-recovery` starts at `590bfdf46c075308ad8299823808002a2f677ed6`. It reconciles the launch documentation, repairs stale browser assertions and adds recovery operations without changing frontend feature code or migrations. The pre-existing local Google activation in `app/supabase/config.toml` is preserved and excluded from the change.

- `npm run lint`: exit 0, including the new recovery scripts.
- `npm run build`: exit 0, TypeScript plus production Vite build; the existing >500 kB chunk advisory remains.
- `npm run test:recovery`: exit 0, 10 synthetic fixture tests (pagination, corruption/missing bytes, source/target guards, incomplete exports and retention).
- `npm run recovery -- backup backups/plan-only`: exit 0; preview only, no credential reads or network/filesystem writes.
- `PORTAL_PORT=55473 npm run test:e2e` in the isolated copy: **153 passed, 4 failed (9.5m)**. All four failures expected obsolete availability copy. A focused Ghost/Echo reproduction also failed and its snapshot showed the shorter current status correctly rendered. The assertion now checks that status and denies new creation; the journey still saves/reloads an existing dossier after disabling its playbook. The subsequent Ghost/Echo check exposed one other stale interaction: opening the collapsed Rules reference is required before asserting its paragraph is visible. Both corrections are test-only; no timing or permission checks were weakened.
- `PORTAL_PORT=55473 npm run test:e2e -- tests/paranormal-playbooks.spec.ts --output=/tmp/bitd-paranormal-final-results`: **8 passed (38.3s)** after the assertion fixes, including all four previously failing journeys. The full 157-test invocation was not repeated at that stage; the 153 other passing results belong to the earlier broad run. Subsequent complete reruns are recorded below. Failed-run logs/traces were retained privately during diagnosis.
- `PORTAL_RECOVERY_WORKDIR=/tmp/bitd-recovery-validation PORTAL_RECOVERY_BUNDLE_ROOT=/tmp/bitd-recovery-bundles node scripts/recovery-drill.mjs`: **41 assertions passed (28.7s)** with final source-history checks. Real SQL and private/shared bytes were exported, the disposable backend reset, and the restored identity IDs, invitations, roles, 56 factions, exact files, outsider denial and membership revocation verified. This is local recovery evidence, not production backup coverage.
- Pinned CLI metadata-only export from the disposable stack: 30 applied migration records match the history parser.
- Native-client fixture harness: all four SQL exports plus 30 migrations verified, followed by a real reset/restore with exact identity, campaign, membership, faction and asset rows plus both byte streams. This mechanics check used plaintext only for the owned SSL-disabled local fixture; the separate TLS-required check specifically received the PostgreSQL SSL-refusal error. No hosted success or production restore is claimed.
- Native PostgreSQL hosted-export client: successful disposable metadata export, and explicit rejection of the same SSL-disabled server when TLS is required. The pinned Supabase CLI accepted that server even with `sslmode=verify-full`; hosted capture therefore uses the native client. No live hosted SQL/bytes were exported.

The disposable project is `bitd-recovery-validation`, API **55421**, database **55422**, shadow **55420**, browser preview **55473**. Its config came from the committed baseline with Google disabled, and source/tests were copied into `/tmp` with separate local environment output. The canonical preview and hosted data were never reset or exported.

Read-only GitHub inspection found [PR #28](https://github.com/STCTbone/bitd-portal/pull/28) **OPEN**, non-draft, **MERGEABLE/CLEAN**, head `590bfdf46c075308ad8299823808002a2f677ed6`, with no reported checks, reviews, review requests or comments. This is a point-in-time observation, not approval or proof that checks ran remotely. The follow-up is local and does not update that PR. No push, approval, merge or deployment was performed. The isolated Sites checkout remained clean at `0579efc`.

Read-only Supabase project metadata reported `rmwthxkqxyhmzjzfloxl` **ACTIVE_HEALTHY**, region `us-east-1`. It did not expose the plan or backup restore points; actual provider backup retention remains unverified. The [recovery runbook](recovery.md) records the proposed retention policy and the pending destination/operator decision. Historical launch smoke results above were not rerun against production.

After verification, the disposable stack and its volumes were removed with `supabase stop --workdir /tmp/bitd-recovery-validation --no-backup`; only the original `bitd-portal` containers remained running. Synthetic bundles, the temporary native-client harness and the isolated source copy were deleted. No privileged credentials or fixture data were added to Git.


## Managed Auth history correction and complete reruns

Independent review identified that the original restore cleared `auth.schema_migrations` even though both capture modes excluded it. A new real local regression failed against the original implementation: the target's initialized history became `[]`. Immediate identity/RPC checks in the former 41-assertion drill did not catch this startup risk.

Restore now preserves that managed table and rejects an uninitialized Auth target. Both export paths explicitly exclude it. The expanded committed `test:recovery:local` drill compares exact history rows before/after restore, restarts the actual disposable Auth container, checks health, signs in a new identity with no campaign membership, and exercises restored identities and privacy boundaries.

- A complete archived-source browser run at `ec59153` passed **157/157 (9.2m)** using `PORTAL_PORT=55473 npm run test:e2e -- --output=/tmp/bitd-final-suite-results` in `/tmp/bitd-final-suite/app`. Source/config were frozen; project `bitd-recovery-final-suite`, API 55421, DB 55422, shadow 55420, preview 55473. No browser suite was running during subsequent restore/reset/restart checks.
- Fixed CLI capture/restore: `PORTAL_RECOVERY_WORKDIR=/tmp/bitd-final-suite/app PORTAL_RECOVERY_BUNDLE_ROOT=/tmp/bitd-auth-history-bundles npm run test:recovery:local` passed **49 assertions (29.4s)**, including actual Auth restart and subsequent sign-in.
- Fixed native-client capture/restore: a private synthetic harness verified exact managed Auth history through restore and actual Auth restart, all source identities/campaign/membership/faction/asset rows, both uploaded byte streams, and new sign-in without campaign membership. This mechanics check used plaintext only for the SSL-disabled owned local fixture; no hosted target was contacted. The native TLS enforcement check recorded above remains separate.
- `npm run lint`, `npm run test:recovery` (**10 tests**) and diff checks pass after the correction. Capture-mode assertions cover the explicit Auth-history exclusion in both CLI and native command contracts; the real restart drill supplies the database regression seam.


## Final full-suite result after the Auth-history fix

The final complete run against **`c1c15782d0ab56b5c953cbf0eeebf8ac376be717` passed 157/157 tests in 9.2 minutes**, exit 0:

```sh
cd /tmp/bitd-final-corrected/app
PORTAL_PORT=55473 npm run test:e2e -- --output=/tmp/bitd-final-corrected-results
```

The source was archived from the committed revision, with only disposable `supabase/config.toml` project/port/Google overrides and a separate ignored local environment. Project `bitd-recovery-final-suite` was reset and configured private-only before the run; no restore or service restart ran concurrently. The production preview build/type check is part of the Playwright command. Every tracked app input except that explicit config override was compared byte-for-byte with `c1c1578` afterward and matched. The operator's original `app/supabase/config.toml` remained byte-for-byte unchanged and excluded from commits.

This aggregate success supersedes the earlier mixed broad/focused results. Together with the 49-assertion CLI restore/Auth-restart drill, native-client restore/Auth-restart verification, clean lint/build and 10 recovery fixture tests, there are no remaining local validation failures. Production backup activation, provider retention and remote restore remain outside this local verification.

Final cleanup removed the disposable stack and volumes with `supabase stop --workdir /tmp/bitd-final-corrected/app --no-backup`; only the original `bitd-portal` containers remained running. Both isolated source copies, synthetic backup bundles and the native-client harness were removed. Raw validation logs/screenshots remain private in `/tmp`; no credentials, fixture data, production operations, pushes, merges or deployments are part of this follow-up.


## Publication verification — 2026-11-02

The previously local follow-up through `880044a` was fast-forwarded to the existing `integration/blades68` PR branch, then merged normally through [PR #28](https://github.com/STCTbone/bitd-portal/pull/28) at `65ea65e5ce917ef1292f7a27f3cdb70d64396bb6`. The remote main tree matched tested release `880044ad19654e0c8b1683dc134a4e5aee69804e` exactly before this documentation-only publication record. The application subtree matched the fully tested `c1c1578` subtree exactly. Fresh lint, build/typecheck and 10 recovery fixture tests passed. GitHub had no required branch rules/checks and reported zero check runs; no approval review or bypass was submitted.

Sites version **2** deployed successfully at the existing public URL from native source `8e4a676a30ecc5d4080fe08856ac8b6e236a3610`; its 44-file static archive hash is identical to version 1. Access policy revision 2 and the complete policy were unchanged. Read-only live checks verified HTTP 200, entry/Google controls, Signal Orange, zero page errors/failed assets, Auth health 200 and Google enabled, with zero Supabase writes and no campaign reads or sign-in. See [the publication record](hosting.md#publication-update--2026-11-02) for exact identifiers and limitations.

Earlier local-only/no-push statements in this document describe the November 1 handoff. This publication supersedes them; backup destination/operator selection and actual live backup activation remain pending. No production database dump, new application credentials, backup schedule, paid service or sharing change was made.

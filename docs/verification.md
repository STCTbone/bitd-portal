# Local portal assurance

The baseline is published Blades ’68 v6 playbook/crew sheets and the supplied v1.0.1 book. Full source PDFs/artwork and raw credential-bearing traces remain outside Git. Feature guidance records source discrepancies (including Hound radio load and relationship suggestions), native capacities, manual procedures and explicit house-rule/table-exception labels. Changing a track alone does not run original-game advancement, retirement, Heat rollover or resource expenditure.

## Public-boundary coverage matrix

Tests use authenticated API, Storage and Realtime boundaries and real browsers against local Supabase. Catalog permutations stay in focused suites; the handoff journey connects the experience without duplicating every shape.

| Assurance | Suites under `app/tests/` |
| --- | --- |
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
| Gazette factions, separate GM notes, disclosure and conflicts | `factions.spec.ts` |
| Private/shared backing, obligations, Failure and eligibility | `backing-records.spec.ts`, `character-grants.spec.ts` |
| Shared/hidden clocks, scope and stale/deleted updates | `clock-records.spec.ts`, `campaign-setup.spec.ts` |
| Personal Business, Planning Meeting, concurrent plans and selected opportunities | `planning-cycle.spec.ts` |
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

Record exact commit, command, local project/ports, exit status, counts and screenshots in the implementation handoff. The integration runner owns broad combined verification; ticket #27 owns its focused journey and lint/build/visual checks. Raw traces can contain invitations/tokens; redact before sharing. Freeze app inputs during tests and retain failed-run evidence. Development hot reload previously reset editor selection; production-preview tests avoid that mechanism. A later isolated Hull-save occurrence has no established cause: preserve its regression and investigate any recurrence without weakening timeouts or treating a green retry as a fix.

Hosted provisioning and public staging validation remain unexecuted. The future deployment guide requires review and smoke checks; local guards intentionally prevent destructive fixture suites from targeting remote services.

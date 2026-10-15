# Blades ’68 Portal: Design Agreement

## Confirmed decisions

- Adapt https://github.com/bsxp/bitd-portal for Blades ’68.
- The first release serves the user's own gaming group. Broader public use is deferred.
- Published Blades ’68 is the rules baseline. Any house rules will be identified explicitly.
- Fork created: https://github.com/STCTbone/bitd-portal.
- Engineering-skill setup approved and applied: GitHub Issues on the fork, the five default triage labels, `AGENTS.md`, and single-context domain documentation. Setup commit: `e930c6459bf9546fd29550ec1b8592d49a2fb862`.
- Preserve the full campaign-tool scope: characters, crew, factions, clocks, scores, maps, shared notes, and related collaboration features.
- Support Blades ’68 only, rather than offering both original Blades and ’68 rulesets.
- Target fresh campaigns. Conversion of existing original-Blades portal campaigns is outside the first release.
- Give the portal a technicolor retrofuturist identity with readable dossier-style sheets.
- GM access uses a separate secret invite. Hidden notes and clocks are protected by the backend; players join without email accounts.
- Keep the portal an editable play aid: GM-confirmed outcomes, with automation only where current official sources fully specify the procedure.
- Include published paranormal playbooks with GM-controlled availability; standard playbooks are available by default.
- First handoff: tested code, a working local preview, reproducible backend setup, and deployment instructions. Live hosting follows review.
- Backend choice may change if research establishes an easier or better fit than Supabase; the user has delegated that judgment.
- Backend recommendation after research: retain Supabase. Existing persistence, live sync, presence, and media integrations make it the lowest-effort fit for this fork. Repair authorization and bootstrap setup rather than migrate providers.

## Design tree

- Audience: own gaming group (settled)
  - First usable release: full campaign portal (settled)
  - Existing campaign conversion: outside the first release (settled)
  - Access and GM-only information: separate GM invite and backend-protected secrets; players need no email account (settled)
- Rules baseline: published Blades ’68 (settled)
  - Game support: dedicated Blades ’68 adaptation (settled)
  - Record keeping versus automated procedures: editable play aid with verified automation and GM-confirmed outcomes (settled)
  - Paranormal playbooks: included, with GM-controlled availability (settled)
  - Exact rule/reference coverage: current public sheets and Gazette obtained; unverified book-only procedures remain manual
- Presentation: technicolor retrofuturism and readable dossier-style sheets (settled)
- Fork: created; engineering-skill configuration complete
  - Maintenance approach for final review: independent ’68 fork with upstream retained as a reference; selectively port useful fixes rather than promise automatic upstream compatibility
- Deployment
  - First handoff: local preview, tested fork, reproducible backend setup, deployment instructions (settled)
  - Backend: retain Supabase after comparison with PocketBase and Convex
  - Live hosting: after review

## Research findings

Upstream already provides character creation and sheets, crew management, factions, clocks, scores, maps, shared notes, media, and realtime collaboration. Original-game assumptions appear in types, game data, sheet components, and automatic score resolution.

The committed SQL migration does not match the newer database model expected by the runtime. A fresh deployment will need a verified database setup, rather than reliance on the existing migration alone.

Official current references establish that the adaptation involves new playbooks and crews, Keys and Deadlocks, stacks and bank, backing factions, base flair, and a revised gameplay cycle. It is more than a visual reskin. Detailed mechanics will be verified against current references before implementation.

The current official bundle contains baseline v6 sheets and separate Deep Cuts v1 sheets. Baseline sheets include eight standard and four paranormal playbook sheets, plus six crews. Deep Cuts is a distinct optional rules package and is outside the accepted baseline. Current sheets and older public creation references disagree about the number of close friends; this is a source discrepancy, not grounds to invent a restrictive validation rule. Book-only procedures will remain editable/manual until verified.

The runtime currently loads full clock/faction records and broadcasts full patches to all seated clients. Some UI filtering hides GM fields, but that does not provide the accepted confidentiality boundary. The new access design must enforce visibility for database reads, writes, realtime events, and media.

The backend comparison recommends keeping Supabase because this existing app already uses its data, storage, realtime, broadcast, and presence capabilities. PocketBase offers simpler single-process local operation but adds server ownership and migration work. Convex offers reactive queries but requires replacing the existing integration. Supabase's free plan currently pauses after one inactive week; hosted-plan selection remains deferred until deployment.

## First-handoff acceptance criteria

- Fresh ’68 campaign creation and separate GM/player joins work without email accounts.
- All standard playbooks and six crews are supported; published paranormal playbooks can be enabled by the GM.
- Character records cover Keys/Deadlocks, Stress, Harm/recovery, stacks/bank, advancement, equipment, contacts, backing factions, and relevant playbook-specific details.
- Crew records cover base/flair, upgrades, cohorts, faction relationships, and crew-specific details.
- The portal supports Personal Business, Planning Meeting, Score, and Aftermath as editable shared play aids, with useful history and GM-confirmed changes.
- Factions, clocks, maps/tokens, shared notes, and media remain usable, with the accepted retrofuturist visual direction and readable responsive sheets.
- Player clients cannot read GM-only records, receive them through realtime, access private assets, or obtain GM write authority by changing local browser state.
- Different players' permitted concurrent edits converge after reconnects; authorization and failed writes are surfaced rather than silently treated as successful.
- Backend configuration, migrations, policies, storage setup, and seed/reset instructions are committed and support a clean reproducible start.
- A working local preview and deployment instructions are supplied; paid or live services are connected after review.
- Build, relevant lint checks, meaningful behavior tests, direct authorization tests, and browser review validate the changed application.

## Current validation and published spec

The untouched upstream application passes its production build. Its lint baseline contains 12 errors and one warning, predominantly React hook/compiler rules and Fast Refresh exports. These are baseline findings, not completed adaptation checks.

The user requested synthesis and publication through to-spec. The canonical implementation scope is [spec #1](https://github.com/STCTbone/bitd-portal/issues/1), labelled `ready-for-agent`. It captures the approved design choices and the explicitly confirmed testing seam: complete browser-to-Supabase campaign flows supplemented by direct API authorization checks. The issue is ready for implementation; this document provides design context.

No glossary, ADR directory, AGENTS.md, CLAUDE.md, tests, or license file was found in the inspected upstream tree. GitHub reports the public repository allows forks. CLI access succeeded with the network sandbox exception; the fork and approved documentation setup are complete. Application implementation has not started; the published spec defines its scope.

## Sources

- [Upstream README](https://github.com/bsxp/bitd-portal/blob/main/README.md)
- [Upstream types](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/types.ts)
- [Runtime database access](https://github.com/bsxp/bitd-portal/blob/main/app/src/lib/db.ts)
- [Committed migration](https://github.com/bsxp/bitd-portal/blob/main/app/supabase/migration.sql)
- [Official Blades ’68 page and downloads](https://evilhat.com/product/blades-68/)
- [Character and crew creation v3](https://evilhat.com/wp-content/uploads/2026/06/b68_crew_char_creation_v3.pdf)
- [Cheat sheet v4](https://evilhat.com/wp-content/uploads/2026/06/b68_cheatsheet_v4.pdf)
- [Run sheet v5](https://evilhat.com/wp-content/uploads/2026/06/b68_runsheet_v5.pdf)
- [Official current playbook and crew bundle](https://evilhat.com/wp-content/uploads/2026/07/Crew-Sheets-and-Playbooks.zip)
- [Player Gazette v4](https://evilhat.com/wp-content/uploads/2026/06/b68_playergazette_v4.pdf)
- [Backend comparison](../research/backend-options.md)

ADR 0001 records the dedicated, fresh-campaign boundary. ADR 0002 records backend-enforced campaign access and confidentiality. ADR 0003 records retaining Supabase after the backend comparison.

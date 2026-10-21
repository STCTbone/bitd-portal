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

Anonymous identity credentials live in the browser's Supabase auth storage. Reload verifies the selected campaign against current server membership. Switching campaigns preserves identity. Clearing browser data loses that identity; an invitation establishes new membership, then the GM can deliberately reassign the previous character using the new participant ID. An invitation is a reusable bearer secret, so distribute the GM invitation only to GMs.

## Verification

```sh
npx playwright install chromium
npm run test:e2e
npm run build
npm run lint
```

Tests use real local Supabase and independent browser contexts, never mocks or a hosted database. They create fresh campaigns and check creation, both invitation roles, invalid invitations, reload, browser tampering, direct API forgery/isolation, unconverted legacy writes/storage, and realtime denial. The public API checks cannot run against an empty external service: start the committed local stack first. Existing unrelated lint failures in legacy editors are recorded in the implementation handoff.

Playwright builds the current application and starts its own production preview on the selected frontend port before testing. It never reuses a running server. This keeps browser journeys independent of development hot reloads and verifies the deployed bundle against the real local backend. Use `npm run dev` separately for interactive development.

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

The authenticated campaign workspace now supports Hound dossiers. Campaign members may read shared dossiers; their owner and the GM may edit or delete them. A GM may explicitly leave a new character unclaimed; a campaign member can claim it once. Claiming an already-owned character does not transfer ownership. A GM can review and confirm assignment to another current campaign participant, or release ownership for a new claim.

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

### Personal Business and Planning Meeting

The campaign-cycle workspace keeps editable individual Personal Business activities, opportunity sketches, and selected score plans. Activities follow current character owner/GM authority. Members can propose and edit their own opportunities; GMs set target Tier, difficulty and potential payout and select the agreed primary score. A sketch needs only a client, target or operation; target Tier is required at final selection. Opportunity edits never overwrite an already-selected score snapshot. Selecting a retained opportunity again corrects the current primary selection without creating a duplicate score.

`campaign_cycles` keeps `phase`, `selected_score_id` and server `revision`. `set_campaign_phase` is GM-only and revision checked; every phase is correctable and changing phase has no other effects. `select_opportunity` creates an independent `scores` row (unique `opportunity_id`) and updates the current selection atomically. Retries return the same score. Previously unconverted score rows without an opportunity remain unreadable. Member `update_score_plan` allows only approach, opening gambit, Quiet/Loud, engagement details/result and shared planning notes. Score lifecycle and consequential outcomes use their own authorized operations.

`personal_business` child rows, `opportunities` and `scores` use narrow authenticated RPCs; direct table writes remain denied. Updates compare the expected values of exactly the edited fields under a row lock, so disjoint edits merge while stale same-field edits reject. Inputs retain failed/conflicting drafts with visible errors, retry by saving again and explicit reload/discard. Authorized full snapshots refresh every 1.4 seconds and on focus/online; mutations invalidate earlier reads. No durable peer messages are accepted. Rewards, Heat, spending, recovery and load/Armor resets are never applied by these planning controls. Guidance identifies Blades ’68 v1.0.1 pp.164–171 and180–189, excluding Deep Cuts.

### Recovering campaign access and character ownership

No email account or email reset is used. Reload the same browser to resume its authorized membership. Keep your player invitation (and, for a GM, the separate secret GM invitation) somewhere safe outside browser storage. Switching campaigns keeps the identity; deleting browser data or changing browser profiles creates a different identity.

1. After identity loss, ask your GM for the player invitation and join again. Rejoining does not take your previous character or grant GM authority.
2. In the campaign access panel, copy **Your participant ID** and send it to the GM. It identifies the new browser identity; the ID itself grants no authority. Verify the person outside the app with your table before transferring.
3. The GM opens the character, refreshes the participant list, selects that exact ID under **Assign character to**, reviews the old and proposed owners, then confirms. The character keeps all saved dossier, condition, equipment and Personal Business records. The old identity loses editing authority, even if its editor is still open or it retries an earlier save. The GM retains access.
4. For a lost GM identity, use the saved secret GM invitation or ask another GM for it. Protect it as a bearer secret. If every GM loses both identity and invitation, there is no browser-side ownership or role bypass: a trusted backend operator must establish recovery outside this no-email flow.

The GM can also deliberately make a character unclaimed; any current campaign member may then claim it once. Use direct assignment for recovery when releasing it to everyone would be inappropriate. Competing claims lock the same row and cannot overwrite an existing owner. Competing reviewed GM changes reject an outdated expected owner and ask the GM to review again. A failed transfer retains the review with Retry and Discard; no ownership changes until the backend accepts it.

Backend contracts: `list_campaign_participants(p_campaign)` returns only current `{user_id,role}` records to a current campaign GM; it does not expose authentication records or invitations. `assign_character_owner(p_character,p_owner,p_expected_owner)` requires that character's current GM, checks the saved expected owner under a row lock, and validates a nonnull new owner against current membership of the same campaign. Null explicitly releases ownership. Direct ownership column writes and dossier-patch owner keys remain denied. This additive migration does not replace character validators, defaults or other feature RPCs. Existing child features must continue authorizing against the current parent character owner.

Clients reconcile ownership through authorized snapshots every second and on focus/reconnect. Backend authorization applies immediately to each save; a connected stale editor can show the previous permission for up to the next successful snapshot, but cannot save an unauthorized change. Current membership verification failures hide the campaign and offer Retry. Superseded refresh responses cannot restore an old campaign/GM role or erase a newer join/switch decision. This generation check covers success, missing membership and errors; it does not retain cached privileged UI after a current failure.


### Active scores, cohort activity and history

The GM starts the selected planned primary, then completes or cancels it through an explicit confirmation. A primary cannot be switched while active; complete or cancel it first. This lifecycle is independent of the flexible phase reference. Starting, completing and cancelling never award payout, reset load/Armor, advance XP, calculate Heat or change character, crew, faction or clock records.

Members edit shared score notes and the existing plan fields. The GM records outcome and recap text, including corrections after completion. Completed/cancelled scores remain in history after reload. Accepted lifecycle changes and every outcome/recap version remain available in each card’s append-only history. Conflicting or failed saves retain drafts for deliberate retry or reload. Status confirmations capture their opening revision and reject intervening edits visibly; duplicate status requests return the saved result without extra events.

Active-score clock cards load only the same RLS-authorized snapshots as the clock workspace, filtered to active clocks linked to that score. Players never receive hidden clock rows. Unsharing/deletion/revocation removes rows at the next authorized snapshot; failed reads conceal clocks, and older responses cannot restore an already removed clock. No clock data is placed in score snapshots, durable broadcasts or browser entity caches.

Cohort participation and a secondary score have independent notes, status, outcome and recap. The GM selects a current nested crew cohort; the server stores its crew/cohort reference plus complete selection-time cohort and opportunity snapshots. Those snapshots survive later source edits/removal. One retained secondary record per primary uses a remaining opportunity with target Tier. It does not become the primary or silently apply its results. Quality, roll, applicability, the expected cut and proposed consequences remain manual records. Sources: supplied Blades ’68 v1.0.1 pp.96–97 and188–189; no Deep Cuts.

Backend additions: `transition_score(p_score,p_status,p_revision)` and `update_score_record(p_score,p_patch,p_expected)` extend the original `scores` rows; the member record patch permits only `activeNotes`, with GM-only `outcome`/`recap`. `create_score_activity(p_score,p_crew,p_cohort,p_opportunity,p_kind)`, `update_score_activity` and `transition_score_activity` manage `score_activities`; current GM membership controls creation/status/outcomes, members can edit notes. Their fields use the same exact edited-field expectations as planning. All direct writes/deletes remain denied. `score_events` exposes only shared accepted lifecycle/result history to current members. Aftermath proposals and atomic receipts belong to the separate reviewed-consequence operation; a recorded outcome is never an applied receipt.


## Protected character art and campaign media

Campaign members see saved portraits/avatars; only the current character owner or a GM can replace/remove them. The GM uploads campaign images/audio, edits a title and annotation, and deliberately saves the sharing state. New campaign media starts private. Failed uploads retain the selected file for retry or discard; failed media saves retain the draft and offer reload/discard. Confirmed removal revokes access before physical cleanup.

- `campaign-assets` is a private bucket. Images accept PNG/JPEG/WebP/GIF up to 10 MiB; audio accepts MP3/WAV/Ogg/WebM up to 20 MiB. The backend validates the declared type/size and `finish_asset` checks actual Storage metadata before publishing. This is format/size validation, not content scanning.
- `campaign_assets` stores server-controlled campaign/character/kind/path and `pending|ready|removed` state; only narrow RPCs can mutate it. `character_art` selects one ready asset per portrait/avatar. No legacy URL fields or peer asset writes are enabled.
- `reserve_asset(p_campaign,p_kind,p_character,p_mime,p_size,p_title)` allocates an immutable random canonical path. Upload exactly that path with standard upload (`upsert:false`), then `finish_asset(p_asset)` validates the object and returns the saved row. A lost upload response can be retried: duplicate upload may fail, but finishing the existing matching file succeeds. Pending files cannot be downloaded; discard uses `remove_asset` and Storage remove.
- `update_asset(p_asset,p_title,p_annotation,p_shared,p_revision)` is GM-only and requires the current revision. `remove_asset(p_asset,p_revision)` requires the current character owner/GM (campaign media GM only), hides metadata/bytes first, then the client removes the physical object. A failed physical cleanup leaves inaccessible bytes; an operator can remove orphans. Deleting a character/campaign similarly denies orphaned objects; automated garbage collection is deferred.
- Storage RLS checks the exact metadata path, current campaign membership and current ownership/GM/sharing state for every operation. Download/info/list and authorized deletion are supported; overwrite/update/copy/move and signed download/upload links are denied, including a crafted long-expiry request. Public URLs do not work. Never expose a service-role credential to a browser.
- File delivery uses authenticated downloads and local blob URLs. Browser Storage SDK requests force `cache:no-store`, so an uploader-controlled long Cache-Control header cannot renew access from a cached info response. New backend reads are denied immediately after unshare/removal/revocation. The app polls RLS metadata every 1 second and renews each blob preview through authenticated Storage info every 3 seconds, with a 10-second lease beginning **before** the request. Denial, lease expiry or unmount revokes local URLs; delayed/older responses cannot renew or revive cleared previews. Timers enforce the bound while the client runs; a suspended browser clears expired state when it resumes. Copies already received by a user cannot be recalled.
- Media/art tables are explicitly excluded from the Realtime publication and send no metadata, annotations, paths or bytes over broadcasts. Sharing/deletion converges through permission-checked snapshots. No durable state is accepted from peer events.

### Map image extension (#22)

Persist the asset UUID in map state, not a public/signed/blob URL. `can_use_map_asset(p_campaign,p_asset)` is the backend predicate for a current member and a same-campaign, ready, shared, non-character `image`; it returns false for private/pending/removed/audio/art/cross-campaign assets. A map assignment RPC must separately require the current GM and validate this predicate. A selected image can later become unavailable through unshare/removal, so map consumers must reread allowed asset metadata and show an unavailable state when absent. `CampaignAsset`, `useProtectedAsset(asset)` and `ProtectedAssetPreview` are exported for the actual map UI; they retain the same bounded access behavior. `useAssetLibrary(campaignId)` provides current permitted assets and art selections without requiring a media provider. The private legacy `maps` bucket remains denied.

### Companion playbooks

Intellectual, Paranormalist and Swinger use the published v6 baseline, checked against book v1.0.1 pp.38–45,54–61,70–76. Each has its own actions, abilities, contacts, Key suggestions, equipment and two-use resource. Intellectual fields of study replace Background. The sparkmind records expertise, Small/Large housing and up to two Advanced Sparkmind choices; the resonance entity is an expert Paranormal Assistant with its own form, abilities and Armor; the two-seat autopod has a Racing/Impressing/Surprising type and style. All have separate cohort traits and conditions. Quality is crew Tier +1 within expertise; these cohorts cannot take secondary scores.

Companion records use reviewed local drafts and explicit confirmation, retaining failed changes for retry/discard. Repeatable selections (Advanced Sparkmind/Echo Projection), native ability uses, twin features, extra activity/assist availability and outcomes survive reload. Native recorded uses require the corresponding selected ability on the server. Stress, Harm, ordinary Armor, rewards, phase restoration and fictional consequences stay deliberate table decisions. Twin consequences have no invented mechanical Stress/Harm track.

After existing closed shape and saved-playbook validation, `patch_character` merges every submitted object one level under its current authorization check and row lock. Arrays/scalars remain atomic. Later playbook migrations can add their own closed objects through captured validators/triggers without replacing this public RPC or copying a stale nested-key list. Immutable metadata remains protected by the validator chain.

### Reviewed Aftermath

After completing a primary score, use **Campaign cycle → Aftermath review** to select explicit final crew resources/Rep/Heat/Wanted/Anger, personal stacks/bank/Stress/Harm/healing, and faction status values. Add each intended change, inspect its saved and proposed values, enter a shared recap, then save a proposal and deliberately confirm the complete review. The Unwind helper only proposes one Stress cleared for selected characters; optional passing-Harm clearing requires an explicit Quarters choice. Tithe, exposure/modifiers, Wanted, Trouble, Harm Complications and recovery have versioned book guidance and remain table decisions. No automatic payout, blanket reset, advancement or forced phase transition occurs.

Proposals are immutable GM working records. Confirmation authenticates the current GM, serializes cycle → score → proposal → ordered same-campaign target rows, checks the saved score revision and each expected value, and delegates changes through the existing character/crew/faction validators. All changes and the immutable member-readable receipt commit together. Repeating a confirmed proposal returns its receipt; a different base proposal cannot pay the same score again. A correction identifies the latest receipt, requires a reason, and retains all previous receipts. Competing corrections or stale reviewed values reject visibly; reload/reconcile and prepare a new review. A lost response may already have committed: reloading converges on its saved receipt, and retrying that proposal cannot apply it twice.

Manual records support Trouble, Ward boss, Recovery, Harm complication, Mandate and Other. Record roll/table/result, adjudication, ongoing/escalation history, delayed reveal and whether temporary effects were consumed. Records are GM-only by default. Explicit sharing discloses the entire manual record; secret notes are never automatically copied into shared recaps or receipts. Revision conflicts retain the manual draft and provide reload/discard. Direct table writes are denied for proposals, receipts and manual records. These tables are absent from raw Realtime publication; authorized snapshots reconcile on polling, focus, reconnect and reload.

### Campaign map and tokens

The GM can upload a shared map image or choose a ready, shared campaign image from the media library. The selected map stores only the protected asset UUID. Private, pending, removed, audio, character-art and other-campaign assets cannot become maps. Unsharing/removing a selected image shows “Selected map unavailable”; there is no saved URL fallback. The existing authenticated Storage lease (maximum 10 seconds without renewal) applies to the map too.

The GM creates, labels, assigns and removes tokens. Choose **Character** to make movement follow that character’s current owner, **Participant** for an explicit GM assignment to a current campaign member, or **GM only**. Character reassignment immediately changes backend move permission. Browser seats, session IDs, peer payloads and client-supplied ownership never grant token authority. Position controls work on desktop and mobile; coordinates are percentages of the image rectangle measured from its top left.

Only server-accepted positions appear on the board. Each token has its own revision, so different tokens save independently. Conflicting edits to the same token or map selection require reloading the saved state and reviewing the draft again. Failed saves retain local drafts for retry; transient sync errors retain the last accepted token positions with a visible warning. Reconnect/focus and one-second snapshots restore current server state. A current permission denial clears map state. Drafts belong to the current mounted page and are not promised across a browser reload.

`CampaignMap`/`useCampaignMap` own durable map state. The exported `MapSurface` renders the exact image rectangle and accepts overlay children; `mapPoint` in `lib/maps.ts` converts client coordinates to bounded image percentages. `MapCollaboration` mounts ephemeral cursors/pings/drawings there, keyed by campaign and asset ID, independently of durable token operations. Map/token tables are not in the Realtime publication. The obsolete legacy map component and its durable broadcast receivers have been removed.

This is manual spatial recordkeeping, not a movement-distance or combat rules engine. No new game procedures, proprietary maps or book artwork are bundled; the small map fixture used by tests is generated geometry.

### Temporary map collaboration

Choose **Show cursor**, **Ping map** or **Draw on map** above the shared image; touch users can tap a ping or drag a drawing. Colors and participant ID prefixes distinguish people, with the current server-assigned GM/player role beside each gesture. **Leave live map** immediately removes your activity; **Join live map** resumes collaboration. Cursors expire after 3 seconds, pings after 4, and drawings after 8. These gestures never save or move tokens.

Authenticated `send_map_activity`, `read_map_activity` and `leave_map_activity` RPCs recheck current membership and the currently selected usable shared map on every request. There is no peer-supplied identity/role, private text, media URL or token payload: only a known gesture kind and 1–64 normalized points (one for cursors/pings). Direct access to the unlogged transient table is denied; it is outside the Realtime publication. One row per actor/kind/map replaces prior activity. Indexed expired-row cleanup runs on authorized sends and reads; an idle database can retain expired, unreadable rows until the next exchange, and restart can erase all activity. Map-selection and asset revisions prevent old gestures returning after reselection or unshare/reshare. Current membership determines receive visibility and displayed roles.

The browser coalesces gesture sends, polls every 250 ms with one read in flight, and clears activity on offline/hidden/leave/unmount. Its two-second response lease rejects delayed responses and clears stale visible activity if polling cannot renew access. Abrupt remote disconnect expires by the server lifetimes above. Reconnect rereads current permitted gestures and the independent saved-token snapshot. This intentionally trades small-table polling load and latency for access checks on every exchange; see `docs/adr/0004-transient-map-activity.md`. No websocket access is enabled by this feature.

### Character backing and obligations

Character dossiers include backing records linked to the campaign's public `faction_records`, independently of crew faction status. Records start private to the current character owner and GM; explicitly sharing discloses the entire mission, Failure, prestige/choices, support and history record. The embedded Failure clock has four segments and shares the backing's visibility. There is no link to a private campaign clock, nor any read of faction GM notes. Linked names/Tiers come from permitted public faction reads. Deleted factions leave unlinked history with the recorded name/Tier, which an editor may explicitly relink.

Book v1.0.1 pp.236–241 establishes one active backing, eight help types once each per crew/personal-business cycle, mission Failure4, and independent crew status. Double Agent (Operative v6 / book p.50) permits two: either the selected native ability, or selected Versatile plus a matching named ability with a nonblank source, following the existing borrowed-ability contract. Free text alone grants no extra backing. Current backend ownership governs every mutation. Removing the ability, clearing its borrowed source or changing its name is rejected while two backings remain active; explicitly inactivate one first. Historical inactive records remain editable.

Add labeled support cycles explicitly. Earlier assistance flags remain; phase transitions never reset them. Review Return the Favor, mission satisfaction/failure, restoration and prestige with the GM, recording roll/results/choices and history manually. A full Failure clock or completed mission changes no backing/status/ability automatically. Apply agreed rewards or +1 crew status separately through explicit GM edits or reviewed Aftermath effects. Gaining/restoring backing uses a table-reviewed project (Tier1/2:4,3/4:6,5:8,6:10); Operatives start with backing. Notes retain project progress and special/incomplete procedure decisions. Deliberate departures from the published rules should be labeled as house rules.

`backing_records` is the sole writable backing source. Migration `202610210017_backing.sql` moves existing Operative `backingFactions` entries without guessing faction IDs: each name/Tier, mission, Failure, prestige, help/Return the Favor and notes survives as a shared unlinked record (matching its prior public dossier visibility). The old array becomes permanently empty/read-only; other Operative fields survive. Use `create_backing(p_character,p_faction)` and `patch_backing(p_backing,p_patch,p_expected_version)`, authenticated owner/GM only. Both lock the saved parent character before mutations; active limits and current ownership cannot race a transfer or ability edit. Version checks reject stale record patches, including atomic cycle-array updates, with retained local draft and Reload/Discard recovery. No ordinary table writes/helper execution are granted. Character deletion cascades backing rows; ending a backing retains its history.

Authorized snapshots replace records every1.2s and on focus/reconnect; accepted mutations invalidate older in-flight snapshots. Deleted/unshared/private rows leave connected viewers after the next successful read. Failed reads conceal saved cards while retaining local changed drafts. Ownership/role changes remount the backing boundary and discard the prior privileged snapshot; save authorization changes immediately in the backend. No backing data is stored in browser storage, raw Realtime publications or durable peer broadcasts. Already-shared historical information cannot be recalled.

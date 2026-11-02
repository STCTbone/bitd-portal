# Hosted Blades ’68 portal

## Deployment record

- Website: **https://blades68-portal.deldir.chatgpt.site**
- Supabase project: **rmwthxkqxyhmzjzfloxl**
- Supabase API: **https://rmwthxkqxyhmzjzfloxl.supabase.co**
- Sites project: **appgprj_6ae6a26b0a4881918253f48977f778cc**
- Signal Orange is the default; valid saved appearance choices remain available.

The public deployment succeeded on 2026-10-31 after applying 29 committed migrations to a fresh hosted database. Anonymous visitors can reach the portal without a ChatGPT login; Google identity and campaign membership protect campaign access. Real Google sign-in returned successfully to the live website, and the operator's fresh **Blades ’68** campaign contains all 56 published factions and restores after reload. Its player invitation is available under **Account**. The local preview and its records were retained.

Frontend source commit: `0579efc571b36b425b68d9a5677222ebe35d592e`; Sites version: **1**. Site access changes may need a short propagation period before new visits reflect them.

The hosted smoke check passed 60 assertions using independent GM, two-player and outsider identities: invitations, ownership, all faction defaults, GM privacy, concurrent edits, private/shared/revoked uploads, token authority, presence and exactly-once Aftermath. All synthetic identities, records and uploaded bytes were removed; the real campaign was preserved. Twelve stale-write paths returned HTTP 409 with `PT409` in 63–84 ms and retained accepted data.

A separate hosted map-activity exchange verified GM pings and player drawing strokes reaching their peers, outsider send/receive denial, and immediate denial in both directions after revoking the test player's membership. Its geometry also disappeared from peer snapshots. This uses the authenticated RPC transport from ADR 0004, not WebSockets; all fixtures were removed afterward.

The follow-up migration `202610310033_business_conflict_http409.sql` brings the deployed total to 30 migrations. It changes intentional business-conflict codes in 27 functions because [managed PostgREST 14 can retry custom `40001` errors indefinitely](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions). Before/after checks confirmed that all 136 application function definitions match after normalizing only that code, with owners, ACLs, OIDs and search-path settings preserved. Use `PT409` for future stale-record checks; reserve serialization failure codes for actual database transaction failures.

## Launch configuration and repeat checks

The public launch above completed the initial configuration. Use this checklist when checking a new environment or changing identity/access settings; it does not imply that launch is still pending.

1. In Supabase Auth, configure Google and manual identity linking. Set the Site URL and exact allowed return URL to `https://blades68-portal.deldir.chatgpt.site/`. In the existing Google web client, use the website origin and add `https://rmwthxkqxyhmzjzfloxl.supabase.co/auth/v1/callback` as an authorized redirect URI. Keep the client secret in backend provider settings.
2. Confirm the hosted API exposes `bitd`, anonymous sign-in remains enabled for the existing guest flow, Realtime public access is disabled, and `campaign-assets` remains private. The committed migrations supply the application grants and Storage policies.
3. Enable the intended Sites visitor audience so friends can reach the app. Sites access and the portal’s Google sign-in/campaign membership are separate controls.
4. Complete a real Google sign-in at the website, create a fresh campaign, and verify that it contains the 56 published factions. No local preview data is transferred automatically.
5. Join from independent player sessions using the **player invitation**. Check that shared saves/maps/files work, GM-private content remains excluded, and the campaign returns after sign-in on another device. Share the website and player invitation only after this check; the secret GM invitation is for other GMs.

This portal requests only basic Google sign-in scopes (`openid`, email and profile). Google documents an exception to the Testing user-list requirement and seven-day authorization expiry for this scope set. Additional OAuth scopes would require a new audience/verification review. See [Google’s audience guidance](https://support.google.com/cloud/answer/15549945) and [the portal’s Google configuration guide](google-login.md).

## Publish an update

The original application source remains in this repository’s `app/` directory. Its GitHub branch and the Sites deployment source are separate; pushing this repository alone does not publish a new Site version.

1. Check the intended original source revision with `npm run lint` and `npm run build` from `app/`.
2. Refresh the isolated Sites source checkout at `work/hosted-blades68` from the reviewed frontend files. Preserve that checkout’s `.openai/hosting.json` and native source repository identity. Copy only frontend source, public assets, dependency manifests and build configuration; exclude local credentials, backend runtime data, test output and rulebook PDFs.
3. Build the isolated frontend with its hosted public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are build-time values; changing runtime settings alone does not change an existing Vite bundle. Never substitute a privileged Supabase key or Google secret.
4. Use the Sites source/package/publish workflow with the existing project ID. Its manifest serves `dist/`. Publish to the current visitor audience and retain the returned source commit, Site version and deployment result.
5. Check the deployed page, Google return URL and one saved campaign interaction. Keep the previous successful Site version available for frontend rollback.

## Database changes and operations

Apply new migrations from the original `app/` checkout, explicitly targeting this hosted project. Inspect the remote target and a dry run before applying:

```sh
npx supabase link --project-ref rmwthxkqxyhmzjzfloxl
npx supabase db push --dry-run
npx supabase db push
```

Do not use `backend:reset`, the historical bootstrap SQL or the Docker-only local configurator against the host. Existing automated browser suites intentionally reject remote URLs and may alter their test backend; use separate local test campaigns and a bounded hosted smoke check.

[Backup and recovery](recovery.md) defines database plus uploaded-file capture, integrity validation, a disposable local restore drill, retention and the production activation decision. Live backup scheduling, off-device destination and actual provider retention have not been established by this follow-up. Database backups alone do not copy uploaded image/audio bytes. If the free project pauses after inactivity, restore it in the Supabase dashboard before the next session; monitor storage and bandwidth as the group adds media.

# Google login setup

The portal supports Google sign-in through Supabase, using PKCE. Google login is not active until an operator configures a Google OAuth web client. The checked-in local configuration deliberately leaves the Google provider disabled. No client secret belongs in browser configuration, source control, chat or screenshots.

## Configure local development

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), select the project for this portal. Configure its Branding, Audience and Data Access. Request only `openid`, email and profile. If its audience is in Testing, add the gaming group's Google accounts as test users.
2. In Clients, create an OAuth client with application type **Web application**. Add authorized JavaScript origin `http://127.0.0.1:5173` and authorized redirect URI `http://127.0.0.1:54321/auth/v1/callback`. The redirect URI is the Supabase backend, not the frontend. Other local worktrees require their corresponding API/frontend ports.
3. Save the client ID and secret to ignored `app/.env`:

   ```dotenv
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=your-client-secret
   ```

   These variables have no `VITE_` prefix. `backend:start` writes public API credentials to `.env.local` without touching this file.
4. In `app/supabase/config.toml`, set `[auth.external.google] enabled = true`. Keep `auth.enable_manual_linking = true` and `skip_nonce_check = false`. Stop/start the local backend using `npm run backend:stop` then `npm run backend:start`; do not reset it. Rebuild the frontend if needed. These provider changes do not require a database migration.
5. In an existing guest campaign, use **Link Google to this guest** before leaving that browser. Complete consent with a Google account not already attached to another participant identity. Verify the participant ID and character ownership stay the same, then sign in from another profile and open **My campaigns**. New users can use **Sign in with Google** directly, then create or join a campaign.

If Google reports an existing identity conflict, the guest's identity is retained. Choose another Google account or use invitation/GM-assisted recovery to move character ownership deliberately. The portal does not merge accounts by email or transfer GM authority based on a Google profile.

## Hosted configuration

In the reviewed Supabase project's Authentication provider settings, enable Google with the web client ID/secret and enable manual identity linking. Configure the production frontend origin and exact allowed return URL in Supabase. Add the hosted Supabase callback URI shown in the Google provider settings to the Google web client. Keep credentials backend-only and keep the existing RLS, private Storage and transport restrictions. Configure staging separately; localhost settings do not activate a hosted project.

## What is verified

Browser/API tests use real local Supabase Auth sessions and campaign RLS. They cover recoverable identity across independent devices, existing ownership, campaign isolation, sign-out across tabs, failed identity checks, cancelled callbacks and an unconfigured Google provider preserving guest access. Permanent-account fixtures use the local Auth admin/verification APIs; they do not pretend to be a successful Google OAuth consent/callback.

A real Google consent and callback test requires the operator's client configuration. Do not report it as passed until that step is completed. Anonymous previews remain available while configuration is pending.

Sources checked 2026-10-21: [Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google), [anonymous identity upgrades](https://supabase.com/docs/guides/auth/auth-anonymous), [manual identity linking](https://supabase.com/docs/reference/javascript/auth-linkidentity), [CLI config](https://supabase.com/docs/guides/local-development/cli/config).

# Blades ’68 campaign portal

A local, shared campaign dossier for fresh **Blades ’68** campaigns, adapted from [Doskvol Portal](https://github.com/bsxp/bitd-portal). React/TypeScript runs as a static frontend; Supabase supplies Google-linked and guest identities, PostgreSQL authorization and private file storage.

The workspace includes all eight standard and four GM-enabled paranormal playbooks, all six crews, factions and backing, clocks, Personal Business, Planning Meeting, active scores, reviewed Aftermath and corrections, shared notes, art, media and collaborative maps. The landing overview shows saved sheet summaries and authenticated online participants. Current published v6 sheets are the baseline; verified procedures cite the supplied v1.0.1 book. Unverified procedures remain manual, with table exceptions and house rules labeled explicitly.

## Run locally

With Node 22.12+, npm and Docker Desktop running:

```sh
cd app
npm ci
npm run backend:start
npm run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:5173**. Create a campaign as GM; use its player invitation in two separate browser profiles for independent players. Fresh campaigns start empty. The GM may review optional sample fiction or a precisely scoped workspace clear.

See [the development and deployment guide](app/README.md) for setup, identity recovery, safe resets, testing, troubleshooting and the reviewed future hosting path. No live hosting or paid service has been provisioned by this implementation.

[Google login](docs/google-login.md) adds recoverable accounts and a signed-in campaign list. Link existing guests to Google to preserve character ownership. Google requires backend OAuth client configuration; the local guest preview remains available before that setup.

## Architecture and references

`SessionProvider` restores the selected campaign against current backend membership; `CampaignLobby` mounts the protected feature boundaries. Feature-specific authenticated reads and field-limited mutation RPCs enforce ownership, GM confidentiality, validation and concurrency. Authorized snapshots poll and refresh on focus/reconnect; ephemeral map gestures and online presence use current-access RPCs. Durable records are never accepted from peer broadcasts. Private Storage downloads recheck current access.

- [Backend and feature contracts](docs/backend-contracts.md)
- [Verification coverage and local handoff](docs/verification.md)
- [Domain language](GLOSSARY.md) and [architectural decisions](docs/adr/)
- [Adaptation design](docs/design/blades68-adaptation.md) and [specification #1](https://github.com/STCTbone/bitd-portal/issues/1)

Active code lives in `app/src/components/` and feature modules in `app/src/lib/`. The authoritative fresh database is `app/supabase/migrations/`, applied in filename order. The old upstream automatic-game UI/store has been retired; `app/supabase/migration.sql` is historical upstream material and is never a setup command.

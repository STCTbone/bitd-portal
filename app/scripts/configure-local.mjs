import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

// This command configures ONLY the CLI's selected local development containers.
// Realtime creates its tenant after SQL migrations, so the private-only transport
// setting belongs here rather than in the application-schema migration.
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1]
if (!project) throw new Error('Expected an explicit safe local project_id')
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
if (!status.API_URL || !['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname)) throw new Error('Expected local Supabase')
execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
  input: "UPDATE _realtime.tenants SET private_only = true WHERE external_id = 'realtime-dev';\n",
  stdio: ['pipe', 'pipe', 'inherit'],
})
execFileSync('docker', ['exec', `supabase_realtime_${project}`, '/app/bin/realtime', 'rpc', 'Realtime.Tenants.Cache.invalidate_tenant_cache("realtime-dev")'], { stdio: 'pipe' })
writeFileSync('.env.local', `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`)
console.log('Configured private-only local Realtime; wrote .env.local public development credentials.')

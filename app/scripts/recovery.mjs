import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bucket = 'campaign-assets'
const sqlFiles = ['roles.sql', 'schema.sql', 'data.sql', 'history.sql']
// The PostgreSQL 17 client image used by the verified disposable Supabase stack.
const pgImage = 'public.ecr.aws/supabase/postgres:17.11.0.004'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const check = (condition, message) => { if (!condition) throw new Error(message) }
const unwrap = result => { check(!result.error, 'Storage operation failed; inspect the target privately'); return result.data }

// Never relay child-process errors: arguments/output can contain database credentials.
export function run(command, args, options = {}) {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }) }
  catch { throw new Error('Recovery subprocess failed. Check Docker, CLI and target access privately; restore may be incomplete.') }
}

function client(url, key) {
  check(key, 'A backend-only service key is required in the process environment')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export function validateSource(apiValue, dbValue, allowRemote = false) {
  const api = new URL(apiValue), db = new URL(dbValue)
  check(['postgres:', 'postgresql:'].includes(db.protocol), 'Expected a PostgreSQL URL')
  check(api.pathname === '/' && !api.username && !api.password && !api.search && !api.hash, 'Expected a plain Supabase API origin')
  if (api.protocol === 'http:' && api.hostname === '127.0.0.1' && db.hostname === '127.0.0.1') return { api, db }
  const ref = api.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1]
  check(allowRemote && api.protocol === 'https:' && ref, 'Remote capture needs --allow-remote and a Supabase HTTPS API')
  check(db.hostname === `db.${ref}.supabase.co` || (db.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(db.username) === `postgres.${ref}` && db.port === '5432'), 'Database/API project mismatch or unsupported pooler')
  check(['require', 'verify-full'].includes(db.searchParams.get('sslmode')), 'Hosted PostgreSQL capture requires sslmode=require or verify-full')
  return { api, db }
}

function historyVersions(sql) {
  const rows = sql.split(/\r?\n/)
  const start = rows.findIndex(row => /^COPY "?supabase_migrations"?\."?schema_migrations"? \("?version"?[,)]/.test(row))
  check(start >= 0, 'Missing migration history COPY section')
  const versions = []
  let end = start + 1
  for (; end < rows.length && rows[end] !== '\\.'; end++) {
    const version = rows[end].split('\t')[0]
    check(/^\d+$/.test(version), 'Unexpected migration history format')
    versions.push(version)
  }
  check(end < rows.length, 'Incomplete migration history')
  return versions.sort()
}

export function dumpWithTls(dbValue, name, execute = run) {
  const db = new URL(dbValue)
  const sslmode = db.searchParams.get('sslmode')
  check(['require', 'verify-full'].includes(sslmode), 'TLS is required')
  // The pinned Supabase CLI drops sslmode from its pg_dump environment. Use
  // libpq directly for hosted exports; secrets travel in env, never shell text.
  const env = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432', PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: decodeURIComponent(db.pathname.slice(1)), PGSSLMODE: sslmode }
  const keys = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE']
  const common = ['--quote-all-identifiers', '--role', 'postgres']
  const commands = {
    'roles.sql': ['pg_dumpall', '--roles-only', '--no-role-passwords'],
    'schema.sql': ['pg_dump', ...common, '--schema-only', '--schema', 'bitd', '--schema', 'public'],
    'data.sql': ['pg_dump', ...common, '--data-only', '--schema', 'bitd', '--schema', 'auth', '--schema', 'public', '--exclude-table', 'auth.schema_migrations'],
    'history.sql': ['pg_dump', ...common, '--data-only', '--schema', 'supabase_migrations'],
  }
  check(commands[name], 'Unknown SQL export')
  return execute('docker', ['run', '--rm', ...keys.flatMap(key => ['--env', key]), pgImage, ...commands[name]], { env, maxBuffer: 256 * 1024 * 1024 })
}

export async function inventory(storage) {
  const files = []
  async function walk(prefix = '') {
    for (let offset = 0; ; offset += 100) {
      const page = unwrap(await storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }))
      for (const entry of page) {
        check(typeof entry.name === 'string' && entry.name && !entry.name.includes('/') && !['.', '..'].includes(entry.name), 'Invalid Storage entry')
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id === null) await walk(path)
        else {
          check(typeof entry.id === 'string' && Number.isSafeInteger(entry.metadata?.size), 'Missing Storage file metadata')
          files.push({ path, id: entry.id, size: entry.metadata.size, updatedAt: entry.updated_at, contentType: entry.metadata.mimetype ?? 'application/octet-stream' })
        }
      }
      if (page.length < 100) break
    }
  }
  await walk()
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  check(new Set(files.map(file => file.path)).size === files.length, 'Storage changed during pagination')
  return files
}

async function storeFile(root, name, bytes) {
  await writeFile(join(root, name), bytes, { flag: 'wx', mode: 0o600 })
  return { file: name, size: Buffer.byteLength(bytes), sha256: hash(bytes) }
}

async function migrationFiles(directory) {
  return (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort()
}

export async function backup({ directory, dbUrl, storage, source, quiesced, execute = run, migrations = join(app, 'supabase/migrations') }) {
  check(quiesced, 'Stop campaign writes/uploads for the whole export; set PORTAL_BACKUP_QUIESCED=1 only after doing so')
  const info = unwrap(await storage.getBucket(bucket))
  check(info && info.public === false, 'Expected a private campaign-assets bucket')
  const before = await inventory(storage)
  await mkdir(directory, { mode: 0o700 }) // Refuse reuse, including incomplete bundles.
  await mkdir(join(directory, 'objects'), { mode: 0o700 })
  await mkdir(join(directory, 'migrations'), { mode: 0o700 })
  const files = []
  const migrationsList = await migrationFiles(migrations)
  check(migrationsList.length > 0, 'No authoritative migrations found')
  for (const name of migrationsList) files.push(await storeFile(directory, `migrations/${name}`, await readFile(join(migrations, name))))
  for (const [name, flags] of [
    ['roles.sql', ['--role-only']],
    ['schema.sql', ['--schema', 'bitd,public']],
    // Restore managed auth tables on a migrated Supabase baseline, with original IDs.
    // Storage metadata/bytes are rebuilt through its API; migrations recreate policies.
    ['data.sql', ['--data-only', '--use-copy', '--schema', 'bitd,auth,public', '--exclude', 'auth.schema_migrations']],
    ['history.sql', ['--data-only', '--use-copy', '--schema', 'supabase_migrations']],
  ]) {
    const output = join(directory, name)
    // Pre-create privately, before the CLI opens its output file.
    await writeFile(output, '', { flag: 'wx', mode: 0o600 })
    if (new URL(dbUrl).hostname === '127.0.0.1') {
      execute(join(app, 'node_modules/.bin/supabase'), ['db', 'dump', '--db-url', dbUrl, '--file', output, ...flags], { cwd: app })
    } else {
      await writeFile(output, dumpWithTls(dbUrl, name, execute), { mode: 0o600 })
    }
    const bytes = await readFile(output)
    check(bytes.length > 0, 'Empty SQL export')
    files.push({ file: name, size: bytes.length, sha256: hash(bytes) })
  }
  check(JSON.stringify(historyVersions(await readFile(join(directory, 'history.sql'), 'utf8'))) === JSON.stringify(migrationsList.map(name => name.split('_')[0])), 'Source migration history differs from local migrations')
  const objects = []
  for (const [index, entry] of before.entries()) {
    const blob = unwrap(await storage.from(bucket).download(entry.path))
    const bytes = Buffer.from(await blob.arrayBuffer())
    check(bytes.length === entry.size, 'Storage size changed during export')
    const saved = await storeFile(directory, `objects/${index}.bin`, bytes)
    files.push(saved)
    objects.push({ ...entry, file: saved.file })
  }
  check(JSON.stringify(before) === JSON.stringify(await inventory(storage)), 'Storage changed during export; discard this incomplete bundle and retry during a write freeze')
  const manifest = { version: 1, completedAt: new Date().toISOString(), source, bucket, files, objects, migrations: migrationsList }
  // Written last: absence means failed/incomplete, never eligible for retention.
  await storeFile(directory, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  await verify(directory)
  return manifest
}

async function regularFile(root, relative) {
  check(/^(roles|schema|data|history)\.sql$|^objects\/\d+\.bin$|^migrations\/\d+_[a-z0-9_]+\.sql$/.test(relative), 'Unexpected bundle path')
  let current = root
  const parts = relative.split('/')
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index])
    const stat = await lstat(current)
    check(!stat.isSymbolicLink() && (index === parts.length - 1 ? stat.isFile() : stat.isDirectory()), 'Bundle contains a symlink or non-regular file')
  }
  return readFile(current)
}

export async function verify(directory) {
  check((await lstat(directory)).isDirectory() && !(await lstat(directory)).isSymbolicLink(), 'Expected a real bundle directory')
  check((await lstat(join(directory, 'manifest.json'))).isFile() && !(await lstat(join(directory, 'manifest.json'))).isSymbolicLink(), 'Expected a regular manifest')
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  check(manifest.version === 1 && manifest.bucket === bucket && Number.isFinite(Date.parse(manifest.completedAt)), 'Invalid/incomplete manifest')
  check(Array.isArray(manifest.files) && Array.isArray(manifest.objects) && Array.isArray(manifest.migrations), 'Invalid manifest entries')
  const expected = [...sqlFiles, ...manifest.migrations.map(name => `migrations/${name}`), ...manifest.objects.map(object => object.file)].sort()
  const actual = manifest.files.map(file => file.file).sort()
  check(new Set(expected).size === expected.length && JSON.stringify(expected) === JSON.stringify(actual) && manifest.migrations.length > 0, 'Missing or duplicate bundle files')
  check(new Set(manifest.objects.map(object => object.path)).size === manifest.objects.length, 'Duplicate object paths')
  for (const file of manifest.files) {
    const bytes = await regularFile(directory, file.file)
    check(bytes.length === file.size && hash(bytes) === file.sha256, 'Backup integrity check failed')
  }
  for (const object of manifest.objects) {
    check(typeof object.path === 'string' && object.path.split('/').every(part => part && !['.', '..'].includes(part)) && !object.path.includes('\\'), 'Unsafe object path')
    check(/^objects\/\d+\.bin$/.test(object.file) && typeof object.contentType === 'string', 'Invalid object entry')
    check(manifest.files.find(file => file.file === object.file)?.size === object.size, 'Object size mismatch')
  }
  check(JSON.stringify(historyVersions(await readFile(join(directory, 'history.sql'), 'utf8'))) === JSON.stringify(manifest.migrations.map(name => name.split('_')[0])), 'Bundle migration history differs')
  return manifest
}

export async function restoreLocal({ directory, workdir, apiUrl, storage, execute = run }) {
  const manifest = await verify(directory) // Check every byte before any write.
  const config = await readFile(join(workdir, 'supabase/config.toml'), 'utf8')
  const project = config.match(/^project_id\s*=\s*"(bitd-recovery-[a-zA-Z0-9_-]+)"/m)?.[1]
  check(project, 'Restore requires a disposable bitd-recovery-* local project')
  const url = new URL(apiUrl)
  const apiPort = config.match(/\[api\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1]
  check(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === apiPort && url.pathname === '/', 'Restore requires the exact loopback API/port from the disposable config')
  check(!url.username && !url.password && !url.search && !url.hash, 'Unexpected restore URL fields')
  const names = await migrationFiles(join(workdir, 'supabase/migrations'))
  check(JSON.stringify(names) === JSON.stringify(manifest.migrations), 'Recovery target migration list differs from bundle')
  for (const name of names) check(hash(await readFile(join(workdir, 'supabase/migrations', name))) === manifest.files.find(file => file.file === `migrations/${name}`).sha256, 'Recovery target migration hash differs')
  const info = unwrap(await storage.getBucket(bucket))
  check(info && info.public === false && (await inventory(storage)).length === 0, 'Restore requires an empty private bucket')
  const dockerArgs = ['exec', '-i', `supabase_db_${project}`, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']
  const versions = execute('docker', dockerArgs, { input: 'select version from supabase_migrations.schema_migrations order by version;\n' }).trim().split('\n')
  check(JSON.stringify(versions) === JSON.stringify(names.map(name => name.split('_')[0])), 'Database migration history differs from bundle')
  const data = await readFile(join(directory, 'data.sql'), 'utf8')
  // This is deliberately not a general destructive restore. Existing identities or
  // campaigns reject the transaction. Migrations seed catalogs, cleared with data.
  // Managed Auth migration history belongs to the initialized target, is excluded
  // from both capture modes, and must survive so GoTrue does not replay its DDL.
  const sql = `BEGIN;
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM bitd.campaigns) THEN
  RAISE EXCEPTION 'Recovery target contains identities/campaigns';
END IF;
IF NOT EXISTS(SELECT 1 FROM auth.schema_migrations) THEN
  RAISE EXCEPTION 'Recovery target Auth is not initialized';
END IF;
END $$;
SET LOCAL session_replication_role = replica;
DO $$ DECLARE targets text; BEGIN
SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO targets
FROM pg_tables WHERE schemaname IN ('bitd','auth','public')
AND NOT (schemaname = 'auth' AND tablename = 'schema_migrations');
IF targets IS NOT NULL THEN EXECUTE 'TRUNCATE ' || targets || ' CASCADE'; END IF;
END $$;
${data}
COMMIT;\n`
  execute('docker', dockerArgs, { input: sql })
  for (const object of manifest.objects) {
    const bytes = await regularFile(directory, object.file)
    unwrap(await storage.from(bucket).upload(object.path, bytes, { contentType: object.contentType, cacheControl: '0', upsert: false }))
    const restored = unwrap(await storage.from(bucket).download(object.path))
    check(hash(Buffer.from(await restored.arrayBuffer())) === hash(bytes), 'Restored object hash differs')
  }
  // A file failure after SQL commit leaves an incomplete target: discard/recreate it.
  return manifest
}

export async function retention(root, keep, now = new Date()) {
  check(Number.isInteger(keep) && keep >= 2, 'Keep at least two complete bundles')
  const complete = []
  const ignored = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) { ignored.push(entry.name); continue }
    try {
      const manifest = await verify(join(root, entry.name))
      check(Date.parse(manifest.completedAt) <= now.getTime(), 'Future timestamp')
      complete.push({ name: entry.name, completedAt: manifest.completedAt })
    } catch { ignored.push(entry.name) }
  }
  complete.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
  return { keep: complete.slice(0, keep), candidates: complete.slice(keep), ignored }
}

async function main() {
  process.umask(0o077)
  const [command, directory, ...flags] = process.argv.slice(2)
  check(directory, 'Usage: npm run recovery -- backup|verify|restore-local|retention DIRECTORY [--execute] [--workdir=PATH] [--keep=14]')
  const allowed = command === 'restore-local' ? ['--execute', '--workdir='] : command === 'backup' ? ['--execute', '--allow-remote'] : command === 'retention' ? ['--keep='] : []
  check(flags.every(flag => allowed.some(option => option.endsWith('=') ? flag.startsWith(option) : flag === option)), 'Unknown option')
  if (command === 'verify') {
    const manifest = await verify(resolve(directory))
    console.log(`Verified ${manifest.files.length} files and ${manifest.objects.length} uploaded objects; integrity alone does not prove recovery.`)
  } else if (command === 'retention') {
    console.log(JSON.stringify(await retention(resolve(directory), Number(flags.find(flag => flag.startsWith('--keep='))?.slice(7) ?? 14)), null, 2))
  } else if (command === 'backup') {
    if (!flags.includes('--execute')) { console.log('Plan only: export roles/schema/data and migrations, download private campaign-assets, verify all hashes. No credentials read, network requests or files written. Use --execute during a write freeze.'); return }
    const { api, db } = validateSource(process.env.PORTAL_BACKUP_API_URL, process.env.PORTAL_BACKUP_DB_URL, flags.includes('--allow-remote'))
    const manifest = await backup({ directory: resolve(directory), dbUrl: db.href, source: api.origin, storage: client(api.href, process.env.PORTAL_BACKUP_SERVICE_KEY).storage, quiesced: process.env.PORTAL_BACKUP_QUIESCED === '1' })
    console.log(`Complete bundle: ${manifest.files.length} files, ${manifest.objects.length} objects. Store encrypted off-device and perform a restore drill.`)
  } else if (command === 'restore-local') {
    await verify(resolve(directory))
    if (!flags.includes('--execute')) { console.log('Plan only: verify target migrations, require empty disposable local Supabase, transactionally restore data, then upload and hash-check objects. No target contacted.'); return }
    const workdir = flags.find(flag => flag.startsWith('--workdir='))?.slice(10)
    check(workdir, 'An explicit disposable --workdir is required')
    const apiUrl = process.env.PORTAL_RESTORE_API_URL
    // Validate the target before constructing an authenticated client.
    check(new URL(apiUrl).hostname === '127.0.0.1' && new URL(apiUrl).protocol === 'http:', 'Remote restores are not supported')
    await restoreLocal({ directory: resolve(directory), workdir: resolve(workdir), apiUrl, storage: client(apiUrl, process.env.PORTAL_RESTORE_SERVICE_KEY).storage })
    console.log('Local data and object restore completed. Run authenticated GM/player/outsider checks before calling the drill successful.')
  } else throw new Error('Unknown recovery command')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Recovery failed. Check inputs, bundle integrity and the private runbook. Credentials and subprocess output are intentionally suppressed.'); process.exitCode = 1 })
}

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { backup, inventory, restoreLocal, retention, verify, run, validateSource, dumpWithTls } from './recovery.mjs'

async function fixture(t, count = 2) {
  const root = await mkdtemp(join(tmpdir(), 'bitd-recovery-unit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const migrations = join(root, 'supabase/migrations')
  await mkdir(migrations, { recursive: true })
  await writeFile(join(migrations, '202610150001_fixture.sql'), '-- fixture')
  await writeFile(join(root, 'supabase/config.toml'), 'project_id = "bitd-recovery-unit"\n[api]\nport = 55421\n')
  const bytes = new Map(Array.from({ length: count }, (_, i) => [`campaign/${String(i).padStart(3, '0')}/file`, Buffer.from(`private image ${i}`)]))
  const storage = {
    async getBucket() { return { data: { public: false } } },
    from() { return {
      async list(prefix, { offset, limit }) {
        const entries = new Map()
        for (const [path, data] of bytes) {
          if (prefix && !path.startsWith(prefix + '/')) continue
          const rest = prefix ? path.slice(prefix.length + 1) : path
          const [name, ...segments] = rest.split('/')
          entries.set(name, segments.length ? { name, id: null } : { name, id: path, updated_at: '2026-11-01', metadata: { size: data.length, mimetype: 'image/png' } })
        }
        return { data: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit) }
      },
      async download(path) { return bytes.has(path) ? { data: new Blob([bytes.get(path)]) } : { error: { message: 'missing' } } },
      async upload(path, data) { if (bytes.has(path)) return { error: {} }; bytes.set(path, Buffer.from(data)); return { data: {} } },
    } },
  }
  const calls = []
  const execute = (command, args, options) => {
    calls.push({ command, args, options })
    if (args.includes('--file')) {
      // Match the synchronous subprocess contract, while retaining async fixture setup.
      return ''
    }
    return options.input.startsWith('select version') ? '202610150001\n' : ''
  }
  return { root, migrations, bytes, storage, calls, execute }
}

// The exporter invokes a synchronous CLI. This fake writes only synthetic SQL.
import { writeFileSync } from 'node:fs'
async function capture(f, name = 'bundle') {
  const directory = join(f.root, name)
  await backup({ directory, migrations: f.migrations, dbUrl: 'postgresql://fixture@127.0.0.1/postgres', source: 'fixture', storage: f.storage, quiesced: true,
    execute: (command, args, options) => {
      f.execute(command, args, options)
      const output = args[args.indexOf('--file') + 1]
      writeFileSync(output, output.endsWith('history.sql') ? `COPY "supabase_migrations"."schema_migrations" ("version", "statements", "name") FROM stdin;\n${f.historyVersion ?? '202610150001'}\t{}\tfixture\n\\.\n` : '-- synthetic SQL\n')
    },
  })
  return directory
}

test('captures every nested file across a 100-entry page and restores exact bytes', async t => {
  const f = await fixture(t, 103)
  assert.equal((await inventory(f.storage)).length, 103)
  const directory = await capture(f)
  const original = new Map(f.bytes)
  assert.equal((await verify(directory)).objects.length, 103)
  assert(f.calls.some(call => call.args.includes('--role-only')))
  assert(f.calls.some(call => call.args.includes('--data-only') && call.args.includes('bitd,auth,public')))
  assert(f.calls.some(call => call.args.includes('--data-only') && call.args.includes('--exclude') && call.args.includes('auth.schema_migrations')))
  f.bytes.clear()
  await restoreLocal({ directory, workdir: f.root, apiUrl: 'http://127.0.0.1:55421', storage: f.storage, execute: f.execute })
  assert.deepEqual(f.bytes, original)
  const sql = f.calls.find(call => call.options?.input?.startsWith('BEGIN;')).options.input
  assert(sql.includes('auth.users') && sql.includes('bitd.campaigns') && sql.includes('COMMIT;'))
})

test('rejects tampering, missing SQL, unsafe paths and symlinked bytes before restore writes', async t => {
  const f = await fixture(t)
  const directory = await capture(f)
  const manifestFile = join(directory, 'manifest.json')
  const manifest = await readFile(manifestFile, 'utf8')
  const bytes = await readFile(join(directory, 'objects/0.bin'))
  await writeFile(join(directory, 'objects/0.bin'), 'corrupt')
  await assert.rejects(verify(directory), /integrity/)
  await writeFile(join(directory, 'objects/0.bin'), bytes)
  const changed = JSON.parse(manifest)
  changed.files = changed.files.filter(file => file.file !== 'data.sql')
  await writeFile(manifestFile, JSON.stringify(changed))
  await assert.rejects(verify(directory), /Missing/)
  changed.files.push({ file: '../escape', size: 0, sha256: '' })
  await writeFile(manifestFile, JSON.stringify(changed))
  await assert.rejects(verify(directory))
  await writeFile(manifestFile, manifest)
  await copyFile(join(directory, 'objects/0.bin'), join(f.root, 'outside'))
  await rm(join(directory, 'objects/0.bin'))
  await symlink(join(f.root, 'outside'), join(directory, 'objects/0.bin'))
  await assert.rejects(verify(directory), /symlink/)
})

test('failed export never produces a completion manifest; write freeze is required', async t => {
  const f = await fixture(t)
  const directory = join(f.root, 'failed')
  await assert.rejects(backup({ directory, storage: f.storage, quiesced: false }), /Stop campaign writes/)
  await assert.rejects(backup({ directory, dbUrl: 'postgresql://fixture@127.0.0.1/postgres', migrations: f.migrations, storage: f.storage, quiesced: true, execute: () => { throw new Error('fixture failure') } }), /fixture failure/)
  await assert.rejects(readFile(join(directory, 'manifest.json')))
})

test('a missing download or changing inventory leaves an incomplete export', async t => {
  const f = await fixture(t)
  const originalFrom = f.storage.from
  f.storage.from = () => ({ ...originalFrom(), download: async () => ({ error: {} }) })
  await assert.rejects(capture(f, 'missing'), /Storage operation failed/)
  await assert.rejects(readFile(join(f.root, 'missing/manifest.json')))
  f.storage.from = () => ({ ...originalFrom(), download: async path => {
    const data = f.bytes.get(path)
    f.bytes.delete(path)
    return { data: new Blob([data]) }
  } })
  await assert.rejects(capture(f, 'changed'), /Storage changed/)
  await assert.rejects(readFile(join(f.root, 'changed/manifest.json')))
})

test('refuses non-disposable, remote, occupied and mismatched restore targets', async t => {
  const f = await fixture(t)
  const directory = await capture(f)
  const restore = options => restoreLocal({ directory, workdir: f.root, apiUrl: 'http://127.0.0.1:55421', storage: f.storage, execute: f.execute, ...options })
  await assert.rejects(restore({ apiUrl: 'https://production.supabase.co' }), /loopback/)
  await assert.rejects(restore({ apiUrl: 'http://127.0.0.1:54321' }), /loopback/)
  await assert.rejects(restore({}), /empty private bucket/)
  f.bytes.clear()
  await assert.rejects(restore({ execute: () => 'wrong-version' }), /history differs/)
  await writeFile(join(f.migrations, '202610150001_fixture.sql'), '-- drift')
  await assert.rejects(restore({}), /hash differs/)
  await writeFile(join(f.root, 'supabase/config.toml'), 'project_id = "bitd-portal"\n')
  await assert.rejects(restore({}), /disposable/)
})

test('retention keeps newest verified bundles, ignores failures, never deletes', async t => {
  const f = await fixture(t, 0)
  const parent = join(f.root, 'archives')
  await mkdir(parent)
  for (let i = 1; i <= 3; i++) {
    const directory = await capture(f, `archives/bundle-${i}`)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    manifest.completedAt = `2026-10-2${i}T00:00:00.000Z`
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  }
  await mkdir(join(parent, 'failed'))
  const result = await retention(parent, 2, new Date('2026-11-01'))
  assert.deepEqual(result.keep.map(item => item.name), ['bundle-3', 'bundle-2'])
  assert.deepEqual(result.candidates.map(item => item.name), ['bundle-1'])
  assert.deepEqual(result.ignored, ['failed'])
  await verify(join(parent, 'bundle-1'))
  await assert.rejects(retention(parent, 1), /at least two/)
})

test('subprocess failures suppress secret-bearing command/output', () => {
  assert.throws(() => run(process.execPath, ['-e', 'console.error("fixture-secret");process.exit(1)']), error => !error.message.includes('fixture-secret'))
})

test('source validation requires matching hosted projects, TLS and explicit remote capture', () => {
  const ref = 'abcdefghijklmnopqrst'
  const api = `https://${ref}.supabase.co`
  const direct = `postgresql://postgres:fixture@db.${ref}.supabase.co:5432/postgres?sslmode=require`
  assert.doesNotThrow(() => validateSource('http://127.0.0.1:55421', 'postgresql://postgres:fixture@127.0.0.1:55422/postgres'))
  assert.throws(() => validateSource(api, direct), /allow-remote/)
  assert.doesNotThrow(() => validateSource(api, direct, true))
  assert.throws(() => validateSource(api, direct.replace(ref, 'wrongproject'), true), /mismatch/)
  assert.throws(() => validateSource(api, direct.replace('?sslmode=require', ''), true), /sslmode/)
  assert.doesNotThrow(() => validateSource(api, `postgresql://postgres.${ref}:fixture@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`, true))
})

test('source migration mismatch cannot become a complete recovery point', async t => {
  const f = await fixture(t)
  f.historyVersion = '202610150002'
  await assert.rejects(capture(f), /Source migration history differs/)
  await assert.rejects(readFile(join(f.root, 'bundle/manifest.json')))
})

test('hosted dump enforces libpq TLS without credentials in process arguments or shell code', () => {
  const calls = []
  for (const name of ['roles.sql', 'schema.sql', 'data.sql', 'history.sql']) {
    dumpWithTls('postgresql://postgres:fixture%24secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require', name, (command, args, options) => { calls.push({ command, args, options }); return '-- SQL' })
  }
  for (const call of calls) {
    assert.equal(call.command, 'docker')
    assert.equal(call.options.env.PGSSLMODE, 'require')
    assert.equal(call.options.env.PGPASSWORD, 'fixture$secret')
    assert(!call.args.join(' ').includes('fixture'))
    assert(!call.args.includes('bash'))
    assert(call.args.includes('PGSSLMODE'))
  }
  assert(calls[2].args.includes('auth.schema_migrations'))
  assert.throws(() => dumpWithTls('postgresql://localhost/postgres', 'data.sql'), /TLS/)
})

// Destructive only to an explicitly named, empty bitd-recovery-* local stack.
// Never supplies hosted credentials or uses the canonical preview's config.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { backup, restoreLocal, run, verify } from './recovery.mjs'

process.umask(0o077)
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workdir = process.env.PORTAL_RECOVERY_WORKDIR
const output = process.env.PORTAL_RECOVERY_BUNDLE_ROOT
assert(workdir && output, 'Set PORTAL_RECOVERY_WORKDIR and PORTAL_RECOVERY_BUNDLE_ROOT to disposable local paths')
const config = await readFile(join(workdir, 'supabase/config.toml'), 'utf8')
const project = config.match(/^project_id\s*=\s*"(bitd-recovery-[a-zA-Z0-9_-]+)"/m)?.[1]
assert(project, 'Only a disposable bitd-recovery-* project is allowed')
const cli = join(app, 'node_modules/.bin/supabase')
const status = JSON.parse(run(cli, ['status', '--workdir', workdir, '-o', 'json']))
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1')
const dockerArgs = ['exec', '-i', `supabase_db_${project}`, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']
assert.equal(run('docker', dockerArgs, { input: 'select (select count(*) from bitd.campaigns) + (select count(*) from auth.users);\n' }).trim(), '0', 'Drill must start with no campaigns or identities')
const options = { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } }
const makeClient = key => createClient(status.API_URL, key, options)
const gm = makeClient(status.ANON_KEY), player = makeClient(status.ANON_KEY), outsider = makeClient(status.ANON_KEY)
const admin = makeClient(status.SERVICE_ROLE_KEY)
let assertions = 0
const ok = result => { assert.equal(result.error, null); assertions++; return result.data }
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++ }
for (const identity of [gm, player, outsider]) ok(await identity.auth.signInAnonymously())
const campaign = ok(await gm.rpc('create_campaign', { p_name: 'Synthetic recovery drill' })).id
const invites = ok(await gm.rpc('get_campaign_invitations', { p_campaign: campaign }))
ok(await player.rpc('join_campaign', { p_invitation: invites.player }))
const playerId = ok(await player.auth.getUser()).user.id
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const assets = []
for (const shared of [false, true]) {
  let asset = ok(await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: shared ? 'Shared fixture' : 'GM private fixture' }))
  ok(await gm.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png' }))
  asset = ok(await gm.rpc('finish_asset', { p_asset: asset.id }))
  if (shared) asset = ok(await gm.rpc('update_asset', { p_asset: asset.id, p_title: asset.title, p_annotation: 'synthetic', p_shared: true, p_revision: asset.revision }))
  assets.push(asset)
}
await mkdir(output, { recursive: true, mode: 0o700 })
const directory = join(output, `drill-${Date.now()}`)
const started = Date.now()
await backup({ directory, dbUrl: status.DB_URL, source: status.API_URL, storage: admin.storage, quiesced: true })
equal((await verify(directory)).objects.length, 2)
// Only this already-checked disposable stack is reset, never app/supabase/config.toml.
run(cli, ['db', 'reset', '--local', '--workdir', workdir, '--yes'])
await restoreLocal({ directory, workdir, apiUrl: status.API_URL, storage: admin.storage })
equal(ok(await gm.rpc('campaign_role', { p_campaign: campaign })), 'gm')
equal(ok(await player.rpc('campaign_role', { p_campaign: campaign })), 'player')
equal(ok(await outsider.rpc('campaign_role', { p_campaign: campaign })), null)
equal(ok(await gm.rpc('get_campaign_invitations', { p_campaign: campaign })), invites)
equal(ok(await player.auth.getUser()).user.id, playerId)
equal(ok(await gm.from('faction_records').select('id').eq('campaign_id', campaign)).length, 56)
equal(ok(await player.from('campaign_assets').select('id').eq('campaign_id', campaign)).map(asset => asset.id), [assets[1].id])
equal(ok(await outsider.from('campaign_assets').select('id').eq('campaign_id', campaign)), [])
for (const asset of assets) equal(Buffer.from(await ok(await gm.storage.from('campaign-assets').download(asset.object_path)).arrayBuffer()), png)
equal(Buffer.from(await ok(await player.storage.from('campaign-assets').download(assets[1].object_path)).arrayBuffer()), png)
assert((await player.storage.from('campaign-assets').download(assets[0].object_path)).error); assertions++
assert((await outsider.storage.from('campaign-assets').download(assets[1].object_path)).error); assertions++
ok(await admin.from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', playerId))
assert((await player.storage.from('campaign-assets').download(assets[1].object_path)).error); assertions++
console.log(`Recovery drill passed ${assertions} assertions in ${((Date.now() - started) / 1000).toFixed(1)}s: real SQL export/reset/restore, identities, invitations, 56 factions, private/shared bytes, outsider denial and membership revocation.`)
console.log('Only synthetic data was captured. Stop/remove the disposable stack and delete the private drill bundle after recording the result.')

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
function localAdmin() {
  const local = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, local.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')

test('character owner and GM persist protected art while other identities cannot change or retrieve across campaigns', async () => {
  const gm = client(), owner = client(), peer = client(), outsider = client(), other = client()
  for (const identity of [gm, owner, peer, outsider, other]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Media boundaries' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  for (const identity of [owner, peer]) await identity.rpc('join_campaign', { p_invitation: invites.player })
  await other.rpc('create_campaign', { p_name: 'Other media' })
  const character = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Pixel' })).data.id
  const reserved = await owner.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'portrait', p_character: character, p_mime: 'image/png', p_size: png.length, p_title: 'Pixel portrait' })
  expect(reserved.error).toBeNull()
  const asset = reserved.data
  expect((await owner.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png' })).error).toBeNull()
  expect((await owner.rpc('finish_asset', { p_asset: asset.id })).error).toBeNull()
  for (const identity of [gm, owner, peer]) expect((await identity.storage.from('campaign-assets').download(asset.object_path)).error).toBeNull()
  for (const identity of [peer, outsider, other]) {
    expect((await identity.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'avatar', p_character: character, p_mime: 'image/png', p_size: png.length, p_title: 'Forged' })).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').upload(`${campaign}/${crypto.randomUUID()}.png`, png, { contentType: 'image/png' })).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').update(asset.object_path, png, { contentType: 'image/png' })).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').remove([asset.object_path])).data ?? []).toHaveLength(0)
  }
  for (const identity of [outsider, other]) {
    expect((await identity.from('campaign_assets').select('*').eq('id', asset.id)).data).toEqual([])
    expect((await identity.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  }
  expect((await owner.storage.from('campaign-assets').createSignedUrl(asset.object_path, 31536000)).error).not.toBeNull()
  expect((await owner.storage.from('campaign-assets').createSignedUploadUrl(asset.object_path)).error).not.toBeNull()
  expect((await fetch(owner.storage.from('campaign-assets').getPublicUrl(asset.object_path).data.publicUrl)).ok).toBe(false)
  const gmArt = await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'avatar', p_character: character, p_mime: 'image/png', p_size: png.length, p_title: 'GM chosen avatar' })
  expect(gmArt.error).toBeNull()
  expect((await gm.storage.from('campaign-assets').upload(gmArt.data.object_path, png, { contentType: 'image/png' })).error).toBeNull()
  expect((await gm.rpc('finish_asset', { p_asset: gmArt.data.id })).error).toBeNull()
  expect((await peer.from('character_art').select('*').eq('character_id', character).eq('kind', 'avatar')).data?.[0].asset_id).toBe(gmArt.data.id)
  expect((await owner.from('character_art').update({ asset_id: asset.id }).eq('character_id', character)).error).not.toBeNull()
  expect((await owner.from('character_art').delete().eq('character_id', character)).error).not.toBeNull()
  expect((await gm.rpc('can_use_map_asset', { p_campaign: campaign, p_asset: gmArt.data.id })).data).toBe(false)
})

test('owner portrait and avatar reload while GM image/audio sharing plays actual protected files', async ({ browser }) => {
  const gm = await browser.newContext(), player = await browser.newContext()
  const page = await gm.newPage(), peer = await player.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Sound and vision')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invite = await page.getByLabel('Player invitation').inputValue()
  await peer.goto('/'); await peer.getByLabel('Invitation', { exact: true }).fill(invite)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await peer.getByLabel('New character name').fill('Neon'); await peer.getByRole('button', { name: 'Create Hound', exact: true }).click()
  const dossier = peer.getByRole('article', { name: 'Neon dossier', exact: true })
  for (const kind of ['portrait', 'avatar']) {
    await dossier.getByLabel(`Choose ${kind} file`, { exact: true }).setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: png })
    await dossier.getByRole('button', { name: `Upload ${kind}`, exact: true }).click()
    await expect(dossier.getByRole('img', { name: `Neon ${kind}`, exact: true })).toBeVisible()
  }
  await peer.reload(); await peer.getByRole('button', { name: 'Open Neon', exact: true }).click()
  for (const kind of ['portrait', 'avatar']) await expect(peer.getByRole('img', { name: `Neon ${kind}`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open Neon', exact: true }).click()
  for (const kind of ['portrait', 'avatar']) await expect(page.getByRole('img', { name: `Neon ${kind}`, exact: true })).toBeVisible()
  const media = page.getByRole('region', { name: 'Campaign media', exact: true })
  const shared = peer.getByRole('region', { name: 'Campaign media', exact: true })
  await media.getByLabel('New media title').fill('SECRET photo')
  await media.getByLabel('New media file').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
  await media.getByRole('button', { name: 'Upload media', exact: true }).click()
  let card = media.getByRole('article', { name: 'SECRET photo', exact: true })
  await expect(card.getByRole('img')).toBeVisible()
  await expect(shared.getByRole('article')).toHaveCount(0)
  await card.getByLabel('Media title', { exact: true }).fill('The meeting place')
  await card.getByLabel('Media annotation', { exact: true }).fill('Look by the station')
  await card.getByLabel('Shared with players', { exact: true }).check()
  await card.getByRole('button', { name: 'Save media changes', exact: true }).click()
  card = media.getByRole('article', { name: 'The meeting place', exact: true })
  await expect(shared.getByRole('img', { name: 'The meeting place', exact: true })).toBeVisible()
  await expect(shared.getByText('Look by the station', { exact: true })).toBeVisible()
  const wav = Buffer.alloc(16044); wav.write('RIFF', 0); wav.writeUInt32LE(16036, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40)
  await media.getByLabel('New media title').fill('Station atmosphere')
  await media.getByLabel('New media file').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav })
  await media.getByRole('button', { name: 'Upload media', exact: true }).click()
  const audio = media.getByRole('article', { name: 'Station atmosphere', exact: true })
  await audio.getByLabel('Shared with players', { exact: true }).check(); await audio.getByRole('button', { name: 'Save media changes', exact: true }).click()
  const playerAudio = shared.locator('audio')
  await expect(playerAudio).toHaveCount(1)
  await expect.poll(() => playerAudio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0)
  await playerAudio.evaluate((element: HTMLAudioElement) => element.play())
  await expect.poll(() => playerAudio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0)
  await card.getByLabel('Shared with players', { exact: true }).uncheck(); await card.getByRole('button', { name: 'Save media changes', exact: true }).click()
  await expect(shared.getByRole('img')).toHaveCount(0)
  await page.reload(); await expect(page.getByRole('article', { name: 'Station atmosphere', exact: true }).locator('audio')).toHaveCount(1)
  await peer.reload(); await expect(peer.getByRole('region', { name: 'Campaign media', exact: true }).locator('audio')).toHaveCount(1)
  await page.getByRole('region', { name: 'Campaign media', exact: true }).screenshot({ path: 'test-results/media-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('region', { name: 'Campaign media', exact: true }).screenshot({ path: 'test-results/media-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await gm.close(); await player.close()
})

test('GM media lifecycle protects private bytes, rejects URL/metadata bypasses and cleans removed files', async () => {
  const gm = client(), player = client(), outsider = client(), other = client()
  for (const identity of [gm, player, outsider, other]) await identity.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Private media lifecycle' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  await player.rpc('join_campaign', { p_invitation: invites.player })
  await other.rpc('create_campaign', { p_name: 'Different media campaign' })
  const reservation = { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'SECRET station plan' }
  for (const invalid of [{ p_mime: 'text/html' }, { p_kind: 'audio' }, { p_size: 10485761 }, { p_size: 0 }, { p_title: '' }, { p_character: crypto.randomUUID() }]) {
    expect((await gm.rpc('reserve_asset', { ...reservation, ...invalid })).error).not.toBeNull()
  }
  const reserved = await gm.rpc('reserve_asset', reservation)
  expect(reserved.error).toBeNull()
  const asset = reserved.data
  expect((await gm.rpc('finish_asset', { p_asset: asset.id })).error).not.toBeNull()
  expect((await gm.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png' })).error).toBeNull()
  const finished = await gm.rpc('finish_asset', { p_asset: asset.id })
  expect(finished.error).toBeNull()
  expect((await gm.rpc('finish_asset', { p_asset: asset.id })).data.revision).toBe(finished.data.revision)
  for (const identity of [player, outsider, other]) {
    expect((await identity.from('campaign_assets').select('*').eq('id', asset.id)).data).toEqual([])
    expect((await identity.storage.from('campaign-assets').list(`${campaign}/${asset.id}`)).data).toEqual([])
    expect((await identity.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').info(asset.object_path)).error).not.toBeNull()
    expect((await identity.rpc('reserve_asset', reservation)).error).not.toBeNull()
    expect((await identity.rpc('finish_asset', { p_asset: asset.id })).error).not.toBeNull()
    expect((await identity.rpc('update_asset', { p_asset: asset.id, p_title: 'forged', p_annotation: '', p_shared: true, p_revision: finished.data.revision })).error).not.toBeNull()
    expect((await identity.rpc('remove_asset', { p_asset: asset.id, p_revision: finished.data.revision })).error).not.toBeNull()
  }
  for (const identity of [gm, player, outsider, other]) {
    expect((await identity.from('campaign_assets').insert({ ...asset, id: crypto.randomUUID() })).error).not.toBeNull()
    expect((await identity.from('campaign_assets').update({ shared: true }).eq('id', asset.id)).error).not.toBeNull()
    expect((await identity.from('campaign_assets').delete().eq('id', asset.id)).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').createSignedUrl(asset.object_path, 31536000)).error).not.toBeNull()
    const signed = await identity.storage.from('campaign-assets').createSignedUrls([asset.object_path], 31536000)
    expect(signed.data?.some(item => !!item.signedUrl) ?? false).toBe(false)
    expect((await identity.storage.from('campaign-assets').createSignedUploadUrl(asset.object_path)).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').update(asset.object_path, png, { contentType: 'image/png' })).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png', upsert: true })).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').copy(asset.object_path, `${campaign}/copy`)).error).not.toBeNull()
    expect((await identity.storage.from('campaign-assets').move(asset.object_path, `${campaign}/moved`)).error).not.toBeNull()
  }
  const shared = await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'Station plan', p_annotation: 'Meet here', p_shared: true, p_revision: finished.data.revision })
  expect(shared.error).toBeNull()
  expect((await player.storage.from('campaign-assets').info(asset.object_path)).error).toBeNull()
  const downloaded = await player.storage.from('campaign-assets').download(asset.object_path)
  expect(downloaded.error).toBeNull(); expect(Buffer.from(await downloaded.data!.arrayBuffer())).toEqual(png)
  expect((await player.storage.from('campaign-assets').list(`${campaign}/${asset.id}`)).data).toHaveLength(1)
  for (const identity of [outsider, other]) expect((await identity.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  expect((await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'Stale', p_annotation: '', p_shared: true, p_revision: finished.data.revision })).error?.code).toBe('40001')
  const hidden = await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'SECRET updated plan', p_annotation: 'SECRET new target', p_shared: false, p_revision: shared.data.revision })
  expect(hidden.error).toBeNull()
  expect((await player.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  expect((await player.storage.from('campaign-assets').info(asset.object_path)).error).not.toBeNull()
  expect((await player.from('campaign_assets').select('*').eq('id', asset.id)).data).toEqual([])
  expect((await gm.rpc('remove_asset', { p_asset: asset.id, p_revision: hidden.data.revision })).error).toBeNull()
  expect((await gm.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  const cleanup = await gm.storage.from('campaign-assets').remove([asset.object_path])
  expect(cleanup.error).toBeNull(); expect(cleanup.data).toHaveLength(1)
})

test('incomplete uploads stay private, validate actual objects, and immutable paths cannot be substituted', async () => {
  const gm = client(), player = client()
  await gm.auth.signInAnonymously(); await player.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Pending media' })).data.id
  const invitation = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  await player.rpc('join_campaign', { p_invitation: invitation })
  const reserved = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length + 1, p_title: 'Unfinished plan' })).data
  expect((await gm.storage.from('campaign-assets').upload(reserved.object_path, png, { contentType: 'image/png' })).error).toBeNull()
  expect((await gm.rpc('finish_asset', { p_asset: reserved.id })).error?.message).toContain('does not match')
  for (const identity of [gm, player]) expect((await identity.storage.from('campaign-assets').download(reserved.object_path)).error).not.toBeNull()
  expect((await player.from('campaign_assets').select('*').eq('id', reserved.id)).data).toEqual([])
  expect((await gm.storage.from('campaign-assets').upload(`${campaign}/${crypto.randomUUID()}/file`, png, { contentType: 'image/png' })).error).not.toBeNull()
  expect((await gm.from('character_art').insert({ character_id: crypto.randomUUID(), kind: 'portrait', asset_id: reserved.id })).error).not.toBeNull()
  expect((await gm.rpc('remove_asset', { p_asset: reserved.id, p_revision: reserved.revision })).error).toBeNull()
  expect((await gm.storage.from('campaign-assets').remove([reserved.object_path])).data).toHaveLength(1)
})

test('upload and media edit failures retain retryable drafts and confirmed removal revokes viewers', async ({ browser }) => {
  const gm = await browser.newContext(), player = await browser.newContext()
  const page = await gm.newPage(), peer = await player.newPage()
  await page.goto('/'); await page.getByLabel('Campaign name', { exact: true }).fill('Media recovery')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invite = await page.getByLabel('Player invitation').inputValue()
  await peer.goto('/'); await peer.getByLabel('Invitation', { exact: true }).fill(invite)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const media = page.getByRole('region', { name: 'Campaign media', exact: true })
  const shared = peer.getByRole('region', { name: 'Campaign media', exact: true })
  await page.route('**/rest/v1/rpc/finish_asset', route => route.abort(), { times: 1 })
  await media.getByLabel('New media title').fill('Retry plan')
  await media.getByLabel('New media file').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png })
  await media.getByRole('button', { name: 'Upload media', exact: true }).click()
  await expect(media.getByRole('alert')).toContainText('file is retained for retry')
  await expect(shared.getByRole('article')).toHaveCount(0)
  await media.getByRole('button', { name: 'Upload media', exact: true }).click()
  const card = media.getByRole('article', { name: 'Retry plan', exact: true })
  await expect(card.getByRole('img')).toBeVisible()
  await page.route('**/rest/v1/rpc/update_asset', route => route.abort(), { times: 1 })
  await card.getByLabel('Media annotation', { exact: true }).fill('Retained annotation')
  await card.getByLabel('Shared with players', { exact: true }).check()
  await card.getByRole('button', { name: 'Save media changes', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('draft is retained')
  await expect(card.getByLabel('Media annotation', { exact: true })).toHaveValue('Retained annotation')
  await expect(shared.getByRole('article')).toHaveCount(0)
  await card.getByRole('button', { name: 'Save media changes', exact: true }).click()
  await expect(shared.getByRole('img', { name: 'Retry plan', exact: true })).toBeVisible()
  await expect(shared.getByText('Retained annotation', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Remove media', exact: true }).click()
  await expect(shared.getByRole('img')).toHaveCount(1)
  await card.getByRole('button', { name: 'Confirm remove media', exact: true }).click()
  await expect(card).toHaveCount(0); await expect(shared.getByRole('article')).toHaveCount(0)
  await gm.close(); await player.close()
})

test('map image extension accepts only a ready shared image from the current campaign', async () => {
  const gm = client(), player = client(), outsider = client()
  for (const identity of [gm, player, outsider]) await identity.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Map asset contract' })).data.id
  const otherCampaign = (await outsider.rpc('create_campaign', { p_name: 'Other map' })).data.id
  await player.rpc('join_campaign', { p_invitation: (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player })
  const asset = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'Map image' })).data
  const valid = (identity: ReturnType<typeof client>, candidateCampaign = campaign) => identity.rpc('can_use_map_asset', { p_campaign: candidateCampaign, p_asset: asset.id })
  expect((await valid(gm)).error).toBeNull(); expect((await valid(gm)).data).toBe(false)
  await gm.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png' })
  const ready = (await gm.rpc('finish_asset', { p_asset: asset.id })).data
  expect((await valid(gm)).data).toBe(false)
  const shared = (await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'Map image', p_annotation: '', p_shared: true, p_revision: ready.revision })).data
  expect((await valid(gm)).data).toBe(true); expect((await valid(player)).data).toBe(true)
  expect((await valid(outsider)).data).toBe(false); expect((await valid(gm, otherCampaign)).data).toBe(false)
  expect((await player.storage.from('campaign-assets').download(asset.object_path)).error).toBeNull()
  await gm.rpc('remove_asset', { p_asset: asset.id, p_revision: shared.revision })
  expect((await valid(player)).data).toBe(false)
})

test('two connected viewers clear unshared media within the lease and delayed snapshots cannot revive it', async ({ browser }) => {
  test.setTimeout(45000)
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Bounded media access' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const reserved = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'Shared photograph' })).data
  await gm.storage.from('campaign-assets').upload(reserved.object_path, png, { contentType: 'image/png' })
  const ready = (await gm.rpc('finish_asset', { p_asset: reserved.id })).data
  const sharedAsset = (await gm.rpc('update_asset', { p_asset: reserved.id, p_title: 'Shared photograph', p_annotation: 'Public caption', p_shared: true, p_revision: ready.revision })).data
  const contexts = [await browser.newContext(), await browser.newContext()]
  const pages = [await contexts[0].newPage(), await contexts[1].newPage()]
  for (const page of pages) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.player)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Shared photograph', exact: true })).toBeVisible()
  }
  const page = pages[0]
  let heldAssets = false, heldInfo = false
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  // Hold actual authorized responses in transit, including renewal responses.
  // Nothing fabricates an allowed backend response after the permission change.
  await page.route('**/rest/v1/campaign_assets?*', async route => {
    const response = await route.fetch(); heldAssets = true; await gate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.route('**/storage/v1/object/info/**', async route => {
    const response = await route.fetch(); heldInfo = true; await gate
    await route.fulfill({ response }).catch(() => {})
  })
  await expect.poll(() => heldAssets && heldInfo).toBe(true)
  const hidden = await gm.rpc('update_asset', { p_asset: reserved.id, p_title: 'SECRET new photograph', p_annotation: 'SECRET private caption', p_shared: false, p_revision: sharedAsset.revision })
  expect(hidden.error).toBeNull()
  await expect(pages[1].getByRole('img')).toHaveCount(0)
  await expect(page.getByRole('img')).toHaveCount(0, { timeout: 10500 })
  const oldResponse = page.waitForResponse(response => response.url().includes('/rest/v1/campaign_assets?'))
  release(); await oldResponse
  await page.unrouteAll({ behavior: 'wait' })
  await expect(page.getByRole('region', { name: 'Campaign media', exact: true })).toContainText('No media is shared with you.')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await page.getByRole('img').count()).toBe(0)
  for (const viewer of pages) expect(await viewer.content()).not.toContain('SECRET private caption')
  const reshared = await gm.rpc('update_asset', { p_asset: reserved.id, p_title: 'Public photograph again', p_annotation: 'Public again', p_shared: true, p_revision: hidden.data.revision })
  expect(reshared.error).toBeNull()
  for (const viewer of pages) await expect(viewer.getByRole('img', { name: 'Public photograph again', exact: true })).toBeVisible()
  // A download that was authorized before unsharing must not remount afterward.
  let downloadHeld = false
  let releaseDownload!: () => void
  const downloadGate = new Promise<void>(resolve => { releaseDownload = resolve })
  await page.route('**/storage/v1/object/campaign-assets/**', async route => {
    const response = await route.fetch(); downloadHeld = true; await downloadGate
    await route.fulfill({ response }).catch(() => {})
  }, { times: 1 })
  await page.reload(); await expect.poll(() => downloadHeld).toBe(true)
  const hiddenAgain = await gm.rpc('update_asset', { p_asset: reserved.id, p_title: 'Private again', p_annotation: '', p_shared: false, p_revision: reshared.data.revision })
  expect(hiddenAgain.error).toBeNull()
  await expect(page.getByRole('article', { name: 'Public photograph again', exact: true })).toHaveCount(0)
  const lateDownload = page.waitForResponse(response => response.url().includes('/storage/v1/object/campaign-assets/'))
  releaseDownload(); await lateDownload
  await page.unrouteAll({ behavior: 'wait' })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await page.getByRole('img').count()).toBe(0)
  expect((await gm.rpc('update_asset', { p_asset: reserved.id, p_title: 'Membership preview', p_annotation: '', p_shared: true, p_revision: hiddenAgain.data.revision })).error).toBeNull()
  for (const viewer of pages) await expect(viewer.getByRole('img', { name: 'Membership preview', exact: true })).toBeVisible()
  const admin = localAdmin()
  const members = await admin.from('campaign_members').select('user_id').eq('campaign_id', campaign).eq('role', 'player')
  for (const member of members.data!) await admin.from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', member.user_id)
  for (const viewer of pages) await expect(viewer.getByRole('img')).toHaveCount(0)
  await page.reload(); await expect(page.getByRole('heading', { name: 'Gather the crew', exact: true })).toBeVisible()
  for (const context of contexts) await context.close()
})

test('media metadata and file identities never enter public or unauthorized private realtime topics', async () => {
  const gm = client(), player = client()
  await gm.auth.signInAnonymously(); await player.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Media transport privacy' })).data.id
  await player.rpc('join_campaign', { p_invitation: (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player })
  await player.realtime.setAuth()
  for (const privateChannel of [false, true]) {
    const events: unknown[] = []
    const channel = player.channel(`campaign:${campaign}`, { config: { private: privateChannel } })
      .on('postgres_changes', { event: '*', schema: 'bitd', table: 'campaign_assets' }, event => events.push(event))
      .on('broadcast', { event: '*' }, event => events.push(event))
    const result = await new Promise<{ status: string; reason: string }>(resolve => channel.subscribe((status, error) => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) resolve({ status, reason: error?.message ?? '' })
    }))
    expect(result.status).toBe('CHANNEL_ERROR'); expect(result.reason).toMatch(privateChannel ? /permissions|unauthorized/i : /private/i)
    const asset = await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'SECRET raw media identity' })
    expect(asset.error).toBeNull()
    expect((await gm.rpc('remove_asset', { p_asset: asset.data.id, p_revision: asset.data.revision })).error).toBeNull()
    expect(events).toEqual([])
    await player.removeChannel(channel)
  }
})

test('audio remains role protected and cannot substitute for a map image', async () => {
  const gm = client(), player = client(), other = client()
  for (const identity of [gm, player, other]) await identity.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Audio delivery' })).data.id
  await player.rpc('join_campaign', { p_invitation: (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player })
  await other.rpc('create_campaign', { p_name: 'Other audio' })
  const bytes = Buffer.from('OggS media storage fixture')
  const reserved = await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'audio', p_character: null, p_mime: 'audio/ogg', p_size: bytes.length, p_title: 'SECRET atmosphere' })
  expect(reserved.error).toBeNull()
  const asset = reserved.data
  expect((await gm.storage.from('campaign-assets').upload(asset.object_path, bytes, { contentType: 'audio/ogg' })).error).toBeNull()
  const finished = (await gm.rpc('finish_asset', { p_asset: asset.id })).data
  for (const identity of [player, other]) expect((await identity.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  const shared = await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'Atmosphere', p_annotation: 'Wind at the station', p_shared: true, p_revision: finished.revision })
  expect(shared.error).toBeNull()
  const downloaded = await player.storage.from('campaign-assets').download(asset.object_path)
  expect(downloaded.error).toBeNull(); expect(Buffer.from(await downloaded.data!.arrayBuffer())).toEqual(bytes)
  expect((await other.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  expect((await gm.rpc('can_use_map_asset', { p_campaign: campaign, p_asset: asset.id })).data).toBe(false)
  expect((await player.storage.from('campaign-assets').createSignedUrl(asset.object_path, 31536000)).error).not.toBeNull()
  await gm.rpc('remove_asset', { p_asset: asset.id, p_revision: shared.data.revision })
  expect((await player.storage.from('campaign-assets').download(asset.object_path)).error).not.toBeNull()
  expect((await gm.storage.from('campaign-assets').remove([asset.object_path])).data).toHaveLength(1)
})

test('GM demotion clears private previews and upload controls, reconnect restores only current permitted state', async ({ browser }) => {
  const gm = client(); await gm.auth.signInAnonymously()
  const creator = (await gm.auth.getUser()).data.user!.id
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Media role changes' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const asset = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'SECRET GM preview' })).data
  await gm.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png' })
  await gm.rpc('finish_asset', { p_asset: asset.id })
  const context = await browser.newContext(), page = await context.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.gm)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const media = page.getByRole('region', { name: 'Campaign media', exact: true })
  await expect(media.getByRole('img', { name: 'SECRET GM preview', exact: true })).toBeVisible()
  const admin = localAdmin()
  const viewer = (await admin.from('campaign_members').select('user_id').eq('campaign_id', campaign).neq('user_id', creator).single()).data!.user_id
  expect((await admin.from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('user_id', viewer)).error).toBeNull()
  await expect(media.getByRole('img')).toHaveCount(0)
  await expect(media.getByLabel('New media file')).toHaveCount(0)
  expect((await admin.from('campaign_members').update({ role: 'gm' }).eq('campaign_id', campaign).eq('user_id', viewer)).error).toBeNull()
  await expect(media.getByRole('img', { name: 'SECRET GM preview', exact: true })).toBeVisible()
  await context.setOffline(true)
  await expect(media.getByRole('img')).toHaveCount(0)
  await expect(media.getByRole('alert')).toContainText('Previews cleared', { timeout: 10500 })
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Campaign media', exact: true }).getByRole('img', { name: 'SECRET GM preview', exact: true })).toBeVisible()
  await context.close()
})

test('protected preview renewal bypasses an uploader controlled long cache lifetime', async ({ browser }) => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Uncached access renewal' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const asset = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'Long cached image' })).data
  await gm.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png', cacheControl: '31536000' })
  const ready = (await gm.rpc('finish_asset', { p_asset: asset.id })).data
  await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'Long cached image', p_annotation: '', p_shared: true, p_revision: ready.revision })
  const context = await browser.newContext(), page = await context.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const renewal = page.waitForRequest(request => request.url().includes('/storage/v1/object/info/campaign-assets/'))
  await expect(page.getByRole('img', { name: 'Long cached image', exact: true })).toBeVisible()
  // No routing/interception: Playwright routing itself disables HTTP caching.
  // This observes the actual browser's request at the Storage boundary.
  expect((await (await renewal).allHeaders())['cache-control']).toBe('no-cache')
  await context.close()
})

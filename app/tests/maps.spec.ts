import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
async function table() {
  const gm = client(), a = client(), b = client(), outsider = client()
  for (const person of [gm, a, b, outsider]) expect((await person.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Map table' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const person of [a, b]) await person.rpc('join_campaign', { p_invitation: invite })
  const character = (await a.rpc('create_character', { p_campaign: campaign, p_name: 'Cinder' })).data
  return { gm, a, b, outsider, campaign, invite, character }
}
test('saved token authority follows current character ownership and explicit GM assignment', async () => {
  const { gm, a, b, outsider, campaign, character } = await table()
  const created = await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Cinder', p_character: character.id, p_controller: null })
  expect(created.error).toBeNull()
  const token = created.data
  const move = (person: ReturnType<typeof client>, revision = token.revision) => person.rpc('move_map_token', { p_token: token.id, p_x: 25, p_y: 75, p_revision: revision })
  for (const person of [b, outsider]) expect((await move(person)).error).not.toBeNull()
  const moved = await move(a); expect(moved.error).toBeNull(); expect(moved.data.x).toBe(25)
  expect((await move(a)).error?.code).toBe('40001')
  const bId = (await b.auth.getUser()).data.user!.id
  expect((await gm.rpc('assign_character_owner', { p_character: character.id, p_owner: bId, p_expected_owner: character.owner_id })).error).toBeNull()
  expect((await move(a, moved.data.revision)).error?.code).toBe('42501')
  expect((await move(b, moved.data.revision)).error).toBeNull()
  const assigned = await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Scout', p_character: null, p_controller: bId })
  expect(assigned.error).toBeNull()
  expect((await a.rpc('create_map_token', { p_campaign: campaign, p_label: 'Forged', p_character: null, p_controller: bId })).error).not.toBeNull()
  expect((await a.from('map_tokens').update({ x: 99 }).eq('id', token.id)).error).not.toBeNull()
  expect((await outsider.rpc('get_map_state', { p_campaign: campaign })).error).not.toBeNull()
  const snapshot = await b.rpc('get_map_state', { p_campaign: campaign })
  expect(snapshot.error).toBeNull(); expect(snapshot.data.tokens).toHaveLength(2)
  expect(snapshot.data.tokens.every((value: { can_move: boolean }) => value.can_move)).toBe(true)
})
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
test('GM uploads a persistent shared map and two players see only accepted token movement with retry', async ({ browser }) => {
  const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext({ viewport: { width: 390, height: 844 } })]
  const [gm, a, b] = await Promise.all(contexts.map(context => context.newPage()))
  await gm.goto('/'); await gm.getByLabel('Campaign name', { exact: true }).fill('Station floor')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invite = await gm.getByLabel('Player invitation').inputValue()
  for (const page of [a, b]) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invite)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  const map = gm.getByRole('region', { name: 'Campaign map', exact: true })
  await expect(map).toBeVisible()
  await map.getByLabel('Upload map image', { exact: true }).setInputFiles({ name: 'floor.png', mimeType: 'image/png', buffer: readFileSync('tests/fixtures/map-grid.png') })
  await map.getByRole('button', { name: 'Upload and use map', exact: true }).click()
  for (const page of [gm, a, b]) await expect(page.getByRole('img', { name: 'Saved campaign map', exact: true })).toBeVisible()
  const aId = await a.getByLabel('Your participant ID').inputValue()
  await map.getByLabel('New token label', { exact: true }).fill('Scout')
  await map.getByLabel('New token movement authority', { exact: true }).selectOption(`participant:${aId}`)
  await map.getByRole('button', { name: 'Create token', exact: true }).click()
  const token = a.getByRole('article', { name: 'Token Scout', exact: true })
  await expect(token.getByRole('button', { name: 'Move token', exact: true })).toBeVisible()
  await expect(b.getByRole('article', { name: 'Token Scout', exact: true }).getByRole('button', { name: 'Move token', exact: true })).toHaveCount(0)
  await a.route('**/rest/v1/rpc/move_map_token', route => route.abort(), { times: 1 })
  await token.getByLabel('Horizontal position').fill('25'); await token.getByLabel('Vertical position').fill('75')
  await token.getByRole('button', { name: 'Move token', exact: true }).click()
  await expect(token.getByRole('alert')).toContainText('draft retained')
  await expect(token.getByLabel('Horizontal position')).toHaveValue('25')
  await expect(b.getByRole('article', { name: 'Token Scout', exact: true })).toContainText('Saved position: 50%, 50%')
  await token.getByRole('button', { name: 'Retry move', exact: true }).click()
  for (const page of [gm, a, b]) await expect(page.getByRole('article', { name: 'Token Scout', exact: true })).toContainText('Saved position: 25%, 75%')
  await b.reload(); await expect(b.getByRole('img', { name: 'Saved campaign map', exact: true })).toBeVisible()
  await expect(b.getByRole('article', { name: 'Token Scout', exact: true })).toContainText('Saved position: 25%, 75%')
  const bId = await b.getByLabel('Your participant ID').inputValue()
  await map.getByLabel('New token label').fill('Lookout')
  await map.getByLabel('New token movement authority').selectOption(`participant:${bId}`)
  await map.getByRole('button', { name: 'Create token', exact: true }).click()
  const mobile = b.getByRole('article', { name: 'Token Lookout', exact: true })
  await mobile.getByLabel('Horizontal position').fill('80'); await mobile.getByLabel('Vertical position').fill('20')
  await mobile.getByRole('button', { name: 'Move token', exact: true }).click()
  await expect(map.getByRole('article', { name: 'Token Lookout', exact: true })).toContainText('Saved position: 80%, 20%')
  const surface = b.locator('[data-map-surface]')
  const rect = (await surface.boundingBox())!, point = (await surface.getByLabel('Lookout map position', { exact: true }).boundingBox())!
  expect(Math.abs(point.x + point.width / 2 - (rect.x + rect.width * .8))).toBeLessThan(3)
  expect(Math.abs(point.y + point.height / 2 - (rect.y + rect.height * .2))).toBeLessThan(3)
  expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await map.screenshot({ path: 'test-results/map-desktop.png' }); await b.getByRole('region', { name: 'Campaign map', exact: true }).screenshot({ path: 'test-results/map-mobile.png' })
  for (const context of contexts) await context.close()
})
test('offline map snapshots preserve a failed move draft until reconnect and explicit retry', async ({ page, context }) => {
  const { gm, campaign, invite } = await table()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invite)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const owner = await page.getByLabel('Your participant ID').inputValue()
  expect((await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Offline scout', p_character: null, p_controller: owner })).error).toBeNull()
  const token = page.getByRole('article', { name: 'Token Offline scout', exact: true })
  await token.getByLabel('Horizontal position').fill('35')
  await context.setOffline(true)
  await token.getByRole('button', { name: 'Move token', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Campaign map', exact: true }).getByRole('alert').filter({ hasText: 'Map sync unavailable' })).toBeVisible()
  await expect(token.getByLabel('Horizontal position')).toHaveValue('35')
  await expect(token.getByRole('alert')).toContainText('draft retained')
  await context.setOffline(false)
  await token.getByRole('button', { name: 'Retry move', exact: true }).click()
  await expect(token).toContainText('Saved position: 35%, 50%')
  await page.reload(); await expect(token).toContainText('Saved position: 35%, 50%')
})
async function sharedImage(gm: ReturnType<typeof client>, campaign: string, shared = true) {
  const asset = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: png.length, p_title: 'Floor plan' })).data
  expect((await gm.storage.from('campaign-assets').upload(asset.object_path, png, { contentType: 'image/png' })).error).toBeNull()
  const ready = (await gm.rpc('finish_asset', { p_asset: asset.id })).data
  return shared ? (await gm.rpc('update_asset', { p_asset: asset.id, p_title: 'Floor plan', p_annotation: '', p_shared: true, p_revision: ready.revision })).data : ready
}
test('map selection validates shared campaign assets, detects races, and rejects direct or foreign writes', async () => {
  const { gm, a, outsider, campaign, character } = await table()
  const otherCampaign = (await outsider.rpc('create_campaign', { p_name: 'Foreign table' })).data.id
  const foreign = await sharedImage(outsider, otherCampaign)
  const privateImage = await sharedImage(gm, campaign, false)
  const asset = await sharedImage(gm, campaign)
  const select = (person: ReturnType<typeof client>, assetId: string | null, revision = 0) => person.rpc('set_campaign_map', { p_campaign: campaign, p_asset: assetId, p_revision: revision })
  for (const person of [a, outsider]) expect((await select(person, asset.id)).error?.code).toBe('42501')
  for (const id of [foreign.id, privateImage.id, crypto.randomUUID()]) expect((await select(gm, id)).error).not.toBeNull()
  const race = await Promise.all([select(gm, asset.id), select(gm, asset.id)])
  expect(race.filter(result => !result.error)).toHaveLength(1)
  expect(race.find(result => result.error)?.error?.code).toBe('40001')
  const saved = race.find(result => !result.error)!.data
  expect(saved.asset_id).toBe(asset.id)
  expect((await select(gm, null)).error?.code).toBe('40001')
  expect((await a.rpc('get_map_state', { p_campaign: campaign })).data.map.asset_id).toBe(asset.id)
  for (const person of [gm, a]) {
    expect((await person.from('campaign_maps').update({ asset_id: foreign.id }).eq('campaign_id', campaign)).error).not.toBeNull()
    expect((await person.from('map_tokens').insert({ campaign_id: campaign, label: 'Forged', character_id: character.id, x: 3, y: 4 })).error).not.toBeNull()
    expect((await person.from('map_tokens').delete().eq('campaign_id', campaign)).error).not.toBeNull()
  }
  expect((await outsider.from('campaign_maps').select('*').eq('campaign_id', campaign)).data).toEqual([])
  expect((await gm.rpc('set_campaign_map', { p_campaign: otherCampaign, p_asset: foreign.id, p_revision: 0 })).error).not.toBeNull()
  expect((await select(gm, null, saved.revision)).error).toBeNull()
})
test('different tokens save concurrently, same token revisions conflict, and only GM manages assignments or removal', async () => {
  const { gm, a, b, outsider, campaign, character } = await table()
  const ids = await Promise.all([a,b,outsider].map(async person => (await person.auth.getUser()).data.user!.id))
  const token = (await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Cinder', p_character: character.id, p_controller: null })).data
  const peerToken = (await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Lookout', p_character: null, p_controller: ids[1] })).data
  const move = (person: ReturnType<typeof client>, id: string, revision: number, x: number) => person.rpc('move_map_token', { p_token: id, p_x: x, p_y: 20, p_revision: revision })
  const independent = await Promise.all([move(a, token.id, 1, 10), move(b, peerToken.id, 1, 90)])
  expect(independent.every(result => !result.error)).toBe(true)
  const race = await Promise.all([move(a, token.id, 2, 30), move(gm, token.id, 2, 70)])
  expect(race.filter(result => !result.error)).toHaveLength(1)
  expect(race.find(result => result.error)?.error?.code).toBe('40001')
  let current = race.find(result => !result.error)!.data
  for (const x of [-1, 101, null]) expect((await gm.rpc('move_map_token', { p_token: token.id, p_x: x, p_y: 50, p_revision: current.revision })).error).not.toBeNull()
  const manage = (person: ReturnType<typeof client>, controller = ids[1], characterId: string | null = null) => person.rpc('manage_map_token', { p_token: token.id, p_label: 'Assigned', p_character: characterId, p_controller: controller, p_revision: current.revision })
  for (const person of [a, b, outsider]) {
    expect((await manage(person)).error?.code).toBe('42501')
    expect((await person.rpc('remove_map_token', { p_token: token.id, p_revision: current.revision })).error?.code).toBe('42501')
  }
  expect((await manage(gm, ids[2])).error).not.toBeNull()
  expect((await manage(gm, ids[1], character.id)).error).not.toBeNull()
  const foreignCampaign = (await outsider.rpc('create_campaign', { p_name: 'Other characters' })).data.id
  const foreignChar = (await outsider.rpc('create_character', { p_campaign: foreignCampaign, p_name: 'Foreign' })).data.id
  expect((await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Foreign', p_character: foreignChar, p_controller: null })).error).not.toBeNull()
  const assigned = await manage(gm); expect(assigned.error).toBeNull(); current = assigned.data
  expect((await move(a, token.id, current.revision, 60)).error?.code).toBe('42501')
  const accepted = await move(b, token.id, current.revision, 60); expect(accepted.error).toBeNull()
  expect((await gm.rpc('remove_map_token', { p_token: token.id, p_revision: current.revision })).error?.code).toBe('40001')
  expect((await gm.rpc('remove_map_token', { p_token: token.id, p_revision: accepted.data.revision })).error).toBeNull()
  const state = (await a.rpc('get_map_state', { p_campaign: campaign })).data
  expect(state.tokens.map((value: { id: string }) => value.id)).toEqual([peerToken.id])
  expect(state.tokens[0].x).toBe(90)
})
test('connected character token controls transfer to the new owner and a held old-owner save is rejected', async ({ browser }) => {
  const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext({ viewport: { width: 390, height: 844 } })]
  const [gm, old, next] = await Promise.all(contexts.map(context => context.newPage()))
  await gm.goto('/'); await gm.getByLabel('Campaign name', { exact: true }).fill('Movement recovery')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const page of [old, next]) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitation)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  await old.getByLabel('New character name', { exact: true }).fill('Cinder')
  await old.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await gm.getByRole('button', { name: 'Open Cinder', exact: true }).click()
  const map = gm.getByRole('region', { name: 'Campaign map', exact: true })
  await map.getByLabel('New token label').fill('Cinder marker')
  await map.getByLabel('New token movement authority').selectOption({ label: 'Character: Cinder' })
  await map.getByRole('button', { name: 'Create token', exact: true }).click()
  const oldToken = old.getByRole('article', { name: 'Token Cinder marker', exact: true })
  let release!: () => void, captured!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), held = new Promise<void>(resolve => { captured = resolve })
  await old.route('**/rest/v1/rpc/move_map_token', async route => { captured(); await gate; await route.continue() }, { times: 1 })
  await oldToken.getByLabel('Horizontal position').fill('11')
  await oldToken.getByRole('button', { name: 'Move token', exact: true }).click(); await held
  const nextId = await next.getByLabel('Your participant ID').inputValue()
  await gm.getByRole('button', { name: 'Refresh participant list', exact: true }).click()
  await gm.getByLabel('Assign character to', { exact: true }).selectOption(nextId)
  await gm.getByRole('button', { name: 'Review ownership change', exact: true }).click()
  await gm.getByRole('button', { name: 'Confirm ownership change', exact: true }).click()
  const nextToken = next.getByRole('article', { name: 'Token Cinder marker', exact: true })
  await expect(nextToken.getByRole('button', { name: 'Move token', exact: true })).toBeVisible()
  const denial = old.waitForResponse(response => response.url().includes('/rpc/move_map_token') && response.status() === 403)
  release(); await denial
  await expect(oldToken.getByRole('alert')).toContainText('Current token movement permission required')
  await expect(oldToken.getByRole('button', { name: 'Move token', exact: true })).toHaveCount(0)
  await expect(nextToken).toContainText('Saved position: 50%, 50%')
  await nextToken.getByLabel('Horizontal position').fill('80'); await nextToken.getByLabel('Vertical position').fill('20')
  await nextToken.getByRole('button', { name: 'Move token', exact: true }).click()
  await expect(oldToken).toContainText('Saved position: 80%, 20%')
  await next.reload(); await expect(nextToken).toContainText('Saved position: 80%, 20%')
  expect(await next.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await next.getByRole('region', { name: 'Campaign map', exact: true }).screenshot({ path: 'test-results/map-owner-mobile.png' })
  for (const context of contexts) await context.close()
})
function localAdmin() {
  const local = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, local.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
test('revocation denies assigned token movement immediately and legacy forged broadcasts cannot enlist a GM receiver', async ({ page }) => {
  const { gm, a, outsider, campaign } = await table()
  const aId = (await a.auth.getUser()).data.user!.id
  const token = (await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Keep', p_character: null, p_controller: aId })).data
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.gm)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const card = page.getByRole('article', { name: 'Token Keep', exact: true })
  await expect(card).toContainText('Saved position: 50%, 50%')
  for (const sender of [a, outsider]) {
    await sender.realtime.setAuth()
    const channel = sender.channel(`map:${campaign}`, { config: { private: true } })
    const status = await new Promise<string>(resolve => channel.subscribe(value => { if (['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(value)) resolve(value) }))
    expect(status).toBe('CHANNEL_ERROR')
    for (const [event, payload] of [['token-add', { id: crypto.randomUUID(), campaignId: campaign, name: 'Forged' }], ['token-move', { id: token.id, x: 1, y: 1 }], ['token-remove', { id: token.id }]] as const) {
      await channel.send({ type: 'broadcast', event, payload })
    }
    await sender.removeChannel(channel)
  }
  await expect(card).toContainText('Saved position: 50%, 50%')
  expect((await gm.rpc('get_map_state', { p_campaign: campaign })).data.tokens).toHaveLength(1)
  expect((await localAdmin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', aId)).error).toBeNull()
  expect((await a.rpc('move_map_token', { p_token: token.id, p_x: 1, p_y: 1, p_revision: token.revision })).error?.code).toBe('42501')
  expect((await a.rpc('get_map_state', { p_campaign: campaign })).error?.code).toBe('42501')
  expect((await a.from('map_tokens').select('*').eq('id', token.id)).data).toEqual([])
  const gmId = (await gm.auth.getUser()).data.user!.id
  await localAdmin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', gmId)
  expect((await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Revoked GM', p_character: null, p_controller: null })).error?.code).toBe('42501')
  expect((await gm.rpc('remove_map_token', { p_token: token.id, p_revision: token.revision })).error?.code).toBe('42501')
})
test('map upload failures retry, stale selections require reload, and unshared selected images disappear', async ({ page }) => {
  const { gm, campaign } = await table()
  const first = await sharedImage(gm, campaign), second = await sharedImage(gm, campaign)
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.gm
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invite)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const map = page.getByRole('region', { name: 'Campaign map', exact: true })
  await map.getByLabel('Saved campaign image').selectOption(first.id)
  expect((await gm.rpc('set_campaign_map', { p_campaign: campaign, p_asset: second.id, p_revision: 0 })).error).toBeNull()
  await map.getByRole('button', { name: 'Use selected map', exact: true }).click()
  await expect(map.getByRole('alert')).toContainText('Map changed')
  await expect(map.getByLabel('Saved campaign image')).toHaveValue(first.id)
  await map.getByRole('button', { name: 'Reload saved map / discard selection', exact: true }).click()
  await expect(map.getByLabel('Saved campaign image')).toHaveValue(second.id)
  await page.route('**/rest/v1/rpc/finish_asset', route => route.abort(), { times: 1 })
  await map.getByLabel('Upload map image').setInputFiles({ name: 'retry-floor.png', mimeType: 'image/png', buffer: png })
  await map.getByRole('button', { name: 'Upload and use map', exact: true }).click()
  await expect(map.getByRole('alert')).toContainText('draft retained')
  await map.getByRole('button', { name: 'Upload and use map', exact: true }).click()
  await expect(map.getByLabel('Saved campaign image').locator('option:checked')).toHaveText('retry-floor.png')
  await expect(map.getByRole('alert')).toHaveCount(0)
  await expect(map.getByRole('img', { name: 'Saved campaign map', exact: true })).toBeVisible()
  const saved = (await gm.rpc('get_map_state', { p_campaign: campaign })).data.map
  expect(saved.asset_id).not.toBe(second.id)
  const asset = (await gm.from('campaign_assets').select('*').eq('id', saved.asset_id).single()).data!
  expect((await gm.rpc('update_asset', { p_asset: asset.id, p_title: asset.title, p_annotation: '', p_shared: false, p_revision: asset.revision })).error).toBeNull()
  await expect(map.getByRole('img')).toHaveCount(0)
  await expect(map).toContainText('Selected map unavailable')
  await page.reload(); await expect(map.getByRole('img')).toHaveCount(0)
  await expect(map).toContainText('Selected map unavailable')
})

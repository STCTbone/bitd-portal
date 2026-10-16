import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const url = process.env.VITE_SUPABASE_URL!
const key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Behavior tests require local Supabase')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
function localAdmin() {
  const local = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, local.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}


// Approved seams: complete browser-to-real-local-Supabase journeys and the public API.
test('create an empty campaign, join as player and GM, reject invalid invitations, restore membership', async ({ browser }) => {
  const gm = await browser.newContext()
  const page = await gm.newPage()
  await page.goto('/')
  await page.screenshot({ path: 'test-results/entry-desktop.png' })
  await page.getByLabel('Campaign name').fill('Neon frontier')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Neon frontier' })).toBeVisible()
  await expect(page.getByTestId('campaign-role')).toHaveText('Game Master')
  await expect(page.getByText('No characters yet. Create your first Hound.')).toBeVisible()
  const playerInvite = await page.getByLabel('Player invitation').inputValue()
  const gmInvite = await page.getByLabel('Secret GM invitation').inputValue()
  expect(playerInvite).not.toBe(gmInvite)
  await page.reload()
  await expect(page.getByTestId('campaign-role')).toHaveText('Game Master')

  for (const [invite, role] of [[playerInvite, 'Player'], [gmInvite, 'Game Master']]) {
    const context = await browser.newContext()
    const join = await context.newPage()
    await join.goto('/')
    await join.getByLabel('Invitation').fill('not-valid')
    await join.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(join.getByRole('alert')).toContainText('Invalid invitation')
    await join.getByLabel('Invitation').fill(invite)
    await join.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(join.getByTestId('campaign-role')).toHaveText(role)
    await join.reload()
    await expect(join.getByTestId('campaign-role')).toHaveText(role)
    if (role === 'Player') await expect(join.getByLabel('Secret GM invitation')).toHaveCount(0)
    await context.close()
  }
  await gm.close()
})

test('public API rejects forged membership, invitation disclosure, and cross-campaign legacy access', async () => {
  const gm = client(), player = client(), outsider = client(), otherGM = client()
  for (const identity of [gm, player, outsider, otherGM]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const created = await gm.rpc('create_campaign', { p_name: 'API permission campaign' })
  expect(created.error).toBeNull()
  const campaign = created.data.id
  const invites = await gm.rpc('get_campaign_invitations', { p_campaign: campaign })
  expect(invites.error).toBeNull()
  expect((await player.rpc('join_campaign', { p_invitation: invites.data.player })).data.role).toBe('player')
  const other = await otherGM.rpc('create_campaign', { p_name: 'Other campaign' })
  const playerId = (await player.auth.getUser()).data.user!.id
  expect((await player.from('campaign_members').insert({ campaign_id: campaign, user_id: playerId, role: 'gm' })).error).not.toBeNull()
  expect((await player.from('campaign_members').update({ role: 'gm' }).eq('campaign_id', campaign)).error).not.toBeNull()
  expect((await player.auth.updateUser({ data: { role: 'gm', campaign_id: other.data.id } })).error).toBeNull()
  expect((await player.rpc('campaign_role', { p_campaign: campaign })).data).toBe('player')
  expect((await player.rpc('get_campaign_invitations', { p_campaign: campaign })).error).not.toBeNull()
  expect((await player.from('campaign_invitations').select('*')).error).not.toBeNull()
  const visible = await player.from('campaigns').select('*')
  expect(visible.error).toBeNull()
  expect(visible.data).toHaveLength(1)
  expect(JSON.stringify(visible.data)).not.toContain(invites.data.gm)
  expect(JSON.stringify(visible.data)).not.toContain(invites.data.player)
  // Trusted fixture setup uses the operator's local-only admin API. Assertions
  // still exercise only the ordinary player's/outsider's public API boundary.
  const admin = localAdmin()
  for (const table of ['crews', 'clocks', 'factions', 'scores', 'map_tokens', 'media', 'codex']) {
    expect((await admin.from(table).insert({ campaign_id: campaign, data: { name: 'PRIVATE fixture', visible_to_players: false } })).error).toBeNull()
  }
  const privatePath = `${campaign}/legacy-private.txt`
  expect((await admin.storage.from('maps').upload(privatePath, 'PRIVATE LEGACY FILE')).error).toBeNull()
  for (const identity of [player, outsider]) {
    expect((await identity.from('campaigns').select('*').eq('id', other.data.id)).data).toEqual([])
    expect((await identity.from('campaign_members').insert({ campaign_id: other.data.id, user_id: playerId, role: 'gm' })).error).not.toBeNull()
    expect((await identity.rpc('get_campaign_invitations', { p_campaign: other.data.id })).error).not.toBeNull()
    for (const table of ['crews', 'clocks', 'factions', 'scores', 'map_tokens', 'media', 'codex']) {
      expect((await identity.from(table).select('*')).data).toEqual([])
      expect((await identity.from(table).insert({ campaign_id: campaign, data: { name: 'forged', visible_to_players: false } })).error).not.toBeNull()
      expect((await identity.from(table).update({ data: { role: 'gm' } }).eq('campaign_id', campaign)).error).not.toBeNull()
      expect((await identity.from(table).delete().eq('campaign_id', campaign)).error).not.toBeNull()
    }
    expect((await identity.rpc('merge_entity', { p_table: 'campaign_members', p_id: playerId, p_campaign: campaign, p_patch: { role: 'gm' } })).error).not.toBeNull()
    expect((await identity.storage.from('maps').upload(`${campaign}/forged.txt`, 'secret')).error).not.toBeNull()
    expect((await identity.storage.from('maps').download(privatePath)).error).not.toBeNull()
    const publicFile = await fetch(identity.storage.from('maps').getPublicUrl(privatePath).data.publicUrl)
    expect(publicFile.ok).toBe(false)
  }
  expect((await player.rpc('join_campaign', { p_invitation: other.data.id })).error).not.toBeNull()
  expect((await player.rpc('campaign_role', { p_campaign: campaign })).data).toBe('player')
  const unsigned = client()
  expect((await unsigned.rpc('create_campaign', { p_name: 'unsigned' })).error).not.toBeNull()
  for (const identity of [gm, player, outsider, otherGM, unsigned]) await identity.removeAllChannels()
})

test('browser role and selected-campaign tampering cannot grant membership', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const gm = client(), other = client()
  await gm.auth.signInAnonymously(); await other.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Tamper test' })).data
  const secret = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign.id })).data
  const second = (await other.rpc('create_campaign', { p_name: 'Isolated campaign' })).data
  await page.goto('/')
  await page.screenshot({ path: 'test-results/entry-mobile.png' })
  await page.getByLabel('Invitation').fill(secret.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await expect(page.getByTestId('campaign-role')).toHaveText('Player')
  await page.evaluate(id => localStorage.setItem('bitd.session', JSON.stringify({ campaignId: id, role: 'gm', seat: { type: 'gm', name: 'Game Master' } })), campaign.id)
  await page.reload()
  await expect(page.getByTestId('campaign-role')).toHaveText('Player')
  await page.evaluate(id => localStorage.setItem('bitd.activeCampaign', id), second.id)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Gather the crew' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Isolated campaign' })).toHaveCount(0)
  await page.getByLabel('Invitation').fill(secret.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await expect(page.getByTestId('campaign-role')).toHaveText('Player')
  const admin = localAdmin()
  const member = await admin.from('campaign_members').select('user_id').eq('campaign_id', campaign.id).eq('role', 'player').single()
  expect(member.error).toBeNull()
  expect((await admin.from('campaign_members').delete().eq('campaign_id', campaign.id).eq('user_id', member.data!.user_id)).error).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Gather the crew' })).toBeVisible()
})

test('unconverted public and private realtime topics deny subscriptions', async () => {
  const outsider = client()
  await outsider.auth.signInAnonymously()
  await outsider.realtime.setAuth()
  for (const privateChannel of [false, true]) {
    const channel = outsider.channel(`campaign:${crypto.randomUUID()}`, { config: { private: privateChannel } })
    const result = await new Promise<{ status: string; reason: string }>(resolve => channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve({ status, reason: error?.message ?? '' })
    }))
    expect(result.status).toBe('CHANNEL_ERROR')
    expect(result.reason).toMatch(privateChannel ? /permissions|unauthorized/i : /private/i)
    await outsider.removeChannel(channel)
  }
})

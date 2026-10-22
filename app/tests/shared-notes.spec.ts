import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

test('members share distinct notes and merge disjoint fields while same-field conflicts preserve saved state', async () => {
  const gm = client(), player = client(), peer = client(), outsider = client(), other = client()
  for (const identity of [gm, player, peer, outsider, other]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Shared reference' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  for (const identity of [player, peer]) expect((await identity.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  const otherCampaign = (await other.rpc('create_campaign', { p_name: 'Separate reference' })).data.id
  const additions = await Promise.all([player, peer].map(identity => identity.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'The same contact', category: 'people', body: 'Met at the station.' } })))
  for (const result of additions) expect(result.error).toBeNull()
  expect(additions[0].data.id).not.toBe(additions[1].data.id)
  const id = additions[0].data.id
  const updates = await Promise.all([
    gm.rpc('update_shared_note', { p_note: id, p_patch: { title: 'Station keeper' }, p_expected: { title: 'The same contact' } }),
    peer.rpc('update_shared_note', { p_note: id, p_patch: { body: 'Owes us a favor.' }, p_expected: { body: 'Met at the station.' } }),
  ])
  for (const result of updates) expect(result.error).toBeNull()
  expect((await player.from('codex').select('*').eq('id', id).single()).data.data).toMatchObject({ title: 'Station keeper', body: 'Owes us a favor.', category: 'people' })
  expect((await player.rpc('update_shared_note', { p_note: id, p_patch: { body: 'Stale recollection' }, p_expected: { body: 'Met at the station.' } })).error?.code).toBe('40001')
  expect((await player.rpc('delete_shared_note', { p_note: id, p_revision: 1 })).error?.code).toBe('40001')
  for (const identity of [outsider, other]) {
    expect((await identity.from('codex').select('*').eq('campaign_id', campaign)).data).toEqual([])
    expect((await identity.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'forged' } })).error?.code).toBe('42501')
    expect((await identity.rpc('update_shared_note', { p_note: id, p_patch: { title: 'forged' }, p_expected: { title: 'Station keeper' } })).error?.code).toBe('42501')
    expect((await identity.rpc('delete_shared_note', { p_note: id, p_revision: 3 })).error?.code).toBe('42501')
  }
  for (const identity of [gm, player, outsider, other]) {
    expect((await identity.from('codex').insert({ campaign_id: campaign, data: { title: 'Bypass' } })).error).not.toBeNull()
    expect((await identity.from('codex').update({ data: { title: 'Bypass' } }).eq('id', id)).error).not.toBeNull()
    expect((await identity.from('codex').upsert({ id, campaign_id: otherCampaign, data: {} })).error).not.toBeNull()
    expect((await identity.from('codex').delete().eq('id', id)).error).not.toBeNull()
  }
  for (const patch of [{ campaign_id: otherCampaign }, { owner_id: crypto.randomUUID() }, { revision: 99 }, { title: '' }, { title: '\t\n' }, { title: 'x'.repeat(121) }, { body: null }, { body: {} }, { body: 'x'.repeat(20001) }, { category: 'secrets' }, { category: false }]) {
    expect((await player.rpc('update_shared_note', { p_note: id, p_patch: patch, p_expected: patch })).error).not.toBeNull()
  }
  expect((await player.rpc('update_shared_note', { p_note: id, p_patch: { title: 'Missing previous value' }, p_expected: {} })).error).not.toBeNull()
  expect((await player.rpc('delete_shared_note', { p_note: id, p_revision: 3 })).error).toBeNull()
  expect((await peer.from('codex').select('*').eq('id', id)).data).toEqual([])
})

test('GM and two players maintain a categorized reference with conflict recovery, offline retry and reload', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, one, two] = await Promise.all(contexts.map(context => context.newPage()))
  await gm.goto('/')
  await gm.getByLabel('Campaign name', { exact: true }).fill('The shared dossier')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const page of [one, two]) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitation)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  const regions = [gm, one, two].map(page => page.getByRole('region', { name: 'Shared campaign notes', exact: true }))
  for (const region of regions) await expect(region.getByText('No shared notes yet.')).toBeVisible()
  await Promise.all(regions.slice(1).map(async (region, index) => {
    await region.getByLabel('New note title', { exact: true }).fill(index ? 'Station map' : 'The keeper')
    await region.getByLabel('New note category', { exact: true }).selectOption(index ? 'places' : 'people')
    await region.getByRole('button', { name: 'Create shared note', exact: true }).click()
  }))
  for (const region of regions) await expect(region.getByRole('article')).toHaveCount(2)
  const cards = regions.map(region => region.getByRole('article', { name: 'The keeper', exact: true }))
  await cards[0].getByRole('button', { name: 'Edit note', exact: true }).click()
  await cards[1].getByRole('button', { name: 'Edit note', exact: true }).click()
  await cards[0].getByLabel('Note category', { exact: true }).selectOption('factions')
  await cards[1].getByLabel('Note body', { exact: true }).fill('Owes us a favor.\nMeet after dark.')
  await Promise.all(cards.slice(0, 2).map(card => card.getByRole('button', { name: 'Save note changes', exact: true }).click()))
  await expect(cards[2].getByText('Owes us a favor. Meet after dark.')).toBeVisible()
  await expect(cards[0].getByLabel('Note category', { exact: true })).toHaveValue('factions')
  await cards[0].getByLabel('Note body', { exact: true }).fill('Local conflicting recollection')
  await cards[1].getByLabel('Note body', { exact: true }).fill('Accepted peer recollection')
  await cards[1].getByRole('button', { name: 'Save note changes', exact: true }).click()
  await expect(cards[1].getByRole('status')).toHaveText('Note saved.')
  await cards[0].getByRole('button', { name: 'Save note changes', exact: true }).click()
  await expect(cards[0].getByRole('alert')).toContainText('Note changed elsewhere')
  await expect(cards[0].getByLabel('Note body', { exact: true })).toHaveValue('Local conflicting recollection')
  await cards[0].getByRole('button', { name: 'Reload note (discard unsaved)', exact: true }).click()
  await expect(cards[0].getByLabel('Note body', { exact: true })).toHaveValue('Accepted peer recollection')
  await cards[1].getByLabel('Note body', { exact: true }).fill('Keep my failed draft')
  await contexts[1].setOffline(true)
  await cards[1].getByRole('button', { name: 'Save note changes', exact: true }).click()
  await expect(cards[1].getByRole('alert')).toContainText('Note was not saved')
  await expect(regions[1].getByRole('alert').filter({ hasText: 'Note refresh failed' })).toBeVisible()
  await expect(cards[1].getByLabel('Note body', { exact: true })).toHaveValue('Keep my failed draft')
  await contexts[1].setOffline(false)
  await cards[1].getByRole('button', { name: 'Save note changes', exact: true }).click()
  await expect(cards[1].getByRole('status')).toHaveText('Note saved.')
  await expect(cards[2].getByText('Keep my failed draft', { exact: true })).toBeVisible()
  await two.reload()
  await expect(two.getByRole('article', { name: 'The keeper', exact: true }).getByText('Keep my failed draft', { exact: true })).toBeVisible()
  await regions[0].getByLabel('Filter notes by category').selectOption('places')
  await expect(regions[0].getByRole('article')).toHaveCount(1)
  await regions[0].getByLabel('Filter notes by category').selectOption('all')
  await regions[0].screenshot({ path: 'test-results/notes-desktop.png' })
  await gm.setViewportSize({ width: 390, height: 844 })
  await regions[0].screenshot({ path: 'test-results/notes-mobile.png' })
  expect(await gm.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await cards[0].getByRole('button', { name: 'Remove note', exact: true }).click()
  await cards[0].getByRole('button', { name: 'Confirm removal', exact: true }).click()
  for (const region of regions.slice(0, 2)) await expect(region.getByRole('article', { name: 'The keeper', exact: true })).toHaveCount(0)
  await expect(two.getByRole('article', { name: 'The keeper', exact: true })).toHaveCount(0)
  await Promise.all(contexts.map(context => context.close()))
})

function admin() {
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, status.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
async function fixture() {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Current note permissions' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const note = await gm.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Current campaign reference', body: 'Saved shared text', category: 'items' } })
  expect(note.error).toBeNull()
  return { gm, campaign, invites, note: note.data }
}

test('delayed snapshots and accepted mutation responses cannot restore deleted or revoked notes', async ({ browser }) => {
  const { gm, campaign, invites, note } = await fixture()
  const context = await browser.newContext(), page = await context.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const reference = page.getByRole('region', { name: 'Shared campaign notes', exact: true })
  const card = reference.getByRole('article', { name: note.data.title, exact: true })
  await expect(card).toBeVisible()
  let held = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/codex?*', async route => { const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }) }, { times: 1 })
  await expect.poll(() => held).toBe(true)
  expect((await gm.rpc('delete_shared_note', { p_note: note.id, p_revision: note.revision })).error).toBeNull()
  await expect(card).toHaveCount(0)
  const oldResponse = page.waitForResponse(response => response.url().includes('/rest/v1/codex?'))
  release(); await oldResponse
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await card.count()).toBe(0)
  const second = await gm.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Revoke during save', category: 'lore' } })
  expect(second.error).toBeNull()
  const pending = reference.getByRole('article', { name: 'Revoke during save', exact: true })
  await expect(pending).toBeVisible()
  await pending.getByRole('button', { name: 'Edit note', exact: true }).click()
  await pending.getByLabel('Note body', { exact: true }).fill('Accepted before revocation')
  let mutationHeld = false, releaseMutation!: () => void
  const mutationGate = new Promise<void>(resolve => { releaseMutation = resolve })
  await page.route('**/rest/v1/rpc/update_shared_note', async route => { const response = await route.fetch(); expect(response.ok()).toBe(true); mutationHeld = true; await mutationGate; await route.fulfill({ response }) }, { times: 1 })
  await pending.getByRole('button', { name: 'Save note changes', exact: true }).click()
  await expect.poll(() => mutationHeld).toBe(true)
  const userId = await page.getByLabel('Your participant ID').inputValue()
  expect((await admin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', userId)).error).toBeNull()
  await expect(reference.getByRole('article')).toHaveCount(0)
  const delayedMutation = page.waitForResponse(response => response.url().includes('/rpc/update_shared_note'))
  releaseMutation(); await delayedMutation
  // A current overview/presence denial now removes the whole campaign boundary.
  await expect(reference).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('Campaign access is no longer authorized')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Shared campaign notes', exact: true })).toHaveCount(0)
  // The live denial already cleared the selected campaign; reload stays at entry.
  await expect(page.getByLabel('Invitation', { exact: true })).toBeVisible()
  await context.close()
})

test('switching campaigns discards a delayed former-campaign snapshot and local editor', async ({ page }) => {
  const { gm, invites } = await fixture()
  const other = (await gm.rpc('create_campaign', { p_name: 'Second note campaign' })).data.id
  const otherInvite = (await gm.rpc('get_campaign_invitations', { p_campaign: other })).data.player
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const card = page.getByRole('article', { name: 'Current campaign reference', exact: true })
  await expect(card).toBeVisible(); await card.getByRole('button', { name: 'Edit note', exact: true }).click()
  await card.getByLabel('Note body', { exact: true }).fill('Former campaign draft')
  let held = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/codex?*', async route => { const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }) }, { times: 1 })
  await expect.poll(() => held).toBe(true)
  await page.getByRole('button', { name: 'Switch campaign', exact: true }).click()
  await page.getByLabel('Invitation', { exact: true }).fill(otherInvite)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const region = page.getByRole('region', { name: 'Shared campaign notes', exact: true })
  await expect(region.getByText('No shared notes yet.')).toBeVisible()
  const delayed = page.waitForResponse(response => response.url().includes('/rest/v1/codex?'))
  release(); await delayed
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await region.getByRole('article').count()).toBe(0)
  await expect(region).not.toContainText('Former campaign')
})

test('current membership gates every RPC and anonymous access and legacy payload channels remain denied', async () => {
  const { gm, campaign, invites, note } = await fixture()
  const player = client(), outsider = client(), unauthenticated = client()
  await player.auth.signInAnonymously(); await outsider.auth.signInAnonymously()
  await player.rpc('join_campaign', { p_invitation: invites.player })
  for (const category of ['people', 'places', 'items', 'factions', 'lore']) {
    const result = await player.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: category, category } })
    expect(result.error).toBeNull(); expect(result.data.data).toMatchObject({ title: category, category, body: '' })
  }
  for (const identity of [player, outsider]) {
    await identity.realtime.setAuth()
    for (const isPrivate of [false, true]) {
      const events: unknown[] = []
      const channel = identity.channel(`campaign:${campaign}`, { config: { private: isPrivate } })
        .on('postgres_changes', { event: '*', schema: 'bitd', table: 'codex', filter: `campaign_id=eq.${campaign}` }, payload => events.push(payload))
        .on('broadcast', { event: '*'}, payload => events.push(payload))
      const result = await new Promise<{ status: string; reason: string }>(resolve => channel.subscribe((status, error) => {
        if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) resolve({ status, reason: error?.message ?? '' })
      }))
      expect(result.status).toBe('CHANNEL_ERROR'); expect(result.reason).toMatch(isPrivate ? /permissions|unauthorized/i : /private/i)
      const fresh = await gm.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'No legacy payload', body: 'Shared only through RLS snapshots' } })
      expect(fresh.error).toBeNull()
      expect((await gm.rpc('delete_shared_note', { p_note: fresh.data.id, p_revision: fresh.data.revision })).error).toBeNull()
      expect(events).toEqual([]); await identity.removeChannel(channel)
    }
  }
  const userId = (await player.auth.getUser()).data.user!.id
  expect((await admin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', userId)).error).toBeNull()
  expect((await player.from('codex').select('*').eq('campaign_id', campaign)).data).toEqual([])
  for (const identity of [player, unauthenticated]) {
    expect((await identity.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Revoked' } })).error).not.toBeNull()
    expect((await identity.rpc('update_shared_note', { p_note: note.id, p_patch: { title: 'Revoked' }, p_expected: { title: note.data.title } })).error).not.toBeNull()
    expect((await identity.rpc('delete_shared_note', { p_note: note.id, p_revision: note.revision })).error).not.toBeNull()
  }
  expect((await unauthenticated.from('codex').select('*')).error).not.toBeNull()
  expect((await gm.rpc('merge_entity', { p_table: 'codex', p_id: note.id, p_patch: { title: 'Bypass' } })).error).not.toBeNull()
})

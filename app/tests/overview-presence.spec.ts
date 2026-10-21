import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
function admin() {
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, status.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
async function fixture() {
  const gm = client(), a = client(), b = client(), outside = client()
  for (const person of [gm, a, b, outside]) expect((await person.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'The table overview' })).data.id
  const invitations = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  for (const person of [a, b]) await person.rpc('join_campaign', { p_invitation: invitations.player })
  return { gm, a, b, outside, campaign, invitations }
}

test('overview projects saved character and crew summaries without secrets and requires current membership', async () => {
  const { gm, a, b, outside, campaign, invitations } = await fixture()
  const character = (await a.rpc('create_character', { p_campaign: campaign, p_name: 'Vesper', p_playbook: 'Hound', p_unclaimed: false })).data
  expect((await a.rpc('patch_character', { p_character: character.id, p_patch: { alias: 'Nightjar', stress: 3, wealth: { stacks: 2, bank: 4 }, notes: 'DO_NOT_PROJECT_CASE_NOTES' } })).error).toBeNull()
  expect((await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'The Frequency', p_type: 'Dealers' })).error).toBeNull()
  const faction = (await gm.rpc('create_faction', { p_campaign: campaign, p_name: 'Palace' })).data
  expect((await gm.rpc('save_faction_private_note', { p_id: faction.id, p_note: 'PRIVATE_FACTION_SENTINEL', p_expected_version: 0 })).error).toBeNull()
  const backing = (await a.rpc('create_backing', { p_character: character.id, p_faction: faction.id })).data
  expect((await a.rpc('patch_backing', { p_backing: backing.id, p_patch: { mission: 'PRIVATE_BACKING_SENTINEL' }, p_expected_version: backing.version })).error).toBeNull()
  const bytes = readFileSync('tests/fixtures/map-grid.png')
  const asset = (await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: 'image', p_character: null, p_mime: 'image/png', p_size: bytes.length, p_title: 'PRIVATE_MEDIA_SENTINEL' })).data
  expect((await gm.storage.from('campaign-assets').upload(asset.object_path, bytes, { contentType: 'image/png' })).error).toBeNull()
  expect((await gm.rpc('finish_asset', { p_asset: asset.id })).error).toBeNull()
  const result = await b.rpc('get_campaign_overview', { p_campaign: campaign })
  expect(result.error).toBeNull()
  expect(result.data.role).toBe('player')
  expect(result.data.characters).toEqual([expect.objectContaining({ id: character.id, name: 'Vesper', alias: 'Nightjar', playbook: 'Hound', owner_id: (await a.auth.getUser()).data.user!.id, stress: 3, stacks: 2, bank: 4 })])
  expect(result.data.crew).toMatchObject({ name: 'The Frequency', type: 'Dealers', tier: 0, hold: 'strong', stacks: 2 })
  for (const secret of [invitations.player, invitations.gm, 'DO_NOT_PROJECT_CASE_NOTES', 'PRIVATE_FACTION_SENTINEL', 'PRIVATE_BACKING_SENTINEL', 'PRIVATE_MEDIA_SENTINEL', asset.object_path, 'backing', 'object_path', 'gm_notes']) expect(JSON.stringify(result.data)).not.toContain(secret)
  expect((await a.rpc('touch_campaign_presence', { p_campaign: campaign, p_connection: crypto.randomUUID() })).error).toBeNull()
  for (const identity of [gm, a, b]) {
    const projection = (await identity.rpc('get_campaign_overview', { p_campaign: campaign })).data
    const presence = (await identity.rpc('get_campaign_presence', { p_campaign: campaign })).data
    for (const secret of [invitations.player, invitations.gm, 'PRIVATE_FACTION_SENTINEL', 'PRIVATE_BACKING_SENTINEL', 'PRIVATE_MEDIA_SENTINEL', asset.object_path]) expect(JSON.stringify([projection, presence])).not.toContain(secret)
  }
  expect((await outside.rpc('get_campaign_overview', { p_campaign: campaign })).error?.code).toBe('42501')
  const other = (await outside.rpc('create_campaign', { p_name: 'Another table' })).data.id
  expect((await a.rpc('get_campaign_overview', { p_campaign: other })).error?.code).toBe('42501')
  expect((await client().rpc('get_campaign_overview', { p_campaign: campaign })).error).not.toBeNull()
})

test('presence aggregates connections by authenticated identity, expires and follows current membership and role', async () => {
  const { gm, a, b, outside, campaign } = await fixture()
  const actor = (await a.auth.getUser()).data.user!.id
  const first = crypto.randomUUID(), second = crypto.randomUUID()
  const touch = (person: ReturnType<typeof client>, connection = first, room = campaign) => person.rpc('touch_campaign_presence', { p_campaign: room, p_connection: connection })
  const read = (person = b) => person.rpc('get_campaign_presence', { p_campaign: campaign })
  expect((await touch(a)).error).toBeNull()
  expect((await touch(a, second)).error).toBeNull()
  expect((await read()).data.participants).toEqual([expect.objectContaining({ actor, role: 'player' })])
  expect((await a.rpc('touch_campaign_presence', { p_campaign: campaign, p_connection: first, p_actor: (await gm.auth.getUser()).data.user!.id, p_role: 'gm', p_name: 'Game Master' })).error).not.toBeNull()
  expect((await a.rpc('leave_campaign_presence', { p_campaign: campaign, p_connection: first })).error).toBeNull()
  expect((await read()).data.participants).toHaveLength(1)
  // Another participant choosing the same connection ID cannot remove this actor.
  expect((await b.rpc('leave_campaign_presence', { p_campaign: campaign, p_connection: second })).error).toBeNull()
  expect((await read()).data.participants).toHaveLength(1)
  expect((await admin().from('campaign_members').update({ role: 'gm' }).eq('campaign_id', campaign).eq('user_id', actor)).error).toBeNull()
  expect((await read()).data.participants).toEqual([expect.objectContaining({ actor, role: 'gm' })])
  expect((await admin().from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('user_id', actor)).error).toBeNull()
  expect((await read()).data.participants[0].role).toBe('player')
  for (const person of [outside, client()]) {
    expect((await touch(person)).error).not.toBeNull()
    expect((await read(person)).error).not.toBeNull()
    expect((await person.rpc('leave_campaign_presence', { p_campaign: campaign, p_connection: first })).error).not.toBeNull()
  }
  const other = (await outside.rpc('create_campaign', { p_name: 'Other participants' })).data.id
  expect((await touch(a, first, other)).error?.code).toBe('42501')
  for (const person of [a, gm, outside]) {
    expect((await person.from('campaign_presence').select('*')).error).not.toBeNull()
    expect((await person.from('campaign_presence').insert({ campaign_id: campaign, actor, connection_id: first })).error).not.toBeNull()
    expect((await person.from('campaign_presence').update({ actor }).eq('campaign_id', campaign)).error).not.toBeNull()
    expect((await person.from('campaign_presence').delete().eq('campaign_id', campaign)).error).not.toBeNull()
  }
  await expect.poll(async () => (await read()).data.participants, { timeout: 8000 }).toEqual([])
  expect((await touch(a)).error).toBeNull()
  expect((await admin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', actor)).error).toBeNull()
  expect((await read()).data.participants).toEqual([])
  expect((await touch(a)).error?.code).toBe('42501')
  expect((await read(a)).error?.code).toBe('42501')
  expect((await a.rpc('get_campaign_overview', { p_campaign: campaign })).error?.code).toBe('42501')
})

test('GM and two players navigate saved live summaries and manage online table lifecycle across tabs and reconnect', async ({ browser }) => {
  test.setTimeout(60000)
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, one, two] = await Promise.all(contexts.map(context => context.newPage()))
  await gm.goto('/'); await gm.getByLabel('Campaign name', { exact: true }).fill('The electric table')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const page of [one, two]) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitation)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  const overview = (page: typeof gm) => page.getByRole('region', { name: 'Campaign state overview', exact: true })
  const presence = (page: typeof gm) => page.getByRole('region', { name: 'Online table', exact: true })
  for (const page of [gm, one, two]) {
    await expect(overview(page).getByText('No characters yet.')).toBeVisible()
    await expect(presence(page).locator('[data-presence-actor]')).toHaveCount(3)
  }
  await one.getByLabel('New character name').fill('Vesper'); await one.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await one.getByLabel('Alias', { exact: true }).fill('Nightjar'); await one.getByLabel('Alias', { exact: true }).blur()
  await two.getByLabel('New character name').fill('Kite'); await two.getByLabel('Playbook', { exact: true }).selectOption('Hull'); await two.getByRole('button', { name: 'Create Hull', exact: true }).click()
  await gm.getByLabel('Crew name', { exact: true }).fill('The Frequency'); await gm.getByRole('button', { name: 'Create crew', exact: true }).click()
  for (const page of [gm, one, two]) {
    await expect(overview(page).getByRole('article', { name: 'Vesper summary', exact: true })).toContainText('Nightjar')
    await expect(overview(page).getByRole('article', { name: 'Crew summary', exact: true })).toContainText('The Frequency')
  }
  await expect(overview(gm).getByRole('article', { name: 'Kite summary', exact: true })).toContainText('Drain 0/10')
  await two.getByRole('link', { name: 'Open Vesper dossier', exact: true }).click()
  await expect(two.getByRole('article', { name: 'Vesper dossier', exact: true })).toBeVisible()
  await expect(two.getByLabel('Alias', { exact: true })).toBeDisabled()
  await gm.getByRole('link', { name: 'Open Vesper dossier', exact: true }).click()
  await gm.getByRole('button', { name: 'Delete character', exact: true }).click()
  await expect(gm.getByRole('button', { name: 'Confirm delete Vesper', exact: true })).toBeVisible()
  await gm.getByRole('link', { name: 'Open Kite dossier', exact: true }).click()
  await expect(gm.getByRole('button', { name: 'Confirm delete Kite', exact: true })).toHaveCount(0)
  await expect(gm.getByRole('button', { name: 'Delete character', exact: true })).toBeVisible()
  await gm.getByRole('link', { name: 'Open crew dossier', exact: true }).click()
  await expect(gm.getByRole('region', { name: 'Crew dossier', exact: true })).toBeInViewport()
  await gm.getByLabel('Heat', { exact: true }).fill('4'); await gm.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(overview(one).getByRole('article', { name: 'Crew summary', exact: true })).toContainText('Heat 4')
  await overview(gm).screenshot({ path: 'test-results/overview-desktop.png' })
  await gm.setViewportSize({ width: 390, height: 844 }); await overview(gm).screenshot({ path: 'test-results/overview-mobile.png' })
  expect(await gm.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const actor = await one.getByLabel('Your participant ID').inputValue()
  const marker = presence(gm).locator(`[data-presence-actor="${actor}"]`)
  await expect(marker).toContainText('Nightjar'); await expect(marker).toContainText('Player')
  const twinContext = await browser.newContext({ storageState: await contexts[1].storageState() }); contexts.push(twinContext)
  const twin = await twinContext.newPage(); await twin.goto('/')
  await expect(presence(twin).locator('[data-presence-actor]')).toHaveCount(3)
  await one.close()
  await expect(marker).toBeVisible()
  await presence(twin).getByRole('button', { name: 'Leave online table', exact: true }).click()
  await expect(marker).toHaveCount(0, { timeout: 8000 })
  await presence(twin).getByRole('button', { name: 'Join online table', exact: true }).click()
  await expect(marker).toBeVisible()
  await twinContext.setOffline(true)
  await expect(presence(twin).getByRole('alert')).toContainText('Presence unavailable')
  await expect(overview(twin).getByRole('alert').filter({ hasText: 'Overview unavailable' })).toContainText('Overview unavailable')
  await expect(marker).toHaveCount(0, { timeout: 10000 })
  await twinContext.setOffline(false)
  // Reconnecting rechecks membership before revealing the workspace again.
  await expect(presence(twin).locator(`[data-presence-actor="${actor}"]`)).toBeVisible()
  await expect(marker).toBeVisible()
  await twin.reload(); await expect(overview(twin).getByRole('heading', { name: 'Nightjar', exact: true })).toBeVisible()
  await expect(presence(twin).locator('[data-presence-actor]')).toHaveCount(3)
  await twin.getByRole('button', { name: 'Switch campaign', exact: true }).click()
  await expect(marker).toHaveCount(0, { timeout: 8000 })
  await Promise.all(contexts.map(context => context.close()))
})

test('live role and ownership changes are authoritative and delayed revoked overview payloads cannot return', async ({ browser }) => {
  const { gm, campaign, invitations } = await fixture()
  const hostContext = await browser.newContext(), peerContext = await browser.newContext()
  const host = await hostContext.newPage(), peer = await peerContext.newPage()
  for (const [page, invitation] of [[host, invitations.gm], [peer, invitations.player]] as const) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitation)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  const actor = await host.getByLabel('Your participant ID').inputValue(), peerActor = await peer.getByLabel('Your participant ID').inputValue()
  const made = await gm.rpc('create_character', { p_campaign: campaign, p_name: 'Current owner', p_unclaimed: true })
  expect(made.error).toBeNull()
  expect(made.data).toMatchObject({ campaign_id: campaign, owner_id: null, data: { name: 'Current owner' } })
  const character = made.data
  expect((await gm.rpc('get_campaign_overview', { p_campaign: campaign })).data.characters).toContainEqual(expect.objectContaining({ id: character.id, name: 'Current owner' }))
  const overview = host.getByRole('region', { name: 'Campaign state overview', exact: true })
  const card = overview.getByRole('article', { name: 'Current owner summary', exact: true })
  await expect(card).toContainText('Unclaimed')
  expect((await gm.rpc('assign_character_owner', { p_character: character.id, p_owner: actor, p_expected_owner: null })).error).toBeNull()
  await expect(card).toContainText('Yours')
  expect((await gm.rpc('assign_character_owner', { p_character: character.id, p_owner: peerActor, p_expected_owner: actor })).error).toBeNull()
  await expect(card).toContainText('Owned by another participant')
  const marker = peer.getByRole('region', { name: 'Online table', exact: true }).locator(`[data-presence-actor="${actor}"]`)
  await expect(marker).toContainText('Game Master')
  expect((await admin().from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('user_id', actor)).error).toBeNull()
  await expect(host.getByTestId('campaign-role')).toHaveText('Player')
  await expect(host.getByLabel('Secret GM invitation')).toHaveCount(0)
  await expect(marker).toContainText('Player')
  await host.getByRole('link', { name: 'Open Current owner dossier', exact: true }).click()
  await expect(host.getByLabel('Alias', { exact: true })).toBeDisabled()
  await expect(host.getByRole('button', { name: 'Review ownership change', exact: true })).toHaveCount(0)
  let held = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await host.route('**/rest/v1/rpc/get_campaign_overview', async route => { const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {}) }, { times: 1 })
  await expect.poll(() => held).toBe(true)
  expect((await admin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', actor)).error).toBeNull()
  await expect(overview).toHaveCount(0)
  await expect(host.getByRole('alert')).toContainText('Campaign access is no longer authorized')
  release()
  await expect(marker).toHaveCount(0)
  await host.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await overview.count()).toBe(0)
  await Promise.all([hostContext.close(), peerContext.close()])
})

test('presence connection churn is bounded and legacy public and private channels cannot carry peer authority', async () => {
  const { a, outside, campaign } = await fixture()
  const connections = Array.from({ length: 13 }, () => crypto.randomUUID())
  for (const connection of connections.slice(0, 12)) expect((await a.rpc('touch_campaign_presence', { p_campaign: campaign, p_connection: connection })).error).toBeNull()
  expect((await a.rpc('touch_campaign_presence', { p_campaign: campaign, p_connection: connections[12] })).error?.code).toBe('22023')
  for (const identity of [a, outside]) {
    await identity.realtime.setAuth()
    for (const privateChannel of [false, true]) {
      const events: unknown[] = []
      const channel = identity.channel(`campaign:${campaign}`, { config: { private: privateChannel } })
        .on('presence', { event: 'sync' }, () => events.push('sync'))
        .on('broadcast', { event: '*' }, event => events.push(event))
        .on('postgres_changes', { event: '*', schema: 'bitd', table: 'campaign_presence' }, event => events.push(event))
      const status = await new Promise<{ state: string; reason: string }>(resolve => channel.subscribe((state, error) => { if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(state)) resolve({ state, reason: error?.message ?? '' }) }))
      expect(status.state).toBe('CHANNEL_ERROR'); expect(status.reason).toMatch(privateChannel ? /permissions|unauthorized/i : /private/i)
      expect(events).toEqual([]); await identity.removeChannel(channel)
    }
  }
})


test('overview carries immutable condition metadata and renders saved paranormal resource labels after creation is disabled', async ({ browser }) => {
  const { gm, a, b, campaign, invitations } = await fixture()
  const cases = [
    ['Hound', null, 'Stress', 9], ['Hull', 'hull', 'Drain', 10],
    ['Ghost/Echo', 'ghost', 'Drain', 9], ['Vampire', 'vampire', 'Stress', 12],
    ['Time Traveler from the Future', 'future', 'Instability', 9], ['Time Traveler from the Past', 'past', 'Instability', 9],
  ] as const
  for (const [playbook, kind] of cases) {
    if (kind && kind !== 'hull') expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook: playbook, p_enabled: true })).error).toBeNull()
    const made = await a.rpc('create_character', { p_campaign: campaign, p_name: playbook, p_playbook: playbook })
    expect(made.error).toBeNull()
    expect((await a.rpc('patch_character', { p_character: made.data.id, p_patch: { stress: 2 } })).error).toBeNull()
    if (kind && kind !== 'hull') expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook: playbook, p_enabled: false })).error).toBeNull()
  }
  const snapshot = await b.rpc('get_campaign_overview', { p_campaign: campaign })
  expect(snapshot.error).toBeNull()
  for (const [playbook, kind, , capacity] of cases) expect(snapshot.data.characters).toContainEqual(expect.objectContaining({ name: playbook, condition_kind: kind, stress: 2, stress_capacity: capacity }))
  const page = await browser.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitations.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const overview = page.getByRole('region', { name: 'Campaign state overview', exact: true })
  for (const [playbook, , resource, capacity] of cases) await expect(overview.getByRole('article', { name: `${playbook} summary`, exact: true })).toContainText(`${resource} 2/${capacity}`)
  await overview.getByRole('link', { name: 'Open Ghost/Echo dossier', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Ghost/Echo dossier', exact: true })).toBeVisible()
  await expect(page.getByLabel('Alias', { exact: true })).toBeDisabled()
  await page.close()
})

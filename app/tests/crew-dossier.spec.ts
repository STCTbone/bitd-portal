import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

// Agreed seams: real browser journeys and the ordinary authenticated public API.
test('GM creates a shared six-type crew and edits common records without automatic consequences', async ({ browser }) => {
  const gm = await browser.newContext(), page = await gm.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Crew dossier campaign')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await page.getByLabel('Player invitation').inputValue()
  const player = await browser.newContext(), shared = await player.newPage()
  await shared.goto('/')
  await shared.getByLabel('Invitation', { exact: true }).fill(invitation)
  await shared.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await expect(shared.getByText('No crew has been created.')).toBeVisible()
  await expect(shared.getByRole('button', { name: 'Create crew', exact: true })).toHaveCount(0)
  for (const type of ['Dealers', 'Hit Squad', 'Militants', 'Racers', 'Shadows', 'Utopians']) {
    await expect(page.getByLabel('Crew type', { exact: true }).locator('option', { hasText: type })).toHaveCount(1)
  }
  await page.getByLabel('Crew name', { exact: true }).fill('The Neon Owls')
  await page.getByLabel('Crew type', { exact: true }).selectOption('Racers')
  await page.getByRole('button', { name: 'Create crew', exact: true }).click()
  const dossier = page.getByRole('region', { name: 'Crew dossier' })
  await expect(dossier.getByRole('heading', { name: 'The Neon Owls', exact: true })).toBeVisible()
  await expect(shared.getByRole('heading', { name: 'The Neon Owls', exact: true })).toBeVisible()
  await dossier.getByLabel('Reputation', { exact: true }).fill('Brazen')
  await dossier.getByLabel('Tier', { exact: true }).fill('2')
  await dossier.getByLabel('Hold', { exact: true }).selectOption('strong')
  await dossier.getByLabel('Heat', { exact: true }).fill('4')
  await dossier.getByLabel('Wanted level', { exact: true }).fill('1')
  await dossier.getByLabel('Stacks', { exact: true }).fill('3')
  await dossier.getByLabel('Crew XP', { exact: true }).fill('8')
  await dossier.getByLabel('Base', { exact: true }).fill('The disused tram depot')
  await dossier.getByLabel('Base flair', { exact: true }).fill('Pink neon; obsolete listening station')
  await dossier.getByLabel('Hunting grounds', { exact: true }).fill('North canal')
  await dossier.getByLabel('Ward boss', { exact: true }).fill('Old Ish')
  await dossier.getByLabel('Anger', { exact: true }).fill('3')
  await dossier.getByLabel('Tithe notes', { exact: true }).fill('Next payment negotiated with the boss')
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
  await expect(shared.getByLabel('Reputation', { exact: true })).toHaveValue('Brazen')
  await expect(shared.getByLabel('Stacks', { exact: true })).toHaveValue('3')
  await expect(shared.getByLabel('Stacks', { exact: true })).toBeDisabled()
  await expect(shared.getByRole('button', { name: 'Save crew changes', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Tithe notes', { exact: true })).toHaveValue('Next payment negotiated with the boss')
  await expect(page.getByLabel('Tier', { exact: true })).toHaveValue('2')
  await page.screenshot({ path: 'test-results/crew-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/crew-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await gm.close(); await player.close()
})

test('crew API supports all published types and rejects forged management, invalid fields and stale overwrites', async () => {
  const gm = client(), coGM = client(), player = client(), outsider = client()
  for (const identity of [gm, coGM, player, outsider]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  let campaign = '', crewId = ''
  for (const type of ['Dealers', 'Hit Squad', 'Militants', 'Racers', 'Shadows', 'Utopians']) {
    const created = await gm.rpc('create_campaign', { p_name: `Crew type ${type}` })
    expect(created.error).toBeNull()
    const crew = await gm.rpc('create_crew', { p_campaign: created.data.id, p_name: `${type} crew`, p_type: type })
    expect(crew.error).toBeNull()
    expect(crew.data.data).toMatchObject({ type, tier: 0, hold: 'strong', stacks: 2, rep: 0, xp: 0, anger: 0 })
    if (type === 'Dealers') { campaign = created.data.id; crewId = crew.data.id }
  }
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  expect((await player.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  expect((await coGM.rpc('join_campaign', { p_invitation: invites.gm })).error).toBeNull()
  const other = (await outsider.rpc('create_campaign', { p_name: 'Other isolated crew' })).data.id
  expect((await outsider.rpc('create_crew', { p_campaign: other, p_name: 'Other crew', p_type: 'Shadows' })).error).toBeNull()
  expect((await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Duplicate', p_type: 'Dealers' })).error).not.toBeNull()
  expect((await gm.rpc('create_crew', { p_campaign: other, p_name: 'Foreign', p_type: 'Dealers' })).error?.message).toContain('GM membership required')
  for (const identity of [player, outsider]) {
    expect((await identity.rpc('create_crew', { p_campaign: campaign, p_name: 'Forged', p_type: 'Dealers' })).error?.message).toContain('GM membership required')
    expect((await identity.rpc('update_crew', { p_campaign: campaign, p_patch: { stacks: 99 }, p_expected: { stacks: 2 } })).error?.message).toContain('GM membership required')
  }
  expect((await player.from('crews').select('*').eq('campaign_id', campaign)).data?.map(row => row.id)).toEqual([crewId])
  expect((await outsider.from('crews').select('*').eq('campaign_id', campaign)).data).toEqual([])
  expect((await player.from('crews').select('*').eq('campaign_id', other)).data).toEqual([])
  for (const identity of [gm, coGM, player, outsider]) {
    expect((await identity.from('crews').insert({ campaign_id: campaign, data: { name: 'Bypass' } })).error).not.toBeNull()
    expect((await identity.from('crews').upsert({ id: crewId, campaign_id: other, data: { name: 'Moved' } })).error).not.toBeNull()
    expect((await identity.from('crews').update({ owner_id: (await identity.auth.getUser()).data.user!.id }).eq('id', crewId)).error).not.toBeNull()
    expect((await identity.from('crews').delete().eq('id', crewId)).error).not.toBeNull()
  }
  for (const patch of [
    { id: crypto.randomUUID() }, { campaign_id: other }, { owner_id: crypto.randomUUID() }, { role: 'gm' },
    { type: 'Assassins' }, { hold: 'automatic' }, { heat: 10 }, { anger: 5 }, { xp: -1 }, { stacks: 2.5 },
    { tier: '3' }, { name: null }, { name: '' }, { rep: 9, arbitrary: true },
  ]) {
    const result = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: patch, p_expected: {} })
    expect(result.error).not.toBeNull()
  }
  const concurrent = await Promise.all([
    gm.rpc('update_crew', { p_campaign: campaign, p_patch: { rep: 11 }, p_expected: { rep: 0 } }),
    coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { base: 'Converted station' }, p_expected: { base: '' } }),
  ])
  for (const result of concurrent) expect(result.error).toBeNull()
  const stale = await coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { rep: 1 }, p_expected: { rep: 0 } })
  expect(stale.error?.code).toBe('40001')
  const shared = await player.from('crews').select('*').eq('campaign_id', campaign).single()
  expect(shared.error).toBeNull()
  expect(shared.data!.data).toMatchObject({ rep: 11, base: 'Converted station', stacks: 2, tier: 0, anger: 0 })
  expect(shared.data!.campaign_id).toBe(campaign)
  expect(shared.data!.owner_id).toBeNull()
  expect(shared.data!.revision).toBe(3)
})

test('GM drafts survive competing edits and failed saves, with deliberate reload and reconnect recovery', async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext()
  const page = await first.newPage(), peer = await second.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Competing crew drafts')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await page.getByLabel('Secret GM invitation').inputValue()
  await page.getByLabel('Crew name', { exact: true }).fill('Electric Herons')
  await page.getByLabel('Crew type', { exact: true }).selectOption('Shadows')
  await page.getByRole('button', { name: 'Create crew', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Electric Herons', exact: true })).toBeVisible()
  await peer.goto('/')
  await peer.getByLabel('Invitation', { exact: true }).fill(invitation)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await expect(peer.getByRole('heading', { name: 'Electric Herons', exact: true })).toBeVisible()
  const ours = page.getByRole('region', { name: 'Crew dossier' }), theirs = peer.getByRole('region', { name: 'Crew dossier' })
  await ours.getByLabel('Reputation', { exact: true }).fill('Daring')
  await theirs.getByLabel('Base', { exact: true }).fill('Radio tower')
  await theirs.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByRole('status')).toHaveText('Crew saved.')
  await expect(ours.getByLabel('Base', { exact: true })).toHaveValue('Radio tower')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Crew saved.')
  await expect(theirs.getByLabel('Reputation', { exact: true })).toHaveValue('Daring')
  await ours.getByLabel('Tithe notes', { exact: true }).fill('Our unsaved decision')
  await theirs.getByLabel('Tithe notes', { exact: true }).fill('Agreed by the other GM')
  await theirs.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByRole('status')).toHaveText('Crew saved.')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Crew changed elsewhere')
  await expect(ours.getByLabel('Tithe notes', { exact: true })).toHaveValue('Our unsaved decision')
  await ours.getByRole('button', { name: 'Reload latest crew (discard unsaved)', exact: true }).click()
  await expect(ours.getByLabel('Tithe notes', { exact: true })).toHaveValue('Agreed by the other GM')
  await expect(ours.getByRole('alert')).toHaveCount(0)
  await ours.getByLabel('Base flair', { exact: true }).fill('A luminous conversation pit')
  await first.setOffline(true)
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Crew was not saved')
  await expect(ours.getByLabel('Base flair', { exact: true })).toHaveValue('A luminous conversation pit')
  await first.setOffline(false)
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Crew saved.')
  await expect(ours.getByRole('alert')).toHaveCount(0)
  await expect(theirs.getByLabel('Base flair', { exact: true })).toHaveValue('A luminous conversation pit')
  await page.reload()
  await expect(page.getByLabel('Base flair', { exact: true })).toHaveValue('A luminous conversation pit')
  await first.close(); await second.close()
})

test('a delayed older empty snapshot cannot erase an accepted crew creation', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Delayed crew snapshot')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await expect(page.getByText('No crew has been created.')).toBeVisible()
  let held = false
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/crews?*', async route => {
    const response = await route.fetch()
    held = true
    await gate
    await route.fulfill({ response })
  }, { times: 1 })
  // Delay one genuine pre-creation read, rather than synthesizing backend data.
  await expect.poll(() => held).toBe(true)
  await page.getByLabel('Crew name', { exact: true }).fill('Persistent Owls')
  await page.getByRole('button', { name: 'Create crew', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Persistent Owls', exact: true })).toBeVisible()
  const oldResponse = page.waitForResponse(response => response.url().includes('/rest/v1/crews?'))
  release()
  await oldResponse
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await page.getByRole('button', { name: 'Create crew', exact: true }).count()).toBe(0)
  await expect(page.getByRole('heading', { name: 'Persistent Owls', exact: true })).toBeVisible()
})

test('an unavailable initial crew read offers retry without claiming the campaign has no crew', async ({ page }) => {
  await page.goto('/')
  await page.route('**/rest/v1/crews?*', route => route.abort(), { times: 1 })
  await page.getByLabel('Campaign name', { exact: true }).fill('Retry initial crew read')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const dossier = page.getByRole('region', { name: 'Crew dossier' })
  await expect(dossier.getByRole('alert')).toContainText('Crew refresh failed')
  expect(await dossier.getByText('No crew has been created.').count()).toBe(0)
  expect(await dossier.getByRole('button', { name: 'Create crew', exact: true }).count()).toBe(0)
  await dossier.getByRole('button', { name: 'Retry crew refresh', exact: true }).click()
  await expect(dossier.getByText('No crew has been created.')).toBeVisible()
  await expect(dossier.getByRole('button', { name: 'Create crew', exact: true })).toBeVisible()
  await expect(dossier.getByRole('alert')).toHaveCount(0)
})

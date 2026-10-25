import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

// Approved seams: browser journeys and the ordinary authenticated API against real Supabase.
test('GM clock lifecycle preserves private content and rejects forged management across campaigns', async () => {
  const gm = client(), player = client(), outsider = client(), otherGM = client()
  for (const identity of [gm, player, outsider, otherGM]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Clock privacy' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  expect((await player.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  const other = (await otherGM.rpc('create_campaign', { p_name: 'Another clock campaign' })).data.id
  const created = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'SECRET mandate', notes: 'SECRET target at midnight', segments: 10, progress: 2, scope: 'campaign', active: true, visible_to_players: false, scoreId: null } })
  expect(created.error).toBeNull()
  const id = created.data.id
  expect(created.data.data).toMatchObject({ segments: 10, progress: 2, active: true, visible_to_players: false })
  expect((await gm.from('clocks').select('*').eq('id', id)).data).toHaveLength(1)
  for (const identity of [player, outsider, otherGM]) {
    const read = await identity.from('clocks').select('*').eq('id', id)
    expect(read.error).toBeNull(); expect(read.data).toEqual([])
    expect(JSON.stringify(read)).not.toContain('SECRET')
    expect((await identity.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'forged' } })).error?.message).toContain('GM membership required')
    expect((await identity.rpc('update_clock', { p_clock: id, p_patch: { visible_to_players: true }, p_expected: { visible_to_players: false } })).error?.message).toContain('GM membership required')
    expect((await identity.rpc('delete_clock', { p_clock: id, p_revision: 1 })).error?.message).toContain('GM membership required')
  }
  for (const identity of [gm, player, outsider, otherGM]) {
    expect((await identity.from('clocks').insert({ campaign_id: campaign, data: { name: 'Bypass' } })).error).not.toBeNull()
    expect((await identity.from('clocks').update({ data: { visible_to_players: true } }).eq('id', id)).error).not.toBeNull()
    expect((await identity.from('clocks').upsert({ id, campaign_id: other, data: {} })).error).not.toBeNull()
    expect((await identity.from('clocks').delete().eq('id', id)).error).not.toBeNull()
  }
  for (const patch of [{ campaign_id: other }, { owner_id: crypto.randomUUID() }, { role: 'gm' }, { revision: 50 }, { segments: 5 }, { segments: '6' }, { progress: 11 }, { progress: -1 }, { progress: 1.5 }, { active: 'yes' }, { visible_to_players: null }, { scope: 'private' }, { name: '' }, { notes: {} }, { scoreId: crypto.randomUUID() }]) {
    expect((await gm.rpc('update_clock', { p_clock: id, p_patch: patch, p_expected: {} })).error).not.toBeNull()
  }
  const shared = await gm.rpc('update_clock', { p_clock: id, p_patch: { visible_to_players: true, name: 'Public mandate', notes: 'Agreed stakes' }, p_expected: { visible_to_players: false, name: 'SECRET mandate', notes: 'SECRET target at midnight' } })
  expect(shared.error).toBeNull()
  expect((await player.from('clocks').select('*').eq('id', id)).data?.[0].data).toMatchObject({ name: 'Public mandate', notes: 'Agreed stakes' })
  expect((await otherGM.from('clocks').select('*').eq('id', id)).data).toEqual([])
  const completed = await gm.rpc('update_clock', { p_clock: id, p_patch: { progress: 10, active: false }, p_expected: { progress: 2, active: true } })
  expect(completed.error).toBeNull()
  expect(completed.data.data).toMatchObject({ progress: 10, active: false })
  const hidden = await gm.rpc('update_clock', { p_clock: id, p_patch: { visible_to_players: false, notes: 'SECRET after unshare' }, p_expected: { visible_to_players: true, notes: 'Agreed stakes' } })
  expect(hidden.error).toBeNull()
  expect((await player.from('clocks').select('*').eq('id', id)).data).toEqual([])
  expect((await gm.rpc('delete_clock', { p_clock: id, p_revision: hidden.data.revision })).error).toBeNull()
  expect((await gm.from('clocks').select('*').eq('id', id)).data).toEqual([])
})

test('connected players receive only shared clocks through create, edit, complete, unshare and removal', async ({ browser }) => {
  const gm = await browser.newContext(), player = await browser.newContext()
  const page = await gm.newPage(), peer = await player.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Clock table')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Clocks', exact: true }).click())
  const invitation = await page.getByLabel('Player invitation').inputValue()
  await peer.goto('/')
  await peer.getByLabel('Invitation', { exact: true }).fill(invitation)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => peer.getByRole('tab', { name: 'Clocks', exact: true }).click())
  const clocks = page.getByRole('region', { name: 'Campaign clocks', exact: true })
  const shared = peer.getByRole('region', { name: 'Campaign clocks', exact: true })
  await expect(shared.getByText('No clocks are shared with you.')).toBeVisible()
  await expect(shared.getByRole('button', { name: 'Create clock', exact: true })).toHaveCount(0)
  await clocks.getByLabel('New clock name', { exact: true }).fill('SECRET inspector dossier')
  await clocks.getByLabel('New clock segments', { exact: true }).selectOption('10')
  await clocks.getByRole('button', { name: 'Create clock', exact: true }).click()
  const clock = clocks.getByRole('article', { name: 'SECRET inspector dossier', exact: true })
  await expect(clock).toBeVisible()
  await clock.getByLabel('Clock notes', { exact: true }).fill('SECRET midnight raid')
  await clock.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(clock.getByRole('status')).toHaveText('Clock saved.')
  await expect(shared.getByText('No clocks are shared with you.')).toBeVisible()
  await clock.getByLabel('Clock name', { exact: true }).fill('An investigation')
  await clock.getByLabel('Clock notes', { exact: true }).fill('Something is brewing')
  await clock.getByLabel('Shared with players', { exact: true }).check()
  await clock.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  const renamed = clocks.getByRole('article', { name: 'An investigation', exact: true })
  const visible = shared.getByRole('article', { name: 'An investigation', exact: true })
  await expect(visible).toBeVisible()
  await expect(visible.getByText('Something is brewing', { exact: true })).toBeVisible()
  await expect(shared).not.toContainText('SECRET')
  await expect(visible.getByRole('button')).toHaveCount(0)
  await renamed.getByLabel('Clock progress', { exact: true }).fill('3')
  await renamed.getByLabel('Clock scope', { exact: true }).selectOption('score')
  await renamed.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(visible.getByText('3 / 10 segments', { exact: true })).toBeVisible()
  await renamed.getByRole('button', { name: 'Complete clock', exact: true }).click()
  await expect(visible.getByText('10 / 10 segments', { exact: true })).toBeVisible()
  await expect(visible.getByText('Complete · Inactive · Score', { exact: true })).toBeVisible()
  await renamed.getByLabel('Shared with players', { exact: true }).uncheck()
  await renamed.getByLabel('Clock notes', { exact: true }).fill('SECRET resumed investigation')
  await renamed.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(shared.getByRole('article')).toHaveCount(0)
  await peer.reload()
  await expect(peer.getByRole('region', { name: 'Campaign clocks', exact: true }).getByRole('article')).toHaveCount(0)
  await renamed.getByLabel('Shared with players', { exact: true }).check()
  await renamed.getByLabel('Clock notes', { exact: true }).fill('Released to the table')
  await renamed.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(peer.getByRole('article', { name: 'An investigation', exact: true })).toBeVisible()
  await page.reload()
  const restored = page.getByRole('article', { name: 'An investigation', exact: true })
  await expect(restored.getByLabel('Clock progress', { exact: true })).toHaveValue('10')
  await page.screenshot({ path: 'test-results/clocks-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/clocks-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await restored.getByRole('button', { name: 'Remove clock', exact: true }).click()
  await expect(page.getByRole('article', { name: 'An investigation', exact: true })).toHaveCount(0)
  await expect(peer.getByRole('article', { name: 'An investigation', exact: true })).toHaveCount(0)
  await gm.close(); await player.close()
})

test('clock drafts survive failed and conflicting saves with deliberate retry and reload', async ({ browser }) => {
  const gm = await browser.newContext(), coGM = await browser.newContext()
  const page = await gm.newPage(), peer = await coGM.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Clock draft recovery')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Clocks', exact: true }).click())
  const invitation = await page.getByLabel('Secret GM invitation').inputValue()
  await page.getByLabel('New clock name', { exact: true }).fill('Rival preparations')
  await page.getByRole('button', { name: 'Create clock', exact: true }).click()
  const ours = page.getByRole('article', { name: 'Rival preparations', exact: true })
  await expect(ours).toBeVisible()
  await peer.goto('/')
  await peer.getByLabel('Invitation', { exact: true }).fill(invitation)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => peer.getByRole('tab', { name: 'Clocks', exact: true }).click())
  const theirs = peer.getByRole('article', { name: 'Rival preparations', exact: true })
  await expect(theirs).toBeVisible()
  await ours.getByLabel('Clock notes', { exact: true }).fill('Our unsaved outcome')
  await theirs.getByLabel('Clock notes', { exact: true }).fill('Accepted peer outcome')
  await theirs.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(theirs.getByRole('status')).toHaveText('Clock saved.')
  await ours.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Clock changed elsewhere')
  await expect(ours.getByLabel('Clock notes', { exact: true })).toHaveValue('Our unsaved outcome')
  await ours.getByRole('button', { name: 'Reload clock (discard unsaved)', exact: true }).click()
  await expect(ours.getByLabel('Clock notes', { exact: true })).toHaveValue('Accepted peer outcome')
  await ours.getByLabel('Clock notes', { exact: true }).fill('Retry this local decision')
  await gm.setOffline(true)
  await ours.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Clock was not saved')
  // Wait for a real failed refresh as well as the failed mutation.
  await expect(page.getByRole('region', { name: 'Campaign clocks', exact: true }).getByRole('alert').filter({ hasText: 'Clock refresh failed' })).toBeVisible()
  await expect(ours.getByLabel('Clock notes', { exact: true })).toHaveValue('Retry this local decision')
  await gm.setOffline(false)
  await ours.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Clock saved.')
  await expect(theirs.getByLabel('Clock notes', { exact: true })).toHaveValue('Retry this local decision')
  await gm.close(); await coGM.close()
})

test('clock boundaries support verified sizes, disjoint GM edits, and reject stale or invalid operations atomically', async () => {
  const gm = client(), coGM = client()
  for (const identity of [gm, coGM]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Clock edit boundaries' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  expect((await coGM.rpc('join_campaign', { p_invitation: invites.gm })).error).toBeNull()
  let id = ''
  for (const size of [4, 6, 8, 10, 12]) {
    const created = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: `Size ${size}`, segments: size } })
    expect(created.error).toBeNull()
    expect(created.data.data).toMatchObject({ segments: size, progress: 0, active: true, visible_to_players: false, scope: 'campaign', scoreId: null })
    if (size === 4) id = created.data.id
  }
  const results = await Promise.all([
    gm.rpc('update_clock', { p_clock: id, p_patch: { notes: 'Agreed situation' }, p_expected: { notes: '' } }),
    coGM.rpc('update_clock', { p_clock: id, p_patch: { progress: 3 }, p_expected: { progress: 0 } }),
  ])
  for (const result of results) expect(result.error).toBeNull()
  expect((await gm.rpc('update_clock', { p_clock: id, p_patch: { notes: 'Stale decision' }, p_expected: { notes: '' } })).error?.code).toBe('40001')
  expect((await gm.rpc('delete_clock', { p_clock: id, p_revision: 1 })).error?.code).toBe('40001')
  expect((await gm.rpc('update_clock', { p_clock: id, p_patch: { name: 'Should not change', progress: 5 }, p_expected: { name: 'Size 4', progress: 3 } })).error?.message).toContain('Progress cannot exceed')
  const row = (await coGM.from('clocks').select('*').eq('id', id).single()).data!
  expect(row.data).toMatchObject({ name: 'Size 4', notes: 'Agreed situation', progress: 3 })
  expect(row.revision).toBe(3)
})

test('clock contents cannot be subscribed to through player public/private changefeeds or broadcasts', async () => {
  const gm = client(), player = client()
  for (const identity of [gm, player]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'No clock payload channel' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  expect((await player.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  await player.realtime.setAuth()
  for (const isPrivate of [false, true]) {
    const events: unknown[] = []
    const channel = player.channel(`campaign:${campaign}`, { config: { private: isPrivate } })
      .on('postgres_changes', { event: '*', schema: 'bitd', table: 'clocks', filter: `campaign_id=eq.${campaign}` }, payload => events.push(payload))
      .on('broadcast', { event: '*' }, payload => events.push(payload))
    const result = await new Promise<{ status: string; reason: string }>(resolve => channel.subscribe((status, error) => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) resolve({ status, reason: error?.message ?? '' })
    }))
    expect(result.status).toBe('CHANNEL_ERROR')
    expect(result.reason).toMatch(isPrivate ? /permissions|unauthorized/i : /private/i)
    const created = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'SECRET hidden mandate', notes: 'SECRET raw payload', segments: 10 } })
    expect(created.error).toBeNull()
    const updated = await gm.rpc('update_clock', { p_clock: created.data.id, p_patch: { progress: 1 }, p_expected: { progress: 0 } })
    expect(updated.error).toBeNull()
    expect((await gm.rpc('delete_clock', { p_clock: created.data.id, p_revision: updated.data.revision })).error).toBeNull()
    expect(events).toEqual([])
    expect((await player.from('clocks').select('*').eq('id', created.data.id)).data).toEqual([])
    await player.removeChannel(channel)
  }
})

test('an older shared clock snapshot cannot restore an already unshared clock on a connected player', async ({ browser }) => {
  const gm = client()
  await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Delayed clock visibility' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const created = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'Initially shared clock', visible_to_players: true } })
  expect(created.error).toBeNull()
  const player = await browser.newContext(), page = await player.newPage()
  const received: Promise<string>[] = []
  page.on('response', response => { if (response.url().includes('/rest/v1/clocks?')) received.push(response.text().catch(() => '')) })
  await page.goto('/')
  await page.getByLabel('Invitation', { exact: true }).fill(invites.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Clocks', exact: true }).click())
  await expect(page.getByRole('article', { name: 'Initially shared clock', exact: true })).toBeVisible()
  let held = false
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/clocks?*', async route => {
    const response = await route.fetch()
    held = true
    await gate
    await route.fulfill({ response })
  }, { times: 1 })
  await expect.poll(() => held).toBe(true)
  const hidden = await gm.rpc('update_clock', { p_clock: created.data.id, p_patch: { visible_to_players: false, notes: 'SECRET after revocation' }, p_expected: { visible_to_players: true, notes: '' } })
  expect(hidden.error).toBeNull()
  await expect(page.getByRole('article', { name: 'Initially shared clock', exact: true })).toHaveCount(0)
  const oldResponse = page.waitForResponse(response => response.url().includes('/rest/v1/clocks?'))
  release(); await oldResponse
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await page.getByRole('article', { name: 'Initially shared clock', exact: true }).count()).toBe(0)
  const payloads = await Promise.all(received)
  expect(payloads.join('')).not.toContain('SECRET after revocation')
  await player.setOffline(true)
  await expect(page.getByRole('region', { name: 'Campaign clocks', exact: true }).getByRole('alert')).toContainText('Clock refresh failed')
  await player.setOffline(false)
  await page.reload()
  await expect(page.getByText('No clocks are shared with you.')).toBeVisible()
  await player.close()
})

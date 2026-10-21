import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Behavior tests require local Supabase')
function localAdmin() {
  const local = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, local.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

test('GM recovery validates current campaign participants, rejects stale transfers and revokes the former owner', async () => {
  const [gm, old, recovered, outsider, otherGM] = Array.from({ length: 5 }, client)
  for (const c of [gm, old, recovered, outsider, otherGM]) expect((await c.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Recovered identity' })).data.id
  const invitation = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [old, recovered]) await c.rpc('join_campaign', { p_invitation: invitation })
  const foreignCampaign = (await otherGM.rpc('create_campaign', { p_name: 'Other campaign' })).data.id
  const ids = await Promise.all([old, recovered, outsider, otherGM].map(async c => (await c.auth.getUser()).data.user!.id))
  const character = (await old.rpc('create_character', { p_campaign: campaign, p_name: 'Reed' })).data
  const transfer = (c: typeof gm, owner: string | null, expected: string | null = ids[0]) => c.rpc('assign_character_owner', { p_character: character.id, p_owner: owner, p_expected_owner: expected })
  const members = await gm.rpc('list_campaign_participants', { p_campaign: campaign })
  expect(members.error).toBeNull()
  expect(members.data.map((m: { user_id: string }) => m.user_id)).toEqual(expect.arrayContaining(ids.slice(0, 2)))
  for (const c of [old, recovered, outsider, otherGM]) {
    expect((await c.rpc('list_campaign_participants', { p_campaign: campaign })).error).not.toBeNull()
    expect((await transfer(c, ids[1])).error).not.toBeNull()
  }
  expect((await gm.rpc('list_campaign_participants', { p_campaign: foreignCampaign })).error).not.toBeNull()
  for (const invalid of [ids[2], ids[3], crypto.randomUUID()]) expect((await transfer(gm, invalid)).error).not.toBeNull()
  const activity = await old.rpc('create_personal_business', { p_character: character.id, p_data: { activity: 'Recover' } })
  expect(activity.error).toBeNull()
  const assigned = await transfer(gm, ids[1])
  expect(assigned.error).toBeNull()
  expect(assigned.data.owner_id).toBe(ids[1])
  expect((await transfer(gm, ids[0])).error).not.toBeNull()
  for (const rpc of ['patch_character', 'delete_character', 'claim_character']) {
    expect((await old.rpc(rpc, { p_character: character.id, ...(rpc === 'patch_character' ? { p_patch: { alias: 'Stale owner' } } : {}) })).error).not.toBeNull()
  }
  expect((await old.rpc('update_personal_business', { p_record: activity.data.id, p_patch: { outcome: 'Stale' }, p_expected: { outcome: '' } })).error?.code).toBe('42501')
  expect((await recovered.rpc('update_personal_business', { p_record: activity.data.id, p_patch: { outcome: 'Recovered' }, p_expected: { outcome: '' } })).error).toBeNull()
  expect((await recovered.rpc('patch_character', { p_character: character.id, p_patch: { alias: 'Recovered' } })).error).toBeNull()
  expect((await gm.rpc('patch_character', { p_character: character.id, p_patch: { wearing: 'Still GM' } })).error).toBeNull()
  expect((await localAdmin().from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', ids[0])).error).toBeNull()
  expect((await transfer(gm, ids[0], ids[1])).error).not.toBeNull()
  expect((await old.rpc('join_campaign', { p_invitation: invitation })).error).toBeNull()
  expect((await transfer(gm, null, ids[1])).error).toBeNull()
  const claims = await Promise.all([old, recovered].map(c => c.rpc('claim_character', { p_character: character.id })))
  expect(claims.filter(r => !r.error)).toHaveLength(1)
  expect(claims.filter(r => r.error)).toHaveLength(1)
  expect((await gm.from('characters').select('data').eq('id', character.id).single()).data!.data).toMatchObject({ alias: 'Recovered', wearing: 'Still GM', wealth: { stacks: 0 }, harm: { mortal: [''] } })
})

for (const outcome of ['rejected', 'authorized GM', 'revoked'] as const) test(`a delayed ${outcome} membership refresh cannot erase a newly joined player campaign and its open editor`, async ({ page }, testInfo) => {
  const events: string[] = []
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) events.push(`navigation: ${new URL(frame.url()).pathname}`) })
  page.on('console', message => { if (message.type() === 'error') events.push(`console error: ${message.text()}`) })
  page.on('response', response => { if (response.url().includes('/campaign_members?')) events.push(`membership response: ${response.status()}`) })
  try {
    const gm = client()
    await gm.auth.signInAnonymously()
    const first = (await gm.rpc('create_campaign', { p_name: 'First table' })).data.id
    const firstInvite = (await gm.rpc('get_campaign_invitations', { p_campaign: first })).data.gm
    const second = (await gm.rpc('create_campaign', { p_name: 'Recovered table' })).data.id
    const secondInvite = (await gm.rpc('get_campaign_invitations', { p_campaign: second })).data.player
    await gm.rpc('create_character', { p_campaign: second, p_name: 'Recovery editor', p_unclaimed: true })
    await page.goto('/')
    await page.getByLabel('Invitation', { exact: true }).fill(firstInvite)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'First table', exact: true })).toBeVisible()
    const userId = await page.getByLabel('Your participant ID', { exact: true }).inputValue()
    let captured!: () => void, release!: () => void
    const intercepted = new Promise<void>(resolve => { captured = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/rest/v1/campaign_members?*', async route => {
      // Revoke at the captured read so independent current-access checks cannot
      // remove the workspace before this delayed-response fixture is armed.
      if (outcome === 'revoked') expect((await localAdmin().from('campaign_members').delete().eq('campaign_id', first).eq('user_id', userId)).error).toBeNull()
      const response = await route.fetch()
      captured()
      await gate
      if (outcome === 'rejected') await route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Membership temporarily unavailable"}' })
      else await route.fulfill({ response })
    }, { times: 1 })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await intercepted
    // Overview/presence now detect current revocation without waiting for focus.
    // Enter the new campaign from that denied-access screen while the old read
    // remains held, preserving the original old-response/new-membership race.
    if (outcome === 'revoked') await expect(page.getByLabel('Invitation', { exact: true })).toBeVisible()
    else await page.getByRole('button', { name: 'Switch campaign', exact: true }).click()
    await page.getByLabel('Invitation', { exact: true }).fill(secondInvite)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await page.getByRole('button', { name: 'Open Recovery editor', exact: true }).click()
    await expect(page.getByLabel('Character name', { exact: true })).toHaveValue('Recovery editor')
    const response = page.waitForResponse(r => r.url().includes('/campaign_members?') && r.status() === (outcome === 'rejected' ? 403 : 200))
    release()
    await response
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByRole('heading', { name: 'Recovered table', exact: true })).toBeVisible()
    await expect(page.getByLabel('Character name', { exact: true })).toHaveValue('Recovery editor')
    await expect(page.getByTestId('campaign-role')).toHaveText('Player')
    await expect(page.getByLabel('Secret GM invitation')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Character ownership', exact: true })).toHaveCount(0)
  } finally {
    await testInfo.attach('membership-navigation-console', { body: events.join('\n'), contentType: 'text/plain' })
  }
})

test('lost identity rejoins without email and the GM deliberately restores its character while stale edits are denied', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, old, recovered] = await Promise.all(contexts.map(c => c.newPage()))
  await gm.goto('/')
  await gm.getByLabel('Campaign name').fill('No email recovery')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const p of [old, recovered]) {
    await p.goto('/')
    await p.getByLabel('Invitation', { exact: true }).fill(invitation)
    await p.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(p.getByTestId('campaign-role')).toHaveText('Player')
  }
  await old.getByLabel('New character name').fill('Reed')
  await old.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await old.getByLabel('Alias', { exact: true }).fill('Remembered')
  await old.getByLabel('Alias', { exact: true }).blur()
  await old.reload()
  await old.getByRole('button', { name: 'Open Reed', exact: true }).click()
  await expect(old.getByLabel('Alias', { exact: true })).toHaveValue('Remembered')
  for (const p of [gm, recovered]) await p.getByRole('button', { name: 'Open Reed', exact: true }).click()
  await expect(recovered.getByLabel('Alias', { exact: true })).toBeDisabled()
  await expect(recovered.getByRole('button', { name: 'Claim Reed', exact: true })).toHaveCount(0)
  const participant = await recovered.getByLabel('Your participant ID', { exact: true }).inputValue()
  await gm.getByRole('button', { name: 'Refresh participant list', exact: true }).click()
  await gm.getByLabel('Assign character to', { exact: true }).selectOption(participant)
  let releaseSave!: () => void, saveCaptured!: () => void
  const heldSave = new Promise<void>(resolve => { releaseSave = resolve })
  const interceptedSave = new Promise<void>(resolve => { saveCaptured = resolve })
  await old.route('**/rest/v1/rpc/patch_character', async route => { saveCaptured(); await heldSave; await route.continue() }, { times: 1 })
  await old.getByLabel('Alias', { exact: true }).fill('Late old owner edit')
  await old.getByLabel('Alias', { exact: true }).blur()
  await interceptedSave
  await gm.getByRole('button', { name: 'Review ownership change', exact: true }).click()
  await expect(recovered.getByLabel('Alias', { exact: true })).toBeDisabled()
  await contexts[0].setOffline(true)
  await gm.getByRole('button', { name: 'Confirm ownership change', exact: true }).click()
  await expect(gm.getByRole('alert').filter({ hasText: 'Ownership was not changed' })).toBeVisible()
  await expect(recovered.getByLabel('Alias', { exact: true })).toBeDisabled()
  await contexts[0].setOffline(false)
  await gm.getByRole('button', { name: 'Retry ownership change', exact: true }).click()
  await expect(recovered.getByLabel('Alias', { exact: true })).toBeEnabled()
  releaseSave()
  await expect(old.getByRole('alert').filter({ hasText: 'Alias was not saved' })).toBeVisible()
  await expect(old.getByRole('button', { name: 'Retry Alias', exact: true })).toBeDisabled()
  await old.getByRole('button', { name: 'Discard Alias edit', exact: true }).click()
  await expect(recovered.getByLabel('Alias', { exact: true })).toHaveValue('Remembered')
  await expect(old.getByLabel('Alias', { exact: true })).toBeDisabled()
  await expect(gm.getByLabel('Alias', { exact: true })).toBeEnabled()
  await recovered.getByLabel('Alias', { exact: true }).fill('Recovered safely')
  await recovered.getByLabel('Alias', { exact: true }).blur()
  await expect(gm.getByLabel('Alias', { exact: true })).toHaveValue('Recovered safely')
  await old.reload()
  await old.getByRole('button', { name: 'Open Reed', exact: true }).click()
  await expect(old.getByLabel('Alias', { exact: true })).toBeDisabled()
  await recovered.reload()
  await recovered.getByRole('button', { name: 'Open Reed', exact: true }).click()
  await expect(recovered.getByLabel('Alias', { exact: true })).toBeEnabled()
  await gm.getByRole('region', { name: 'Character ownership', exact: true }).screenshot({ path: 'test-results/ownership-desktop.png' })
  await gm.setViewportSize({ width: 390, height: 844 })
  await expect(gm.getByLabel('Assign character to', { exact: true })).toBeVisible()
  expect(await gm.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await gm.getByRole('region', { name: 'Character ownership', exact: true }).screenshot({ path: 'test-results/ownership-mobile.png' })
  await gm.getByRole('region', { name: 'Campaign overview', exact: true }).screenshot({ path: 'test-results/recovery-access-mobile.png' })
  for (const context of contexts) await context.close()
})

test('a current membership failure hides GM information, permits retry, and current revocation remains denied on reconnect and reload', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Campaign name').fill('Verify current authority')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await expect(page.getByLabel('Secret GM invitation')).toBeVisible()
  const userId = await page.getByLabel('Your participant ID', { exact: true }).inputValue()
  const campaignId = await page.evaluate(() => localStorage.getItem('bitd.activeCampaign'))
  await page.getByLabel('New character name').fill('Private editor')
  await page.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await expect(page.getByLabel('Alias', { exact: true })).toBeEnabled()
  await page.route('**/rest/v1/campaign_members?*', async route => {
    await route.fetch()
    await route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Membership verification rejected"}' })
  }, { times: 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button', { name: 'Retry campaign access', exact: true })).toBeVisible()
  await expect(page.getByLabel('Secret GM invitation')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Character dossiers', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry campaign access', exact: true }).click()
  await expect(page.getByTestId('campaign-role')).toHaveText('Game Master')
  await expect(page.getByLabel('Secret GM invitation')).toBeVisible()
  expect((await localAdmin().from('campaign_members').delete().eq('campaign_id', campaignId!).eq('user_id', userId)).error).toBeNull()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('button', { name: 'Join campaign', exact: true })).toBeVisible()
  await expect(page.getByLabel('Secret GM invitation')).toHaveCount(0)
  await expect(page.getByTestId('campaign-role')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Join campaign', exact: true })).toBeVisible()
  await expect(page.getByLabel('Secret GM invitation')).toHaveCount(0)
})

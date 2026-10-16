import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const url = process.env.VITE_SUPABASE_URL!
const key = process.env.VITE_SUPABASE_ANON_KEY!
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

test('GM deliberately initializes the current Gazette factions; players see the shared dossier', async ({ browser }) => {
  const gmContext = await browser.newContext(), playerContext = await browser.newContext()
  const gm = await gmContext.newPage(), player = await playerContext.newPage()
  await gm.goto('/')
  await gm.getByLabel('Campaign name').fill('Gazette campaign')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  await expect(gm.getByText('No factions have been added.')).toBeVisible()
  await gm.getByRole('button', { name: 'Add Blades ’68 Gazette factions' }).click()
  await expect(gm.getByText('56 factions')).toBeVisible()
  await gm.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await expect(gm.getByLabel('Tier', { exact: true })).toHaveValue('6')
  await expect(gm.getByLabel('Hold', { exact: true })).toHaveValue('strong')
  await gm.getByLabel('Description', { exact: true }).fill('An elusive criminal power in modern Doskvol.')
  await gm.getByRole('button', { name: 'Save public dossier' }).click()
  await expect(gm.getByText('Public dossier saved.')).toBeVisible()
  await player.goto('/')
  await player.getByLabel('Invitation').fill(invitation)
  await player.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await expect(player.getByText('56 factions')).toBeVisible()
  await player.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await expect(player.getByLabel('Description', { exact: true })).toHaveValue('An elusive criminal power in modern Doskvol.')
  await expect(player.getByLabel('Description', { exact: true })).toBeDisabled()
  await expect(player.getByLabel('GM-private notes')).toHaveCount(0)
  await gm.reload()
  await gm.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await expect(gm.getByLabel('Description', { exact: true })).toHaveValue('An elusive criminal power in modern Doskvol.')
  await gmContext.close(); await playerContext.close()
})

test('GM keeps private faction notes confidential and deliberately shares only selected text', async ({ browser }) => {
  const gmAPI = client()
  await gmAPI.auth.signInAnonymously()
  const campaign = (await gmAPI.rpc('create_campaign', { p_name: 'Private faction campaign' })).data
  const invitations = (await gmAPI.rpc('get_campaign_invitations', { p_campaign: campaign.id })).data
  expect((await gmAPI.rpc('initialize_gazette_factions', { p_campaign: campaign.id })).error).toBeNull()
  const gmContext = await browser.newContext(), playerContext = await browser.newContext()
  const gm = await gmContext.newPage(), player = await playerContext.newPage()
  const responses: string[] = []
  player.on('response', async response => { if (response.url().startsWith(url) && !response.url().includes('/auth/')) responses.push(await response.text().catch(() => '')) })
  for (const [page, invitation] of [[gm, invitations.gm], [player, invitations.player]] as const) {
    await page.goto('/')
    await page.getByLabel('Invitation').fill(invitation)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await page.getByRole('button', { name: 'The Unseen', exact: true }).click()
  }
  await gm.getByLabel('GM-private notes', { exact: true }).fill('PRIVATE: MIDNIGHT-ORCHID. Public clue: The tower is watched.')
  await gm.getByRole('button', { name: 'Save private notes' }).click()
  await expect(gm.getByText('Private notes saved.')).toBeVisible()
  await expect(player.getByLabel('Known information', { exact: true })).toHaveValue('')
  await expect(player.getByLabel('GM-private notes', { exact: true })).toHaveCount(0)
  await gm.getByLabel('Selected text to share').fill('The tower is watched.')
  await gm.getByRole('button', { name: 'Publish selected text' }).click()
  await expect(player.getByLabel('Known information', { exact: true })).toHaveValue('The tower is watched.')
  await gm.getByLabel('Known information', { exact: true }).fill('')
  await gm.getByRole('button', { name: 'Save public dossier' }).click()
  await expect(player.getByLabel('Known information', { exact: true })).toHaveValue('')
  await player.reload()
  await player.getByRole('button', { name: 'The Unseen', exact: true }).click()
  expect(responses.join('\n')).not.toContain('MIDNIGHT-ORCHID')
  expect(await player.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('MIDNIGHT-ORCHID')
  await gm.reload()
  await gm.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await expect(gm.getByLabel('GM-private notes', { exact: true })).toHaveValue('PRIVATE: MIDNIGHT-ORCHID. Public clue: The tower is watched.')
  await gmContext.close(); await playerContext.close()
})

async function factionFixture() {
  const gm = client(), player = client(), outsider = client(), otherGM = client()
  for (const identity of [gm, player, outsider, otherGM]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Faction API boundaries' })).data.id as string
  const second = (await otherGM.rpc('create_campaign', { p_name: 'Second faction campaign' })).data.id as string
  const invitations = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  await player.rpc('join_campaign', { p_invitation: invitations.player })
  expect((await gm.rpc('initialize_gazette_factions', { p_campaign: campaign })).data).toBe(56)
  await otherGM.rpc('initialize_gazette_factions', { p_campaign: second })
  const faction = (await gm.from('faction_records').select('*').eq('campaign_id', campaign).eq('name', 'The Unseen').single()).data!
  const otherFaction = (await otherGM.from('faction_records').select('*').eq('campaign_id', second).eq('name', 'The Unseen').single()).data!
  return { gm, player, outsider, otherGM, campaign, second, faction, otherFaction, invitations }
}

test('public faction API permits shared notes while protecting facts, private notes and other campaigns', async () => {
  const { gm, player, outsider, otherGM, campaign, second, faction, otherFaction } = await factionFixture()
  const written = await player.rpc('patch_faction', { p_id: faction.id, p_patch: { shared_notes: 'PLAYER: watch the north gate' }, p_expected_version: faction.version })
  expect(written.error).toBeNull()
  expect(written.data.shared_notes).toBe('PLAYER: watch the north gate')
  // A field-limited patch preserves the remainder of the public dossier.
  expect(written.data.name).toBe('The Unseen')
  const version = written.data.version
  for (const p_patch of [{ tier: 1 }, { status: 3 }, { description: 'forged' }, { known_information: 'forged' }, { shared_notes: 'good', tier: 1 }, { campaign_id: second }, { note: 'PRIVATE INJECTION' }, { shared_notes: null }, { shared_notes: [] }]) {
    expect((await player.rpc('patch_faction', { p_id: faction.id, p_patch, p_expected_version: version })).error).not.toBeNull()
  }
  expect((await gm.rpc('save_faction_private_note', { p_id: faction.id, p_note: 'PRIVATE: VIOLET-CIPHER', p_expected_version: 0 })).error).toBeNull()
  expect((await gm.rpc('get_faction_private_note', { p_id: faction.id })).data.note).toBe('PRIVATE: VIOLET-CIPHER')
  for (const identity of [player, outsider, otherGM]) {
    expect((await identity.from('faction_private_notes').select('*').eq('faction_id', faction.id)).data).toEqual([])
    expect((await identity.rpc('get_faction_private_note', { p_id: faction.id })).error).not.toBeNull()
    expect((await identity.rpc('save_faction_private_note', { p_id: faction.id, p_note: 'forged', p_expected_version: 1 })).error).not.toBeNull()
    expect((await identity.rpc('publish_faction_information', { p_id: faction.id, p_text: 'forged', p_expected_version: version })).error).not.toBeNull()
    for (const table of ['faction_records', 'faction_private_notes']) {
      expect((await identity.from(table).insert(table === 'faction_records' ? { campaign_id: campaign, name: 'forged' } : { faction_id: faction.id, campaign_id: campaign, note: 'forged' })).error).not.toBeNull()
      expect((await identity.from(table).update(table === 'faction_records' ? { tier: 1 } : { note: 'forged' }).eq('campaign_id', campaign)).error).not.toBeNull()
      expect((await identity.from(table).delete().eq('campaign_id', campaign)).error).not.toBeNull()
    }
  }
  expect(JSON.stringify((await player.from('faction_records').select('*').eq('campaign_id', campaign)).data)).not.toContain('VIOLET-CIPHER')
  for (const identity of [outsider, otherGM]) {
    expect((await identity.from('faction_records').select('*').eq('campaign_id', campaign)).data).toEqual([])
    expect((await identity.rpc('patch_faction', { p_id: faction.id, p_patch: { shared_notes: 'forged' }, p_expected_version: version })).error).not.toBeNull()
    expect((await identity.rpc('initialize_gazette_factions', { p_campaign: campaign })).error).not.toBeNull()
  }
  expect((await gm.rpc('patch_faction', { p_id: otherFaction.id, p_patch: { tier: 1 }, p_expected_version: 1 })).error).not.toBeNull()
  expect((await gm.from('faction_private_notes').update({ campaign_id: second }).eq('faction_id', faction.id)).error).not.toBeNull()
  for (const p_patch of [{ secret: 'no' }, { tier: '3' }, { tier: 2.5 }, { tier: -1 }, { tier: 7 }, { status: 4 }, { hold: 'fixed' }]) {
    expect((await gm.rpc('patch_faction', { p_id: faction.id, p_patch, p_expected_version: version })).error).not.toBeNull()
  }
  expect((await gm.rpc('initialize_gazette_factions', { p_campaign: campaign })).error).not.toBeNull()
  expect((await gm.rpc('patch_faction', { p_id: faction.id, p_patch: { status: -1 }, p_expected_version: faction.version })).error).not.toBeNull()
  const final = await gm.rpc('patch_faction', { p_id: faction.id, p_patch: { status: -1 }, p_expected_version: version })
  expect(final.error).toBeNull()
  expect(final.data.shared_notes).toBe('PLAYER: watch the north gate')
  expect(final.data.status).toBe(-1)
  expect((await player.from('faction_records').select('*').eq('id', faction.id).single()).data!.status).toBe(-1)
})

test('GM adds and deletes custom factions; connected players reconcile deletion without private realtime payloads', async ({ browser }) => {
  const { gm, player, outsider, otherGM, campaign, invitations } = await factionFixture()
  const gmContext = await browser.newContext(), playerContext = await browser.newContext()
  const gmPage = await gmContext.newPage(), playerPage = await playerContext.newPage()
  for (const [page, invite] of [[gmPage, invitations.gm], [playerPage, invitations.player]] as const) {
    await page.goto('/')
    await page.getByLabel('Invitation').fill(invite)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(page.getByText('56 factions')).toBeVisible()
  }
  await gmPage.getByLabel('New faction name').fill('The Neon Garden')
  await gmPage.getByRole('button', { name: 'Create faction', exact: true }).click()
  await expect(playerPage.getByRole('button', { name: 'The Neon Garden', exact: true })).toBeVisible()
  await playerPage.getByRole('button', { name: 'The Neon Garden', exact: true }).click()
  await playerPage.getByLabel('Shared notes', { exact: true }).fill('The garden trades in information.')
  await playerPage.getByRole('button', { name: 'Save shared notes' }).click()
  await expect(playerPage.getByText('Shared notes saved.')).toBeVisible()
  await expect(gmPage.getByLabel('Shared notes', { exact: true })).toHaveValue('The garden trades in information.')
  const record = (await gm.from('faction_records').select('*').eq('campaign_id', campaign).eq('name', 'The Neon Garden').single()).data!
  const observed: unknown[] = []
  const channels = []
  for (const identity of [player, outsider]) {
    await identity.realtime.setAuth()
    const channel = identity.channel(`faction-private:${campaign}`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'bitd', table: 'faction_private_notes' }, payload => observed.push(payload))
      .on('postgres_changes', { event: '*', schema: 'bitd', table: 'faction_records' }, payload => observed.push(payload))
    const result = await new Promise<{ status: string; reason: string }>(resolve => channel.subscribe((status, error) => {
      if (['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status)) resolve({ status, reason: error?.message ?? '' })
    }))
    expect(result.status).toBe('CHANNEL_ERROR')
    expect(result.reason).toMatch(/permissions|unauthorized/i)
    channels.push([identity, channel] as const)
  }
  expect((await gm.rpc('save_faction_private_note', { p_id: record.id, p_note: 'PRIVATE DELETE: COBALT-KEYHOLE', p_expected_version: 0 })).error).toBeNull()
  for (const identity of [player, outsider, otherGM]) {
    expect((await identity.rpc('delete_faction', { p_id: record.id, p_expected_version: record.version })).error).not.toBeNull()
    expect((await identity.rpc('create_faction', { p_campaign: campaign, p_name: 'forged' })).error).not.toBeNull()
  }
  await gmPage.getByRole('checkbox', { name: 'Delete this faction and its GM-private notes' }).check()
  await gmPage.getByRole('button', { name: 'Delete faction', exact: true }).click()
  await expect(playerPage.getByRole('button', { name: 'The Neon Garden', exact: true })).toHaveCount(0)
  await expect(playerPage.getByRole('article', { name: 'Faction dossier' })).toHaveCount(0)
  expect((await gm.from('faction_private_notes').select('*').eq('faction_id', record.id)).data).toEqual([])
  expect(observed).toEqual([])
  for (const [identity, channel] of channels) await identity.removeChannel(channel)
  await gmPage.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await gmPage.screenshot({ path: 'test-results/factions-desktop.png', fullPage: true })
  await playerPage.setViewportSize({ width: 390, height: 844 })
  await playerPage.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await playerPage.screenshot({ path: 'test-results/factions-mobile.png', fullPage: true })
  await gmContext.close(); await playerContext.close()
})


test('stale faction saves are rejected visibly, and a demoted GM loses the private notebook', async ({ browser }) => {
  const { gm, player, campaign, faction, invitations } = await factionFixture()
  expect((await gm.rpc('save_faction_private_note', { p_id: faction.id, p_note: 'PRIVATE: EMERALD-CANARY', p_expected_version: 0 })).error).toBeNull()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Invitation').fill(invitations.gm)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await page.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await expect(page.getByLabel('GM-private notes', { exact: true })).toHaveValue('PRIVATE: EMERALD-CANARY')
  await page.getByLabel('Description', { exact: true }).fill('Unsaved stale description')
  expect((await player.rpc('patch_faction', { p_id: faction.id, p_patch: { shared_notes: 'A newer player note' }, p_expected_version: faction.version })).error).toBeNull()
  await page.getByRole('button', { name: 'Save public dossier' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Save failed:' })).toContainText('Faction changed')
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Unsaved stale description')
  await page.getByRole('button', { name: 'Reload dossier', exact: true }).click()
  await expect(page.getByLabel('Shared notes', { exact: true })).toHaveValue('A newer player note')
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('An influential criminal network whose members remain anonymous.')
  // Trusted fixture operation changes the browser member's authority, never its local UI state.
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  const admin = createClient(url, status.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
  const originalGM = (await gm.auth.getUser()).data.user!.id
  expect((await admin.from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('role', 'gm').neq('user_id', originalGM)).error).toBeNull()
  await expect(page.getByLabel('GM-private notes', { exact: true })).toHaveCount(0)
  expect(await page.content()).not.toContain('EMERALD-CANARY')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByTestId('campaign-role')).toHaveText('Player')
  await page.getByRole('button', { name: 'The Unseen', exact: true }).click()
  await expect(page.getByLabel('GM-private notes', { exact: true })).toHaveCount(0)
  await context.close()
})

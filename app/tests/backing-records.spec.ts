import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Tests require local Supabase')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

test('backing support is a private owner/GM record, separate from crew status and legacy Operative fields', async () => {
  const gm = client(), owner = client(), peer = client(), outsider = client()
  for (const c of [gm, owner, peer, outsider]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Backing authority' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, peer]) await c.rpc('join_campaign', { p_invitation: invite })
  const character = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Morgan' })).data
  const faction = (await gm.rpc('create_faction', { p_campaign: campaign, p_name: 'Palace' })).data
  const made = await owner.rpc('create_backing', { p_character: character.id, p_faction: faction.id })
  expect(made.error).toBeNull()
  expect(made.data).toMatchObject({ character_id: character.id, faction_id: faction.id, active: true, shared: false, mission: '', failure: 0, cycles: [] })
  const patch = { mission: 'Recover the dossier', failure: 2, prestige: 'Training pending review', choices: 'Ask the GM about training', cycles: [{ label: 'Cycle 3', used: ['assist', 'intelligence'], notes: 'Two calls; Return the Favor pending' }] }
  const saved = await owner.rpc('patch_backing', { p_backing: made.data.id, p_patch: patch, p_expected_version: made.data.version })
  expect(saved.error).toBeNull(); expect(saved.data).toMatchObject(patch)
  for (const c of [peer, outsider]) {
    expect((await c.from('backing_records').select('*').eq('id', made.data.id)).data).toEqual([])
    expect((await c.rpc('patch_backing', { p_backing: made.data.id, p_patch: { notes: 'Forged' }, p_expected_version: saved.data.version })).error).not.toBeNull()
  }
  expect((await gm.from('backing_records').select('*').eq('id', made.data.id).single()).data).toMatchObject(patch)
  expect((await owner.from('faction_records').select('status').eq('id', faction.id).single()).data!.status).toBe(0)
})

test('owner records labeled assistance, mission and private Failure; explicit sharing, correction and failed-save retry synchronize', async ({ browser }) => {
  test.setTimeout(60000)
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, owner, peer] = await Promise.all(contexts.map(c => c.newPage()))
  for (const p of [gm, owner, peer]) p.setDefaultTimeout(10000)
  await gm.goto('/'); await gm.getByLabel('Campaign name').fill('Backing collaboration')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invite = await gm.getByLabel('Player invitation').inputValue()
  await gm.getByLabel('New faction name', { exact: true }).fill('Palace')
  await gm.getByRole('button', { name: 'Create faction', exact: true }).click()
  for (const p of [owner, peer]) {
    await p.goto('/'); await p.getByLabel('Invitation', { exact: true }).fill(invite)
    await p.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  await owner.getByLabel('New character name').fill('Morgan')
  await owner.getByRole('button', { name: 'Create Hound', exact: true }).click()
  for (const p of [gm, peer]) await p.getByRole('button', { name: 'Open Morgan', exact: true }).click()
  const section = owner.getByRole('region', { name: 'Backing factions', exact: true })
  await section.getByLabel('Public backing faction').selectOption({ label: 'Palace · Tier 0' })
  await section.getByRole('button', { name: 'Record backing', exact: true }).click()
  const card = section.getByRole('region', { name: 'Palace backing', exact: true })
  await card.getByLabel('Personal mission', { exact: true }).fill('PRIVATE: recover diplomatic dossier')
  await card.getByLabel('Mission state', { exact: true }).selectOption('active')
  await card.getByLabel('Failure progress', { exact: true }).selectOption('2')
  await card.getByLabel('Prestige ability', { exact: true }).fill('Training after satisfaction')
  await card.getByLabel('Prestige choices and decisions').fill('Training retained if backing ends; GM review')
  await card.getByRole('button', { name: 'Add labeled support cycle', exact: true }).click()
  await card.getByLabel('Support cycle 1 label').fill('Cycle 7')
  await card.getByLabel('Cycle 1 · Assist').check()
  await card.getByLabel('Cycle 1 · Intelligence').check()
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await contexts[1].setOffline(true)
  await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('not saved')
  await expect(card.getByLabel('Personal mission', { exact: true })).toHaveValue('PRIVATE: recover diplomatic dossier')
  await contexts[1].setOffline(false)
  await card.getByRole('button', { name: 'Retry backing changes', exact: true }).click()
  const gmCard = gm.getByRole('region', { name: 'Palace backing', exact: true })
  await expect(gmCard.getByLabel('Personal mission', { exact: true })).toHaveValue('PRIVATE: recover diplomatic dossier')
  await expect(peer.getByRole('region', { name: 'Palace backing', exact: true })).toHaveCount(0)
  await card.getByLabel('Share entire backing record with campaign').check()
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  const peerCard = peer.getByRole('region', { name: 'Palace backing', exact: true })
  await expect(peerCard.getByLabel('Failure progress', { exact: true })).toHaveValue('2')
  await expect(peerCard.getByLabel('Personal mission', { exact: true })).toBeDisabled()
  await gmCard.getByLabel('Failure progress', { exact: true }).selectOption('3')
  await gmCard.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await gmCard.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(card.getByLabel('Failure progress', { exact: true })).toHaveValue('3')
  await card.getByRole('button', { name: 'Add labeled support cycle', exact: true }).click()
  await card.getByLabel('Support cycle 2 label').fill('Cycle 8')
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(peerCard.getByLabel('Cycle 1 · Assist', { exact: true })).toBeChecked()
  await expect(peerCard.getByLabel('Cycle 2 · Assist', { exact: true })).not.toBeChecked()
  await owner.reload(); await owner.getByRole('button', { name: 'Open Morgan', exact: true }).click()
  await expect(card.getByLabel('Failure progress', { exact: true })).toHaveValue('3')
  await expect(card.getByLabel('Prestige ability', { exact: true })).toHaveValue('Training after satisfaction')
  await section.screenshot({ path: 'test-results/backing-desktop.png' })
  await owner.setViewportSize({ width: 390, height: 844 })
  expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await section.screenshot({ path: 'test-results/backing-mobile.png' })
  await card.getByLabel('Share entire backing record with campaign').uncheck()
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(peerCard).toHaveCount(0)
  await Promise.all(contexts.map(c => c.close()))
})

test('backing limits, current ownership, public linkage and strict cycle records cannot be bypassed', async () => {
  const gm = client(), owner = client(), peer = client(), outsider = client()
  for (const c of [gm, owner, peer, outsider]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Backing exceptions' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, peer]) await c.rpc('join_campaign', { p_invitation: invite })
  const other = (await outsider.rpc('create_campaign', { p_name: 'Other backing campaign' })).data.id
  const foreign = (await outsider.rpc('create_faction', { p_campaign: other, p_name: 'FOREIGN' })).data
  const factions = []
  for (const name of ['Palace', 'Blackthorn Park', 'Paxton']) factions.push((await gm.rpc('create_faction', { p_campaign: campaign, p_name: name })).data)
  const character = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Agent', p_playbook: 'Operative' })).data
  const create = (faction = factions[0].id, who = owner, id = character.id) => who.rpc('create_backing', { p_character: id, p_faction: faction })
  for (const who of [peer, outsider]) expect((await create(factions[0].id, who)).error).not.toBeNull()
  expect((await create(foreign.id)).error).not.toBeNull()
  const concurrent = await Promise.all([create(factions[0].id), create(factions[1].id)])
  expect(concurrent.filter(r => !r.error)).toHaveLength(1)
  let first = concurrent.find(r => !r.error)!.data
  const patch = (record: typeof first, changes: unknown, who = owner, version = record.version) => who.rpc('patch_backing', { p_backing: record.id, p_patch: changes, p_expected_version: version })
  const invalid = [{ campaign_id: other }, { character_id: character.id }, { faction_name: 'Forged' }, { faction_tier: 6 }, { clock_id: 'private-clock-identity' }, { mission: null }, { shared: 'true' }, { failure: 5 }, { failure: 1.5 }, { mission_state: 'automatic-reward' }, { cycles: [{ label: 'Cycle 1', used: ['assist', 'assist'], notes: '' }] }, { cycles: [{ label: '', used: [], notes: '' }] }, { cycles: [{ label: 'A', used: [], notes: '' }, { label: 'A', used: [], notes: '' }] }, { cycles: [{ label: 'A', used: ['invented'], notes: '' }] }, { faction_id: foreign.id }]
  for (const changes of invalid) expect((await patch(first, changes)).error, JSON.stringify(changes)).not.toBeNull()
  expect((await owner.from('backing_records').update({ shared: true }).eq('id', first.id)).error).not.toBeNull()
  expect((await gm.from('backing_records').insert({ campaign_id: campaign, character_id: character.id, faction_name: 'Forged', faction_tier: 0 })).error).not.toBeNull()
  for (const helper of ['validate_backing_patch', 'validate_character_pre_backing_patch']) expect((await owner.rpc(helper, { p_patch: {} })).error).not.toBeNull()
  expect((await owner.rpc('patch_character', { p_character: character.id, p_patch: { operative: { backingFactions: [] } } })).error).not.toBeNull()
  expect((await owner.rpc('patch_character', { p_character: character.id, p_patch: { abilities: ['Double Agent'] } })).error).toBeNull()
  const remaining = factions.find(f => f.id !== first.faction_id)!
  let second = (await create(remaining.id)).data
  expect(second).toBeTruthy()
  expect((await create(factions[2].id)).error).not.toBeNull()
  expect((await owner.rpc('patch_character', { p_character: character.id, p_patch: { abilities: [] } })).error).not.toBeNull()
  const ended = await patch(second, { active: false, mission_state: 'failed', failure: 4, prestige: 'Training retained' }); expect(ended.error).toBeNull(); second = ended.data
  expect((await owner.rpc('patch_character', { p_character: character.id, p_patch: { abilities: [] } })).error).toBeNull()
  expect((await patch(second, { notes: 'Inactive history remains editable' })).error).toBeNull()
  expect((await patch(first, { mission_state: 'complete', failure: 4, prestige: 'Reviewed training', cycles: [{ label: 'Cycle 2', used: ['assist','effect','equipment','intelligence','downtime','information','consequence','diplomacy'], notes: 'All eight calls' }] })).error).toBeNull()
  first = (await gm.from('backing_records').select('*').eq('id', first.id).single()).data
  expect(first.active).toBe(true) // Filled Failure remains a record until deliberately adjudicated.
  expect((await owner.from('faction_records').select('status').eq('id', first.faction_id).single()).data!.status).toBe(0)
  expect((await patch(first, { notes: 'Stale overwrite' }, owner, 1)).error?.code).toBe('40001')
  const oldOwner = (await owner.auth.getUser()).data.user!.id, newOwner = (await peer.auth.getUser()).data.user!.id
  expect((await gm.rpc('assign_character_owner', { p_character: character.id, p_owner: newOwner, p_expected_owner: oldOwner })).error).toBeNull()
  expect((await patch(first, { notes: 'Old owner stale save' })).error?.code).toBe('42501')
  expect((await owner.from('backing_records').select('*').eq('id', first.id)).data).toEqual([])
  const transferred = await patch(first, { notes: 'New owner correction', shared: true }, peer); expect(transferred.error).toBeNull()
  expect((await owner.from('backing_records').select('*').eq('id', first.id).single()).data!.notes).toBe('New owner correction')
  const normal = (await peer.rpc('create_character', { p_campaign: campaign, p_name: 'Versatile Hound' })).data
  const source = [{ name: 'Double Agent', source: 'Operative · book v1.0.1 p.50', notes: '' }]
  expect((await peer.rpc('patch_character', { p_character: normal.id, p_patch: { versatile: source } })).error).toBeNull()
  expect((await create(factions[0].id, peer, normal.id)).error).toBeNull()
  expect((await create(factions[1].id, peer, normal.id)).error).not.toBeNull() // Unselected free text grants nothing.
  for (const blank of [' ', '\t\n', '\u00a0\u2003\u2028\uFEFF']) {
    expect((await peer.rpc('patch_character', { p_character: normal.id, p_patch: { abilities: ['Versatile'], versatile: [{ ...source[0], source: blank }] } })).error).toBeNull()
    expect((await create(factions[1].id, peer, normal.id)).error).not.toBeNull() // Whitespace is not a source.
  }
  expect((await peer.rpc('patch_character', { p_character: normal.id, p_patch: { versatile: source } })).error).toBeNull()
  const borrowed = await create(factions[1].id, peer, normal.id); expect(borrowed.error).toBeNull()
  for (const changes of [{ abilities: [] }, { versatile: [] }, { versatile: [{ ...source[0], source: '' }] }, { versatile: [{ ...source[0], source: '\t\n' }] }, { versatile: [{ ...source[0], name: 'Other ability' }] }]) expect((await peer.rpc('patch_character', { p_character: normal.id, p_patch: changes })).error).not.toBeNull()
  expect((await patch(borrowed.data, { active: false }, peer)).error).toBeNull()
  expect((await peer.rpc('patch_character', { p_character: normal.id, p_patch: { abilities: [], versatile: [] } })).error).toBeNull()

})

test('stale backing drafts recover visibly, delayed snapshots cannot restore private records and ownership transfers reject held saves', async ({ browser }) => {
  test.setTimeout(60000)
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Private backing boundaries' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  const faction = (await gm.rpc('create_faction', { p_campaign: campaign, p_name: 'Paxton' })).data
  expect((await gm.rpc('save_faction_private_note', { p_id: faction.id, p_note: 'PRIVATE_FACTION_NOTE_17', p_expected_version: 0 })).error).toBeNull()
  const clock = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'PRIVATE_CLOCK_IDENTITY_17', notes: 'PRIVATE_CLOCK_TEXT_17', visible_to_players: false } }); expect(clock.error).toBeNull()
  const character = (await gm.rpc('create_character', { p_campaign: campaign, p_name: 'Reed', p_unclaimed: true })).data
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [owner, peer] = await Promise.all(contexts.map(c => c.newPage()))
  const received: Promise<string>[] = []
  for (const p of [owner, peer]) {
    p.setDefaultTimeout(10000)
    p.on('response', r => { if (r.url().includes('/rest/v1/')) received.push(r.text().catch(() => '')) })
    await p.goto('/'); await p.getByLabel('Invitation', { exact: true }).fill(invite); await p.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  const oldOwner = await owner.getByLabel('Your participant ID').inputValue(), newOwner = await peer.getByLabel('Your participant ID').inputValue()
  await owner.getByRole('button', { name: 'Claim Reed', exact: true }).click()
  await peer.getByRole('button', { name: 'Open Reed', exact: true }).click()
  const section = owner.getByRole('region', { name: 'Backing factions', exact: true })
  await section.getByLabel('Public backing faction').selectOption(faction.id)
  await section.getByRole('button', { name: 'Record backing', exact: true }).click()
  const card = owner.getByRole('region', { name: 'Paxton backing', exact: true }), follower = peer.getByRole('region', { name: 'Paxton backing', exact: true })
  await card.getByLabel('Share entire backing record with campaign').check()
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click(); await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(follower).toBeVisible()
  await card.getByLabel('Backing history and notes').fill('Local stale correction')
  let saved = (await gm.from('backing_records').select('*').eq('character_id', character.id).single()).data!
  const update = async (changes: unknown) => {
    const result = await gm.rpc('patch_backing', { p_backing: saved.id, p_patch: changes, p_expected_version: saved.version }); expect(result.error).toBeNull(); saved = result.data
  }
  await update({ notes: 'Newer GM agreement' })
  await expect(follower.getByLabel('Backing history and notes')).toHaveValue('Newer GM agreement')
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click(); await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('Backing changed')
  await expect(card.getByLabel('Backing history and notes')).toHaveValue('Local stale correction')
  await card.getByRole('button', { name: 'Reload saved backing', exact: true }).click()
  await expect(card.getByLabel('Backing history and notes')).toHaveValue('Newer GM agreement')
  let captured!: () => void, release!: () => void
  const caught = new Promise<void>(resolve => { captured = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  await peer.route('**/rest/v1/backing_records?*', async route => { const response = await route.fetch(); captured(); await gate; await route.fulfill({ response }) }, { times: 1 })
  await peer.evaluate(() => window.dispatchEvent(new Event('focus'))); await caught
  await update({ shared: false, mission: 'PRIVATE_BACKING_MISSION_17' })
  await expect(follower).toHaveCount(0)
  const response = peer.waitForResponse(r => r.url().includes('/rest/v1/backing_records?'))
  release(); await response
  await peer.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(follower).toHaveCount(0)
  await expect(card.getByLabel('Personal mission', { exact: true })).toHaveValue('PRIVATE_BACKING_MISSION_17')
  let captureSave!: () => void, releaseSave!: () => void
  const saveCaught = new Promise<void>(resolve => { captureSave = resolve }), saveGate = new Promise<void>(resolve => { releaseSave = resolve })
  await owner.route('**/rest/v1/rpc/patch_backing', async route => { captureSave(); await saveGate; await route.continue() }, { times: 1 })
  await card.getByLabel('Personal mission', { exact: true }).fill('Old-owner held mutation')
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click(); await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await saveCaught
  expect((await gm.rpc('assign_character_owner', { p_character: character.id, p_owner: newOwner, p_expected_owner: oldOwner })).error).toBeNull()
  const rejected = owner.waitForResponse(r => r.url().endsWith('/rpc/patch_backing') && r.status() === 403)
  releaseSave(); await rejected
  await expect(card).toHaveCount(0)
  await expect(follower.getByLabel('Personal mission', { exact: true })).toHaveValue('PRIVATE_BACKING_MISSION_17')
  await expect(follower.getByLabel('Personal mission', { exact: true })).toBeEnabled()
  const traffic = (await Promise.all(received)).join('\n')
  expect(traffic).not.toContain('PRIVATE_FACTION_NOTE_17'); expect(traffic).not.toContain('PRIVATE_CLOCK_IDENTITY_17'); expect(traffic).not.toContain('PRIVATE_CLOCK_TEXT_17'); expect(traffic).not.toContain(clock.data.id)
  for (const p of [owner, peer]) expect(await p.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('PRIVATE_BACKING_MISSION_17')
  await Promise.all(contexts.map(c => c.close()))
})

test('a sourced borrowed Double Agent supports two backings and its required selection stays visible after rejected removal', async ({ page }) => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Borrowed backing ability' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const name of ['Palace', 'Paxton']) expect((await gm.rpc('create_faction', { p_campaign: campaign, p_name: name })).error).toBeNull()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invite)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await page.getByLabel('New character name').fill('Borrower')
  await page.getByRole('button', { name: 'Create Hound', exact: true }).click()
  const section = page.getByRole('region', { name: 'Backing factions', exact: true })
  await section.getByLabel('Public backing faction').selectOption({ label: 'Palace · Tier 0' })
  await section.getByRole('button', { name: 'Record backing', exact: true }).click()
  await expect(section.getByText('1 / 1 active.', { exact: false })).toBeVisible()
  const abilities = page.getByRole('region', { name: 'Special abilities', exact: true })
  await abilities.getByLabel('Versatile', { exact: true }).click()
  await expect(abilities.getByLabel('Versatile', { exact: true })).toBeChecked()
  await abilities.getByRole('button', { name: 'Add Versatile ability', exact: true }).click()
  await page.getByLabel('Versatile 1 name', { exact: true }).fill('Double Agent')
  await page.getByLabel('Versatile 1 name', { exact: true }).blur()
  await expect(page.getByLabel('Versatile 1 name', { exact: true })).toBeEnabled()
  await expect(section.getByText('1 / 1 active.', { exact: false })).toBeVisible()
  await page.getByLabel('Versatile 1 source', { exact: true }).fill('Operative · book v1.0.1 p.50')
  await page.getByLabel('Versatile 1 source', { exact: true }).blur()
  await expect(section.getByText('1 / 2 active.', { exact: false })).toBeVisible()
  await section.getByLabel('Public backing faction').selectOption({ label: 'Paxton · Tier 0' })
  await section.getByRole('button', { name: 'Record backing', exact: true }).click()
  await expect(section.getByText('2 / 2 active.', { exact: false })).toBeVisible()
  await abilities.getByLabel('Versatile', { exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'End a backing before removing' })).toBeVisible()
  await expect(abilities.getByLabel('Versatile', { exact: true })).toBeChecked()
  await page.getByLabel('Versatile 1 source', { exact: true }).fill('')
  await page.getByLabel('Versatile 1 source', { exact: true }).blur()
  await expect(page.getByRole('alert').filter({ hasText: 'Versatile 1 source was not saved' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard Versatile 1 source edit', exact: true }).click()
  const card = section.getByRole('region', { name: 'Paxton backing', exact: true })
  await card.getByLabel('Active backing', { exact: true }).uncheck()
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(section.getByText('1 / 2 active.', { exact: false })).toBeVisible()
  await abilities.getByLabel('Versatile', { exact: true }).click()
  await expect(section.getByText('1 / 1 active.', { exact: false })).toBeVisible()
  await page.reload(); await page.getByRole('button', { name: 'Open Borrower', exact: true }).click()
  await expect(section.getByRole('region', { name: 'Paxton backing', exact: true })).toContainText('Inactive history')
})

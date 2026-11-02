import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
async function table() {
  const gm = client(), player = client(), peer = client(), outsider = client()
  for (const identity of [gm, player, peer, outsider]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Planning table' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  for (const identity of [player, peer]) expect((await identity.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  expect((await outsider.rpc('create_campaign', { p_name: 'Other campaign' })).error).toBeNull()
  const character = (await player.rpc('create_character', { p_campaign: campaign, p_name: 'Moth' })).data
  return { gm, player, peer, outsider, campaign, character, invites }
}
// Approved seams: ordinary authenticated public API and browser → real local Supabase.
test('individual Personal Business records persist under current character owner and GM permissions', async () => {
  const { gm, player, peer, outsider, campaign, character } = await table()
  const created = await player.rpc('create_personal_business', { p_character: character.id, p_data: { activity: 'Long-Term Project', description: 'Build a signal jammer' } })
  expect(created.error).toBeNull()
  const id = created.data.id
  expect(created.data.data).toMatchObject({ activity: 'Long-Term Project', outcome: '', roll: '', helper: '', spend: '', finalResult: '', proposedEffects: '' })
  const results = await Promise.all([
    player.rpc('update_personal_business', { p_record: id, p_patch: { outcome: 'Two segments agreed' }, p_expected: { outcome: '' } }),
    gm.rpc('update_personal_business', { p_record: id, p_patch: { helper: 'Our rival' }, p_expected: { helper: '' } }),
  ])
  for (const result of results) expect(result.error).toBeNull()
  expect((await player.rpc('update_personal_business', { p_record: id, p_patch: { outcome: 'stale' }, p_expected: { outcome: '' } })).error?.code).toBe('PT409')
  expect((await peer.from('personal_business').select('*').eq('id', id)).data?.[0].data).toMatchObject({ outcome: 'Two segments agreed', helper: 'Our rival' })
  for (const identity of [peer, outsider]) {
    expect((await identity.rpc('create_personal_business', { p_character: character.id, p_data: { activity: 'Recover' } })).error?.code).toBe('42501')
    expect((await identity.rpc('update_personal_business', { p_record: id, p_patch: { outcome: 'forged' }, p_expected: { outcome: 'Two segments agreed' } })).error?.code).toBe('42501')
    expect((await identity.rpc('delete_personal_business', { p_record: id, p_revision: 3 })).error?.code).toBe('42501')
  }
  for (const patch of [{ owner_id: crypto.randomUUID() }, { character_id: crypto.randomUUID() }, { activity: 'automated payout' }, { roll: 6 }, { outcome: {} }]) {
    expect((await gm.rpc('update_personal_business', { p_record: id, p_patch: patch, p_expected: {} })).error?.code).toBe('P0001')
  }
  for (const identity of [gm, player, outsider]) {
    expect((await identity.from('personal_business').insert({ campaign_id: campaign, character_id: character.id, data: {} })).error).not.toBeNull()
    expect((await identity.from('personal_business').update({ data: {} }).eq('id', id)).error).not.toBeNull()
    expect((await identity.from('personal_business').delete().eq('id', id)).error).not.toBeNull()
  }
  expect((await outsider.from('personal_business').select('*').eq('id', id)).data).toEqual([])
  expect((await player.rpc('delete_personal_business', { p_record: id, p_revision: 3 })).error).toBeNull()
  expect((await gm.from('personal_business').select('*').eq('id', id)).data).toEqual([])
})

test('flexible planning preserves distinct opportunities and selected score without changing resources', async () => {
  const { gm, player, peer, outsider, campaign, character } = await table()
  const crew = (await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Station Six', p_type: 'Shadows' })).data
  const beforeCharacter = (await player.from('characters').select('*').eq('id', character.id)).data![0]
  const beforeCrew = (await gm.from('crews').select('*').eq('id', crew.id)).data![0]
  const cycle = (await player.from('campaign_cycles').select('*').eq('campaign_id', campaign)).data![0]
  expect(cycle.phase).toBe('personal_business')
  for (const identity of [player, outsider]) expect((await identity.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'planning_meeting', p_revision: 1 })).error?.code).toBe('42501')
  const planning = await gm.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'planning_meeting', p_revision: 1 })
  expect(planning.error).toBeNull()
  // A meeting may happen mid-business; phases are a correctable table reference.
  expect((await gm.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'personal_business', p_revision: 2 })).error).toBeNull()
  expect((await gm.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'score', p_revision: 3 })).error).toBeNull()
  expect((await gm.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'aftermath', p_revision: 4 })).error).toBeNull()
  expect((await gm.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'planning_meeting', p_revision: 5 })).error).toBeNull()
  expect((await gm.rpc('set_campaign_phase', { p_campaign: campaign, p_phase: 'score', p_revision: 1 })).error?.code).toBe('PT409')
  const ids: string[] = []
  for (const sketch of [{ client: 'SCORPION' }, { target: 'Fireworks factory' }, { operation: 'Specialist fence claim' }]) {
    const created = await player.rpc('create_opportunity', { p_campaign: campaign, p_data: sketch })
    expect(created.error).toBeNull(); ids.push(created.data.id)
    expect(created.data.data.targetTier).toBeNull()
  }
  expect((await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: {} })).error?.message).toContain('client, target or operation')
  expect((await player.rpc('create_opportunity', { p_campaign: campaign, p_data: { client: 'Forged payout', payout: 500 } })).error?.code).toBe('42501')
  expect((await peer.rpc('update_opportunity', { p_opportunity: ids[0], p_patch: { client: 'theft' }, p_expected: { client: 'SCORPION' } })).error?.code).toBe('42501')
  expect((await player.rpc('select_opportunity', { p_opportunity: ids[0], p_revision: 1, p_cycle_revision: 6 })).error?.code).toBe('42501')
  expect((await gm.rpc('select_opportunity', { p_opportunity: ids[0], p_revision: 1, p_cycle_revision: 6 })).error?.message).toContain('target Tier')
  const update = await gm.rpc('update_opportunity', { p_opportunity: ids[0], p_patch: { targetTier: 2, payout: 6, difficulty: 'Standard score', payoutRoll: 'Crew Tier roll 4 + target Tier 2', planningDetails: 'Avoid violence; bonus by agreement' }, p_expected: { targetTier: null, payout: null, difficulty: '', payoutRoll: '', planningDetails: '' } })
  expect(update.error).toBeNull()
  const selection = await gm.rpc('select_opportunity', { p_opportunity: ids[0], p_revision: 2, p_cycle_revision: 6 })
  expect(selection.error).toBeNull()
  const score = selection.data
  const privateClock = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'SECRET score mandate', scope: 'score', scoreId: score.id } })
  const publicClock = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'Loading bay guards', scope: 'score', scoreId: score.id, visible_to_players: true } })
  expect(privateClock.error).toBeNull(); expect(publicClock.error).toBeNull()
  const permittedClocks = await player.from('clocks').select('*').eq('campaign_id', campaign)
  expect(permittedClocks.data).toHaveLength(1)
  expect(permittedClocks.data![0]).toMatchObject({ id: publicClock.data.id, data: { scoreId: score.id, visible_to_players: true } })
  expect(JSON.stringify(permittedClocks)).not.toContain('SECRET')
  expect(score.id).not.toBe(ids[0]); expect(score.opportunity_id).toBe(ids[0]); expect(score.data).toMatchObject({ status: 'planned', approach: '', loadout: '', engagementDetails: '', opportunity: { client: 'SCORPION', targetTier: 2, payout: 6 } })
  // Retry returns the same selected record, never an extra score or consequence.
  expect((await gm.rpc('select_opportunity', { p_opportunity: ids[0], p_revision: 2, p_cycle_revision: 6 })).data.id).toBe(score.id)
  expect((await player.from('opportunities').select('*').eq('campaign_id', campaign)).data).toHaveLength(3)
  expect((await player.from('scores').select('*').eq('campaign_id', campaign)).data).toHaveLength(1)
  const concurrent = await Promise.all([
    player.rpc('update_score_plan', { p_score: score.id, p_patch: { approach: 'Paranormal', openingGambit: 'Refract the signal' }, p_expected: { approach: '', openingGambit: '' } }),
    peer.rpc('update_score_plan', { p_score: score.id, p_patch: { loadout: 'Quiet', engagementDetails: 'Rain and rival assistance' }, p_expected: { loadout: '', engagementDetails: '' } }),
  ])
  for (const result of concurrent) expect(result.error).toBeNull()
  for (const approach of ['Assault', 'Deception', 'Paranormal', 'Social', 'Speed', 'Stealth']) {
    const row = (await player.from('scores').select('*').eq('id', score.id)).data![0]
    expect((await player.rpc('update_score_plan', { p_score: score.id, p_patch: { approach }, p_expected: { approach: row.data.approach } })).error).toBeNull()
  }
  for (const patch of [{ approach: 'Occult' }, { approach: 'Transport' }, { loadout: 'Heavy' }, { status: 'completed' }, { opportunity: {} }, { campaign_id: crypto.randomUUID() }]) expect((await gm.rpc('update_score_plan', { p_score: score.id, p_patch: patch, p_expected: {} })).error?.code).toBe('P0001')
  expect((await outsider.rpc('update_score_plan', { p_score: score.id, p_patch: {}, p_expected: {} })).error?.code).toBe('42501')
  expect((await player.rpc('update_score_plan', { p_score: score.id, p_patch: { loadout: 'Loud' }, p_expected: { loadout: '' } })).error?.code).toBe('PT409')
  for (const tableName of ['campaign_cycles', 'opportunities', 'scores']) {
    expect((await outsider.from(tableName).select('*').eq('campaign_id', campaign)).data).toEqual([])
    for (const identity of [gm, player]) {
      expect((await identity.from(tableName).insert({ campaign_id: campaign, data: {} })).error).not.toBeNull()
      expect((await identity.from(tableName).update({ campaign_id: crypto.randomUUID() }).eq('campaign_id', campaign)).error).not.toBeNull()
      expect((await identity.from(tableName).delete().eq('campaign_id', campaign)).error).not.toBeNull()
    }
  }
  expect((await player.from('characters').select('*').eq('id', character.id)).data![0]).toEqual(beforeCharacter)
  expect((await gm.from('crews').select('*').eq('id', crew.id)).data![0]).toEqual(beforeCrew)
  const savedCycle = (await player.from('campaign_cycles').select('*').eq('campaign_id', campaign)).data![0]
  expect(savedCycle).toMatchObject({ selected_score_id: score.id, phase: 'planning_meeting', revision: 7 })
})

test('table records Personal Business, compares opportunities and reloads a shared selected plan on desktop and mobile', async ({ browser }) => {
  const gm = await browser.newContext(), player = await browser.newContext()
  const page = await gm.newPage(), peer = await player.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Wednesday broadcast')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Cycle', exact: true }).click())
  const invitation = await page.getByLabel('Player invitation').inputValue()
  await peer.goto('/')
  await peer.getByLabel('Invitation', { exact: true }).fill(invitation)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => peer.getByRole('tab', { name: 'Cycle', exact: true }).click())
  await peer.getByRole('tab', { name: 'Characters', exact: true }).click()
  await peer.getByLabel('New character name', { exact: true }).fill('Moth')
  await peer.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await peer.getByRole('tab', { name: 'Cycle', exact: true }).click()
  const own = peer.getByRole('region', { name: 'Campaign cycle', exact: true }), shared = page.getByRole('region', { name: 'Campaign cycle', exact: true })
  await expect(own.getByText('Personal Business', { exact: true }).first()).toBeVisible()
  await own.getByLabel('Activity character', { exact: true }).selectOption({ label: 'Moth' })
  await own.getByLabel('New activity', { exact: true }).selectOption('Long-Term Project')
  await own.getByLabel('Project', { exact: true }).fill('Build the jammer')
  await own.getByRole('button', { name: 'Record activity', exact: true }).click()
  const activity = own.getByRole('article', { name: 'Long-Term Project · Moth', exact: true })
  await activity.getByLabel('Progress', { exact: true }).fill('Two segments agreed')
  await activity.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(activity.getByRole('status')).toHaveText('Saved.')
  await expect(shared.getByRole('article', { name: 'Long-Term Project · Moth', exact: true }).getByLabel('Progress', { exact: true })).toHaveValue('Two segments agreed')
  await expect(own.getByRole('button', { name: 'Set phase', exact: true })).toHaveCount(0)
  await shared.getByLabel('Campaign phase', { exact: true }).selectOption('planning_meeting')
  await shared.getByRole('button', { name: 'Set phase', exact: true }).click()
  await expect(own.getByText('Current phase: Planning Meeting', { exact: true })).toBeVisible()
  await own.getByLabel('Opportunity client', { exact: true }).fill('SCORPION')
  await own.getByRole('button', { name: 'Sketch opportunity', exact: true }).click()
  await shared.getByLabel('Opportunity target', { exact: true }).fill('Fireworks factory')
  await shared.getByRole('button', { name: 'Sketch opportunity', exact: true }).click()
  const opportunity = shared.getByRole('article', { name: 'Opportunity · SCORPION', exact: true })
  await opportunity.getByLabel('Target Tier', { exact: true }).fill('2')
  await opportunity.getByLabel('Potential payout', { exact: true }).fill('6')
  await opportunity.getByLabel('Difficulty', { exact: true }).fill('Standard score')
  await opportunity.getByRole('button', { name: 'Save opportunity', exact: true }).click()
  await expect(opportunity.getByRole('status')).toHaveText('Saved.')
  await opportunity.getByRole('button', { name: 'Select as primary score', exact: true }).click()
  const plan = own.getByRole('article', { name: 'Score plan · SCORPION', exact: true })
  await expect(plan).toBeVisible()
  await expect(plan.getByLabel('Approach', { exact: true }).locator('option')).toHaveText(['Choose when ready', 'Assault', 'Deception', 'Paranormal', 'Social', 'Speed', 'Stealth'])
  await expect(plan.getByLabel('Score loadout', { exact: true }).locator('option')).toHaveText(['Choose when ready', 'Quiet', 'Loud'])
  await plan.getByLabel('Approach', { exact: true }).selectOption('Speed')
  await plan.getByLabel('Opening gambit', { exact: true }).fill('Hit the loading bay at shift change')
  await plan.getByLabel('Score loadout', { exact: true }).selectOption('Quiet')
  await plan.getByLabel('Engagement details', { exact: true }).fill('Our rival distracts the guards')
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(plan.getByRole('status')).toHaveText('Saved.')
  await expect(shared.getByRole('article', { name: 'Score plan · SCORPION', exact: true }).getByLabel('Approach', { exact: true })).toHaveValue('Speed')
  await peer.reload()
  const restored = peer.getByRole('article', { name: 'Score plan · SCORPION', exact: true })
  await expect(restored.getByLabel('Engagement details', { exact: true })).toHaveValue('Our rival distracts the guards')
  await expect(peer.getByRole('article', { name: /^Opportunity · / })).toHaveCount(2)
  await restored.scrollIntoViewIfNeeded()
  await peer.screenshot({ path: 'test-results/planning-desktop.png' })
  await peer.setViewportSize({ width: 390, height: 844 })
  await restored.scrollIntoViewIfNeeded()
  await peer.screenshot({ path: 'test-results/planning-mobile.png' })
  expect(await peer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await gm.close(); await player.close()
})

test('planning drafts survive concurrent edits, rejected saves, offline retry and deliberate reload', async ({ browser }) => {
  const { gm, campaign, invites, character } = await table()
  const activity = await gm.rpc('create_personal_business', { p_character: character.id, p_data: { activity: 'Recover', description: 'Sparktech consultation' } })
  const opportunity = await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Relay station', targetTier: 2 } })
  const score = await gm.rpc('select_opportunity', { p_opportunity: opportunity.data.id, p_revision: 1, p_cycle_revision: 1 })
  expect(activity.error).toBeNull(); expect(score.error).toBeNull()
  const a = await browser.newContext(), b = await browser.newContext()
  const page = await a.newPage(), peer = await b.newPage()
  for (const current of [page, peer]) {
    await current.goto('/'); await current.getByLabel('Invitation', { exact: true }).fill(invites.gm)
    await current.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => current.getByRole('tab', { name: 'Cycle', exact: true }).click())
  }
  const ours = page.getByRole('article', { name: 'Score plan · Relay station', exact: true }), theirs = peer.getByRole('article', { name: 'Score plan · Relay station', exact: true })
  await ours.getByLabel('Opening gambit', { exact: true }).fill('Under the rails')
  await theirs.getByLabel('Score loadout', { exact: true }).selectOption('Loud')
  await theirs.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(theirs.getByRole('status')).toHaveText('Saved.')
  await ours.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Saved.')
  await expect(ours.getByLabel('Score loadout', { exact: true })).toHaveValue('Loud')
  await expect(theirs.getByLabel('Opening gambit', { exact: true })).toHaveValue('Under the rails')
  await ours.getByLabel('Engagement details', { exact: true }).fill('Our unsaved agreement')
  await theirs.getByLabel('Engagement details', { exact: true }).fill('Accepted peer detail')
  await theirs.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(theirs.getByRole('status')).toHaveText('Saved.')
  await ours.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Record changed elsewhere')
  await expect(ours.getByLabel('Engagement details', { exact: true })).toHaveValue('Our unsaved agreement')
  await ours.getByRole('button', { name: 'Reload record (discard unsaved)', exact: true }).click()
  await expect(ours.getByLabel('Engagement details', { exact: true })).toHaveValue('Accepted peer detail')
  await ours.getByLabel('Shared planning notes', { exact: true }).fill('Keep this after reconnect')
  await a.setOffline(true)
  await ours.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Record was not saved')
  await expect(page.getByRole('region', { name: 'Campaign cycle', exact: true }).getByRole('alert').filter({ hasText: 'Cycle refresh failed' })).toBeVisible()
  await expect(ours.getByLabel('Shared planning notes', { exact: true })).toHaveValue('Keep this after reconnect')
  await a.setOffline(false)
  await ours.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Saved.')
  await expect(theirs.getByLabel('Shared planning notes', { exact: true })).toHaveValue('Keep this after reconnect')
  const op = page.getByRole('article', { name: 'Opportunity · Relay station', exact: true })
  await op.getByLabel('Target Tier', { exact: true }).fill('')
  await op.getByRole('button', { name: 'Save opportunity', exact: true }).click()
  await expect(op.getByRole('status')).toHaveText('Saved.')
  // Saved score retains the reviewed selection snapshot independently.
  await expect(ours).toContainText('Tier 2')
  await a.close(); await b.close()
})

test('a GM can correct the primary selection without duplicating selected score history', async () => {
  const { gm, campaign } = await table()
  const first = (await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { client: 'First client', targetTier: 1 } })).data
  const second = (await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Second target', targetTier: 2 } })).data
  const [selected, retry] = await Promise.all([
    gm.rpc('select_opportunity', { p_opportunity: first.id, p_revision: 1, p_cycle_revision: 1 }),
    gm.rpc('select_opportunity', { p_opportunity: first.id, p_revision: 1, p_cycle_revision: 1 }),
  ])
  expect(retry.error).toBeNull(); expect(retry.data.id).toBe(selected.data.id)
  const replacement = await gm.rpc('select_opportunity', { p_opportunity: second.id, p_revision: 1, p_cycle_revision: 2 })
  expect(selected.error).toBeNull(); expect(replacement.error).toBeNull()
  const correction = await gm.rpc('select_opportunity', { p_opportunity: first.id, p_revision: 1, p_cycle_revision: 3 })
  expect(correction.error).toBeNull()
  expect(correction.data.id).toBe(selected.data.id)
  expect((await gm.from('campaign_cycles').select('*').eq('campaign_id', campaign)).data![0]).toMatchObject({ selected_score_id: selected.data.id, revision: 4 })
  expect((await gm.from('scores').select('*').eq('campaign_id', campaign)).data).toHaveLength(2)
})

test('downtime activities use three tailored inputs and preserve earlier details through conflicts and reloads', async ({ browser }) => {
  const { gm, campaign, character, invites } = await table()
  const beforeCharacter = (await gm.from('characters').select('*').eq('id', character.id)).data![0]
  const earlier = { roll: '4, 5', helper: 'Rival', spend: '1 stack agreed', finalResult: 'Previous final result', proposedEffects: 'Previous proposed effects' }
  const prompts = [
    ['Free play', 'Scene', 'Outcome'],
    ['Indulge Vice', 'Vice / contact', 'Stress cleared / overindulgence'],
    ['Long-Term Project', 'Project', 'Progress'],
    ['Recover', 'Treatment / healer', 'Healing / Harm changes'],
    ['Reduce Heat', 'How you reduce Heat', 'Heat reduced'],
    ['Acquire Asset', 'Asset', 'Quality / duration'],
    ['Training Montage', 'Training focus', 'XP gained'],
  ]
  const ids = new Map<string, string>()
  for (const [activity] of prompts) {
    const created = await gm.rpc('create_personal_business', { p_character: character.id, p_data: { activity, description: `${activity} detail`, ...(activity === 'Indulge Vice' ? earlier : {}) } })
    expect(created.error).toBeNull(); ids.set(activity, created.data.id)
  }
  const editorContext = await browser.newContext(), readerContext = await browser.newContext()
  const editor = await editorContext.newPage(), reader = await readerContext.newPage()
  try {
    for (const [page, invitation] of [[editor, invites.gm], [reader, invites.player]] as const) {
      await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitation)
      await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
      await page.getByRole('tab', { name: 'Cycle', exact: true }).click()
    }
    const creation = editor.getByRole('group', { name: 'Record individual activity', exact: true })
    await expect(creation.locator('input, select, textarea')).toHaveCount(3)
    for (const [activity, detail, result] of prompts) {
      await creation.getByLabel('New activity', { exact: true }).selectOption(activity)
      await expect(creation.getByLabel(detail, { exact: true })).toBeVisible()
      const card = editor.getByRole('article', { name: `${activity} · Moth`, exact: true })
      await expect(card.locator('input, select, textarea')).toHaveCount(3)
      await expect(card.getByLabel(detail, { exact: true })).toHaveValue(`${activity} detail`)
      await card.getByLabel(result, { exact: true }).fill(`${activity} result`)
      await card.getByRole('button', { name: 'Save activity', exact: true }).click()
      await expect(card.getByRole('status')).toHaveText('Saved.')
      const readOnly = reader.getByRole('article', { name: `${activity} · Moth`, exact: true })
      await expect(readOnly.getByLabel(result, { exact: true })).toHaveValue(`${activity} result`)
      await expect(readOnly.getByLabel(detail, { exact: true })).toBeDisabled()
      await expect(readOnly.getByLabel('Activity', { exact: true })).toBeDisabled()
      await expect(readOnly.getByRole('button', { name: 'Save activity', exact: true })).toHaveCount(0)
    }
    const vice = editor.getByRole('article', { name: 'Indulge Vice · Moth', exact: true })
    await vice.getByLabel('Activity', { exact: true }).selectOption('Long-Term Project')
    await expect(vice.getByLabel('Project', { exact: true })).toHaveValue('Indulge Vice detail')
    await expect(vice.getByLabel('Progress', { exact: true })).toHaveValue('Indulge Vice result')
    await vice.getByLabel('Activity', { exact: true }).selectOption('Indulge Vice')
    await vice.getByLabel('Stress cleared / overindulgence', { exact: true }).fill('Our draft result')
    expect((await gm.rpc('update_personal_business', { p_record: ids.get('Indulge Vice'), p_patch: { outcome: 'Peer result' }, p_expected: { outcome: 'Indulge Vice result' } })).error).toBeNull()
    await vice.getByRole('button', { name: 'Save activity', exact: true }).click()
    await expect(vice.getByRole('alert')).toContainText('Record changed elsewhere')
    await expect(vice.getByLabel('Stress cleared / overindulgence', { exact: true })).toHaveValue('Our draft result')
    await vice.getByRole('button', { name: 'Reload record (discard unsaved)', exact: true }).click()
    await expect(vice.getByLabel('Stress cleared / overindulgence', { exact: true })).toHaveValue('Peer result')
    await vice.getByLabel('Stress cleared / overindulgence', { exact: true }).fill('3 Stress cleared; no overindulgence')
    await editorContext.setOffline(true)
    await vice.getByRole('button', { name: 'Save activity', exact: true }).click()
    await expect(vice.getByRole('alert')).toContainText('Record was not saved')
    await expect(vice.getByLabel('Stress cleared / overindulgence', { exact: true })).toHaveValue('3 Stress cleared; no overindulgence')
    await editorContext.setOffline(false)
    await vice.getByRole('button', { name: 'Save activity', exact: true }).click()
    await expect(vice.getByRole('status')).toHaveText('Saved.')
    await editor.reload()
    await expect(vice.getByLabel('Stress cleared / overindulgence', { exact: true })).toHaveValue('3 Stress cleared; no overindulgence')
    await vice.getByText('Earlier details', { exact: true }).click()
    for (const value of Object.values(earlier)) await expect(vice.getByRole('definition').filter({ hasText: value })).toBeVisible()
    await expect(vice.locator('input, select, textarea')).toHaveCount(3)
    expect((await gm.from('personal_business').select('*').eq('id', ids.get('Indulge Vice'))).data![0].data).toMatchObject({ ...earlier, outcome: '3 Stress cleared; no overindulgence' })
    expect((await gm.from('characters').select('*').eq('id', character.id)).data![0]).toEqual(beforeCharacter)
    await vice.getByText('Earlier details', { exact: true }).click()
    await vice.scrollIntoViewIfNeeded()
    await editor.screenshot({ path: 'test-results/downtime-three-inputs-desktop.png' })
    await editor.setViewportSize({ width: 390, height: 844 })
    await vice.scrollIntoViewIfNeeded()
    await editor.screenshot({ path: 'test-results/downtime-three-inputs-mobile.png' })
    expect(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await gm.from('personal_business').select('*').eq('campaign_id', campaign)).data).toHaveLength(7)
  } finally { await editorContext.close(); await readerContext.close() }
})

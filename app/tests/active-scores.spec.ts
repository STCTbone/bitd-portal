import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
async function table() {
  const gm = client(), player = client(), outsider = client()
  for (const identity of [gm, player, outsider]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Active operations' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  expect((await player.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  const character = (await player.rpc('create_character', { p_campaign: campaign, p_name: 'Moth' })).data
  const crew = (await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Station Six', p_type: 'Shadows' })).data
  const opportunity = (await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Relay station', targetTier: 2, payout: 6 } })).data
  const selected = await gm.rpc('select_opportunity', { p_opportunity: opportunity.id, p_revision: 1, p_cycle_revision: 1 })
  expect(selected.error).toBeNull()
  return { gm, player, outsider, campaign, invites, character, crew, score: selected.data }
}
// Approved seams: authenticated public API and real browser → local Supabase.
test('GM runs a primary score once, retains corrected results and member notes without changing sheets', async () => {
  const { gm, player, outsider, campaign, character, crew, score } = await table()
  const beforeCharacter = (await player.from('characters').select('*').eq('id', character.id)).data![0]
  const beforeCrew = (await gm.from('crews').select('*').eq('id', crew.id)).data![0]
  const starts = await Promise.all([1, 2].map(() => gm.rpc('transition_score', { p_score: score.id, p_status: 'active', p_revision: 1 })))
  for (const start of starts) { expect(start.error).toBeNull(); expect(start.data.revision).toBe(2) }
  const active = starts[0]
  expect(active.data.data).toMatchObject({ status: 'active', activeNotes: '', outcome: '', recap: '', opportunity: { target: 'Relay station', payout: 6 } })
  const second = (await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'New target', targetTier: 1 } })).data
  expect((await gm.rpc('select_opportunity', { p_opportunity: second.id, p_revision: 1, p_cycle_revision: 2 })).error?.message).toContain('active primary')
  for (const identity of [player, outsider]) expect((await identity.rpc('transition_score', { p_score: score.id, p_status: 'completed', p_revision: 2 })).error?.code).toBe('42501')
  const edits = await Promise.all([
    player.rpc('update_score_record', { p_score: score.id, p_patch: { activeNotes: 'Signal jammer deployed' }, p_expected: { activeNotes: '' } }),
    gm.rpc('update_score_plan', { p_score: score.id, p_patch: { engagementResult: 'Risky' }, p_expected: { engagementResult: '' } }),
  ])
  for (const edit of edits) expect(edit.error).toBeNull()
  expect((await player.rpc('update_score_record', { p_score: score.id, p_patch: { outcome: 'forged' }, p_expected: { outcome: '' } })).error?.code).toBe('42501')
  expect((await gm.rpc('transition_score', { p_score: score.id, p_status: 'completed', p_revision: 2 })).error?.code).toBe('40001')
  const result = await gm.rpc('update_score_record', { p_score: score.id, p_patch: { outcome: 'Success', recap: 'Escaped with the tapes' }, p_expected: { outcome: '', recap: '' } })
  expect(result.error).toBeNull()
  const completed = await gm.rpc('transition_score', { p_score: score.id, p_status: 'completed', p_revision: result.data.revision })
  expect(completed.error).toBeNull()
  expect((await gm.rpc('transition_score', { p_score: score.id, p_status: 'completed', p_revision: result.data.revision })).data.revision).toBe(completed.data.revision)
  expect((await gm.rpc('update_score_record', { p_score: score.id, p_patch: { outcome: 'Success with a cost' }, p_expected: { outcome: 'Success' } })).error).toBeNull()
  const saved = (await player.from('scores').select('*').eq('id', score.id)).data![0]
  expect(saved.data).toMatchObject({ status: 'completed', outcome: 'Success with a cost', recap: 'Escaped with the tapes', activeNotes: 'Signal jammer deployed', engagementResult: 'Risky' })
  const history = (await player.from('score_events').select('*').eq('score_id', score.id)).data!
  expect(history.filter(row => row.data.status === 'completed')).toHaveLength(1)
  expect(history.some(row => row.data.outcome === 'Success' && row.data.recap === 'Escaped with the tapes')).toBe(true)
  expect((await outsider.from('score_events').select('*').eq('score_id', score.id)).data).toEqual([])
  expect((await gm.rpc('select_planned_opportunity', { p_opportunity: second.id, p_revision: 1, p_cycle_revision: 2 })).error?.code).toBe('42501')
  expect((await outsider.rpc('update_score_record', { p_score: score.id, p_patch: { activeNotes: 'forged' }, p_expected: { activeNotes: 'Signal jammer deployed' } })).error?.code).toBe('42501')
  for (const patch of [{ status: 'active' }, { opportunity: {} }, { activeNotes: 9 }, { recap: {} }, { aftermath: {} }]) expect((await gm.rpc('update_score_record', { p_score: score.id, p_patch: patch, p_expected: {} })).error?.code).toBe('P0001')
  expect((await player.rpc('update_score_record', { p_score: score.id, p_patch: { activeNotes: 'stale' }, p_expected: { activeNotes: '' } })).error?.code).toBe('40001')
  const next = await gm.rpc('select_opportunity', { p_opportunity: second.id, p_revision: 1, p_cycle_revision: 2 })
  expect(next.error).toBeNull()
  expect((await gm.rpc('transition_score', { p_score: next.data.id, p_status: 'cancelled', p_revision: 1 })).error).toBeNull()
  expect((await player.from('characters').select('*').eq('id', character.id)).data![0]).toEqual(beforeCharacter)
  expect((await gm.from('crews').select('*').eq('id', crew.id)).data![0]).toEqual(beforeCrew)
})

test('cohort participation and a secondary score preserve server snapshots and independent outcomes', async () => {
  const { gm, player, outsider, campaign, crew, score } = await table()
  const cohort = { id: 'relay-crew', name: 'Signal Rats', kind: 'gang', types: 'Infiltrators', edges: 'Loyal', flaws: 'Wild', quality: 2, scale: 1, condition: 'healthy', armor: 'available', assignment: '', notes: 'Known tunnels' }
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { cohorts: [cohort] }, p_expected: { cohorts: [] } })).error).toBeNull()
  const opportunity = (await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Fireworks factory', targetTier: 1, payout: 5 } })).data
  const args = { p_score: score.id, p_crew: crew.id, p_cohort: cohort.id, p_opportunity: opportunity.id, p_kind: 'secondary' }
  for (const identity of [player, outsider]) expect((await identity.rpc('create_score_activity', args)).error?.code).toBe('42501')
  const created = await gm.rpc('create_score_activity', args)
  expect(created.error).toBeNull()
  expect(created.data).toMatchObject({ score_id: score.id, crew_id: crew.id, cohort_id: 'relay-crew', opportunity_id: opportunity.id, data: { kind: 'secondary', status: 'planned', cohort, opportunity: { target: 'Fireworks factory', payout: 5 } } })
  const id = created.data.id
  expect((await gm.rpc('create_score_activity', { ...args, p_cohort: 'absent' })).error?.code).toBe('P0001')
  const otherCampaign = (await outsider.rpc('create_campaign', { p_name: 'Other secondary table' })).data.id
  const foreignOpportunity = (await outsider.rpc('create_opportunity', { p_campaign: otherCampaign, p_data: { target: 'Foreign relay', targetTier: 2 } })).data
  expect((await gm.rpc('create_score_activity', { ...args, p_opportunity: foreignOpportunity.id })).error?.code).toBe('P0001')
  expect((await outsider.rpc('update_score_activity', { p_activity: id, p_patch: { activeNotes: 'forged' }, p_expected: { activeNotes: '' } })).error?.code).toBe('42501')
  expect((await gm.rpc('update_score_activity', { p_activity: id, p_patch: { cohort: {} }, p_expected: {} })).error?.code).toBe('P0001')
  expect((await gm.rpc('create_score_activity', { ...args, p_opportunity: score.opportunity_id })).error?.code).toBe('P0001')
  // One retained secondary per primary; a duplicate request cannot create extra activity.
  expect((await gm.rpc('create_score_activity', args)).error?.code).toBe('P0001')
  const primary = await gm.rpc('create_score_activity', { ...args, p_kind: 'participation', p_opportunity: null })
  expect(primary.error).toBeNull()
  expect((await gm.rpc('transition_score_activity', { p_activity: id, p_status: 'active', p_revision: 1 })).error).toBeNull()
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { cohorts: [] }, p_expected: { cohorts: [cohort] } })).error).toBeNull()
  expect((await gm.rpc('update_opportunity', { p_opportunity: opportunity.id, p_patch: { target: 'Changed later' }, p_expected: { target: 'Fireworks factory' } })).error).toBeNull()
  expect((await player.rpc('update_score_activity', { p_activity: id, p_patch: { activeNotes: 'Off-screen roll 4; review consequences' }, p_expected: { activeNotes: '' } })).error).toBeNull()
  expect((await player.rpc('update_score_activity', { p_activity: id, p_patch: { recap: 'forged' }, p_expected: { recap: '' } })).error?.code).toBe('42501')
  expect((await player.rpc('transition_score_activity', { p_activity: id, p_status: 'completed', p_revision: 3 })).error?.code).toBe('42501')
  const outcome = await gm.rpc('update_score_activity', { p_activity: id, p_patch: { outcome: 'Success, 1 harm proposed', recap: 'Brought back the powder' }, p_expected: { outcome: '', recap: '' } })
  expect(outcome.error).toBeNull()
  const done = await gm.rpc('transition_score_activity', { p_activity: id, p_status: 'completed', p_revision: outcome.data.revision })
  expect(done.error).toBeNull()
  expect((await gm.rpc('transition_score_activity', { p_activity: id, p_status: 'completed', p_revision: 1 })).data.revision).toBe(done.data.revision)
  const saved = (await player.from('score_activities').select('*').eq('id', id)).data![0]
  expect(saved.data).toMatchObject({ cohort: { name: 'Signal Rats', quality: 2 }, opportunity: { target: 'Fireworks factory', payout: 5 }, status: 'completed', outcome: 'Success, 1 harm proposed' })
  expect((await player.from('scores').select('*').eq('id', score.id)).data![0].data.status).toBe('planned')
  expect((await player.from('score_activities').select('*').eq('id', primary.data.id)).data![0].data.status).toBe('planned')
  expect((await outsider.from('score_activities').select('*').eq('id', id)).data).toEqual([])
  for (const name of ['score_activities', 'score_events']) for (const identity of [gm, player]) {
    expect((await identity.from(name).insert({ campaign_id: campaign, score_id: score.id, data: {} })).error).not.toBeNull()
    expect((await identity.from(name).update({ data: {} }).eq('campaign_id', campaign)).error).not.toBeNull()
    expect((await identity.from(name).delete().eq('campaign_id', campaign)).error).not.toBeNull()
  }
  expect((await gm.from('crews').select('*').eq('id', crew.id)).data![0].data).toMatchObject({ heat: 0, rep: 0, stacks: 2 })
})

test('table starts a planned score, saves notes and independent cohort results, then reloads history', async ({ browser }) => {
  const { gm, campaign, invites } = await table()
  const cohort = { id: 'infiltrators', name: 'Signal Rats', kind: 'gang', types: 'Infiltrators', edges: '', flaws: '', quality: 2, scale: 1, condition: 'healthy', armor: 'available', assignment: '', notes: '' }
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { cohorts: [cohort] }, p_expected: { cohorts: [] } })).error).toBeNull()
  expect((await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Fireworks factory', targetTier: 1, payout: 5 } })).error).toBeNull()
  const context = await browser.newContext(), member = await browser.newContext()
  const page = await context.newPage(), peer = await member.newPage()
  for (const [current, invitation] of [[page, invites.gm], [peer, invites.player]] as const) {
    await current.goto('/'); await current.getByLabel('Invitation', { exact: true }).fill(invitation)
    await current.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => current.getByRole('tab', { name: 'Cycle', exact: true }).click())
  }
  const scores = page.getByRole('region', { name: 'Scores and history', exact: true }), otherScores = peer.getByRole('region', { name: 'Scores and history', exact: true })
  const ours = scores.getByRole('article', { name: 'Score · Relay station', exact: true }), theirs = otherScores.getByRole('article', { name: 'Score · Relay station', exact: true })
  await expect(ours.getByText('Status: planned', { exact: true })).toBeVisible()
  await expect(theirs.getByRole('button', { name: 'Start score', exact: true })).toHaveCount(0)
  await ours.getByRole('button', { name: 'Start score', exact: true }).click()
  await ours.getByRole('button', { name: 'Confirm start', exact: true }).click()
  await expect(theirs.getByText('Status: active', { exact: true })).toBeVisible()
  await theirs.getByLabel('Shared score notes', { exact: true }).fill('Jammer deployed at midnight')
  await theirs.getByRole('button', { name: 'Save score record', exact: true }).click()
  await expect(ours.getByLabel('Shared score notes', { exact: true })).toHaveValue('Jammer deployed at midnight')
  await expect(theirs.getByLabel('Score outcome', { exact: true })).toBeDisabled()
  await scores.getByLabel('Activity cohort', { exact: true }).selectOption({ label: 'Signal Rats · Station Six' })
  await scores.getByLabel('Cohort activity', { exact: true }).selectOption('secondary')
  await scores.getByLabel('Secondary opportunity', { exact: true }).selectOption({ label: 'Fireworks factory' })
  await scores.getByRole('button', { name: 'Record cohort activity', exact: true }).click()
  const secondary = scores.getByRole('article', { name: 'Secondary score · Signal Rats · Fireworks factory', exact: true })
  await secondary.getByRole('button', { name: 'Start activity', exact: true }).click()
  await secondary.getByRole('button', { name: 'Confirm start', exact: true }).click()
  await secondary.getByLabel('Score outcome', { exact: true }).fill('Rolled 4; success, harm and Heat proposed for review')
  await secondary.getByLabel('Score recap', { exact: true }).fill('Returned with the powder')
  await secondary.getByRole('button', { name: 'Save activity record', exact: true }).click()
  await expect(secondary.getByRole('status')).toHaveText('Saved.')
  await secondary.getByRole('button', { name: 'Complete activity', exact: true }).click()
  await secondary.getByRole('button', { name: 'Confirm complete', exact: true }).click()
  await expect(secondary.getByText('Status: completed', { exact: true })).toBeVisible()
  await expect(ours.getByText('Status: active', { exact: true })).toBeVisible()
  await ours.getByLabel('Score outcome', { exact: true }).fill('Success')
  await ours.getByLabel('Score recap', { exact: true }).fill('Escaped with the tapes')
  await ours.getByRole('button', { name: 'Save score record', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Saved.')
  await ours.getByRole('button', { name: 'Complete score', exact: true }).click()
  await ours.getByRole('button', { name: 'Confirm complete', exact: true }).click()
  await expect(theirs.getByText('Status: completed', { exact: true })).toBeVisible()
  await peer.reload()
  await expect(theirs.getByLabel('Score recap', { exact: true })).toHaveValue('Escaped with the tapes')
  await expect(otherScores.getByRole('article', { name: 'Secondary score · Signal Rats · Fireworks factory', exact: true }).getByLabel('Score recap', { exact: true })).toHaveValue('Returned with the powder')
  await scores.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/scores-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 }); await ours.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/scores-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await context.close(); await member.close()
})

test('score drafts retain rejected edits, merge other fields and retry after reconnect', async ({ browser }) => {
  const { gm, score, invites } = await table()
  const context = await browser.newContext(), page = await context.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.gm)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Cycle', exact: true }).click())
  const ours = page.getByRole('region', { name: 'Scores and history', exact: true }).getByRole('article', { name: 'Score · Relay station', exact: true })
  await ours.getByLabel('Shared score notes', { exact: true }).fill('Our unsaved note')
  expect((await gm.rpc('update_score_record', { p_score: score.id, p_patch: { outcome: 'Peer outcome' }, p_expected: { outcome: '' } })).error).toBeNull()
  await expect(ours.getByLabel('Score outcome', { exact: true })).toHaveValue('Peer outcome')
  await ours.getByRole('button', { name: 'Save score record', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Saved.')
  await ours.getByLabel('Score recap', { exact: true }).fill('Our recap draft')
  expect((await gm.rpc('update_score_record', { p_score: score.id, p_patch: { recap: 'Accepted peer recap' }, p_expected: { recap: '' } })).error).toBeNull()
  await ours.getByRole('button', { name: 'Save score record', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Record changed elsewhere')
  await expect(ours.getByLabel('Score recap', { exact: true })).toHaveValue('Our recap draft')
  await ours.getByRole('button', { name: 'Reload record (discard unsaved)', exact: true }).click()
  await expect(ours.getByLabel('Score recap', { exact: true })).toHaveValue('Accepted peer recap')
  await ours.getByRole('button', { name: 'Start score', exact: true }).click()
  expect((await gm.rpc('update_score_record', { p_score: score.id, p_patch: { outcome: 'Updated before confirmation' }, p_expected: { outcome: 'Peer outcome' } })).error).toBeNull()
  await expect(ours.getByLabel('Score outcome', { exact: true })).toHaveValue('Updated before confirmation')
  await ours.getByRole('button', { name: 'Confirm start', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Record changed elsewhere')
  await expect(ours.getByText('Status: planned', { exact: true })).toBeVisible()
  await ours.getByRole('button', { name: 'Keep current status', exact: true }).click()
  await ours.getByRole('button', { name: 'Start score', exact: true }).click()
  await ours.getByRole('button', { name: 'Confirm start', exact: true }).click()
  await expect(ours.getByText('Status: active', { exact: true })).toBeVisible()
  await ours.getByLabel('Shared score notes', { exact: true }).fill('Saved after reconnect')
  await context.setOffline(true)
  await ours.getByRole('button', { name: 'Save score record', exact: true }).click()
  await expect(ours.getByRole('alert')).toContainText('Record was not saved')
  await expect(ours.getByLabel('Shared score notes', { exact: true })).toHaveValue('Saved after reconnect')
  await context.setOffline(false)
  await ours.getByRole('button', { name: 'Save score record', exact: true }).click()
  await expect(ours.getByRole('status')).toHaveText('Saved.')
  await page.reload()
  await expect(ours.getByLabel('Shared score notes', { exact: true })).toHaveValue('Saved after reconnect')
  await ours.getByRole('button', { name: 'Cancel score', exact: true }).click()
  await ours.getByRole('button', { name: 'Confirm cancel', exact: true }).click()
  await expect(ours.getByText('Status: cancelled', { exact: true })).toBeVisible()
  await context.close()
})

test('active score clocks remove unshared snapshots, ignore delayed responses and follow current membership', async ({ browser }) => {
  const { gm, player, campaign, invites, score } = await table()
  expect((await gm.rpc('transition_score', { p_score: score.id, p_status: 'active', p_revision: 1 })).error).toBeNull()
  const shared = (await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'Loading bay guards', scope: 'score', scoreId: score.id, visible_to_players: true } })).data
  expect((await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'PRIVATE mandate', notes: 'PRIVATE criminal threshold', scope: 'score', scoreId: score.id } })).error).toBeNull()
  const context = await browser.newContext(), page = await context.newPage()
  const received: Promise<string>[] = []
  page.on('response', response => { if (response.url().includes('/rest/v1/')) received.push(response.text().catch(() => '')) })
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.player)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Cycle', exact: true }).click())
  const active = page.getByRole('region', { name: 'Permitted clocks · Relay station', exact: true })
  await expect(active.getByText('Loading bay guards', { exact: true })).toBeVisible()
  await expect(active.getByText('PRIVATE mandate', { exact: true })).toHaveCount(0)
  let held = 0, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/clocks?*', async route => { const response = await route.fetch(); held++; await gate; await route.fulfill({ response }) }, { times: 2 })
  await expect.poll(() => held).toBe(2)
  expect((await gm.rpc('update_clock', { p_clock: shared.id, p_patch: { visible_to_players: false, notes: 'PRIVATE after revocation' }, p_expected: { visible_to_players: true, notes: '' } })).error).toBeNull()
  await expect(active.getByText('Loading bay guards', { exact: true })).toHaveCount(0)
  const oldResponses = page.waitForResponse(response => response.url().includes('/rest/v1/clocks?'))
  release(); await oldResponses
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await active.getByText('Loading bay guards', { exact: true }).count()).toBe(0)
  expect((await gm.rpc('update_clock', { p_clock: shared.id, p_patch: { visible_to_players: true, notes: 'Shared again' }, p_expected: { visible_to_players: false, notes: 'PRIVATE after revocation' } })).error).toBeNull()
  await expect(active.getByText('Loading bay guards', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await expect(active.getByRole('alert')).toContainText('Clock refresh failed')
  await expect(active.getByText('Loading bay guards', { exact: true })).toHaveCount(0)
  await context.setOffline(false)
  await expect(active.getByText('Loading bay guards', { exact: true })).toBeVisible()
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  const admin = createClient(url, status.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
  const member = (await admin.from('campaign_members').select('user_id').eq('campaign_id', campaign).eq('role', 'player').neq('user_id', (await player.auth.getUser()).data.user!.id).single()).data!
  expect((await admin.from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', member.user_id)).error).toBeNull()
  await expect(page.getByRole('region', { name: 'Permitted clocks · Relay station', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Gather the crew', exact: true })).toBeVisible()
  expect((await Promise.all(received)).join('')).not.toContain('PRIVATE')
  await context.close()
})

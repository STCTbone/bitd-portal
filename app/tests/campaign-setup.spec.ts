import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
async function fixture() {
  const gm = client(), player = client(), other = client()
  for (const identity of [gm, player, other]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Intentional setup' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  await player.rpc('join_campaign', { p_invitation: invites.player })
  expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook: 'Vampire', p_enabled: true })).error).toBeNull()
  expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook: 'Ghost/Echo', p_enabled: false })).error).toBeNull()
  const settings = await gm.rpc('get_campaign_playbooks', { p_campaign: campaign }); expect(settings.error).toBeNull()
  return { gm, player, other, campaign, invites, settings: settings.data }
}
test('sample setup is explicit, current-GM only, atomic and exactly once without replacing existing records', async () => {
  const { gm, player, other, campaign, settings } = await fixture()
  expect((await gm.from('characters').select('*').eq('campaign_id', campaign)).data).toEqual([])
  const preview = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })
  expect(preview.error).toBeNull()
  for (const identity of [player, other]) {
    expect((await identity.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })).error?.code).toBe('42501')
    expect((await identity.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'LOAD SAMPLE' })).error?.code).toBe('42501')
  }
  expect((await gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: '' })).error).not.toBeNull()
  expect((await gm.from('characters').select('*').eq('campaign_id', campaign)).data).toEqual([])
  const applied = await Promise.all([1, 2].map(() => gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'LOAD SAMPLE' })))
  for (const response of applied) expect(response.error).toBeNull()
  expect(applied[0].data).toEqual(applied[1].data)
  expect((await gm.rpc('get_campaign_playbooks', { p_campaign: campaign })).data).toEqual(settings)
  const characters = (await player.from('characters').select('*').eq('campaign_id', campaign)).data!
  expect(characters).toHaveLength(2)
  expect(characters.every(character => character.owner_id === null && character.data.playbook === 'Hound')).toBe(true)
  expect(characters[0].data.stressCapacity).toBe(9)
  expect(characters[0].data.keyCapacity).toBe(4)
  expect((await player.rpc('claim_character', { p_character: characters[0].id })).error).toBeNull()
  expect((await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })).error).not.toBeNull()
  expect((await player.from('crews').select('*').eq('campaign_id', campaign)).data).toHaveLength(1)
  expect((await player.from('faction_records').select('*').eq('campaign_id', campaign)).data).toHaveLength(2)
  expect((await player.from('clocks').select('*').eq('campaign_id', campaign)).data).toHaveLength(1)
  expect((await player.from('codex').select('*').eq('campaign_id', campaign)).data).toHaveLength(2)
})

test('empty loads never seed; a GM deliberately reviews sample and scoped clear while two players converge', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, one, two] = await Promise.all(contexts.map(context => context.newPage()))
  await gm.goto('/'); await gm.getByLabel('Campaign name', { exact: true }).fill('Night Wire table')
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const page of [one, two]) { await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invitation); await page.getByRole('button', { name: 'Join campaign', exact: true }).click() }
  await gm.reload(); await gm.reload()
  const setup = gm.getByRole('region', { name: 'Campaign setup', exact: true })
  await expect(setup).toBeVisible()
  for (const page of [one, two]) await expect(page.getByRole('region', { name: 'Campaign setup', exact: true })).toHaveCount(0)
  await expect(gm.getByText('Mara Vey', { exact: true })).toHaveCount(0)
  await setup.getByRole('button', { name: 'Review optional sample', exact: true }).click()
  await expect(setup.getByText(/Invented sample fiction/).first()).toBeVisible()
  await setup.getByRole('button', { name: 'Cancel setup review', exact: true }).click()
  await expect(gm.getByText('Mara Vey', { exact: true })).toHaveCount(0)
  await setup.getByRole('button', { name: 'Review optional sample', exact: true }).click()
  await setup.getByLabel('Confirmation phrase', { exact: true }).fill('LOAD SAMPLE')
  await setup.getByRole('button', { name: 'Confirm sample setup', exact: true }).click()
  await expect(setup.getByRole('status')).toContainText('Sample setup saved')
  for (const [index, page] of [gm, one, two].entries()) {
    await expect(page.getByRole('article', { name: 'The missing broadcast reel', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Mara Vey', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Campaign clocks', exact: true }).getByRole('article')).toHaveCount(index === 0 ? 2 : 1)
  }
  await setup.getByRole('button', { name: 'Review optional sample', exact: true }).click()
  await expect(setup.getByRole('alert')).toContainText('empty campaign')
  await setup.getByRole('button', { name: 'Review clocks, notes and markers clear', exact: true }).click()
  await expect(setup).toContainText('including hidden clocks')
  await expect(setup).toContainText('all character/crew/faction sheet values')
  await setup.screenshot({ path: 'test-results/setup-review-desktop.png' })
  await gm.setViewportSize({ width: 390, height: 844 }); await setup.screenshot({ path: 'test-results/setup-review-mobile.png' })
  expect(await gm.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await gm.setViewportSize({ width: 1280, height: 720 })
  await setup.getByRole('button', { name: 'Cancel setup review', exact: true }).click()
  await expect(one.getByRole('article', { name: 'The missing broadcast reel', exact: true })).toBeVisible()
  await setup.getByRole('button', { name: 'Review clocks, notes and markers clear', exact: true }).click()
  await setup.getByLabel('Confirmation phrase', { exact: true }).fill('CLEAR WORKSPACE')
  await contexts[0].setOffline(true)
  await setup.getByRole('button', { name: 'Confirm clocks, notes and markers clear', exact: true }).click()
  await expect(setup.getByRole('alert')).toContainText('not confirmed')
  await expect(setup.getByLabel('Confirmation phrase')).toHaveValue('CLEAR WORKSPACE')
  await contexts[0].setOffline(false)
  await gm.route('**/rest/v1/rpc/apply_campaign_setup', async route => { const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort('failed') }, { times: 1 })
  await setup.getByRole('button', { name: 'Confirm clocks, notes and markers clear', exact: true }).click()
  await expect(setup.getByRole('alert')).toContainText('not confirmed')
  await expect(setup.getByLabel('Confirmation phrase')).toHaveValue('CLEAR WORKSPACE')
  await setup.getByRole('button', { name: 'Confirm clocks, notes and markers clear', exact: true }).click()
  await expect(setup.getByRole('status')).toContainText('Clocks, notes and map markers cleared')
  for (const page of [gm, one, two]) {
    await expect(page.getByRole('article', { name: 'The missing broadcast reel', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Campaign clocks', exact: true }).getByRole('article')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Mara Vey', exact: true })).toBeVisible()
  }
  await one.reload(); await expect(one.getByText('Night Wire', { exact: true }).first()).toBeVisible()
  await setup.screenshot({ path: 'test-results/setup-desktop.png' })
  await gm.setViewportSize({ width: 390, height: 844 }); await setup.screenshot({ path: 'test-results/setup-mobile.png' })
  expect(await gm.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await Promise.all(contexts.map(context => context.close()))
})

const preservedTables = ['characters','crews','faction_records','faction_private_notes','backing_records','personal_business','opportunities','scores','score_activities','score_events','aftermath_proposals','aftermath_receipts','aftermath_manual','campaign_assets','campaign_maps','campaign_cycles']
async function savedRecords(gm: ReturnType<typeof client>, campaign: string) {
  return Object.fromEntries(await Promise.all(preservedTables.map(async table => {
    const response = await gm.from(table).select('*').eq('campaign_id', campaign)
    expect(response.error).toBeNull()
    return [table, response.data!.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]
  })))
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
async function upload(gm: ReturnType<typeof client>, campaign: string, kind: string, character: string | null = null) {
  const reserved = await gm.rpc('reserve_asset', { p_campaign: campaign, p_kind: kind, p_character: character, p_mime: 'image/png', p_size: png.length, p_title: kind === 'image' ? 'PRIVATE_IMAGE_26' : 'Character portrait' })
  expect(reserved.error).toBeNull()
  expect((await gm.storage.from('campaign-assets').upload(reserved.data.object_path, png, { contentType: 'image/png' })).error).toBeNull()
  const ready = await gm.rpc('finish_asset', { p_asset: reserved.data.id }); expect(ready.error).toBeNull()
  return ready.data
}
async function richFixture() {
  const f = await fixture(), { gm, player, campaign } = f
  const sample = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })
  expect((await gm.rpc('apply_campaign_setup', { p_request: sample.data.id, p_confirmation: 'LOAD SAMPLE' })).error).toBeNull()
  const character = (await gm.from('characters').select('*').eq('campaign_id', campaign)).data![0]
  expect((await player.rpc('claim_character', { p_character: character.id })).error).toBeNull()
  const faction = (await gm.from('faction_records').select('*').eq('campaign_id', campaign)).data![0]
  expect((await gm.rpc('save_faction_private_note', { p_id: faction.id, p_note: 'PRIVATE_FACTION_26', p_expected_version: 0 })).error).toBeNull()
  const backing = await player.rpc('create_backing', { p_character: character.id, p_faction: faction.id }); expect(backing.error).toBeNull()
  expect((await player.rpc('patch_backing', { p_backing: backing.data.id, p_expected_version: 1, p_patch: { mission: 'PRIVATE_MISSION_26', failure: 2 } })).error).toBeNull()
  const opportunity = await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Archive', targetTier: 1, payout: 4 } }); expect(opportunity.error).toBeNull()
  const selected = await gm.rpc('select_opportunity', { p_opportunity: opportunity.data.id, p_revision: 1, p_cycle_revision: 1 }); expect(selected.error).toBeNull()
  expect((await gm.rpc('transition_score', { p_score: selected.data.id, p_status: 'active', p_revision: 1 })).error).toBeNull()
  expect((await gm.rpc('transition_score', { p_score: selected.data.id, p_status: 'completed', p_revision: 2 })).error).toBeNull()
  const proposal = await gm.rpc('propose_aftermath', { p_score: selected.data.id, p_effects: [{ kind: 'character', id: character.id, field: 'stress', expected: 0, value: 1 }], p_recap: 'Real retained receipt', p_reason: '', p_correction_of: null }); expect(proposal.error).toBeNull()
  const receipt = await gm.rpc('confirm_aftermath', { p_proposal: proposal.data.id }); expect(receipt.error).toBeNull()
  expect((await gm.rpc('save_aftermath_manual', { p_score: selected.data.id, p_id: null, p_revision: 0, p_kind: 'Mandate', p_title: 'PRIVATE_MANDATE_26', p_notes: 'Preserved hidden manual record', p_shared: false })).error).toBeNull()
  const portrait = await upload(gm, campaign, 'portrait', character.id), secret = await upload(gm, campaign, 'image'), map = await upload(gm, campaign, 'image')
  const shared = await gm.rpc('update_asset', { p_asset: map.id, p_title: 'Shared map', p_annotation: '', p_shared: true, p_revision: map.revision }); expect(shared.error).toBeNull()
  expect((await gm.rpc('set_campaign_map', { p_campaign: campaign, p_asset: map.id, p_revision: 0 })).error).toBeNull()
  expect((await gm.rpc('create_map_token', { p_campaign: campaign, p_label: 'Courier', p_character: character.id, p_controller: null })).error).toBeNull()
  expect((await player.rpc('send_map_activity', { p_campaign: campaign, p_asset: map.id, p_kind: 'stroke', p_points: [{ x: .2, y: .3 }, { x: .3, y: .4 }] })).error).toBeNull()
  return { ...f, portrait, secret, map, character, proposal: proposal.data, receipt: receipt.data }
}

test('scoped clear preserves actual Aftermath history, sheets, backing, confidential records, uploaded art and map selection', async () => {
  const { gm, player, other, campaign, invites, settings, portrait, secret, map, character, proposal, receipt } = await richFixture()
  const otherCampaign = (await other.rpc('create_campaign', { p_name: 'Separate intact campaign' })).data.id
  const otherNote = await other.rpc('create_shared_note', { p_campaign: otherCampaign, p_data: { title: 'Other table note' } }); expect(otherNote.error).toBeNull()
  const before = await savedRecords(gm, campaign)
  expect(before.aftermath_receipts).toHaveLength(1); expect(before.score_events.length).toBeGreaterThan(1)
  const artBefore = (await gm.from('character_art').select('*').eq('character_id', character.id)).data
  const review = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'clear' }); expect(review.error).toBeNull()
  expect(review.data.counts).toMatchObject({ clocks: 2, codex: 2, map_tokens: 1 })
  expect((await gm.rpc('apply_campaign_setup', { p_request: review.data.id, p_confirmation: 'WRONG' })).error).not.toBeNull()
  for (const identity of [player, other, client()]) {
    expect((await identity.rpc('apply_campaign_setup', { p_request: review.data.id, p_confirmation: 'CLEAR WORKSPACE' })).error).not.toBeNull()
    expect((await identity.rpc('campaign_setup_snapshot', { p_campaign: campaign })).error).not.toBeNull()
    expect((await identity.from('campaign_setup_requests').select('*')).error).not.toBeNull()
  }
  expect(await savedRecords(gm, campaign)).toEqual(before)
  const cleared = await Promise.all([1, 2].map(() => gm.rpc('apply_campaign_setup', { p_request: review.data.id, p_confirmation: 'CLEAR WORKSPACE' })))
  for (const result of cleared) expect(result.error).toBeNull()
  expect(cleared[0].data).toEqual(cleared[1].data)
  for (const table of ['clocks','codex','map_tokens']) expect((await gm.from(table).select('*').eq('campaign_id', campaign)).data).toEqual([])
  expect((await player.rpc('read_map_activity', { p_campaign: campaign, p_asset: map.id })).data).toEqual([])
  expect(await savedRecords(gm, campaign)).toEqual(before)
  expect((await gm.from('character_art').select('*').eq('character_id', character.id)).data).toEqual(artBefore)
  expect((await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data).toEqual(invites)
  expect((await gm.rpc('get_campaign_playbooks', { p_campaign: campaign })).data).toEqual(settings)
  expect(settings.find((row: { name: string }) => row.name === 'Vampire').enabled).toBe(true)
  expect(settings.find((row: { name: string }) => row.name === 'Ghost/Echo').enabled).toBe(false)
  expect((await player.from('paranormal_playbook_availability').select('*')).error).not.toBeNull()
  for (const asset of [portrait, secret, map]) {
    const file = await gm.storage.from('campaign-assets').download(asset.object_path); expect(file.error).toBeNull(); expect(Buffer.from(await file.data!.arrayBuffer())).toEqual(png)
  }
  expect((await player.storage.from('campaign-assets').download(secret.object_path)).error).not.toBeNull()
  expect((await player.from('faction_private_notes').select('*').eq('campaign_id', campaign)).data).toEqual([])
  expect((await player.from('aftermath_manual').select('*').eq('campaign_id', campaign)).data).toEqual([])
  expect((await gm.rpc('confirm_aftermath', { p_proposal: proposal.id })).data).toEqual(receipt)
  expect((await other.from('codex').select('*').eq('campaign_id', otherCampaign)).data).toEqual([otherNote.data])
  for (const identity of [gm, player, other]) {
    expect((await identity.from('campaigns').delete().eq('id', campaign)).error).not.toBeNull()
    expect((await identity.from('clocks').delete().eq('campaign_id', campaign)).error).not.toBeNull()
    expect((await identity.rpc('reset_campaign', { p_campaign: campaign })).error).not.toBeNull()
    expect((await identity.rpc('merge_entity', { p_table: 'campaigns', p_id: campaign, p_patch: {} })).error).not.toBeNull()
  }
})

test('stale setup and clear reviews never discard intervening records; independently reviewed clears compete safely', async () => {
  const { gm, player, campaign } = await fixture()
  const sample = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })
  const note = await player.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Intervening player record' } }); expect(note.error).toBeNull()
  expect((await gm.rpc('apply_campaign_setup', { p_request: sample.data.id, p_confirmation: 'LOAD SAMPLE' })).error?.code).toBe('40001')
  expect((await gm.from('characters').select('*').eq('campaign_id', campaign)).data).toEqual([])
  const review = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'clear' })
  expect((await player.rpc('update_shared_note', { p_note: note.data.id, p_patch: { body: 'Late edit' }, p_expected: { body: '' } })).error).toBeNull()
  expect((await gm.rpc('apply_campaign_setup', { p_request: review.data.id, p_confirmation: 'CLEAR WORKSPACE' })).error?.code).toBe('40001')
  expect((await player.from('codex').select('*').eq('id', note.data.id)).data![0].data.body).toBe('Late edit')
  const previews = await Promise.all([1, 2].map(() => gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'clear' })))
  const clears = await Promise.all(previews.map(result => gm.rpc('apply_campaign_setup', { p_request: result.data.id, p_confirmation: 'CLEAR WORKSPACE' })))
  expect(clears.filter(result => !result.error)).toHaveLength(1)
  expect(clears.find(result => result.error)?.error?.code).toBe('40001')
})

test('delayed accepted clock saves and older reads cannot restore clocks or notes after the confirmed clear', async ({ browser }) => {
  const { gm, campaign, invites } = await fixture()
  const clock = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'Held clock', visible_to_players: true } }); expect(clock.error).toBeNull()
  expect((await gm.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Held note' } })).error).toBeNull()
  const context = await browser.newContext(), page = await context.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.gm); await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const card = page.getByRole('article', { name: 'Held clock', exact: true }), note = page.getByRole('article', { name: 'Held note', exact: true })
  await expect(card).toBeVisible(); await expect(note).toBeVisible()
  let heldSave = false, heldRead = false, releaseSave!: () => void, releaseRead!: () => void
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve }), readGate = new Promise<void>(resolve => { releaseRead = resolve })
  await page.route('**/rest/v1/rpc/update_clock', async route => { const response = await route.fetch(); expect(response.ok()).toBe(true); heldSave = true; await saveGate; await route.fulfill({ response }) }, { times: 1 })
  await card.getByLabel('Clock notes', { exact: true }).fill('Accepted before clear')
  await card.getByRole('button', { name: 'Save clock changes', exact: true }).click()
  await expect.poll(() => heldSave).toBe(true)
  await page.route('**/rest/v1/codex?*', async route => { const response = await route.fetch(); heldRead = true; await readGate; await route.fulfill({ response }) }, { times: 1 })
  await expect.poll(() => heldRead).toBe(true)
  const preview = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'clear' })
  expect((await gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'CLEAR WORKSPACE' })).error).toBeNull()
  await expect(card).toHaveCount(0); await expect(note).toHaveCount(0)
  const saveResponse = page.waitForResponse(response => response.url().includes('/rpc/update_clock')), readResponse = page.waitForResponse(response => response.url().includes('/rest/v1/codex?'))
  releaseSave(); releaseRead(); await Promise.all([saveResponse, readResponse])
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await card.count()).toBe(0); expect(await note.count()).toBe(0)
  await context.close()
})

// Infrastructure fault injection on the selected local test project only. All
// behavior assertions still use ordinary authenticated API/storage boundaries.
function sql(statement: string) {
  const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1]
  if (!project) throw new Error('Explicit local project required')
  return execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], { input: statement, encoding: 'utf8' }).trim()
}
function admin() {
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(url, status.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
test('a late database failure rolls the whole clear back and the same reviewed action recovers safely', async () => {
  const { gm, campaign } = await fixture()
  const note = await gm.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Must survive rollback' } }), clock = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'Must survive rollback' } })
  expect(note.error).toBeNull(); expect(clock.error).toBeNull()
  const preview = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'clear' })
  sql(`create function bitd.test26_fail_clear() returns trigger language plpgsql set search_path='' as $$ begin if old.campaign_id='${campaign}'::uuid then raise exception 'Injected late clear failure'; end if; return old; end $$; create trigger test26_fail_clear before delete on bitd.codex for each row execute function bitd.test26_fail_clear();`)
  try {
    expect((await gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'CLEAR WORKSPACE' })).error?.message).toContain('Injected late clear failure')
    expect((await gm.from('codex').select('*').eq('id', note.data.id)).data).toEqual([note.data])
    expect((await gm.from('clocks').select('*').eq('id', clock.data.id)).data).toEqual([clock.data])
  } finally { sql('drop trigger test26_fail_clear on bitd.codex; drop function bitd.test26_fail_clear();') }
  expect((await gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'CLEAR WORKSPACE' })).error).toBeNull()
  expect((await gm.from('codex').select('*').eq('id', note.data.id)).data).toEqual([])
  expect((await gm.from('clocks').select('*').eq('id', clock.data.id)).data).toEqual([])
})

test('writes racing an in-progress clear are rejected without deadlock, and later deliberate writes remain available', async () => {
  const { gm, player, campaign } = await fixture()
  const clock = await gm.rpc('create_clock', { p_campaign: campaign, p_data: { name: 'Hold clear lease' } }); expect(clock.error).toBeNull()
  const preview = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'clear' })
  sql(`create function bitd.test26_delay_clear() returns trigger language plpgsql set search_path='' as $$ begin if old.campaign_id='${campaign}'::uuid then perform pg_sleep(1.5); end if; return old; end $$; create trigger test26_delay_clear before delete on bitd.clocks for each row execute function bitd.test26_delay_clear();`)
  try {
    const clearing = Promise.resolve(gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'CLEAR WORKSPACE' }))
    await expect.poll(() => Number(sql("select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%apply_campaign_setup%';"))).toBe(1)
    expect((await player.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Racing insertion' } })).error?.code).toBe('40001')
    expect((await clearing).error).toBeNull()
    expect((await player.from('codex').select('*').eq('campaign_id', campaign)).data).toEqual([])
  } finally { sql('drop trigger test26_delay_clear on bitd.clocks; drop function bitd.test26_delay_clear();') }
  expect((await player.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'Deliberate later insertion' } })).error).toBeNull()
})

test('current GM authority is checked even for accepted retries and expired previews', async () => {
  const { gm, player, campaign } = await fixture()
  const preview = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })
  const user = (await gm.auth.getUser()).data.user!.id
  expect((await admin().from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('user_id', user)).error).toBeNull()
  expect((await gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'LOAD SAMPLE' })).error?.code).toBe('42501')
  expect((await player.from('characters').select('*').eq('campaign_id', campaign)).data).toEqual([])
  expect((await admin().from('campaign_members').update({ role: 'gm' }).eq('campaign_id', campaign).eq('user_id', user)).error).toBeNull()
  sql(`update bitd.campaign_setup_requests set created_at=clock_timestamp()-interval '16 minutes' where id='${preview.data.id}'::uuid;`)
  expect((await gm.rpc('apply_campaign_setup', { p_request: preview.data.id, p_confirmation: 'LOAD SAMPLE' })).error?.code).toBe('40001')
  const fresh = await gm.rpc('preview_campaign_setup', { p_campaign: campaign, p_action: 'sample' })
  expect((await gm.rpc('apply_campaign_setup', { p_request: fresh.data.id, p_confirmation: 'LOAD SAMPLE' })).error).toBeNull()
  expect((await admin().from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('user_id', user)).error).toBeNull()
  expect((await gm.rpc('apply_campaign_setup', { p_request: fresh.data.id, p_confirmation: 'LOAD SAMPLE' })).error?.code).toBe('42501')
})

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
const business = { product: 'Counterfeit records', units: 12, supply: 'Canal supplier; paused until bridge reopens', demand: 'University record clubs', distribution: 'Night market in Charterhall', competitiveAdvantages: 'Independent label; laundering unavailable' }

test('GM preserves Dealers business through corrections and crew type changes without automatic consequences', async () => {
  const gm = client()
  expect((await gm.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Business records' })).data.id
  const created = await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Night Press', p_type: 'Dealers' })
  expect(created.error).toBeNull()
  const saved = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { dealerBusiness: business }, p_expected: { dealerBusiness: created.data.data.dealerBusiness ?? null } })
  expect(saved.error).toBeNull()
  expect(saved.data.data).toMatchObject({ dealerBusiness: business, stacks: 2, heat: 0, rep: 0, turf: 0, xp: 0 })
  const corrected = { ...business, units: 7, product: 'Independent records' }
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { dealerBusiness: corrected }, p_expected: { dealerBusiness: business } })).error).toBeNull()
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { type: 'Militants' }, p_expected: { type: 'Dealers' } })).error).toBeNull()
  const row = await gm.from('crews').select('data').eq('campaign_id', campaign).single()
  expect(row.data?.data).toMatchObject({ type: 'Militants', dealerBusiness: corrected, huntingGrounds: '', stacks: 2, heat: 0 })
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { type: 'Dealers' }, p_expected: { type: 'Militants' } })).error).toBeNull()
  expect((await gm.from('crews').select('data').eq('campaign_id', campaign).single()).data?.data.dealerBusiness).toEqual(corrected)
})

test('GM records the Militants cause and two enemies while unrelated fields and retained business stay independent', async () => {
  const gm = client()
  expect((await gm.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Cause records' })).data.id
  const created = await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Canal Union', p_type: 'Militants' })
  expect(created.error).toBeNull()
  const cause = { cause: 'Workers control their labor', enemies: ['Ministry of Stability', 'The Foundation'] }
  const saved = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: cause }, p_expected: { militantCause: created.data.data.militantCause ?? null } })
  expect(saved.error).toBeNull()
  expect(saved.data.data).toMatchObject({ militantCause: cause, huntingGrounds: '', tier: 0, stacks: 2, heat: 0, wanted: 0, xp: 0 })
  const corrected = { ...cause, enemies: ['Ministry of Stability', 'Xantara Pharm'] }
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: corrected }, p_expected: { militantCause: cause } })).error).toBeNull()
  const switched = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { type: 'Dealers', dealerBusiness: business }, p_expected: { type: 'Militants', dealerBusiness: saved.data.data.dealerBusiness } })
  expect(switched.error).toBeNull()
  expect(switched.data.data).toMatchObject({ dealerBusiness: business, militantCause: corrected, type: 'Dealers' })
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { type: 'Militants' }, p_expected: { type: 'Dealers' } })).error).toBeNull()
  expect((await gm.from('crews').select('data').eq('campaign_id', campaign).single()).data?.data.militantCause).toEqual(corrected)
})

test('GM and players inspect specialized records, retain failed drafts, retry, reload and correct crew types', async ({ browser }) => {
  const gm = await browser.newContext(), player = await browser.newContext()
  const page = await gm.newPage(), peer = await player.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Night Press business')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Crew', exact: true }).click())
  const invitation = await page.getByLabel('Player invitation', { exact: true }).inputValue()
  await page.getByRole('tab', { name: 'Crew', exact: true }).click()
  await page.getByLabel('Crew name', { exact: true }).fill('Night Press')
  await page.getByRole('button', { name: 'Create crew', exact: true }).click()
  const dossier = page.getByRole('region', { name: 'Crew dossier' })
  await dossier.getByLabel('Product', { exact: true }).fill(business.product)
  await dossier.getByLabel('Product units', { exact: true }).fill('12')
  await dossier.getByLabel('Supply notes', { exact: true }).fill(business.supply)
  await dossier.getByLabel('Demand notes', { exact: true }).fill(business.demand)
  await dossier.getByLabel('Distribution and sales territory', { exact: true }).fill(business.distribution)
  await dossier.getByLabel('Competitive advantage notes', { exact: true }).fill(business.competitiveAdvantages)
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
  await peer.goto('/')
  await peer.getByLabel('Invitation', { exact: true }).fill(invitation)
  await peer.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => peer.getByRole('tab', { name: 'Crew', exact: true }).click())
  await expect(peer.getByLabel('Product', { exact: true })).toHaveValue(business.product)
  await expect(peer.getByLabel('Product units', { exact: true })).toBeDisabled()
  await expect(peer.getByRole('button', { name: 'Save crew changes', exact: true })).toHaveCount(0)
  await dossier.getByLabel('Product units', { exact: true }).fill('9')
  await gm.setOffline(true)
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(dossier.getByRole('alert')).toContainText('Crew was not saved')
  await expect(dossier.getByLabel('Product units', { exact: true })).toHaveValue('9')
  await gm.setOffline(false)
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
  await expect(peer.getByLabel('Product units', { exact: true })).toHaveValue('9')
  await page.reload()
  await expect(dossier.getByLabel('Product units', { exact: true })).toHaveValue('9')
  await expect(dossier.getByLabel('Supply notes', { exact: true })).toHaveValue(business.supply)
  await dossier.getByRole('region', { name: 'Dealers business', exact: true }).screenshot({ path: 'test-results/business-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await dossier.getByRole('region', { name: 'Dealers business', exact: true }).screenshot({ path: 'test-results/business-mobile.png' })
  await dossier.getByLabel('Crew type', { exact: true }).selectOption('Militants')
  await expect(dossier.getByText('Retained Dealers business (inactive)', { exact: true })).toBeVisible()
  await dossier.getByLabel('Cause', { exact: true }).fill('Workers control their labor')
  await dossier.getByLabel('Enemy of the Cause 1', { exact: true }).fill('Ministry of Stability')
  await dossier.getByLabel('Enemy of the Cause 2', { exact: true }).fill('The Foundation')
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
  await expect(peer.getByLabel('Enemy of the Cause 2', { exact: true })).toHaveValue('The Foundation')
  await expect(peer.getByLabel('Cause', { exact: true })).toBeDisabled()
  await dossier.getByLabel('Enemy of the Cause 2', { exact: true }).fill('Xantara Pharm')
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(peer.getByLabel('Enemy of the Cause 2', { exact: true })).toHaveValue('Xantara Pharm')
  await page.reload()
  await expect(dossier.getByLabel('Enemy of the Cause 2', { exact: true })).toHaveValue('Xantara Pharm')
  await dossier.getByText('Retained Dealers business (inactive)', { exact: true }).click()
  await expect(dossier.getByText(business.supply, { exact: true })).toBeVisible()
  await dossier.getByRole('region', { name: 'Militants cause', exact: true }).screenshot({ path: 'test-results/cause-mobile.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await dossier.getByRole('region', { name: 'Militants cause', exact: true }).screenshot({ path: 'test-results/cause-desktop.png' })
  await dossier.getByLabel('Crew type', { exact: true }).selectOption('Dealers')
  await dossier.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(peer.getByLabel('Product units', { exact: true })).toHaveValue('9')
  await expect(dossier.getByLabel('Product', { exact: true })).toHaveValue(business.product)
  await expect(dossier.getByLabel('Stacks', { exact: true })).toHaveValue('2')
  await expect(dossier.getByLabel('Heat', { exact: true })).toHaveValue('0')
  await gm.close(); await player.close()
})

test('specialized public API enforces current GM membership, exact shapes, final crew type and expected-field conflicts', async () => {
  const gm = client(), player = client(), coGM = client(), otherGM = client(), unsigned = client()
  for (const identity of [gm, player, coGM, otherGM]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Authorized business' })).data.id
  const otherCampaign = (await otherGM.rpc('create_campaign', { p_name: 'Other business' })).data.id
  const initial = (await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Dealers', p_type: 'Dealers' })).data
  expect((await otherGM.rpc('create_crew', { p_campaign: otherCampaign, p_name: 'Others', p_type: 'Dealers' })).error).toBeNull()
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  expect((await player.rpc('join_campaign', { p_invitation: invites.player })).error).toBeNull()
  expect((await coGM.rpc('join_campaign', { p_invitation: invites.gm })).error).toBeNull()
  const original = initial.data.dealerBusiness
  for (const identity of [player, otherGM, unsigned]) {
    expect((await identity.rpc('update_crew', { p_campaign: campaign, p_patch: { dealerBusiness: business }, p_expected: { dealerBusiness: original } })).error?.code).toBe('42501')
    expect((await identity.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: { cause: 'Forged', enemies: ['', ''] } }, p_expected: { militantCause: initial.data.militantCause } })).error?.code).toBe('42501')
  }
  for (const identity of [gm, player, coGM, otherGM, unsigned]) {
    expect((await identity.from('crews').update({ data: { dealerBusiness: business } }).eq('id', initial.id)).error).not.toBeNull()
    expect((await identity.from('crews').insert({ campaign_id: campaign, data: initial.data })).error).not.toBeNull()
    expect((await identity.from('crews').delete().eq('id', initial.id)).error).not.toBeNull()
  }
  for (const identity of [otherGM, unsigned]) expect((await identity.from('crews').select('*').eq('id', initial.id)).data ?? []).toEqual([])
  const parallel = await Promise.all([
    gm.rpc('update_crew', { p_campaign: campaign, p_patch: { dealerBusiness: business }, p_expected: { dealerBusiness: original } }),
    coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { base: 'Canal station' }, p_expected: { base: '' } }),
  ])
  for (const result of parallel) expect(result.error).toBeNull()
  expect((await coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { dealerBusiness: { ...business, units: 0 } }, p_expected: { dealerBusiness: original } })).error?.code).toBe('40001')
  for (const invalid of [null, [], {}, { ...business, units: -1 }, { ...business, units: 1.5 }, { ...business, units: '1' }, { ...business, units: 10000 }, { ...business, supply: null }, { ...business, demand: 'x'.repeat(5001) }, { ...business, owner: 'gm' }]) {
    expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { base: 'Atomic rejection', dealerBusiness: invalid }, p_expected: { base: 'Canal station', dealerBusiness: business } })).error?.code, JSON.stringify(invalid)).toBe('P0001')
  }
  // A type correction raced ahead of an existing business draft. The saved final
  // type must guard the stale edit even though that draft's object is unchanged.
  expect((await coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { type: 'Militants' }, p_expected: { type: 'Dealers' } })).error).toBeNull()
  expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { dealerBusiness: { ...business, units: 4 } }, p_expected: { dealerBusiness: business } })).error?.code).toBe('P0001')
  const cause = { cause: 'Fair working conditions', enemies: ['The Foundation', 'Xantara Pharm'] }
  const saved = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: cause }, p_expected: { militantCause: initial.data.militantCause } })
  expect(saved.error).toBeNull()
  for (const invalid of [null, [], {}, { ...cause, enemies: [] }, { ...cause, enemies: ['One'] }, { ...cause, enemies: ['One', 'Two', 'Three'] }, { ...cause, enemies: ['One', null] }, { ...cause, cause: 5 }, { ...cause, enemies: ['One', 'x'.repeat(5001)] }, { ...cause, bonus: 1 }]) {
    expect((await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: invalid }, p_expected: { militantCause: cause } })).error?.code, JSON.stringify(invalid)).toBe('P0001')
  }
  expect((await coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: { ...cause, cause: 'Stale' } }, p_expected: { militantCause: initial.data.militantCause } })).error?.code).toBe('40001')
  const preserved = (await player.from('crews').select('data').eq('id', initial.id).single()).data!.data
  expect(preserved).toMatchObject({ dealerBusiness: business, militantCause: cause, base: 'Canal station', stacks: 2, heat: 0, tier: 0, xp: 0, abilities: [], upgrades: [], claims: [], cohorts: [] })
  // Business-specific helpers and the retained dispatcher are private, too.
  for (const [name, args] of [
    ['validate_crew_tools_patch', { p_patch: {} }], ['validate_crew_patch', { p_patch: {} }],
    ['validate_crew_business_field', { field: 'dealerBusiness', value: business }], ['crew_business_defaults', { p_data: {} }],
  ] as const) expect((await player.rpc(name, args)).error?.code).toBe('42501')
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  const admin = createClient(url, status.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
  const coId = (await coGM.auth.getUser()).data.user!.id
  expect((await admin.from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaign).eq('user_id', coId)).error).toBeNull()
  expect((await coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: { ...cause, cause: 'Demoted' } }, p_expected: { militantCause: cause } })).error?.code).toBe('42501')
  expect((await coGM.from('crews').select('data').eq('id', initial.id).single()).data?.data.militantCause).toEqual(cause)
  expect((await admin.from('campaign_members').delete().eq('campaign_id', campaign).eq('user_id', coId)).error).toBeNull()
  expect((await coGM.from('crews').select('*').eq('id', initial.id)).data).toEqual([])
  expect((await coGM.rpc('update_crew', { p_campaign: campaign, p_patch: { militantCause: cause }, p_expected: { militantCause: cause } })).error?.code).toBe('42501')
})

test('competing business drafts retain local values until explicit reload and disjoint common edits converge', async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext()
  const ours = await first.newPage(), theirs = await second.newPage()
  await ours.goto('/')
  await ours.getByLabel('Campaign name', { exact: true }).fill('Competing business drafts')
  await ours.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => ours.getByRole('tab', { name: 'Crew', exact: true }).click())
  const invitation = await ours.getByLabel('Secret GM invitation', { exact: true }).inputValue()
  await ours.getByRole('tab', { name: 'Crew', exact: true }).click()
  await ours.getByLabel('Crew name', { exact: true }).fill('Night Press')
  await ours.getByRole('button', { name: 'Create crew', exact: true }).click()
  await theirs.goto('/')
  await theirs.getByLabel('Invitation', { exact: true }).fill(invitation)
  await theirs.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => theirs.getByRole('tab', { name: 'Crew', exact: true }).click())
  await expect(theirs.getByLabel('Product', { exact: true })).toHaveValue('')
  await ours.getByLabel('Product', { exact: true }).fill('Counterfeit records')
  await theirs.getByLabel('Base', { exact: true }).fill('Tram station')
  await theirs.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByRole('region', { name: 'Crew dossier' }).getByRole('status')).toHaveText('Crew saved.')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('region', { name: 'Crew dossier' }).getByRole('status')).toHaveText('Crew saved.')
  await expect(theirs.getByLabel('Product', { exact: true })).toHaveValue('Counterfeit records')
  await expect(ours.getByLabel('Base', { exact: true })).toHaveValue('Tram station')
  await ours.getByLabel('Supply notes', { exact: true }).fill('Local supplier at the docks')
  await theirs.getByLabel('Product units', { exact: true }).fill('8')
  await theirs.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByRole('region', { name: 'Crew dossier' }).getByRole('status')).toHaveText('Crew saved.')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('region', { name: 'Crew dossier' }).getByRole('alert')).toContainText('Crew changed elsewhere')
  await expect(ours.getByLabel('Supply notes', { exact: true })).toHaveValue('Local supplier at the docks')
  await ours.getByRole('button', { name: 'Reload latest crew (discard unsaved)', exact: true }).click()
  await expect(ours.getByLabel('Product units', { exact: true })).toHaveValue('8')
  await expect(ours.getByLabel('Supply notes', { exact: true })).toHaveValue('')
  await ours.getByLabel('Supply notes', { exact: true }).fill('Supplier corrected after review')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByLabel('Supply notes', { exact: true })).toHaveValue('Supplier corrected after review')
  await ours.getByLabel('Distribution and sales territory', { exact: true }).fill('Pending expanded territory')
  await theirs.getByLabel('Crew type', { exact: true }).selectOption('Militants')
  await theirs.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByLabel('Crew type', { exact: true })).toHaveValue('Militants')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('region', { name: 'Crew dossier' }).getByRole('alert')).toContainText('Switch crew type to Dealers')
  await ours.getByText('Retained Dealers business (inactive)', { exact: true }).click()
  await expect(ours.getByText('Pending expanded territory', { exact: true })).toBeVisible()
  await ours.getByLabel('Crew type', { exact: true }).selectOption('Dealers')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByLabel('Distribution and sales territory', { exact: true })).toHaveValue('Pending expanded territory')
  await first.close(); await second.close()
})

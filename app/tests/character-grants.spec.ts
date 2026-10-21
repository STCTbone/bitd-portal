import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Tests require local Supabase')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
const whitespace = ['\t\n\r\v\f ', '\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff']

test('permanent healing requires an actual selected and sourced ability, including during source removal', async () => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Ability source guard' })).data.id
  const made = (await gm.rpc('create_character', { p_campaign: campaign, p_name: 'Healer' })).data
  const patch = (p_patch: unknown) => gm.rpc('patch_character', { p_character: made.id, p_patch })
  for (const source of whitespace) {
    expect((await patch({ abilities: ['Versatile'], versatile: [{ name: 'Get Back In There', source, notes: 'Veteran p.84 is only a note' }], healing: { permanent: 1 } })).error, JSON.stringify(source)).not.toBeNull()
  }
  expect((await patch({ abilities: ['Versatile'], versatile: [{ name: 'Get Back In There', source: 'Veteran · book v1.0.1 p.84', notes: '' }], healing: { permanent: 1, progress: 3 } })).error).toBeNull()
  for (const p of [{ abilities: [] }, { versatile: [{ name: 'Get Back In There', source: whitespace[0], notes: '' }] }, { versatile: [{ name: 'Other ability', source: 'Veteran p.84', notes: 'Get Back In There' }] }]) expect((await patch(p)).error).not.toBeNull()
  expect((await gm.from('characters').select('data').eq('id', made.id).single()).data!.data).toMatchObject({ healing: { permanent: 1, progress: 3 }, versatile: [{ source: 'Veteran · book v1.0.1 p.84' }] })
  expect((await patch({ healing: { permanent: 0 }, versatile: [] })).error).toBeNull()
})

test('completed sourced Hull memories grant backing and healing, and removal requires explicit state correction', async () => {
  const gm = client(), owner = client(), other = client()
  for (const c of [gm, owner, other]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Remembered abilities' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, other]) await c.rpc('join_campaign', { p_invitation: invite })
  const hull = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Remembrance', p_playbook: 'Hull' })).data
  const factions = []
  for (const p_name of ['Palace', 'Paxton']) factions.push((await gm.rpc('create_faction', { p_campaign: campaign, p_name })).data)
  const patch = (p_patch: unknown, who = owner) => who.rpc('patch_character', { p_character: hull.id, p_patch })
  const create = (n: number) => owner.rpc('create_backing', { p_character: hull.id, p_faction: factions[n].id })
  expect((await create(0)).error).toBeNull()
  expect((await patch({ hull: { operations: 'Double Agent · Operative p.50' } })).error).toBeNull()
  expect((await create(1)).error).not.toBeNull()
  const memories = hull.data.hull.memories.map((m: object, i: number) => ({ ...m, progress: i === 0 ? 8 : 0, ability: i === 0 ? 'Double Agent' : '', source: i === 0 ? 'Operative · book v1.0.1 p.50' : '' }))
  for (const source of whitespace) expect((await patch({ hull: { memories: memories.map((m: object, i: number) => i === 0 ? { ...m, source } : m) } })).error).not.toBeNull()
  expect((await patch({ hull: { memories } }, other)).error).not.toBeNull()
  expect((await patch({ hull: { memories } })).error).toBeNull()
  const second = await create(1); expect(second.error).toBeNull()
  for (const first of [{ ...memories[0], ability: '', source: '' }, { ...memories[0], ability: '', source: '', progress: 7 }, { ...memories[0], ability: 'Other ability' }]) expect((await patch({ hull: { memories: [first, ...memories.slice(1)] } })).error).not.toBeNull()
  expect((await owner.rpc('patch_backing', { p_backing: second.data.id, p_patch: { active: false }, p_expected_version: second.data.version })).error).toBeNull()
  memories[0] = { ...memories[0], ability: '', source: '', progress: 7 }
  expect((await patch({ hull: { memories } })).error).toBeNull()
  expect((await create(1)).error).not.toBeNull()
  memories[0] = { ...memories[0], progress: 8, ability: 'Get Back In There', source: 'Veteran · book v1.0.1 p.84' }
  expect((await patch({ hull: { memories }, healing: { permanent: 1, progress: 3 } })).error).toBeNull()
  const cleared = memories.map((m: object, i: number) => i === 0 ? { ...m, ability: '', source: '' } : m)
  expect((await patch({ hull: { memories: cleared } })).error).not.toBeNull()
  expect((await patch({ hull: { memories: cleared }, healing: { permanent: 0 } })).error).toBeNull()
  expect((await owner.from('characters').select('data').eq('id', hull.id).single()).data!.data).toMatchObject({ healing: { permanent: 0, progress: 3 }, hull: { memories: cleared } })
})

test('Hull owner reviews remembered Double Agent, keeps rejected removal and ends backing before correcting the memory', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/'); await page.getByLabel('Campaign name').fill('Remembering an agent')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  for (const name of ['Palace', 'Paxton']) {
    await page.getByLabel('New faction name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Create faction', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Faction list' }).getByRole('button', { name, exact: true })).toBeVisible()
  }
  await page.getByLabel('New character name').fill('Memory')
  await page.getByLabel('Playbook', { exact: true }).selectOption('Hull')
  await page.getByRole('button', { name: 'Create Hull', exact: true }).click()
  const section = page.getByRole('region', { name: 'Backing factions', exact: true })
  const hull = page.getByRole('region', { name: 'Hull records', exact: true })
  await section.getByLabel('Public backing faction').selectOption({ label: 'Palace · Tier 0' })
  await section.getByRole('button', { name: 'Record backing', exact: true }).click()
  await expect(section.getByText('1 / 1 active.', { exact: false })).toBeVisible()
  await hull.getByLabel('Memory 1 progress', { exact: true }).selectOption('8')
  await hull.getByLabel('Memory 1 ability', { exact: true }).fill('Double Agent')
  await hull.getByLabel('Memory 1 ability source', { exact: true }).fill('Operative · book v1.0.1 p.50')
  await hull.getByRole('button', { name: 'Review Hull records', exact: true }).click()
  await hull.getByRole('button', { name: 'Confirm Hull records', exact: true }).click()
  await expect(section.getByText('1 / 2 active.', { exact: false })).toBeVisible()
  await section.getByLabel('Public backing faction').selectOption({ label: 'Paxton · Tier 0' })
  await section.getByRole('button', { name: 'Record backing', exact: true }).click()
  await expect(section.getByText('2 / 2 active.', { exact: false })).toBeVisible()
  await hull.getByLabel('Memory 1 ability', { exact: true }).fill('')
  await hull.getByLabel('Memory 1 ability source', { exact: true }).fill('')
  await hull.getByLabel('Memory 1 progress', { exact: true }).selectOption('7')
  await hull.getByRole('button', { name: 'Review Hull records', exact: true }).click()
  await hull.getByRole('button', { name: 'Confirm Hull records', exact: true }).click()
  await expect(hull.getByRole('alert')).toContainText('End a backing before removing')
  await expect(section.getByText('2 / 2 active.', { exact: false })).toBeVisible()
  await expect(hull.getByLabel('Memory 1 progress', { exact: true })).toHaveValue('7')
  await hull.getByRole('button', { name: 'Discard Hull records', exact: true }).click()
  await expect(hull.getByLabel('Memory 1 ability', { exact: true })).toHaveValue('Double Agent')
  const card = section.getByRole('region', { name: 'Paxton backing', exact: true })
  await card.getByLabel('Active backing', { exact: true }).uncheck()
  await card.getByRole('button', { name: 'Review backing changes', exact: true }).click()
  await card.getByRole('button', { name: 'Confirm backing changes', exact: true }).click()
  await expect(section.getByText('1 / 2 active.', { exact: false })).toBeVisible()
  await hull.getByLabel('Memory 1 ability', { exact: true }).fill('')
  await hull.getByLabel('Memory 1 ability source', { exact: true }).fill('')
  await hull.getByLabel('Memory 1 progress', { exact: true }).selectOption('7')
  await hull.getByRole('button', { name: 'Review Hull records', exact: true }).click()
  await hull.getByRole('button', { name: 'Confirm Hull records', exact: true }).click()
  await expect(section.getByText('1 / 1 active.', { exact: false })).toBeVisible()
  await page.reload(); await page.getByRole('button', { name: 'Open Memory', exact: true }).click()
  await expect(hull.getByLabel('Memory 1 progress', { exact: true })).toHaveValue('7')
  await expect(card).toContainText('Inactive history')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await section.screenshot({ path: 'test-results/memory-backing-mobile.png' })
})

test('remembered Get Back In There exposes deliberate permanent Repair and preserves a rejected grant-removal draft', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Campaign name').fill('Remembering treatment')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await page.getByLabel('New character name').fill('Repair')
  await page.getByLabel('Playbook', { exact: true }).selectOption('Hull')
  await page.getByRole('button', { name: 'Create Hull', exact: true }).click()
  const hull = page.getByRole('region', { name: 'Hull records', exact: true })
  await expect(page.getByLabel('Permanent repair segments', { exact: true })).toHaveCount(0)
  await hull.getByLabel('Memory 1 progress', { exact: true }).selectOption('8')
  await hull.getByLabel('Memory 1 ability', { exact: true }).fill('Get Back In There')
  await hull.getByLabel('Memory 1 ability source', { exact: true }).fill('Veteran · book v1.0.1 p.84')
  await hull.getByRole('button', { name: 'Review Hull records', exact: true }).click()
  await hull.getByRole('button', { name: 'Confirm Hull records', exact: true }).click()
  await expect(page.getByLabel('Permanent repair segments', { exact: true })).toBeVisible()
  await page.getByLabel('Permanent repair segments', { exact: true }).selectOption('1')
  await page.getByLabel('Repair progress', { exact: true }).selectOption('3')
  await page.getByRole('button', { name: 'Review condition changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm condition changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Review condition changes', exact: true })).toHaveCount(0)
  await hull.getByLabel('Memory 1 ability', { exact: true }).fill('')
  await hull.getByLabel('Memory 1 ability source', { exact: true }).fill('')
  await hull.getByRole('button', { name: 'Review Hull records', exact: true }).click()
  await hull.getByRole('button', { name: 'Confirm Hull records', exact: true }).click()
  await expect(hull.getByRole('alert')).toContainText('Permanent segment requires Get Back In There')
  await expect(page.getByLabel('Permanent repair segments', { exact: true })).toHaveValue('1')
  await page.getByRole('region', { name: 'Condition records', exact: true }).screenshot({ path: 'test-results/memory-repair-desktop.png' })
  await page.getByLabel('Permanent repair segments', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'Review condition changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm condition changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Review condition changes', exact: true })).toHaveCount(0)
  await hull.getByRole('button', { name: 'Retry Hull records', exact: true }).click()
  await expect(hull.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Permanent repair segments', { exact: true })).toHaveCount(0)
  await page.reload(); await page.getByRole('button', { name: 'Open Repair', exact: true }).click()
  await expect(hull.getByLabel('Memory 1 ability', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Repair progress', { exact: true })).toHaveValue('3')
})


test('Versatile records require every text field while complete empty drafts remain editable', async () => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Complete borrowed records' })).data.id
  const character = (await gm.rpc('create_character', { p_campaign: campaign, p_name: 'Borrower' })).data
  const patch = (versatile: unknown) => gm.rpc('patch_character', { p_character: character.id, p_patch: { abilities: ['Versatile'], versatile } })
  for (const missing of ['name', 'source', 'notes']) {
    const entry: Record<string, string> = { name: 'Double Agent', source: 'Operative', notes: 'Kept notes' }
    delete entry[missing]
    expect((await patch([entry])).error, `missing ${missing}`).not.toBeNull()
  }
  expect((await patch([{ name: '', source: '', notes: '' }])).error).toBeNull()
  expect((await patch([{ name: 'Double Agent', source: '', notes: 'Unverified draft' }])).error).toBeNull()
  expect((await gm.rpc('patch_character', { p_character: character.id, p_patch: { healing: { permanent: 1 } } })).error).not.toBeNull()
  expect((await gm.from('characters').select('data').eq('id', character.id).single()).data!.data.versatile).toEqual([{ name: 'Double Agent', source: '', notes: 'Unverified draft' }])
})

test('legacy incomplete Versatile records remain readable by owner GM and peer and can be repaired without free grants', async ({ browser }) => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Repair borrowed records' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()))
  const [owner, manager, peer] = await Promise.all(contexts.map(c => c.newPage()))
  const pageErrors: string[] = []
  for (const page of [owner, manager, peer]) page.on('pageerror', error => pageErrors.push(error.message))
  for (const [page, invite] of [[owner, invites.player], [manager, invites.gm], [peer, invites.player]] as const) {
    await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invite)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Repair borrowed records', exact: true })).toBeVisible()
  }
  await owner.getByLabel('New character name').fill('Legacy borrower')
  await owner.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await expect(owner.getByLabel('Character name', { exact: true })).toHaveValue('Legacy borrower')
  const character = (await gm.from('characters').select('*').eq('campaign_id', campaign).single()).data!
  // Emulate a row accepted by the original public patch contract before the
  // complete-entry migration. All observations and repairs use the live UI/API.
  const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1]
  if (!project || !/^[0-9a-f-]{36}$/.test(character.id)) throw new Error('Explicit local fixture required')
  execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: `update bitd.characters set data=data || '{"abilities":["Versatile"],"versatile":[{"name":"Double Agent"},{"name":"Get Back In There","notes":"Retained note"}]}'::jsonb where id='${character.id}'::uuid;`,
  })
  await owner.reload()
  for (const page of [owner, manager, peer]) {
    await page.getByRole('button', { name: 'Open Legacy borrower', exact: true }).click()
    await expect(page.getByLabel('Versatile 1 name', { exact: true })).toHaveValue('Double Agent')
    await expect(page.getByLabel('Versatile 1 source', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Versatile 2 notes', { exact: true })).toHaveValue('Retained note')
    await expect(page.getByLabel('Permanent healing segments', { exact: true })).toHaveValue('0')
  }
  await expect(peer.getByLabel('Versatile 1 source', { exact: true })).toBeDisabled()
  await expect(owner.getByRole('region', { name: 'Backing factions', exact: true })).toContainText('0 / 1 active.')
  await owner.getByLabel('Versatile 1 source', { exact: true }).fill('Operative · book v1.0.1 p.50')
  await owner.getByLabel('Versatile 1 source', { exact: true }).blur()
  await expect.poll(async () => (await gm.from('characters').select('data').eq('id', character.id).single()).data!.data.versatile).toEqual([
    { name: 'Double Agent', source: 'Operative · book v1.0.1 p.50', notes: '' },
    { name: 'Get Back In There', source: '', notes: 'Retained note' },
  ])
  await expect(owner.getByRole('region', { name: 'Backing factions', exact: true })).toContainText('0 / 2 active.')
  await expect(peer.getByLabel('Versatile 1 source', { exact: true })).toHaveValue('Operative · book v1.0.1 p.50')
  await owner.reload(); await owner.getByRole('button', { name: 'Open Legacy borrower', exact: true }).click()
  await expect(owner.getByLabel('Versatile 1 source', { exact: true })).toHaveValue('Operative · book v1.0.1 p.50')
  await expect(owner.getByLabel('Permanent healing segments', { exact: true })).toHaveValue('0')
  await owner.getByRole('region', { name: 'Special abilities', exact: true }).screenshot({ path: 'test-results/legacy-versatile-desktop.png' })
  await peer.setViewportSize({ width: 390, height: 844 })
  expect(await peer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await peer.getByRole('region', { name: 'Special abilities', exact: true }).screenshot({ path: 'test-results/legacy-versatile-mobile.png' })
  expect(pageErrors).toEqual([])
  for (const context of contexts) await context.close()
})

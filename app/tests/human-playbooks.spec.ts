import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Tests require local Supabase')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

test('published Operative, Radical and Veteran creation uses its own verified sheet', async () => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Human playbooks' })).data.id
  const cases = [
    { name: 'Operative', actions: { hunt: 1, prowl: 2, consort: 0 }, abilities: [], resource: 'Precision', item: 'Truth serum syringe', load: 0, special: { operative: { controlAction: '', backingFactions: [] } } },
    { name: 'Radical', actions: { wreck: 1, command: 1, sway: 1, survey: 0 }, abilities: [], resource: 'Conviction', item: 'Provocative manifesto', load: 0, special: { radical: { radicalizedBy: '', cause: '', bandoliers: [['', '', ''], ['', '', '']], works: [] } } },
    { name: 'Veteran', actions: { hunt: 2, skirmish: 1, command: 1, consort: 0 }, abilities: ['Military Discipline'], resource: 'Training', item: 'Heat blade', load: 1, special: { veteran: { tours: '', damage: '', helps: '', hobby: '', assistance: '' } } },
  ]
  for (const c of cases) {
    const made = await gm.rpc('create_character', { p_campaign: campaign, p_name: c.name, p_playbook: c.name })
    expect(made.error).toBeNull()
    expect(made.data.data).toMatchObject({ playbook: c.name, actions: c.actions, abilities: c.abilities, ...c.special, resources: [{ name: c.resource, used: 0, capacity: 2 }] })
    expect(made.data.data.equipment.find((i: { name: string }) => i.name === c.item)).toMatchObject({ load: c.load })
    expect(made.data.data.equipment.some((i: { name: string }) => i.name === 'A loyal, clever pet')).toBe(false)
    expect(made.data.data.sheet.creation).toContain(c.name)
    expect(made.data.data.deadlocks).toHaveLength(c.name === 'Veteran' ? 1 : 0)
  }
})

test('specialized records obey saved playbook authority and merge without erasing prior condition or gear', async () => {
  const gm = client(), owner = client(), observer = client(), outsider = client()
  for (const c of [gm, owner, observer, outsider]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Specialized authority' })).data.id
  const invitation = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, observer]) await c.rpc('join_campaign', { p_invitation: invitation })
  const backing = (name: string) => ({ name, tier: 3, mission: 'Recover dossier', failure: 2, prestige: 'Pending mission', help: 'Intel received; Return the Favor pending', notes: '' })
  const work = { name: 'Free the streets', progress: 4, circulating: true, contribution: 'One tick to campaign project this downtime', notes: '' }
  const cases = [
    { name: 'Operative', patch: { abilities: ['Clean', 'Double Agent', 'Control', 'Dead Drop', 'Sleeper Agents', 'Cipher'], operative: { controlAction: 'prowl', coverIdentity: 'Mr Grey', dropLoad: 2, dropAssetUsed: true, sleeperUsed: true } }, invalid: [{ operative: { controlAction: 'forged' } }, { operative: { dropLoad: 3 } }, { abilities: ['Clean'] }, { operative: { backingFactions: [backing('A'), backing('B'), backing('C')] } }], field: 'operative', first: { coverNotes: 'Cover intact' }, second: { operations: 'Drop complete' } },
    { name: 'Radical', patch: { abilities: ['True Believer', 'Pamphleteer'], radical: { radicalizedBy: 'Labor conditions', cause: 'Housing for all', supplier: 'Delyan', bandoliers: [['Smoke bomb', '', ''], ['', '', '']], works: [work] } }, invalid: [{ radical: { bandoliers: [['One']] } }, { radical: { works: [{ ...work, progress: 3 }] } }, { radical: { works: Array.from({ length: 5 }, () => work) } }, { abilities: ['True Believer'] }], field: 'radical', first: { praxis: 'Symbol destroyed; +2 levels pending' }, second: { dedication: 'Accepted resistance tradeoff' } },
    { name: 'Veteran', patch: { abilities: ['Military Discipline', 'Walking Arsenal', 'Get Back In There', 'Creative Community'], veteran: { tours: 'Unity War III', damage: 'Permanent leg damage', helps: 'Prosthetic', hobby: 'Pottery', assistance: 'Mara assists with prosthetic' }, healing: { permanent: 1, progress: 3 } }, invalid: [{ abilities: ['Walking Arsenal'] }, { abilities: ['Military Discipline'] }, { healing: { progress: 4 } }, { veteran: { forged: true } }], field: 'veteran', first: { assistance: 'New prosthetic fitting' }, second: { operations: 'Protected teammate; recovery reviewed' } },
  ]
  for (const c of cases) {
    const made = await owner.rpc('create_character', { p_campaign: campaign, p_name: c.name, p_playbook: c.name }); expect(made.error).toBeNull()
    const id = made.data.id
    const patch = (changes: unknown, who = owner) => who.rpc('patch_character', { p_character: id, p_patch: changes })
    expect((await patch(c.patch)).error).toBeNull()
    for (const invalid of [...c.invalid, { abilities: ['Hound’s Instincts'] }, { actions: { study: 5 } }, { harm: { mortal: [] } }, { stressCapacity: 99 }]) expect((await patch(invalid)).error, JSON.stringify(invalid)).not.toBeNull()
    for (const who of [observer, outsider]) expect((await patch({ [c.field]: c.first }, who)).error).not.toBeNull()
    expect((await patch({ [c.field]: null })).error).not.toBeNull()
    expect((await patch({ [c.field]: { damage: 12 } })).error).not.toBeNull()
    const resource = made.data.data.resources[0]
    expect((await patch({ resources: [{ ...resource, capacity: 3 }] })).error).not.toBeNull()
    expect((await patch({ resources: [{ ...resource, used: 2 }], wealth: { stacks: 2 }, xp: { playbook: 4 }, harm: { passing: ['Bruised', ''] } })).error).toBeNull()
    const updates = await Promise.all([patch({ [c.field]: c.first, xp: { insight: 2 } }), patch({ [c.field]: c.second, xp: { prowess: 3 }, armor: { notes: 'Saved armor detail' } }, gm)])
    for (const r of updates) expect(r.error).toBeNull()
    const saved = (await observer.from('characters').select('data').eq('id', id).single()).data!.data
    expect(saved[c.field]).toMatchObject({ ...c.first, ...c.second })
    expect(saved).toMatchObject({ wealth: { stacks: 2 }, xp: { playbook: 4, insight: 2, prowess: 3 }, harm: { passing: ['Bruised', ''] }, armor: { notes: 'Saved armor detail' } })
    expect((await patch({ playbook: 'Hound', sheet: { actionMax: 999 } })).error).not.toBeNull()
    expect((await owner.from('characters').update({ data: saved }).eq('id', id)).error).not.toBeNull()
    expect((await outsider.from('characters').select('id').eq('id', id)).data).toEqual([])
    expect((await outsider.rpc('create_character', { p_campaign: campaign, p_name: c.name, p_playbook: c.name })).error).not.toBeNull()
  }
  const hound = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Hound' })).data.id
  expect((await owner.rpc('patch_character', { p_character: hound, p_patch: { veteran: { damage: 'Forged' } } })).error).not.toBeNull()
  for (const name of ['Operative', 'Radical']) {
    const made = (await owner.rpc('create_character', { p_campaign: campaign, p_name: name, p_playbook: name })).data
    expect((await owner.rpc('patch_character', { p_character: made.id, p_patch: { resources: [{ ...made.data.resources[0], used: 1 }] } })).error).not.toBeNull()
  }
})

for (const playbook of ['Operative', 'Radical', 'Veteran']) test(`${playbook} creation and specialized drafts synchronize, recover from failure and survive reload`, async ({ browser }) => {
  test.setTimeout(60000)
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, owner, observer] = await Promise.all(contexts.map(c => c.newPage()))
  await gm.goto('/')
  await gm.getByLabel('Campaign name').fill(`${playbook} dossier`)
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => gm.getByRole('tab', { name: 'Characters', exact: true }).click())
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const p of [owner, observer]) {
    await p.goto('/'); await p.getByLabel('Invitation', { exact: true }).fill(invitation)
    await p.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => p.getByRole('tab', { name: 'Characters', exact: true }).click())
  }
  await owner.getByRole('tab', { name: 'Characters', exact: true }).click()
  await owner.getByLabel('New character name').fill('Morgan')
  await owner.getByLabel('Playbook', { exact: true }).selectOption(playbook)
  await owner.getByRole('button', { name: `Create ${playbook}`, exact: true }).click()
  for (const p of [gm, observer]) await p.getByRole('button', { name: 'Open Morgan', exact: true }).click()
  const source = owner.getByRole('article', { name: 'Morgan dossier' })
  await expect(source).not.toContainText('Hound starts')
  await expect(owner.getByRole('region', { name: 'Loyal clever pet' })).toHaveCount(0)
  const field = playbook === 'Operative' ? 'Cover identity' : playbook === 'Radical' ? 'Cause and ideology' : 'Permanent damage'
  const value = playbook === 'Operative' ? 'Mr Grey' : playbook === 'Radical' ? 'Homes for everyone' : 'Permanent leg damage'
  if (playbook === 'Operative') {
    for (const ability of ['Clean', 'Control', 'Cipher', 'Dead Drop', 'Double Agent']) { await owner.getByLabel(ability, { exact: true }).click(); await expect(owner.getByLabel(ability, { exact: true })).toBeChecked() }
    await owner.getByLabel('Control action', { exact: true }).selectOption('prowl')
    await owner.getByLabel('Dead Drop load delivered', { exact: true }).fill('2')
  } else if (playbook === 'Radical') {
    for (const ability of ['True Believer', 'Pamphleteer']) { await owner.getByLabel(ability, { exact: true }).click(); await expect(owner.getByLabel(ability, { exact: true })).toBeChecked() }
    await owner.getByLabel('Radicalized by', { exact: true }).fill('Labor conditions')
    await owner.getByLabel('Bandolier 1 slot 1', { exact: true }).fill('Smoke bomb')
    await owner.getByRole('button', { name: 'Add revolutionary work', exact: true }).click()
    await owner.getByLabel('Work 1 name', { exact: true }).fill('Free the streets')
    await owner.getByLabel('Work 1 progress', { exact: true }).fill('4')
    await owner.getByLabel('Work 1 circulating', { exact: true }).check()
  } else {
    await expect(owner.getByLabel('Military Discipline', { exact: true })).toBeChecked()
    await expect(owner.getByLabel('Hunt rating', { exact: true })).toHaveValue('2')
    for (const ability of ['Walking Arsenal', 'Get Back In There', 'Creative Community']) { await owner.getByLabel(ability, { exact: true }).click(); await expect(owner.getByLabel(ability, { exact: true })).toBeChecked() }
    await expect(owner.getByLabel('Load choice', { exact: true }).locator('option').first()).toHaveText('Quiet · 5')
    await owner.getByLabel('Something that helps', { exact: true }).fill('Prosthetic')
    await owner.getByLabel('Assistance details', { exact: true }).fill('Mara helps fit the prosthetic')
    await owner.getByLabel('Creative hobby vice', { exact: true }).fill('Pottery')
    await owner.getByLabel('Tours of duty', { exact: true }).fill('Unity War III')
  }
  await owner.getByLabel('Study rating', { exact: true }).selectOption('2')
  await expect(owner.getByLabel('Study rating', { exact: true })).toHaveValue('2')
  await owner.getByLabel('Tinker rating', { exact: true }).selectOption('2')
  await expect(owner.getByLabel('Tinker rating', { exact: true })).toHaveValue('2')
  await owner.getByLabel(field, { exact: true }).fill(value)
  await expect(observer.getByLabel(field, { exact: true })).toHaveValue('')
  await expect(observer.getByLabel(field, { exact: true })).toBeDisabled()
  await owner.getByRole('button', { name: 'Review playbook records', exact: true }).click()
  await expect(owner.getByRole('region', { name: 'Review playbook records', exact: true })).toContainText(value)
  await contexts[1].setOffline(true)
  await owner.getByRole('button', { name: 'Confirm playbook records', exact: true }).click()
  await expect(owner.getByRole('alert').filter({ hasText: 'Playbook records were not saved' })).toBeVisible()
  await expect(owner.getByLabel(field, { exact: true })).toHaveValue(value)
  await gm.getByLabel('Playbook operations and outcomes', { exact: true }).fill('GM reviewed separate outcome')
  await gm.getByRole('button', { name: 'Review playbook records', exact: true }).click()
  await gm.getByRole('button', { name: 'Confirm playbook records', exact: true }).click()
  await expect(observer.getByLabel('Playbook operations and outcomes', { exact: true })).toHaveValue('GM reviewed separate outcome')
  await contexts[1].setOffline(false)
  await owner.getByRole('button', { name: 'Retry playbook records', exact: true }).click()
  await expect(observer.getByLabel(field, { exact: true })).toHaveValue(value)
  await expect(owner.getByLabel('Playbook operations and outcomes', { exact: true })).toHaveValue('GM reviewed separate outcome')
  const item = playbook === 'Operative' ? 'Truth serum syringe' : playbook === 'Radical' ? 'Provocative manifesto' : 'Heat blade'
  await owner.getByText(`${item} · ${playbook === 'Veteran' ? 1 : 0} load × 1`, { exact: true }).click()
  await owner.getByLabel(`Item ${item} carried`, { exact: true }).check()
  await owner.getByLabel('Resource 1 used', { exact: true }).fill('2')
  await owner.getByLabel('Load choice', { exact: true }).selectOption('Loud')
  await owner.getByRole('button', { name: 'Review equipment and advancement', exact: true }).click()
  await owner.getByRole('button', { name: 'Confirm equipment and advancement', exact: true }).click()
  await expect(observer.getByLabel('Resource 1 used', { exact: true })).toHaveValue('2')
  if (playbook === 'Veteran') {
    await expect(owner.getByLabel('Permanent healing segments', { exact: true })).toHaveValue('0')
    await owner.getByLabel('Deadlock 1 name', { exact: true }).fill('Haunted')
    await owner.getByLabel('Deadlock 1 former Key', { exact: true }).fill('Bold')
    await owner.getByLabel('Healing progress', { exact: true }).selectOption('3')
    await owner.getByLabel('Permanent healing segments', { exact: true }).selectOption('1')
    await owner.getByRole('button', { name: 'Review condition changes', exact: true }).click()
    await owner.getByRole('button', { name: 'Confirm condition changes', exact: true }).click()
    await expect(observer.getByLabel('Permanent healing segments', { exact: true })).toHaveValue('1')
    await expect(owner.getByLabel('Load choice', { exact: true }).locator('option').last()).toHaveText('Loud · 8')
  }
  await owner.reload(); await owner.getByRole('button', { name: 'Open Morgan', exact: true }).click()
  await expect(owner.getByLabel(field, { exact: true })).toHaveValue(value)
  await expect(owner.getByLabel('Resource 1 used', { exact: true })).toHaveValue('2')
  await expect(owner.getByLabel('Study rating', { exact: true })).toHaveValue('2')
  await expect(owner.getByText(`${item} · ${playbook === 'Veteran' ? 1 : 0} load × 1 · carried`, { exact: true })).toBeVisible()
  if (playbook === 'Veteran') await expect(owner.getByLabel('Permanent healing segments', { exact: true })).toHaveValue('1')
  if (playbook === 'Radical') await expect(owner.getByLabel('Work 1 circulating', { exact: true })).toBeChecked()
  if (playbook === 'Veteran') await expect(owner.getByLabel('Something that helps', { exact: true })).toHaveValue('Prosthetic')
  await owner.getByRole('region', { name: 'Playbook records', exact: true }).screenshot({ path: `test-results/${playbook.toLowerCase()}-desktop.png` })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expect(owner.getByLabel(field, { exact: true })).toBeVisible()
  expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await owner.getByRole('region', { name: 'Playbook records', exact: true }).screenshot({ path: `test-results/${playbook.toLowerCase()}-mobile.png` })
  await Promise.all(contexts.map(c => c.close()))
})

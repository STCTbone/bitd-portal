import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Tests require local Supabase')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })

test('companion playbooks create distinct published cohorts and own starting sheets', async () => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Companion sheets' })).data.id
  const cases = [
    { name: 'Intellectual', actions: { study: 1, tinker: 2, consort: 0 }, field: 'sparkmind', shape: { types: [], housing: '', advancedChoices: [] }, resource: 'Research', item: 'Experimental laser cannon', load: 2 },
    { name: 'Paranormalist', actions: { study: 1, attune: 2, consort: 0 }, field: 'resonanceEntity', shape: { type: 'Paranormal Assistant', armor: false, abilities: '' }, resource: 'Sixth Sense', item: 'Fine echo containment unit', load: 1 },
    { name: 'Swinger', actions: { finesse: 1, sway: 2, consort: 0 }, field: 'autopod', shape: { type: '', style: '' }, resource: 'Mojo', item: 'Fine clothes & jewelry', load: 0 },
  ]
  for (const c of cases) {
    const result = await gm.rpc('create_character', { p_campaign: campaign, p_name: c.name, p_playbook: c.name })
    expect(result.error).toBeNull()
    const d = result.data.data
    expect(d).toMatchObject({ actions: c.actions, abilities: [], [c.field]: { name: '', edges: '', flaws: '', weak: false, impaired: false, broken: false, ...c.shape }, resources: [{ name: c.resource, capacity: 2, used: 0 }] })
    expect(d.pet).toBeUndefined()
    expect(d.equipment.find((i: { name: string }) => i.name === 'RF radio handset')).toMatchObject({ load: 0 })
    expect(d.equipment.find((i: { name: string }) => i.name === c.item)).toMatchObject({ load: c.load })
    expect(d.sheet.creation).toContain(c.name)
    expect(d.sheet.contacts).toHaveLength(5)
  }
})

test('companion models enforce native choices and current authority while disjoint nested saves preserve siblings', async () => {
  const gm = client(), owner = client(), observer = client(), outsider = client()
  for (const c of [gm, owner, observer, outsider]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Companion authority' })).data.id
  const invitation = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, observer]) await c.rpc('join_campaign', { p_invitation: invitation })
  await outsider.rpc('create_campaign', { p_name: 'Other campaign' })
  const cases = [
    { name: 'Intellectual', field: 'sparkmind', abilities: ['Researcher', 'Advanced Sparkmind'], patch: { types: ['Research', 'Ingress'], housing: 'Large', advancedChoices: ['additional-type', 'remove-flaw'], edges: 'Independent', flaws: '', weak: true }, special: { intellectual: { fieldsOfStudy: 'Spark-Craft', gadgetDecisions: 'Recipient carries gadget' } }, invalid: [{ sparkmind: { housing: 'Medium' } }, { sparkmind: { types: ['Research', 'Analysis', 'Ingress'] } }, { sparkmind: { armor: true } }, { sparkmind: { advancedChoices: ['add-edge', 'add-edge', 'add-edge'] } }] },
    { name: 'Paranormalist', field: 'resonanceEntity', abilities: ['Extrasensory Perception', 'Precognition', 'Echo Projection'], patch: { kind: 'Mirror shards', abilities: 'Fetch tools', armor: true, impaired: true }, special: { paranormalist: { precognitionUsed: 2, projectionRank: 2, projectionActive: true, experiments: 'Negotiated theory clock' } }, invalid: [{ resonanceEntity: { type: 'Hunter' } }, { paranormalist: { projectionRank: 3 } }, { paranormalist: { precognitionUsed: 3 } }, { paranormalist: { projectionRank: 0 } }] },
    { name: 'Swinger', field: 'autopod', abilities: ['Smooth', 'Echo Twin', 'Always Hustling', 'Party Animal'], patch: { type: 'Surprising', style: 'Velvet chrome', broken: true }, special: { swinger: { sideHustle: 'Fashion advice', hustleActivityGranted: true, partyAssistAvailable: true, twinSummoned: true, twinFeatures: ['scene', 'solid', 'obedient'], twinNotes: 'Different twin each time' } }, invalid: [{ autopod: { type: 'Hunter' } }, { autopod: { armor: true } }, { swinger: { twinFeatures: ['invented'] } }, { swinger: { twinFeatures: ['solid', 'solid'] } }] },
  ]
  for (const c of cases) {
    const made = await owner.rpc('create_character', { p_campaign: campaign, p_name: c.name, p_playbook: c.name }); expect(made.error).toBeNull()
    const id = made.data.id
    const patch = (p: unknown, who = owner) => who.rpc('patch_character', { p_character: id, p_patch: p })
    expect((await patch({ [c.field]: c.patch, ...c.special })).error).not.toBeNull()
    expect((await patch({ abilities: c.abilities, [c.field]: { name: 'Companion', ...c.patch }, ...c.special })).error).toBeNull()
    const resource = made.data.data.resources[0]
    expect((await patch({ resources: [{ ...resource, used: 2 }] })).error).toBeNull()
    for (const invalid of [...c.invalid, { abilities: [] }, { [c.field]: null }, { [c.field]: { forged: true } }, { resources: [{ ...resource, capacity: 3 }] }, { abilities: ['Hound’s Instincts'] }, { sheet: { abilities: [] } }]) expect((await patch(invalid)).error, JSON.stringify(invalid)).not.toBeNull()
    for (const who of [observer, outsider]) expect((await patch({ [c.field]: { name: 'Forged' } }, who)).error).not.toBeNull()
    for (const result of await Promise.all([patch({ [c.field]: { origin: 'Built together' }, xp: { insight: 2 }, harm: { passing: ['Bruised', ''] } }), patch({ [c.field]: { notes: 'GM accepted outcome' }, xp: { prowess: 3 }, armor: { notes: 'Armor preserved' } }, gm)])) expect(result.error).toBeNull()
    const saved = (await observer.from('characters').select('data').eq('id', id).single()).data!.data
    expect(saved).toMatchObject({ [c.field]: { ...c.patch, name: 'Companion', origin: 'Built together', notes: 'GM accepted outcome' }, ...c.special, xp: { insight: 2, prowess: 3 }, harm: { passing: ['Bruised', ''] }, armor: { notes: 'Armor preserved' } })
    expect((await owner.from('characters').update({ data: saved }).eq('id', id)).error).not.toBeNull()
    expect((await outsider.from('characters').select('id').eq('id', id)).data).toEqual([])
    expect((await outsider.rpc('create_character', { p_campaign: campaign, p_name: 'Forged', p_playbook: c.name })).error).not.toBeNull()
    const ownerId = (await owner.auth.getUser()).data.user!.id
    const observerId = (await observer.auth.getUser()).data.user!.id
    expect((await gm.rpc('assign_character_owner', { p_character: id, p_owner: observerId, p_expected_owner: ownerId })).error).toBeNull()
    expect((await patch({ [c.field]: { notes: 'Old owner write' } })).error).not.toBeNull()
    expect((await patch({ [c.field]: { notes: 'Current owner accepted' } }, observer)).error).toBeNull()
    expect((await patch({ [c.field]: { origin: 'GM after transfer' } }, gm)).error).toBeNull()

  }
  const hound = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Hound' })).data.id
  expect((await owner.rpc('patch_character', { p_character: hound, p_patch: { sparkmind: { name: 'Forged' } } })).error).not.toBeNull()
  // The generic merge seam must preserve earlier nested shapes as well as new companion ones.
  const operative = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Operative', p_playbook: 'Operative' })).data.id
  for (const result of await Promise.all([owner.rpc('patch_character', { p_character: operative, p_patch: { operative: { coverIdentity: 'Grey' }, wealth: { stacks: 2 } } }), gm.rpc('patch_character', { p_character: operative, p_patch: { operative: { operations: 'Still covered' }, wealth: { bank: 4 } } })])) expect(result.error).toBeNull()
  expect((await owner.from('characters').select('data').eq('id', operative).single()).data!.data).toMatchObject({ operative: { coverIdentity: 'Grey', operations: 'Still covered' }, wealth: { stacks: 2, bank: 4 } })
})

for (const playbook of ['Intellectual', 'Paranormalist', 'Swinger']) test(`${playbook} distinct companion drafts retry, synchronize and reload on desktop and mobile`, async ({ browser }) => {
  test.setTimeout(60000)
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, owner, observer] = await Promise.all(contexts.map(c => c.newPage()))
  await gm.goto('/'); await gm.getByLabel('Campaign name').fill(`${playbook} companions`)
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await gm.getByLabel('Player invitation').inputValue()
  for (const p of [owner, observer]) {
    await p.goto('/'); await p.getByLabel('Invitation', { exact: true }).fill(invitation)
    await p.getByRole('button', { name: 'Join campaign', exact: true }).click()
  }
  await owner.getByLabel('New character name').fill('Morgan')
  await owner.getByLabel('Playbook', { exact: true }).selectOption(playbook)
  await owner.getByRole('button', { name: `Create ${playbook}`, exact: true }).click()
  for (const p of [gm, observer]) await p.getByRole('button', { name: 'Open Morgan', exact: true }).click()
  await expect(owner.getByRole('region', { name: 'Loyal clever pet' })).toHaveCount(0)
  await expect(owner.getByRole('article', { name: 'Morgan dossier' })).not.toContainText('Hound starts')
  const abilities = playbook === 'Intellectual' ? ['Researcher', 'Advanced Sparkmind'] : playbook === 'Paranormalist' ? ['Extrasensory Perception', 'Precognition', 'Echo Projection'] : ['Smooth', 'Echo Twin', 'Always Hustling', 'Party Animal']
  for (const ability of abilities) { await owner.getByLabel(ability, { exact: true }).click(); await expect(owner.getByLabel(ability, { exact: true })).toBeChecked() }
  if (playbook === 'Intellectual') {
    await owner.getByLabel('Fields of study', { exact: true }).fill('Spark-Craft and philosophy')
    await owner.getByLabel('Sparkmind Research', { exact: true }).check()
    await owner.getByLabel('Advanced Sparkmind choice 1', { exact: true }).selectOption('additional-type')
    await owner.getByLabel('Advanced Sparkmind choice 2', { exact: true }).selectOption('remove-flaw')
    await owner.getByLabel('Sparkmind Ingress', { exact: true }).check()
    await owner.getByLabel('Sparkmind housing', { exact: true }).selectOption('Large')
  } else if (playbook === 'Paranormalist') {
    await owner.getByLabel('Entity form', { exact: true }).fill('Mirror shards')
    await owner.getByLabel('Entity abilities', { exact: true }).fill('Fetch tools')
    await owner.getByLabel('Entity Armor', { exact: true }).check()
    await owner.getByLabel('Precognition assists used', { exact: true }).fill('2')
    await owner.getByLabel('Echo Projection selections', { exact: true }).selectOption('2')
    await owner.getByLabel('Echo Projection active', { exact: true }).check()
  } else {
    await owner.getByLabel('Autopod type', { exact: true }).selectOption('Surprising')
    await owner.getByLabel('Autopod style', { exact: true }).fill('Velvet chrome')
    await owner.getByLabel('Side hustle', { exact: true }).fill('Fashion advice')
    await owner.getByLabel('Hustle extra activity granted', { exact: true }).check()
    await owner.getByLabel('Party assist available', { exact: true }).check()
    await owner.getByLabel('Echo Twin summoned', { exact: true }).check()
    for (const feature of ['scene', 'solid', 'obedient']) await owner.getByLabel(`Twin ${feature}`, { exact: true }).check()
  }
  for (const action of ['Hunt', 'Survey']) { await owner.getByLabel(`${action} rating`, { exact: true }).selectOption('2'); await expect(owner.getByLabel(`${action} rating`, { exact: true })).toHaveValue('2') }
  await owner.getByLabel('Companion name', { exact: true }).fill('Orbit')
  await owner.getByLabel('Companion edges', { exact: true }).fill('Independent')
  await owner.getByLabel('Companion impaired', { exact: true }).check()
  await expect(observer.getByLabel('Companion name', { exact: true })).toHaveValue('')
  await expect(observer.getByLabel('Companion name', { exact: true })).toBeDisabled()
  await owner.getByRole('button', { name: 'Review companion records', exact: true }).click()
  await expect(owner.getByRole('region', { name: 'Review companion records', exact: true })).toContainText('Orbit')
  await contexts[1].setOffline(true)
  await owner.getByRole('button', { name: 'Confirm companion records', exact: true }).click()
  await expect(owner.getByRole('alert').filter({ hasText: 'Companion records were not saved' })).toBeVisible()
  await expect(owner.getByLabel('Companion name', { exact: true })).toHaveValue('Orbit')
  await gm.getByLabel('Companion notes', { exact: true }).fill('GM separate outcome')
  await gm.getByRole('button', { name: 'Review companion records', exact: true }).click()
  await gm.getByRole('button', { name: 'Confirm companion records', exact: true }).click()
  await expect(observer.getByLabel('Companion notes', { exact: true })).toHaveValue('GM separate outcome')
  await contexts[1].setOffline(false)
  await owner.getByRole('button', { name: 'Retry companion records', exact: true }).click()
  await expect(observer.getByLabel('Companion name', { exact: true })).toHaveValue('Orbit')
  await expect(owner.getByLabel('Companion notes', { exact: true })).toHaveValue('GM separate outcome')
  await owner.getByLabel('Resource 1 used', { exact: true }).fill('2')
  const item = playbook === 'Intellectual' ? 'Experimental laser cannon' : playbook === 'Paranormalist' ? 'Fine echo containment unit' : 'Fine clothes & jewelry'
  const load = playbook === 'Intellectual' ? 2 : playbook === 'Paranormalist' ? 1 : 0
  await owner.getByText(`${item} · ${load} load × 1`, { exact: true }).click()
  await owner.getByLabel(`Item ${item} carried`, { exact: true }).check()
  await owner.getByRole('button', { name: 'Review equipment and advancement', exact: true }).click()
  await owner.getByRole('button', { name: 'Confirm equipment and advancement', exact: true }).click()
  await expect(observer.getByLabel('Resource 1 used', { exact: true })).toHaveValue('2')
  await owner.reload(); await owner.getByRole('button', { name: 'Open Morgan', exact: true }).click()
  for (const action of ['Hunt', 'Survey']) await expect(owner.getByLabel(`${action} rating`, { exact: true })).toHaveValue('2')
  await expect(owner.getByLabel('Companion name', { exact: true })).toHaveValue('Orbit')
  await expect(owner.getByLabel('Companion impaired', { exact: true })).toBeChecked()
  await expect(owner.getByLabel('Resource 1 used', { exact: true })).toHaveValue('2')
  await expect(owner.getByText(`${item} · ${load} load × 1 · carried`, { exact: true })).toBeVisible()
  if (playbook === 'Intellectual') { await expect(owner.getByLabel('Sparkmind Ingress', { exact: true })).toBeChecked(); await expect(owner.getByLabel('Advanced Sparkmind choice 2', { exact: true })).toHaveValue('remove-flaw'); await expect(owner.getByLabel('Sparkmind housing', { exact: true })).toHaveValue('Large') }
  if (playbook === 'Paranormalist') { await expect(owner.getByLabel('Echo Projection selections', { exact: true })).toHaveValue('2'); await expect(owner.getByLabel('Entity Armor', { exact: true })).toBeChecked() }
  if (playbook === 'Swinger') { await expect(owner.getByLabel('Twin obedient', { exact: true })).toBeChecked(); await expect(owner.getByLabel('Autopod style', { exact: true })).toHaveValue('Velvet chrome') }
  await owner.getByRole('region', { name: 'Companion records', exact: true }).screenshot({ path: `test-results/${playbook.toLowerCase()}-desktop.png` })
  await owner.setViewportSize({ width: 390, height: 844 })
  expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await owner.getByRole('region', { name: 'Companion records', exact: true }).screenshot({ path: `test-results/${playbook.toLowerCase()}-mobile.png` })
  await Promise.all(contexts.map(c => c.close()))
})

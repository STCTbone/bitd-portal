import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local Supabase required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
const books = ['Ghost/Echo', 'Vampire', 'Time Traveler from the Future', 'Time Traveler from the Past']

test('only current campaign GM controls paranormal creation; stale clients and disabled choices are denied without stranding dossiers', async () => {
  const [gm, owner, observer, outsider] = [client(), client(), client(), client()]
  for (const c of [gm, owner, observer, outsider]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Paranormal permissions' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, observer]) await c.rpc('join_campaign', { p_invitation: invite })
  const other = (await outsider.rpc('create_campaign', { p_name: 'Elsewhere' })).data.id
  for (const p_playbook of ['Hound', 'Hull', 'Intellectual', 'Operative', 'Paranormalist', 'Radical', 'Swinger', 'Veteran']) expect((await owner.rpc('create_character', { p_campaign: campaign, p_name: p_playbook, p_playbook })).error).toBeNull()
  expect((await owner.from('paranormal_playbook_availability').insert({ campaign_id: campaign, playbook: 'Ghost/Echo', enabled: true })).error).not.toBeNull()
  expect((await owner.from('paranormal_playbook_availability').select('*')).error).not.toBeNull()
  const availability = () => owner.rpc('get_campaign_playbooks', { p_campaign: campaign })
  const initial = await availability(); expect(initial.error).toBeNull()
  expect(initial.data.filter((p: { enabled: boolean }) => p.enabled)).toHaveLength(8)
  for (const p_playbook of books) {
    expect((await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Denied', p_playbook })).error).not.toBeNull()
    for (const c of [owner, observer, outsider]) expect((await c.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: true })).error).not.toBeNull()
    await owner.auth.updateUser({ data: { role: 'gm' } })
    expect((await owner.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: true })).error).not.toBeNull()
    expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: true })).error).toBeNull()
    const made = await owner.rpc('create_character', { p_campaign: campaign, p_name: p_playbook, p_playbook }); expect(made.error).toBeNull()
    expect((await outsider.rpc('create_character', { p_campaign: campaign, p_name: 'Forged', p_playbook })).error).not.toBeNull()
    expect((await outsider.rpc('create_character', { p_campaign: other, p_name: 'Other campaign disabled', p_playbook })).error).not.toBeNull()
    expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: false })).error).toBeNull()
    expect((await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Stale choice', p_playbook })).error).not.toBeNull()
    expect((await owner.rpc('patch_character', { p_character: made.data.id, p_patch: { notes: 'Still editable after disabled' } })).error).toBeNull()
    expect((await observer.rpc('patch_character', { p_character: made.data.id, p_patch: { notes: 'Forged owner' } })).error).not.toBeNull()
    expect((await observer.from('characters').select('data').eq('id', made.data.id).single()).data!.data.notes).toBe('Still editable after disabled')
  }
  expect((await outsider.rpc('get_campaign_playbooks', { p_campaign: campaign })).error).not.toBeNull()
  expect((await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook: 'Hound', p_enabled: false })).error).not.toBeNull()
})

test('four native paranormal sheets persist distinct records and reject invalid final state under current ownership', async () => {
  const gm = client(), owner = client(), observer = client(), outsider = client()
  for (const c of [gm, owner, observer, outsider]) await c.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Four forms' })).data.id
  const invite = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.player
  for (const c of [owner, observer]) await c.rpc('join_campaign', { p_invitation: invite })
  const ids: string[] = []
  for (const p_playbook of books) {
    await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: true })
    const made = await owner.rpc('create_character', { p_campaign: campaign, p_name: p_playbook, p_playbook }); expect(made.error).toBeNull()
    const d = made.data.data, id = made.data.id; ids.push(id)
    const patch = (p_patch: unknown, who = owner) => who.rpc('patch_character', { p_character: id, p_patch })
    if (p_playbook === 'Ghost/Echo') {
      expect(d).toMatchObject({ abilities: ['Resonance Echo'], stressCapacity: 9, actions: { hunt: 1, prowl: 1, attune: 1 }, equipment: [], ghost: { retainedEcho: [] } })
      expect((await patch({ abilities: ['Resonance Echo', 'Dissipate'], ghost: { needNotes: 'Awaiting Possess advance', transformation: 'Previous Survey 2 retained by table decision', retainedEcho: [{ name: 'Echo Walker', source: 'Operative v6', notes: 'Kept after death' }, { name: 'Echo Chamber', source: 'Radical v6 · book p.67', notes: 'Retained poetic resonance' }] }, stress: 9, deadlocks: [{ name: 'Chaotic', formerKey: 'Curious', notes: '' }], equipment: [{ name: 'Iconic coat in ghost form', load: 0, quantity: 1, uses: 0, carried: true, source: 'Retained iconic item · book p.335', notes: 'Nonphysical' }] })).error).toBeNull()
      for (const p of [{ abilities: [] }, { ghost: { retainedEcho: [{ name: 'Fixer', source: 'Hound v6', notes: '' }] } }, { ghost: { retainedEcho: [{ name: 'Echo Walker', source: '\u00a0', notes: '' }] } }, { deadlocks: [{ name: 'Brutal', notes: '', formerKey: '' }] }, { vampire: { feeding: 'Wrong model' } }, { stress: 10 }]) expect((await patch(p)).error, JSON.stringify(p)).not.toBeNull()
    } else if (p_playbook === 'Vampire') {
      expect(d).toMatchObject({ abilities: ['Vampire'], stressCapacity: 12, vampire: { strictures: ['Dayfire'], darkMajesty: '' }, sheet: { playbookXp: 10, attributeXp: 8 } })
      expect(d.deadlocks).toHaveLength(4); expect(d.vampire.darkServants).toHaveLength(2)
      expect(d.equipment.find((i: { name: string }) => i.name === 'Vial of rare & exotic drug')).toMatchObject({ quantity: 2, load: 0 })
      expect((await patch({ actions: { hunt: 5 } })).error).not.toBeNull()
      expect((await patch({ abilities: ['Vampire', 'Dark Majesty'], vampire: { darkMajesty: 'Insight', feeding: 'Leaves silver veins', darkServants: [{ name: 'Blackwood', relationship: 'Chauffeur', notes: '' }, { name: 'Sable', relationship: 'Model', notes: '' }] }, actions: { hunt: 5 }, stress: 12, xp: { playbook: 10, insight: 8 } })).error).toBeNull()
      for (const p of [{ actions: { prowl: 5 } }, { vampire: { darkMajesty: 'Prowess' } }, { abilities: ['Vampire'] }, { vampire: { resistanceBonus: 99 } }, { vampire: { strictures: [] } }, { vampire: { darkServants: [] } }, { deadlocks: [] }, { keys: [{ name: 'Human Key', hits: 0 }] }, { stress: 13 }, { xp: { insight: 9 } }]) expect((await patch(p)).error, JSON.stringify(p)).not.toBeNull()
      expect((await patch({ actions: { hunt: 4 }, vampire: { darkMajesty: '' }, abilities: ['Vampire'] })).error).toBeNull()
    } else {
      const past = p_playbook.endsWith('Past')
      expect(d).toMatchObject({ abilities: [past ? 'Haunted by the Past' : 'Future Shock'], stressCapacity: 9, traveler: { alluvium: 4, mission: '' } })
      expect(d.traveler.details).toHaveLength(4)
      expect(Object.values(d.actions).reduce((sum: number, n) => sum + Number(n), 0)).toBe(0)
      expect(d.equipment[0]).toMatchObject({ name: past ? 'Fine shadow cloak' : 'Powerful mechanical limb', load: past ? 1 : 0 })
      expect((await patch({ abilities: [past ? 'Haunted by the Past' : 'Future Shock', past ? 'Shadow Walk' : 'Quantum Displacement'], traveler: { alluvium: 8, mission: past ? 'Find a Solution and Take It Back' : 'Prevent a Terrible Future', origin: 'A muddled arrival', details: [{ revealed: true, text: 'The city needs this crew' }, { revealed: false, text: '' }, { revealed: false, text: '' }, { revealed: false, text: '' }], gainedAbilities: [{ name: past ? 'Ghost Mind' : 'Double Agent', trait: past ? 'Shadow Walk' : 'Quantum Displacement', source: past ? 'Original Blades in the Dark · Whisper' : 'Operative v6', notes: 'Table advance' }] }, deadlocks: [{ name: 'Time Skips', formerKey: 'Curious', notes: '' }], stress: 9, actions: { hunt: 3, survey: 3, prowl: 3 } })).error).toBeNull()
      for (const p of [{ traveler: { alluvium: 9 } }, { traveler: { mission: past ? 'Prevent a Terrible Future' : 'Find a Solution and Take It Back' } }, { traveler: { details: [] } }, { traveler: { gainedAbilities: [{ name: 'Double Agent', trait: past ? 'Shadow Walk' : 'Quantum Displacement', source: '\t\u00a0', notes: '' }] } }, { deadlocks: [{ name: 'Detached', formerKey: '', notes: '' }] }, { abilities: [] }, { ghost: { needNotes: 'Wrong model' } }]) expect((await patch(p)).error, JSON.stringify(p)).not.toBeNull()
    }
    const ownKey = p_playbook === 'Ghost/Echo' ? 'ghost' : p_playbook === 'Vampire' ? 'vampire' : 'traveler'
    for (const p of [{ [ownKey]: null }, { [ownKey]: { forged: true } }, { [ownKey]: { operations: 1 } }, { playbook: 'Hound' }, { sheet: { actionMax: 99 } }]) expect((await patch(p)).error).not.toBeNull()
    for (const who of [observer, outsider]) expect((await patch({ [ownKey]: { operations: 'Forged' } }, who)).error).not.toBeNull()
    for (const result of await Promise.all([patch({ [ownKey]: { operations: 'Owner manual outcome' }, xp: { prowess: 2 } }), patch({ [ownKey]: { [ownKey === 'ghost' ? 'transformation' : ownKey === 'vampire' ? 'transformation' : 'itemDecisions']: 'GM table decision' }, xp: { resolve: 3 } }, gm)])) expect(result.error).toBeNull()
    const saved = (await observer.from('characters').select('data').eq('id', id).single()).data!.data
    expect(saved).toMatchObject({ [ownKey]: { operations: 'Owner manual outcome' }, xp: { prowess: 2, resolve: 3 } })
    expect((await owner.from('characters').update({ data: saved }).eq('id', id)).error).not.toBeNull()
    expect((await outsider.from('characters').select('id').eq('id', id)).data).toEqual([])
    const oldOwner = (await owner.auth.getUser()).data.user!.id, newOwner = (await observer.auth.getUser()).data.user!.id
    expect((await gm.rpc('assign_character_owner', { p_character: id, p_owner: newOwner, p_expected_owner: oldOwner })).error).toBeNull()
    expect((await patch({ [ownKey]: { operations: 'Former owner' } })).error).not.toBeNull()
    expect((await patch({ [ownKey]: { operations: 'Current owner' } }, observer)).error).toBeNull()
  }
  const standard = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'Standard', p_playbook: 'Hound' })).data.id
  for (const p_patch of [{ ghost: { needNotes: 'Foreign' } }, { traveler: { alluvium: 4 } }, { vampire: { feeding: 'Foreign' } }, { abilities: ['Versatile'], versatile: [{ name: 'Resonance Echo', source: 'Ghost/Echo v6', notes: '' }] }]) expect((await owner.rpc('patch_character', { p_character: standard, p_patch })).error).not.toBeNull()
  const hull = (await owner.rpc('create_character', { p_campaign: campaign, p_name: 'No trait borrowing', p_playbook: 'Hull' })).data
  const memories = hull.data.hull.memories.map((m: object, i: number) => i ? m : { ...m, progress: 8, ability: 'Resonance Echo', source: 'Ghost/Echo v6 · a trait, not a special ability' })
  expect((await owner.rpc('patch_character', { p_character: hull.id, p_patch: { hull: { memories } } })).error).not.toBeNull()
  expect(ids).toHaveLength(4)
})

for (const playbook of books) test(`${playbook} owner edits native records, retries an offline draft, reloads and follows GM availability on mobile`, async ({ browser }) => {
  test.setTimeout(60000)
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [gm, owner, observer] = await Promise.all(contexts.map(c => c.newPage()))
  await gm.goto('/'); await gm.getByLabel('Campaign name').fill(`Paranormal ${playbook}`)
  await gm.getByRole('button', { name: 'Create campaign', exact: true }).click().then(() => gm.getByRole('tab', { name: 'Characters', exact: true }).click())
  const invite = await gm.getByLabel('Player invitation').inputValue()
  for (const p of [owner, observer]) { await p.goto('/'); await p.getByLabel('Invitation', { exact: true }).fill(invite); await p.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => p.getByRole('tab', { name: 'Characters', exact: true }).click()) }
  await expect(owner.getByRole('option', { name: playbook, exact: true })).toHaveCount(0)
  await expect(owner.getByLabel(`Allow ${playbook}`, { exact: true })).toHaveCount(0)
  await gm.getByLabel(`Allow ${playbook}`, { exact: true }).check()
  await gm.getByRole('button', { name: 'Review paranormal availability', exact: true }).click()
  await gm.getByRole('button', { name: 'Confirm paranormal availability', exact: true }).click()
  await expect(owner.getByRole('option', { name: playbook, exact: true })).toHaveCount(1)
  await owner.getByRole('tab', { name: 'Characters', exact: true }).click()
  await owner.getByLabel('New character name').fill('Anomaly')
  await owner.getByLabel('Playbook', { exact: true }).selectOption(playbook)
  await owner.getByRole('button', { name: `Create ${playbook}`, exact: true }).click()
  for (const p of [gm, observer]) await p.getByRole('button', { name: 'Open Anomaly', exact: true }).click()
  const ghost = playbook === 'Ghost/Echo', vampire = playbook === 'Vampire', past = playbook.endsWith('Past')
  const field = ghost ? 'Resonance need and feeding' : vampire ? 'Feeding method and telltale signs' : 'Temporal origin and history'
  const fixed = ghost ? 'Resonance Echo' : vampire ? 'Vampire' : past ? 'Haunted by the Past' : 'Future Shock'
  await expect(owner.getByLabel(fixed, { exact: true })).toBeChecked()
  await expect(owner.getByLabel(fixed, { exact: true })).toBeDisabled()
  await expect(observer.getByLabel(field, { exact: true })).toBeDisabled()
  await owner.getByLabel(field, { exact: true }).fill('Source-guided player decision')
  if (ghost) {
    await owner.getByLabel('Transformation decisions', { exact: true }).fill('Iconic nonphysical coat retained')
    await owner.getByLabel('Dissipate', { exact: true }).click(); await expect(owner.getByLabel('Dissipate', { exact: true })).toBeChecked()
  } else if (vampire) {
    await owner.getByLabel('Dark Majesty', { exact: true }).click(); await expect(owner.getByLabel('Dark Majesty', { exact: true })).toBeChecked()
    await expect(owner.getByLabel('Dark Majesty attribute', { exact: true })).toBeVisible()
    await owner.getByLabel('Dark Majesty attribute', { exact: true }).selectOption('Insight')
    await owner.getByLabel('Dark Servant 1 name', { exact: true }).fill('Blackwood')
    await owner.getByLabel('Dark Servant 2 name', { exact: true }).fill('Sable')
  } else {
    await owner.getByLabel('Alluvium remaining', { exact: true }).selectOption('3')
    await owner.getByLabel('Temporal mission', { exact: true }).selectOption(past ? 'Find a Solution and Take It Back' : 'Prevent a Terrible Future')
    await owner.getByLabel('Mission detail 1 revealed', { exact: true }).check()
    await owner.getByLabel('Mission detail 1', { exact: true }).fill('The crew is essential')
    if (!past) {
      await owner.getByLabel('Quantum Displacement', { exact: true }).click(); await expect(owner.getByLabel('Quantum Displacement', { exact: true })).toBeChecked()
      await owner.getByRole('button', { name: 'Add gained ability', exact: true }).click()
      await owner.getByLabel('Gained ability 1 name', { exact: true }).fill('Double Agent')
      await owner.getByLabel('Gained ability 1 paired trait', { exact: true }).selectOption('Quantum Displacement')
      await owner.getByLabel('Gained ability 1 source', { exact: true }).fill('Operative v6 · Future Shock advance')
      await expect(owner.getByRole('region', { name: 'Backing factions', exact: true }).getByText('0 / 1 active.', { exact: false })).toBeVisible()
    }
    for (const action of ['Hunt','Survey','Prowl']) { await owner.getByLabel(`${action} rating`, { exact: true }).selectOption('3'); await expect(owner.getByLabel(`${action} rating`, { exact: true })).toHaveValue('3') }
  }
  await expect(observer.getByLabel(field, { exact: true })).toHaveValue('')
  await owner.getByRole('button', { name: 'Review paranormal records', exact: true }).click()
  await contexts[1].setOffline(true)
  await owner.getByRole('button', { name: 'Confirm paranormal records', exact: true }).click()
  await expect(owner.getByRole('alert').filter({ hasText: 'Paranormal records were not saved' })).toBeVisible()
  await expect(owner.getByLabel(field, { exact: true })).toHaveValue('Source-guided player decision')
  await gm.getByLabel('Paranormal operations and outcomes', { exact: true }).fill('GM agreed outcome')
  await gm.getByRole('button', { name: 'Review paranormal records', exact: true }).click()
  await gm.getByRole('button', { name: 'Confirm paranormal records', exact: true }).click()
  await expect(observer.getByLabel('Paranormal operations and outcomes', { exact: true })).toHaveValue('GM agreed outcome')
  await contexts[1].setOffline(false)
  await owner.getByRole('button', { name: 'Retry paranormal records', exact: true }).click()
  await expect(observer.getByLabel(field, { exact: true })).toHaveValue('Source-guided player decision')
  await expect(owner.getByLabel('Paranormal operations and outcomes', { exact: true })).toHaveValue('GM agreed outcome')
  if (playbook.endsWith('Future')) await expect(owner.getByRole('region', { name: 'Backing factions', exact: true }).getByText('0 / 2 active.', { exact: false })).toBeVisible()
  if (vampire) {
    await expect(owner.getByText('Insight resistance bonus: +1 (separate from action dots).', { exact: true })).toBeVisible()
    await owner.getByLabel('Hunt rating', { exact: true }).selectOption('5')
    await expect(observer.getByLabel('Hunt rating', { exact: true })).toHaveValue('5')
    await expect(owner.getByRole('option', { name: '5 · ●●●●●', exact: true }).first()).toBeAttached()
  }
  const resource = ghost ? 'Drain' : vampire ? 'Stress' : 'Instability'
  await owner.getByLabel(`${resource} marked`, { exact: true }).selectOption(vampire ? '12' : '9')
  if (!vampire) { const label = ghost ? 'Echo irregularity' : 'Temporal glitch'; await owner.getByRole('button', { name: `Add ${label.toLowerCase()}`, exact: true }).click(); await owner.getByLabel(`${label} 1 name`, { exact: true }).selectOption(ghost ? 'Chaotic' : 'Time Skips') }
  await owner.getByRole('button', { name: 'Review condition changes', exact: true }).click()
  await owner.getByRole('button', { name: 'Confirm condition changes', exact: true }).click()
  await expect(observer.getByLabel(`${resource} marked`, { exact: true })).toHaveValue(vampire ? '12' : '9')
  await gm.getByLabel(`Allow ${playbook}`, { exact: true }).uncheck()
  await gm.getByRole('button', { name: 'Review paranormal availability', exact: true }).click()
  await gm.getByRole('button', { name: 'Confirm paranormal availability', exact: true }).click()
  await expect(owner.getByText('Unavailable for new characters. This existing dossier remains readable and editable.', { exact: true })).toBeVisible()
  await owner.getByLabel(field, { exact: true }).fill('Still permitted after disable')
  await owner.getByRole('button', { name: 'Review paranormal records', exact: true }).click()
  await owner.getByRole('button', { name: 'Confirm paranormal records', exact: true }).click()
  await expect(observer.getByLabel(field, { exact: true })).toHaveValue('Still permitted after disable')
  await owner.reload(); await owner.getByRole('button', { name: 'Open Anomaly', exact: true }).click()
  await expect(owner.getByLabel(field, { exact: true })).toHaveValue('Still permitted after disable')
  await expect(owner.getByLabel(`${resource} marked`, { exact: true })).toHaveValue(vampire ? '12' : '9')
  if (ghost) await expect(owner.getByRole('region', { name: 'Paranormal records', exact: true }).getByText('You cannot turn Keys.', { exact: false })).toBeVisible()
  if (!ghost && !vampire) { await expect(owner.getByLabel('Alluvium remaining', { exact: true })).toHaveValue('3'); await expect(owner.getByLabel('Mission detail 1', { exact: true })).toHaveValue('The crew is essential') }
  for (const region of ['Paranormal records', 'Condition records']) await owner.getByRole('region', { name: region, exact: true }).screenshot({ path: `test-results/${playbook.replaceAll('/','-').replaceAll(' ','-')}-${region.split(' ')[0]}-desktop.png` })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expect(owner.locator('body')).toHaveJSProperty('scrollWidth', 390)
  for (const region of ['Paranormal records', 'Condition records']) await owner.getByRole('region', { name: region, exact: true }).screenshot({ path: `test-results/${playbook.replaceAll('/','-').replaceAll(' ','-')}-${region.split(' ')[0]}-mobile.png` })
  for (const c of contexts) await c.close()
})

test('only source-qualified Future Shock advancement grants verified human effects; Past records cannot grant by name collision', async () => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Temporal grants' })).data.id
  for (const p_playbook of books.slice(2)) {
    await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: true })
    const made = await gm.rpc('create_character', { p_campaign: campaign, p_name: p_playbook, p_playbook }); expect(made.error).toBeNull()
    const id = made.data.id, past = p_playbook.endsWith('Past'), trait = past ? 'Shadow Walk' : 'Quantum Displacement'
    const grant = { name: 'Get Back In There', source: past ? 'Original Blades name collision · manual record' : 'Veteran v6 · Future Shock advance', trait, notes: 'Explicit table choice' }
    const patch = (p_patch: unknown) => gm.rpc('patch_character', { p_character: id, p_patch })
    expect((await patch({ abilities: [past ? 'Haunted by the Past' : 'Future Shock', trait], traveler: { gainedAbilities: [grant] } })).error).toBeNull()
    if (past) {
      expect((await patch({ healing: { permanent: 1 } })).error).not.toBeNull()
    } else {
      expect((await patch({ healing: { permanent: 1 } })).error).toBeNull()
      for (const p of [{ traveler: { gainedAbilities: [] } }, { abilities: ['Future Shock'] }, { traveler: { gainedAbilities: [{ ...grant, source: '\u00a0\u2003\t' }] } }, { traveler: { gainedAbilities: [{ ...grant, trait: 'Psionics' }] } }]) expect((await patch(p)).error).not.toBeNull()
      expect((await patch({ healing: { permanent: 0 }, traveler: { gainedAbilities: [] }, abilities: ['Future Shock'] })).error).toBeNull()
      for (const name of ['Invented power', 'Automaton', 'Vampire', 'Resonance Echo']) expect((await patch({ abilities: ['Future Shock', trait], traveler: { gainedAbilities: [{ ...grant, name }] } })).error).not.toBeNull()
      const factions = []
      for (const p_name of ['Clockwork', 'Paxton']) factions.push((await gm.rpc('create_faction', { p_campaign: campaign, p_name })).data)
      const create = (n: number) => gm.rpc('create_backing', { p_character: id, p_faction: factions[n].id })
      expect((await create(0)).error).toBeNull()
      expect((await patch({ traveler: { operations: 'Double Agent is only a note' } })).error).toBeNull()
      expect((await create(1)).error).not.toBeNull()
      expect((await patch({ abilities: ['Future Shock', trait], traveler: { gainedAbilities: [{ ...grant, name: 'Double Agent', source: 'Operative v6 · Future Shock advance' }] } })).error).toBeNull()
      const second = await create(1); expect(second.error).toBeNull()
      expect((await patch({ traveler: { gainedAbilities: [] } })).error).not.toBeNull()
      expect((await patch({ abilities: ['Future Shock'] })).error).not.toBeNull()
      expect((await gm.rpc('patch_backing', { p_backing: second.data.id, p_patch: { active: false }, p_expected_version: second.data.version })).error).toBeNull()
      expect((await patch({ traveler: { gainedAbilities: [] }, abilities: ['Future Shock'] })).error).toBeNull()

    }
  }
})

test('Aftermath reviews canonical paranormal resources, rejects capacity overflow and labels the shared receipt correctly', async ({ browser }) => {
  const gm = client(); await gm.auth.signInAnonymously()
  const campaign = (await gm.rpc('create_campaign', { p_name: 'Paranormal Aftermath' })).data.id
  const invites = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data
  const characters = []
  for (const p_playbook of books) {
    await gm.rpc('set_paranormal_playbook', { p_campaign: campaign, p_playbook, p_enabled: true })
    characters.push((await gm.rpc('create_character', { p_campaign: campaign, p_name: p_playbook, p_playbook })).data)
  }
  const opportunity = (await gm.rpc('create_opportunity', { p_campaign: campaign, p_data: { target: 'Anomaly', targetTier: 1 } })).data
  const selected = await gm.rpc('select_opportunity', { p_opportunity: opportunity.id, p_revision: 1, p_cycle_revision: 1 }); expect(selected.error).toBeNull()
  const score = selected.data.id
  await gm.rpc('transition_score', { p_score: score, p_status: 'active', p_revision: 1 })
  await gm.rpc('transition_score', { p_score: score, p_status: 'completed', p_revision: 2 })
  for (const c of characters) {
    const proposal = await gm.rpc('propose_aftermath', { p_score: score, p_effects: [{ kind: 'character', id: c.id, field: 'stress', expected: 0, value: c.data.stressCapacity + 1 }], p_recap: 'Invalid resource overflow', p_reason: '' }); expect(proposal.error).toBeNull()
    expect((await gm.rpc('confirm_aftermath', { p_proposal: proposal.data.id })).error).not.toBeNull()
    expect((await gm.from('characters').select('data').eq('id', c.id).single()).data!.data.stress).toBe(0)
  }
  expect((await gm.from('aftermath_receipts').select('id').eq('score_id', score)).data).toEqual([])
  const context = await browser.newContext(), page = await context.newPage()
  await page.goto('/'); await page.getByLabel('Invitation', { exact: true }).fill(invites.gm)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click().then(() => page.getByRole('tab', { name: 'Characters', exact: true }).click())
  const panel = page.getByRole('region', { name: 'Aftermath review', exact: true })
  await panel.getByLabel('Effect record type', { exact: true }).selectOption('character')
  for (const c of characters) {
    await panel.getByLabel('Effect target', { exact: true }).selectOption(c.id)
    await panel.getByLabel('Effect field', { exact: true }).selectOption({ label: c.data.playbook === 'Ghost/Echo' ? 'Drain' : c.data.playbook === 'Vampire' ? 'Stress' : 'Instability' })
    await panel.getByLabel('Proposed value', { exact: true }).fill(String(c.data.stressCapacity))
    await panel.getByRole('button', { name: 'Add reviewed effect', exact: true }).click()
  }
  await panel.getByLabel('Shared Aftermath recap', { exact: true }).fill('Four paranormal resources reviewed')
  await panel.getByRole('button', { name: 'Save proposal for review', exact: true }).click()
  await panel.getByRole('article', { name: 'Pending Aftermath proposal', exact: true }).filter({ hasText: 'Four paranormal resources reviewed' }).getByRole('button', { name: 'Confirm all reviewed changes', exact: true }).click()
  const receipt = panel.getByRole('article', { name: 'Aftermath receipt', exact: true })
  for (const label of ['Drain: 0 → 9','Stress: 0 → 12','Instability: 0 → 9']) await expect(receipt).toContainText(label)
  for (const c of characters) expect((await gm.from('characters').select('data').eq('id', c.id).single()).data!.data.stress).toBe(c.data.stressCapacity)
  await context.close()
})

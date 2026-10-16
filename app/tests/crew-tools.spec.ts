import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url,key,{ db:{schema:'bitd'},auth:{persistSession:false,autoRefreshToken:false} })

test('GM records crew selections and a cohort, shares accepted state and recovers rejected saves', async ({ browser }) => {
  const gm = await browser.newContext(), player = await browser.newContext()
  const page = await gm.newPage(), peer = await player.newPage()
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact:true }).fill('Crew tools')
  await page.getByRole('button',{name:'Create campaign',exact:true}).click()
  const invitation = await page.getByLabel('Player invitation').inputValue()
  await page.getByLabel('Crew name',{exact:true}).fill('The Neon Owls')
  await page.getByRole('button',{name:'Create crew',exact:true}).click()
  const dossier = page.getByRole('region',{name:'Crew dossier'})
  await dossier.getByRole('button',{name:'Add crew ability',exact:true}).click()
  await dossier.getByLabel('Ability 1',{exact:true}).selectOption({label:'Field Testing'})
  await dossier.getByLabel('Ability choice 1',{exact:true}).selectOption('Healing')
  await dossier.getByRole('button',{name:'Add crew upgrade',exact:true}).click()
  await dossier.getByLabel('Upgrade 1',{exact:true}).selectOption({label:'Intriguing'})
  await dossier.getByLabel('Upgrade marks 1',{exact:true}).fill('3')
  await dossier.getByRole('checkbox',{name:'Local Supplier (1)',exact:true}).check()
  await dossier.getByRole('checkbox',{name:'Local Supplier (2)',exact:true}).check()
  await dossier.getByRole('button',{name:'Add cohort',exact:true}).click()
  await dossier.getByLabel('Cohort name 1',{exact:true}).fill('Canal runners')
  await dossier.getByLabel('Cohort types 1',{exact:true}).fill('Runners, Hustlers')
  await dossier.getByLabel('Cohort edges 1',{exact:true}).fill('Independent, Loyal')
  await dossier.getByLabel('Cohort flaws 1',{exact:true}).fill('Principled, Panicky')
  await dossier.getByLabel('Cohort Quality 1',{exact:true}).fill('2')
  await dossier.getByLabel('Cohort assignment 1',{exact:true}).fill('Watch the canal')
  await dossier.getByLabel('Cohort condition 1',{exact:true}).selectOption('impaired')
  await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click()
  await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
  await peer.goto('/')
  await peer.getByLabel('Invitation',{exact:true}).fill(invitation)
  await peer.getByRole('button',{name:'Join campaign',exact:true}).click()
  await expect(peer.getByLabel('Cohort assignment 1',{exact:true})).toHaveValue('Watch the canal')
  await expect(peer.getByLabel('Cohort name 1',{exact:true})).toBeDisabled()
  await expect(peer.getByRole('button',{name:'Add cohort',exact:true})).toHaveCount(0)
  await dossier.getByLabel('Cohort assignment 1',{exact:true}).fill('Guard the tram')
  await gm.setOffline(true)
  await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click()
  await expect(dossier.getByRole('alert')).toContainText('Crew was not saved')
  await expect(dossier.getByLabel('Cohort assignment 1',{exact:true})).toHaveValue('Guard the tram')
  await gm.setOffline(false)
  await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click()
  await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
  await expect(peer.getByLabel('Cohort assignment 1',{exact:true})).toHaveValue('Guard the tram')
  await page.reload()
  await expect(page.getByLabel('Ability choice 1',{exact:true})).toHaveValue('Healing')
  await expect(page.getByLabel('Upgrade marks 1',{exact:true})).toHaveValue('3')
  await expect(page.getByRole('checkbox',{name:'Local Supplier (2)',exact:true})).toBeChecked()
  await dossier.locator('.crew-tools').screenshot({ path: 'test-results/crew-tools-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await dossier.locator('.crew-tools').screenshot({ path: 'test-results/crew-tools-mobile.png' })
  await page.getByRole('button',{name:'Remove cohort 1',exact:true}).click()
  await page.getByRole('button',{name:'Save crew changes',exact:true}).click()
  await expect(peer.getByLabel('Cohort name 1',{exact:true})).toHaveCount(0)
  await gm.close(); await player.close()
})

test('verified catalogs allow each crew, repeatable choices and full Mastery while rejecting forged crew management', async () => {
  const gm=client(), player=client(), other=client(), coGM=client()
  for(const identity of [gm,player,other,coGM]) expect((await identity.auth.signInAnonymously()).error).toBeNull()
  const examples=[
    ['Dealers','dealers-field-testing','Healing','dealers-intriguing','dealers-claim-1'],
    ['Hit Squad','hit-squad-loopers','','hit-squad-deep','hit-squad-claim-9'],
    ['Militants','militants-mutual-aid','','militants-complicated','militants-claim-2'],
    ['Racers','racers-stunt-riders','Big Air','racers-airship','racers-claim-3'],
    ['Shadows','shadows-echo-safe-house','','shadows-multifaceted','shadows-claim-9'],
    ['Utopians','utopians-commune','','utopians-awakened','utopians-claim-13'],
  ]
  let campaign='',crewId=''
  const ability=(catalogId:string,choice='')=>({id:crypto.randomUUID(),catalogId,choice,notes:'Table reviewed'})
  for(const [type,a,choice,u,c] of examples) {
    const created=await gm.rpc('create_campaign',{p_name:'Catalog '+type}); expect(created.error).toBeNull()
    const id=created.data.id
    const crew=await gm.rpc('create_crew',{p_campaign:id,p_name:type,p_type:type});expect(crew.error).toBeNull()
    expect(crew.data.data.cohorts).toEqual([])
    const patch={abilities:[ability(a,choice)],upgrades:[{id:crypto.randomUUID(),catalogId:u,marks:1,notes:''},{id:crypto.randomUUID(),catalogId:'training-mastery',marks:4,notes:''}],claims:[{catalogId:c,notes:'Campaign detail'}]}
    const saved=await gm.rpc('update_crew',{p_campaign:id,p_patch:patch,p_expected:{abilities:[],upgrades:[],claims:[]}})
    expect(saved.error, type).toBeNull()
    expect(saved.data.data).toMatchObject({...patch,stacks:2,heat:0,tier:0,xp:0})
    if(type==='Racers') {
      const second=[...patch.abilities,ability(a,'Reverse 180')]
      expect((await gm.rpc('update_crew',{p_campaign:id,p_patch:{abilities:second},p_expected:{abilities:patch.abilities}})).error).toBeNull()
    }
    if(type==='Dealers'){campaign=id;crewId=crew.data.id}
  }
  const invites=(await gm.rpc('get_campaign_invitations',{p_campaign:campaign})).data
  expect((await player.rpc('join_campaign',{p_invitation:invites.player})).error).toBeNull()
  expect((await coGM.rpc('join_campaign',{p_invitation:invites.gm})).error).toBeNull()
  const cohort={id:crypto.randomUUID(),name:'Canal runners',kind:'gang',types:'Runners, Hustlers',edges:'Loyal',flaws:'Principled',quality:2,scale:1,condition:'weakened',armor:'available',assignment:'Scout canal',notes:''}
  const patch={cohorts:[cohort]}
  for(const identity of [player,other]) {
    expect((await identity.rpc('update_crew',{p_campaign:campaign,p_patch:patch,p_expected:{cohorts:[]}})).error?.code).toBe('42501')
  }
  for(const identity of [gm,player,other]) {
    expect((await identity.from('crews').update({data:patch}).eq('id',crewId)).error).not.toBeNull()
    expect((await identity.from('crews').delete().eq('id',crewId)).error).not.toBeNull()
  }
  const updates=await Promise.all([
    gm.rpc('update_crew',{p_campaign:campaign,p_patch:patch,p_expected:{cohorts:[]}}),
    coGM.rpc('update_crew',{p_campaign:campaign,p_patch:{base:'Canal station'},p_expected:{base:''}}),
  ])
  for(const update of updates)expect(update.error).toBeNull()
  expect((await coGM.rpc('update_crew',{p_campaign:campaign,p_patch:{cohorts:[]},p_expected:{cohorts:[]}})).error?.code).toBe('40001')
  const beforeInvalid = (await gm.from('crews').select('data').eq('id',crewId).single()).data!.data
  for(const invalid of [
    {cohorts:[{...cohort,owner_id:crypto.randomUUID()}]}, {cohorts:[{...cohort,condition:'unbreakable'}]},
    {cohorts:[{...cohort,quality:-1}]},{cohorts:[cohort,cohort]},{cohorts:null},
    {base:'Rejected together',cohorts:[{...cohort,armor:'heavy'}]},{cohorts:[{...cohort,scale:1.5}]},{cohorts:[{...cohort,name:''}]},
    {abilities:[ability('assassins-deadly')]},{abilities:[ability('dealers-field-testing','Dangerous')]},
    {abilities:[ability('dealers-first-rate'),ability('dealers-first-rate')]},
    {claims:[{catalogId:'shadows-claim-1',notes:''}]},{upgrades:[{id:'upgrade',catalogId:'training-mastery',marks:5,notes:''}]},
    {upgrades:[{id:'one',catalogId:'training-insight',marks:1,notes:''},{id:'two',catalogId:'training-insight',marks:1,notes:''}]},
    {type:'Shadows'},
    {campaign_id:crypto.randomUUID()}, {arbitrary:{}},
  ]) {
    const expected=Object.fromEntries(Object.keys(invalid).map(field=>[field,beforeInvalid[field]??null]))
    const rejected=await gm.rpc('update_crew',{p_campaign:campaign,p_patch:invalid,p_expected:expected})
    expect(rejected.error?.code,JSON.stringify(invalid)).toBe('P0001')
  }
  const saved=await player.from('crews').select('*').eq('id',crewId).single()
  expect(saved.data?.data).toMatchObject({cohorts:[cohort],base:'Canal station',stacks:2,heat:0,tier:0})
  expect((await other.from('crews').select('*').eq('id',crewId)).data).toEqual([])
  expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{cohorts:[]},p_expected:{cohorts:[cohort]}})).error).toBeNull()
  expect((await player.from('crews').select('*').eq('id',crewId).single()).data?.data.cohorts).toEqual([])
  const corrected=await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{type:'Shadows',abilities:[],upgrades:[],claims:[]},p_expected:{type:'Dealers',abilities:beforeInvalid.abilities,upgrades:beforeInvalid.upgrades,claims:beforeInvalid.claims}})
  expect(corrected.error).toBeNull()
  expect(corrected.data.data).toMatchObject({type:'Shadows',abilities:[],upgrades:[],claims:[],base:'Canal station',stacks:2})
  expect((await player.rpc('merge_entity',{p_table:'crews',p_id:crewId,p_campaign:campaign,p_patch:patch})).error).not.toBeNull()
  const channel=player.channel('campaign:'+campaign,{config:{private:true}})
  const status=await new Promise<string>(resolve=>channel.subscribe(state=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(state))resolve(state)}))
  expect(status).toBe('CHANNEL_ERROR')
  await player.removeAllChannels()
})

// Reviewed expected names from baseline crew sheets v6, pages 1–6. These
// literals are independent of the application's catalog and SQL seed.
const crewMenus = {
  "Dealers": {
    "abilities": [
      "First Rate",
      "On Retainer",
      "Cat and Mouse",
      "First One’s Free",
      "Field Testing",
      "Payment in Kind",
      "Benefactor",
      "Versatile"
    ],
    "upgrades": [
      "Dealer rigging",
      "Elite Hustlers",
      "Elite Muscle",
      "Intriguing"
    ],
    "claims": [
      "Local Supplier",
      "Local Supplier",
      "Smuggler",
      "Manufacturer",
      "Airship",
      "Local Fiends",
      "City-Wide",
      "Luxury Venue",
      "Key Influencer",
      "VIP Clients",
      "Branding",
      "Money Laundering",
      "Top Secret Intel",
      "Money Laundering",
      "Monopoly",
      "Turf",
      "Turf",
      "Turf",
      "Turf",
      "Turf"
    ]
  },
  "Hit Squad": {
    "abilities": [
      "Take the Shot",
      "Under the Radar",
      "Chameleons",
      "Cold Storage",
      "Benefactor",
      "Loopers",
      "Professionals",
      "Versatile"
    ],
    "upgrades": [
      "Assassin rigging",
      "Elite Infiltrators",
      "Elite Muscle",
      "Deep"
    ],
    "claims": [
      "Friendly Ink Rake",
      "Protection Racket",
      "Elusive Target",
      "Dive Bar",
      "City Records",
      "Shady Hotel",
      "Gambling Hall",
      "Turf",
      "Legendary Target",
      "Detailed Map",
      "VIP Lounge",
      "Double Contract",
      "Cover Operation",
      "Dispensary",
      "Turf",
      "Cover Identities",
      "Hagfish Farm",
      "Informants",
      "Clock the Routine"
    ]
  },
  "Militants": {
    "abilities": [
      "On the Side of the Oppressed",
      "Absolute Commitment",
      "Benefactor",
      "Revolutionaries",
      "Sympathizers",
      "Mutual Aid",
      "Guerrillas",
      "Versatile"
    ],
    "upgrades": [
      "Militant rigging",
      "Elite Runners",
      "Elite Muscle",
      "Complicated"
    ],
    "claims": [
      "Secret Caches",
      "Catalyst Action",
      "Informants",
      "Covert Funding",
      "Popular Support",
      "Turf",
      "Grassroot Support",
      "Turf",
      "Critical Strike",
      "Key Conspirator",
      "Donations",
      "Expropriation",
      "Turf",
      "Dispensary",
      "Turf",
      "Hostel",
      "“Interview Room”",
      "Social Clubs",
      "Meeting Hall"
    ]
  },
  "Racers": {
    "abilities": [
      "The Family Takes a Cut",
      "Bring Them In",
      "Speed Demons",
      "Stunt Riders",
      "Custom Ride",
      "Escape Velocity",
      "Versatile"
    ],
    "upgrades": [
      "Racer rigging",
      "Elite Runners",
      "Airship",
      "Complicated"
    ],
    "claims": [
      "Weird Old Gate",
      "Secret Routes",
      "Big Street Race",
      "Turf",
      "Weird Old Maps",
      "Turf",
      "Lounge Bar",
      "Loyal Fence",
      "Deathlands Race",
      "Turf",
      "Turf",
      "Secret Hit",
      "Chop Shop",
      "Informants",
      "Convoy",
      "Gambling Den",
      "Warehouse",
      "Cover Operation",
      "Bets Placed"
    ]
  },
  "Shadows": {
    "abilities": [
      "Echo Safe House",
      "Black Bag Operations",
      "Synchronized Watches",
      "Thieves with a Code",
      "Sleepy Time",
      "Don’t Forget the Duffel Bag",
      "Benefactor",
      "Versatile"
    ],
    "upgrades": [
      "Secret maps, and various keys and passcards",
      "Elite Infiltrators",
      "Elite Hustlers",
      "Multifaceted"
    ],
    "claims": [
      "Cover Identities",
      "Paid-Off Bluecoats",
      "Critical Move",
      "Turf",
      "Turf",
      "Interested Party",
      "High-Stakes Game",
      "Specialist Fence",
      "Checkmate",
      "Slush Fund",
      "Informants",
      "Inside Mark",
      "Cover Story",
      "Turf",
      "Covert Fixer",
      "Secret Pathways",
      "Luxury Venue",
      "Dispensary",
      "Lounge Bar"
    ]
  },
  "Utopians": {
    "abilities": [
      "Enlightened",
      "Commune",
      "Best Intentions",
      "Zeal",
      "Versatile",
      "True Believers",
      "Altered States",
      "Remember the Forgotten",
      "For the Greater Good",
      "This Is Fine",
      "Paradise Manifest",
      "We No Longer Play by Your Rules"
    ],
    "upgrades": [
      "Utopian rigging",
      "Elite Eggheads",
      "Elite Muscle",
      "Awakened"
    ],
    "claims": [
      "Turf",
      "Turf",
      "Ancient Altar",
      "Notable Skeptic",
      "Temple",
      "Reality Shift",
      "Reality Tear",
      "Luxury Retreat",
      "Natural Healer",
      "Ancient Gate",
      "Figurehead",
      "Wellness Class",
      "Donations",
      "Abandoned Lab",
      "Ancient Tomes",
      "Turf",
      "Turf",
      "Ancient Tower",
      "Interested Party"
    ]
  }
} as const

test('all six published crew menus persist every ability choice, upgrade track and printed claim space', async ({ browser }) => {
  const gm = client()
  expect((await gm.auth.signInAnonymously()).error).toBeNull()
  for (const [type, expected] of Object.entries(crewMenus)) {
    const created = await gm.rpc('create_campaign', { p_name: 'Full catalog ' + type })
    expect(created.error).toBeNull()
    const campaign = created.data.id
    expect((await gm.rpc('create_crew', { p_campaign: campaign, p_name: type, p_type: type })).error).toBeNull()
    const invitation = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.gm
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto('/')
    await page.getByLabel('Invitation', { exact: true }).fill(invitation)
    await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
    const dossier = page.getByRole('region', { name: 'Crew dossier' })
    await dossier.getByRole('button', { name: 'Add crew ability', exact: true }).click()
    const abilityMenu = dossier.getByLabel('Ability 1', { exact: true })
    expect(await abilityMenu.locator('option').allTextContents()).toEqual(expected.abilities)
    const abilities = []
    for (const name of expected.abilities) {
      await abilityMenu.selectOption({ label: name })
      const catalogId = await abilityMenu.inputValue()
      let choices = ['']
      if (name === 'Field Testing') choices = ['Healing', 'Exhilarating', 'Calming', 'Enlightening']
      if (name === 'Stunt Riders') choices = ['Smuggler’s Turn', 'Reverse 180', 'Shell Game', 'Outside Ride', 'Big Air', 'Ramming Speed']
      if (name === 'Versatile') choices = Object.entries(crewMenus).filter(([other]) => other !== type).flatMap(([other, menu]) => menu.abilities.filter(ability => ability !== 'Versatile' && (other !== 'Utopians' || ['Enlightened', 'Commune', 'Best Intentions', 'Zeal'].includes(ability))).map(ability => other + ': ' + ability))
      if (choices[0]) expect(await dossier.getByLabel('Ability choice 1', { exact: true }).locator('option').allTextContents()).toEqual(['Not recorded', ...choices])
      // Field Testing records one chosen effect; Stunt Riders and Versatile are
      // repeatable. Exercise every published choice without duplicating others.
      for (const choice of name === 'Field Testing' ? ['Healing'] : choices) abilities.push({ id: crypto.randomUUID(), catalogId, choice, notes: '' })
    }
    await dossier.getByRole('button', { name: 'Add crew upgrade', exact: true }).click()
    const upgradeMenu = dossier.getByLabel('Upgrade 1', { exact: true })
    const common = ['Training: Insight', 'Training: Prowess', 'Training: Resolve', 'Training: Personal', 'Training: Mastery', ...(type === 'Racers' ? [] : ['Base: Van', 'Base: Boat']), 'Base: Hidden', 'Base: Secure', 'Base: Workshop', 'Base: Lounge and quarters', 'Base: Vault', 'Items: Documents', 'Items: Gear', 'Items: Paranormal', 'Items: Supplies', 'Items: Tools', 'Items: Weapons', 'Cohorts: new cohort', 'Cohorts: additional type']
    const expectedUpgrades = [...common, ...expected.upgrades, ...(type === 'Racers' ? ['Base: Vehicles', 'Base: Heavy Vehicles'] : [])]
    expect(await upgradeMenu.locator('option').allTextContents()).toEqual(expectedUpgrades)
    const upgrades = []
    for (const name of expectedUpgrades) {
      await upgradeMenu.selectOption({ label: name })
      const marks = name === 'Training: Mastery' ? 4 : ['Intriguing', 'Deep', 'Complicated', 'Multifaceted', 'Awakened'].includes(name) ? 3 : ['Base: Van', 'Base: Boat', 'Base: Secure', 'Base: Vault', 'Base: Vehicles', 'Base: Heavy Vehicles', 'Cohorts: new cohort', 'Cohorts: additional type'].includes(name) ? 2 : 1
      await expect(dossier.getByLabel('Upgrade marks 1', { exact: true })).toHaveAttribute('max', String(marks))
      upgrades.push({ id: crypto.randomUUID(), catalogId: await upgradeMenu.inputValue(), marks, notes: '' })
    }
    const claims = []
    for (let i = 0; i < expected.claims.length; i++) {
      const name = expected.claims[i], count = expected.claims.filter(value => value === name).length
      const occurrence = expected.claims.slice(0, i + 1).filter(value => value === name).length
      const label = name + (count > 1 ? ' (' + occurrence + ')' : '')
      await expect(dossier.getByRole('checkbox', { name: label, exact: true })).toBeVisible()
      const prefix = type.toLowerCase().replaceAll(' ', '-')
      claims.push({ catalogId: prefix + '-claim-' + (i + 1), notes: label })
    }
    const patch = { abilities, upgrades, claims }
    const saved = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: patch, p_expected: { abilities: [], upgrades: [], claims: [] } })
    expect(saved.error, type).toBeNull()
    expect(saved.data.data).toMatchObject({ ...patch, tier: 0, stacks: 2, heat: 0, xp: 0 })
    // Field Testing's other three choices must also pass authoritative validation.
    if (type === 'Dealers') {
      let previous = abilities
      for (const choice of ['Exhilarating', 'Calming', 'Enlightening']) {
        const next = previous.map(row => row.catalogId === 'dealers-field-testing' ? { ...row, choice } : row)
        const changed = await gm.rpc('update_crew', { p_campaign: campaign, p_patch: { abilities: next }, p_expected: { abilities: previous } })
        expect(changed.error).toBeNull()
        previous = next
      }
    }
    await page.reload()
    await expect(dossier.getByLabel('Ability 1', { exact: true })).toHaveValue(abilities[0].catalogId)
    await expect(dossier.getByLabel('Upgrade marks 5', { exact: true })).toHaveValue('4')
    await expect(dossier.getByRole('checkbox')).toHaveCount(expected.claims.length)
    for (const checkbox of await dossier.getByRole('checkbox').all()) await expect(checkbox).toBeChecked()
    await context.close()
  }
})


test('competing GM cohort drafts fail visibly, preserve edits and recover with an explicit reload', async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext()
  const ours = await first.newPage(), theirs = await second.newPage()
  await ours.goto('/')
  await ours.getByLabel('Campaign name', { exact: true }).fill('Competing cohort drafts')
  await ours.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const invitation = await ours.getByLabel('Secret GM invitation', { exact: true }).inputValue()
  await ours.getByLabel('Crew name', { exact: true }).fill('Canal watch')
  await ours.getByRole('button', { name: 'Create crew', exact: true }).click()
  await ours.getByRole('button', { name: 'Add cohort', exact: true }).click()
  await ours.getByLabel('Cohort name 1', { exact: true }).fill('Canal runners')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('region', { name: 'Crew dossier' }).getByRole('status')).toHaveText('Crew saved.')
  await theirs.goto('/')
  await theirs.getByLabel('Invitation', { exact: true }).fill(invitation)
  await theirs.getByRole('button', { name: 'Join campaign', exact: true }).click()
  await expect(theirs.getByLabel('Cohort name 1', { exact: true })).toHaveValue('Canal runners')
  // The collection is a single conflict unit; neither GM silently overwrites
  // the other's cohort field even when the individual inputs differ.
  await ours.getByLabel('Cohort assignment 1', { exact: true }).fill('Guard the station')
  await theirs.getByLabel('Cohort condition 1', { exact: true }).selectOption('broken')
  await theirs.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByRole('region', { name: 'Crew dossier' }).getByRole('status')).toHaveText('Crew saved.')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(ours.getByRole('region', { name: 'Crew dossier' }).getByRole('alert')).toContainText('Crew changed elsewhere')
  await expect(ours.getByLabel('Cohort assignment 1', { exact: true })).toHaveValue('Guard the station')
  await ours.getByRole('button', { name: 'Reload latest crew (discard unsaved)', exact: true }).click()
  await expect(ours.getByLabel('Cohort condition 1', { exact: true })).toHaveValue('broken')
  await expect(ours.getByLabel('Cohort assignment 1', { exact: true })).toHaveValue('')
  await ours.getByLabel('Cohort assignment 1', { exact: true }).fill('Recover at the base')
  await ours.getByRole('button', { name: 'Save crew changes', exact: true }).click()
  await expect(theirs.getByLabel('Cohort assignment 1', { exact: true })).toHaveValue('Recover at the base')
  await expect(theirs.getByLabel('Cohort condition 1', { exact: true })).toHaveValue('broken')
  await first.close(); await second.close()
})

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
const racers = { circuit: 'Canal loop and Charterhall roofs', operations: ['Smuggling', 'Racing'], signatureStunts: ['Big Air', 'Reverse 180'], vehicles: [{ id: 'black-echo', name: 'Black Echo', edges: ['Nimble', 'Sturdy'], flaws: ['Distinct', 'Guzzler'], notes: 'Driver: Aniya; custom cohort recorded separately' }] }
test('Racers circuit, verified stunts and vehicle traits persist independently of common crew records', async () => {
 const gm=client(); expect((await gm.auth.signInAnonymously()).error).toBeNull()
 const campaign=(await gm.rpc('create_campaign',{p_name:'Racer records'})).data.id
 const initial=(await gm.rpc('create_crew',{p_campaign:campaign,p_name:'Blackline',p_type:'Racers'})).data
 const saved=await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{racerCircuit:racers},p_expected:{racerCircuit:initial.data.racerCircuit??null}})
 expect(saved.error).toBeNull()
 expect(saved.data.data).toMatchObject({racerCircuit:racers,stacks:2,tier:0,heat:0,abilities:[],cohorts:[]})
})
const utopian = { vision: 'A radiant city outside time', circle: 1, stacksEarned: 0, livesEnded: 0, majorAnomalyCreated: false, truths: ['Free','Radiant','','',''], anomalies: 'Canal mirror: discovered; stabilization incomplete' }
const ability=(catalogId:string,choice='')=>({id:crypto.randomUUID(),catalogId,choice,notes:''})
test('Utopian progression is reviewed in order using earned totals, with final-state ability and claim eligibility', async()=>{
 const gm=client(); expect((await gm.auth.signInAnonymously()).error).toBeNull()
 const campaign=(await gm.rpc('create_campaign',{p_name:'Circles'})).data.id
 let row=(await gm.rpc('create_crew',{p_campaign:campaign,p_name:'Radiant city',p_type:'Utopians'})).data.data
 const update=async(patch:Record<string,unknown>)=>gm.rpc('update_crew',{p_campaign:campaign,p_patch:patch,p_expected:Object.fromEntries(Object.keys(patch).map(k=>[k,row[k]??null]))})
 let saved=await update({utopianVision:utopian});expect(saved.error).toBeNull();row=saved.data.data
 expect(row).toMatchObject({utopianVision:utopian,stacks:2,tier:0})
 expect((await update({abilities:[ability('utopians-true-believers')]})).error?.code).toBe('P0001')
 expect((await update({claims:[{catalogId:'utopians-claim-13',notes:''}]})).error?.code).toBe('P0001')
 expect((await update({stacks:99,utopianVision:{...utopian,circle:2}})).error?.code).toBe('P0001')
 expect((await update({utopianVision:{...utopian,circle:3,stacksEarned:20,livesEnded:10}})).error?.code).toBe('P0001')
 saved=await update({utopianVision:{...utopian,stacksEarned:20,livesEnded:10,majorAnomalyCreated:true}});expect(saved.error).toBeNull();row=saved.data.data
 expect(row.utopianVision.circle).toBe(1) // earning thresholds never descends automatically
 for(const circle of [2,3,4]){
  const vision={...row.utopianVision,circle,truths:['Free','Radiant','Alien',circle>=3?'Violent':'',circle===4?'Terrifying':'']}
  const patch={utopianVision:vision,...(circle===4?{tier:3}:{})}
  if(circle===4){expect((await update({utopianVision:vision})).error?.code).toBe('P0001');expect((await update({tier:3,utopianVision:{...vision,majorAnomalyCreated:false}})).error?.code).toBe('P0001')}
  saved=await update(patch);expect(saved.error).toBeNull();row=saved.data.data
  const selected=ability(circle===2?'utopians-true-believers':circle===3?'utopians-this-is-fine':'utopians-remember-the-forgotten')
  saved=await update({abilities:[selected]});expect(saved.error).toBeNull();row=saved.data.data
  if(circle<4)expect((await update({abilities:[ability('utopians-remember-the-forgotten')]})).error?.code).toBe('P0001')
 }
 expect((await update({utopianVision:{...row.utopianVision,circle:1}})).error?.code).toBe('P0001')
 saved=await update({utopianVision:{...row.utopianVision,circle:1},abilities:[]});expect(saved.error).toBeNull();row=saved.data.data
 saved=await update({type:'Racers',abilities:[ability('racers-versatile','Utopians: Commune')]});expect(saved.error).toBeNull();row=saved.data.data
 expect((await update({abilities:[ability('racers-versatile','Utopians: Remember the Forgotten')]})).error?.code).toBe('P0001')
 expect(row).toMatchObject({stacks:2,heat:0,xp:0,advances:0,utopianVision:{circle:1,stacksEarned:20,livesEnded:10}})
})
test('GM and two players share Racers and Utopians records, recover offline drafts, and retain inactive history',async({browser})=>{
 const gm=await browser.newContext(), one=await browser.newContext(), two=await browser.newContext()
 const page=await gm.newPage(), peers=await Promise.all([one.newPage(),two.newPage()])
 await page.goto('/');await page.getByLabel('Campaign name',{exact:true}).fill('Circle browser records');await page.getByRole('button',{name:'Create campaign',exact:true}).click().then(() => page.getByRole('tab', { name: 'Crew', exact: true }).click())
 const invitation=await page.getByLabel('Player invitation',{exact:true}).inputValue()
 await page.getByRole('tab', { name: 'Crew', exact: true }).click()
 await page.getByLabel('Crew name',{exact:true}).fill('Blackline');await page.getByLabel('Crew type',{exact:true}).selectOption('Racers');await page.getByRole('button',{name:'Create crew',exact:true}).click()
 const dossier=page.getByRole('region',{name:'Crew dossier'})
 await dossier.getByLabel('Local circuit',{exact:true}).fill(racers.circuit)
 await dossier.getByRole('checkbox',{name:'Circuit operation: Racing',exact:true}).check()
 await dossier.getByRole('checkbox',{name:'Signature stunt: Big Air',exact:true}).check()
 await dossier.getByRole('button',{name:'Add racer vehicle',exact:true}).click()
 await dossier.getByLabel('Vehicle name 1',{exact:true}).fill('Black Echo')
 await dossier.getByRole('checkbox',{name:'Vehicle 1 edge: Nimble',exact:true}).check()
 await dossier.getByRole('checkbox',{name:'Vehicle 1 flaw: Finicky',exact:true}).check()
 await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
 for(const peer of peers){
  await peer.goto('/');await peer.getByLabel('Invitation',{exact:true}).fill(invitation);await peer.getByRole('button',{name:'Join campaign',exact:true}).click().then(() => peer.getByRole('tab', { name: 'Crew', exact: true }).click())
  await expect(peer.getByLabel('Local circuit',{exact:true})).toHaveValue(racers.circuit);await expect(peer.getByLabel('Vehicle name 1',{exact:true})).toBeDisabled()
  await expect(peer.getByRole('checkbox',{name:'Signature stunt: Big Air',exact:true})).toBeChecked();await expect(peer.getByRole('button',{name:'Save crew changes',exact:true})).toHaveCount(0)
 }
 await dossier.getByLabel('Local circuit',{exact:true}).fill('Canals reopened');await gm.setOffline(true)
 await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('alert')).toContainText('Crew was not saved');await expect(dossier.getByLabel('Local circuit',{exact:true})).toHaveValue('Canals reopened')
 await gm.setOffline(false);await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
 for(const peer of peers)await expect(peer.getByLabel('Local circuit',{exact:true})).toHaveValue('Canals reopened')
 await page.reload();await expect(dossier.getByLabel('Vehicle name 1',{exact:true})).toHaveValue('Black Echo')
 await dossier.getByRole('region',{name:'Racers circuit',exact:true}).screenshot({path:'test-results/racers-desktop.png'})
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await dossier.getByRole('region',{name:'Racers circuit',exact:true}).screenshot({path:'test-results/racers-mobile.png'})
 await dossier.getByLabel('Crew type',{exact:true}).selectOption('Utopians');await dossier.getByLabel('Utopian vision',{exact:true}).fill(utopian.vision)
 await dossier.getByLabel('First Circle truth 1',{exact:true}).fill('Free');await dossier.getByLabel('First Circle truth 2',{exact:true}).fill('Radiant')
 await dossier.getByLabel('Anomalies',{exact:true}).fill(utopian.anomalies);await dossier.getByLabel('Stacks earned since campaign start',{exact:true}).fill('20');await dossier.getByLabel('Lives ended since campaign start',{exact:true}).fill('10')
 await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
 await expect(dossier.getByLabel('Reviewed Utopian Circle',{exact:true})).toHaveValue('1')
 await expect(dossier.getByRole('button', { name: 'Wellness Class', exact: true })).toBeEnabled()
 for (const name of ['Donations', 'Reality Shift', 'Reality Tear']) await expect(dossier.getByRole('button', { name, exact: true })).toBeDisabled()
 for(const peer of peers){await expect(peer.getByLabel('Anomalies',{exact:true})).toHaveValue(utopian.anomalies);await expect(peer.getByLabel('Reviewed Utopian Circle',{exact:true})).toBeDisabled()}
 await dossier.getByRole('button',{name:'Add crew ability',exact:true}).click()
 await expect(dossier.getByLabel('Ability 1',{exact:true}).locator('option[value="utopians-remember-the-forgotten"]')).toHaveAttribute('disabled', '')
 for(const circle of [2,3,4]){
  if(circle===4){await dossier.getByLabel('Tier',{exact:true}).fill('3');await dossier.getByRole('checkbox',{name:'Major anomaly created',exact:true}).check()}
  await dossier.getByLabel('Reviewed Utopian Circle',{exact:true}).selectOption(String(circle))
  await expect(dossier.getByRole('button', { name: circle === 2 ? 'Donations' : circle === 3 ? 'Reality Shift' : 'Reality Tear', exact: true })).toBeEnabled()
  await dossier.getByLabel(circle===2?'Second Circle truth':circle===3?'Third Circle truth':'Final Circle truth',{exact:true}).fill(circle===2?'Alien':circle===3?'Violent':'Terrifying')
  await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
 }
 await dossier.getByLabel('Ability 1',{exact:true}).selectOption('utopians-remember-the-forgotten');await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('status')).toHaveText('Crew saved.')
 for(const peer of peers)await expect(peer.getByLabel('Reviewed Utopian Circle',{exact:true})).toHaveValue('4')
 await page.reload();await expect(dossier.getByLabel('Final Circle truth',{exact:true})).toHaveValue('Terrifying')
 await dossier.getByRole('region',{name:'Utopian campaign record',exact:true}).screenshot({path:'test-results/utopians-mobile.png'});await page.setViewportSize({width:1280,height:720})
 await dossier.getByRole('region',{name:'Utopian campaign record',exact:true}).screenshot({path:'test-results/utopians-desktop.png'})
 await dossier.getByText('Retained Racers circuit (inactive)',{exact:true}).click();await expect(dossier.getByText('Canals reopened',{exact:true})).toBeVisible()
 await expect(dossier.getByLabel('Stacks',{exact:true})).toHaveValue('2');await expect(dossier.getByLabel('Crew XP',{exact:true})).toHaveValue('0')
 await gm.close();await one.close();await two.close()
})

test('specialized crew APIs reject unauthorized, malformed and inactive edits using current membership', async()=>{
 const gm=client(),player=client(),second=client(),coGM=client(),outsider=client(),unsigned=client()
 for(const identity of [gm,player,second,coGM,outsider])expect((await identity.auth.signInAnonymously()).error).toBeNull()
 const campaign=(await gm.rpc('create_campaign',{p_name:'Circle permissions'})).data.id
 const elsewhere=(await outsider.rpc('create_campaign',{p_name:'Another circle'})).data.id
 expect((await outsider.rpc('create_crew',{p_campaign:elsewhere,p_name:'Other',p_type:'Utopians'})).error).toBeNull()
 const initial=(await gm.rpc('create_crew',{p_campaign:campaign,p_name:'Private edits',p_type:'Racers'})).data
 const invites=(await gm.rpc('get_campaign_invitations',{p_campaign:campaign})).data
 for(const identity of [player,second])expect((await identity.rpc('join_campaign',{p_invitation:invites.player})).error).toBeNull()
 expect((await coGM.rpc('join_campaign',{p_invitation:invites.gm})).error).toBeNull()
 for(const [field,value] of Object.entries({racerCircuit:racers,utopianVision:utopian})){
  for(const identity of [player,second,outsider,unsigned])expect((await identity.rpc('update_crew',{p_campaign:campaign,p_patch:{[field]:value},p_expected:{[field]:initial.data[field]}})).error?.code).toBe('42501')
 }
 for(const identity of [gm,coGM,player,second,outsider,unsigned]){
  expect((await identity.from('crews').insert({campaign_id:campaign,data:initial.data})).error).not.toBeNull()
  expect((await identity.from('crews').update({data:{racerCircuit:racers}}).eq('id',initial.id)).error).not.toBeNull()
  expect((await identity.from('crews').delete().eq('id',initial.id)).error).not.toBeNull()
 }
 for(const identity of [outsider,unsigned])expect((await identity.from('crews').select('*').eq('id',initial.id)).data??[]).toEqual([])
 const invalidRacers=[null,[],{}, {...racers,extra:true},{...racers,circuit:3},{...racers,circuit:'x'.repeat(5001)},{...racers,operations:['Transport']},{...racers,operations:['Racing','Racing']},{...racers,signatureStunts:['Jump']},{...racers,vehicles:null},{...racers,vehicles:[{...racers.vehicles[0],edges:['Nimble','Simple','Sturdy']}]},{...racers,vehicles:[{...racers.vehicles[0],flaws:['Fearsome']}]},{...racers,vehicles:[racers.vehicles[0],racers.vehicles[0]]},{...racers,vehicles:[{...racers.vehicles[0],name:''}]},{...racers,vehicles:[{...racers.vehicles[0],notes:null}]}]
 for(const invalid of invalidRacers)expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{base:'Must roll back',racerCircuit:invalid},p_expected:{base:'',racerCircuit:initial.data.racerCircuit}})).error?.code,JSON.stringify(invalid)).toBe('P0001')
 const saved=await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{racerCircuit:racers},p_expected:{racerCircuit:initial.data.racerCircuit}});expect(saved.error).toBeNull()
 for(const identity of [player,second])expect((await identity.from('crews').select('data').eq('id',initial.id).single()).data?.data).toMatchObject({racerCircuit:racers,base:''})
 expect((await coGM.rpc('update_crew',{p_campaign:campaign,p_patch:{type:'Utopians'},p_expected:{type:'Racers'}})).error).toBeNull()
 expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{racerCircuit:{...racers,circuit:'Stale type'}},p_expected:{racerCircuit:racers}})).error?.code).toBe('P0001')
 const invalidUtopians=[null,[],{}, {...utopian,extra:1},{...utopian,vision:null},{...utopian,anomalies:'x'.repeat(5001)},{...utopian,circle:0},{...utopian,circle:5},{...utopian,stacksEarned:1.5},{...utopian,livesEnded:-1},{...utopian,stacksEarned:'20'},{...utopian,stacksEarned:10000},{...utopian,majorAnomalyCreated:1},{...utopian,truths:['Free','Radiant']},{...utopian,truths:['Free','Radiant',null,'','']}]
 for(const invalid of invalidUtopians)expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{base:'Must roll back',utopianVision:invalid},p_expected:{base:'',utopianVision:initial.data.utopianVision}})).error?.code,JSON.stringify(invalid)).toBe('P0001')
 expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{utopianVision:utopian},p_expected:{utopianVision:initial.data.utopianVision}})).error).toBeNull()
 for(const [name,args] of [['validate_crew_business_patch',{p_patch:{}}],['validate_crew_patch',{p_patch:{}}],['validate_racer_circuit',{value:racers}],['validate_utopian_vision',{value:utopian}],['crew_circles_defaults',{p_data:{}}]] as const)expect((await player.rpc(name,args)).error?.code).toBe('42501')
 const local=JSON.parse(execFileSync('node_modules/.bin/supabase',['status','-o','json'],{encoding:'utf8'}))
 const admin=createClient(url,local.SERVICE_ROLE_KEY,{db:{schema:'bitd'},auth:{persistSession:false}})
 const coId=(await coGM.auth.getUser()).data.user!.id
 expect((await admin.from('campaign_members').update({role:'player'}).eq('campaign_id',campaign).eq('user_id',coId)).error).toBeNull()
 expect((await coGM.rpc('update_crew',{p_campaign:campaign,p_patch:{utopianVision:{...utopian,vision:'Demoted'}},p_expected:{utopianVision:utopian}})).error?.code).toBe('42501')
 expect((await coGM.from('crews').select('data').eq('id',initial.id).single()).data?.data.utopianVision).toEqual(utopian)
 expect((await admin.from('campaign_members').delete().eq('campaign_id',campaign).eq('user_id',coId)).error).toBeNull()
 expect((await coGM.rpc('update_crew',{p_campaign:campaign,p_patch:{utopianVision:utopian},p_expected:{utopianVision:utopian}})).error?.code).toBe('42501')
 expect((await coGM.from('crews').select('*').eq('id',initial.id)).data).toEqual([])
})

test('Circle-specific claims and inactive history preserve source spaces and unrelated fields',async()=>{
 const gm=client();expect((await gm.auth.signInAnonymously()).error).toBeNull()
 const campaign=(await gm.rpc('create_campaign',{p_name:'Circle claim spaces'})).data.id
 let row=(await gm.rpc('create_crew',{p_campaign:campaign,p_name:'Vision history',p_type:'Utopians'})).data.data
 const update=async(patch:Record<string,unknown>)=>{const result=await gm.rpc('update_crew',{p_campaign:campaign,p_patch:patch,p_expected:Object.fromEntries(Object.keys(patch).map(k=>[k,row[k]]))});if(!result.error)row=result.data.data;return result}
 const circleByClaim=[1,2,3,4,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4]
 for(const circle of [1,2,3,4]){
  expect((await update({tier:3,utopianVision:{...utopian,circle,stacksEarned:20,livesEnded:10,majorAnomalyCreated:true}})).error).toBeNull()
  for(let index=0;index<circleByClaim.length;index++){
   const result=await update({claims:[{catalogId:'utopians-claim-'+(index+1),notes:'Reviewed printed space'}]})
   if(circleByClaim[index]<=circle)expect(result.error).toBeNull();else expect(result.error?.code).toBe('P0001')
  }
 }
 expect((await update({claims:[],type:'Racers',racerCircuit:racers,tier:1})).error).toBeNull()
 expect(row).toMatchObject({utopianVision:{circle:4,stacksEarned:20},tier:1,racerCircuit:racers})
 expect((await update({utopianVision:{...row.utopianVision,vision:'Inactive mutation'}})).error?.code).toBe('P0001')
 expect((await update({type:'Dealers',dealerBusiness:{product:'Records',units:5,supply:'Canal',demand:'Students',distribution:'Night market',competitiveAdvantages:'Independent'}})).error).toBeNull()
 expect((await update({type:'Militants',militantCause:{cause:'Free the canal',enemies:['Ministry','Foundation']}})).error).toBeNull()
 const cohort={id:'car',name:'Black Echo',kind:'vehicle',types:'Custom Ride',edges:'Nimble',flaws:'Finicky',quality:2,scale:0,condition:'healthy',armor:'none',assignment:'Circuit',notes:'Manual cohort'}
 expect((await update({type:'Racers',cohorts:[cohort],upgrades:[{id:'rig',catalogId:'racers-racer-rigging',marks:1,notes:''}],abilities:[ability('racers-stunt-riders','Big Air')]})).error).toBeNull()
 expect(row).toMatchObject({racerCircuit:racers,utopianVision:{circle:4,vision:utopian.vision},dealerBusiness:{units:5,product:'Records'},militantCause:{cause:'Free the canal'},cohorts:[cohort],stacks:2,heat:0,advances:0})
})

test('competing specialized drafts preserve values, disjoint fields commute, and a changed crew type cannot bypass validation',async({browser})=>{
 const first=await browser.newContext(),second=await browser.newContext(),ours=await first.newPage(),theirs=await second.newPage()
 await ours.goto('/');await ours.getByLabel('Campaign name',{exact:true}).fill('Racing concurrent records');await ours.getByRole('button',{name:'Create campaign',exact:true}).click().then(() => ours.getByRole('tab', { name: 'Crew', exact: true }).click())
 const invitation=await ours.getByLabel('Secret GM invitation',{exact:true}).inputValue()
 await ours.getByRole('tab', { name: 'Crew', exact: true }).click()
 await ours.getByLabel('Crew name',{exact:true}).fill('Concurrent circuits');await ours.getByLabel('Crew type',{exact:true}).selectOption('Racers');await ours.getByRole('button',{name:'Create crew',exact:true}).click()
 await theirs.goto('/');await theirs.getByLabel('Invitation',{exact:true}).fill(invitation);await theirs.getByRole('button',{name:'Join campaign',exact:true}).click().then(() => theirs.getByRole('tab', { name: 'Crew', exact: true }).click());await expect(theirs.getByLabel('Local circuit',{exact:true})).toHaveValue('')
 const a=ours.getByRole('region',{name:'Crew dossier'}),b=theirs.getByRole('region',{name:'Crew dossier'})
 const save=async(dossier:typeof a)=>{await dossier.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(dossier.getByRole('status')).toHaveText('Crew saved.')}
 await a.getByLabel('Local circuit',{exact:true}).fill('Canal loop');await b.getByLabel('Base',{exact:true}).fill('Tram station');await save(b);await save(a)
 await expect(a.getByLabel('Base',{exact:true})).toHaveValue('Tram station');await expect(b.getByLabel('Local circuit',{exact:true})).toHaveValue('Canal loop')
 await a.getByLabel('Local circuit',{exact:true}).fill('Rooftop draft');await b.getByRole('checkbox',{name:'Signature stunt: Big Air',exact:true}).check();await save(b)
 await a.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(a.getByRole('alert')).toContainText('Crew changed elsewhere');await expect(a.getByLabel('Local circuit',{exact:true})).toHaveValue('Rooftop draft')
 await a.getByRole('button',{name:'Reload latest crew (discard unsaved)',exact:true}).click();await expect(a.getByLabel('Local circuit',{exact:true})).toHaveValue('Canal loop');await expect(a.getByRole('checkbox',{name:'Signature stunt: Big Air',exact:true})).toBeChecked()
 await a.getByLabel('Local circuit',{exact:true}).fill('Pending expanded circuit');await b.getByLabel('Crew type',{exact:true}).selectOption('Utopians');await save(b);await expect(a.getByLabel('Crew type',{exact:true})).toHaveValue('Utopians')
 await a.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(a.getByRole('alert')).toContainText('Switch crew type to Racers');await a.getByText('Retained Racers circuit (inactive)',{exact:true}).click();await expect(a.getByText('Pending expanded circuit',{exact:true})).toBeVisible()
 await a.getByRole('button',{name:'Reload latest crew (discard unsaved)',exact:true}).click();await expect(a.getByLabel('Utopian vision',{exact:true})).toHaveValue('')
 await a.getByLabel('Utopian vision',{exact:true}).fill('A city free of walls');await b.getByLabel('Stacks earned since campaign start',{exact:true}).fill('21');await save(b)
 await a.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(a.getByRole('alert')).toContainText('Crew changed elsewhere');await expect(a.getByLabel('Utopian vision',{exact:true})).toHaveValue('A city free of walls')
 await a.getByRole('button',{name:'Reload latest crew (discard unsaved)',exact:true}).click();await expect(a.getByLabel('Stacks earned since campaign start',{exact:true})).toHaveValue('21')
 await a.getByLabel('Utopian vision',{exact:true}).fill('A city free of walls');await save(a);await expect(b.getByLabel('Utopian vision',{exact:true})).toHaveValue('A city free of walls')
 await a.getByLabel('Anomalies',{exact:true}).fill('Unsaved anomaly');await first.setOffline(true);await a.getByRole('button',{name:'Save crew changes',exact:true}).click();await expect(a.getByRole('alert')).toContainText('Crew was not saved');await expect(a.getByLabel('Anomalies',{exact:true})).toHaveValue('Unsaved anomaly')
 await first.setOffline(false);await save(a);await expect(b.getByLabel('Anomalies',{exact:true})).toHaveValue('Unsaved anomaly')
 await first.close();await second.close()
})

test('ability writes check the current saved Circle after a peer correction',async()=>{
 const gm=client(),peer=client();for(const identity of [gm,peer])expect((await identity.auth.signInAnonymously()).error).toBeNull()
 const campaign=(await gm.rpc('create_campaign',{p_name:'Current Circle authority'})).data.id
 const invitation=(await gm.rpc('get_campaign_invitations',{p_campaign:campaign})).data.gm
 expect((await peer.rpc('join_campaign',{p_invitation:invitation})).error).toBeNull()
 const initial=(await gm.rpc('create_crew',{p_campaign:campaign,p_name:'Circle correction',p_type:'Utopians'})).data.data
 const circle2={...utopian,circle:2,stacksEarned:20}
 expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{utopianVision:circle2},p_expected:{utopianVision:initial.utopianVision}})).error).toBeNull()
 const circle1={...circle2,circle:1}
 expect((await peer.rpc('update_crew',{p_campaign:campaign,p_patch:{utopianVision:circle1},p_expected:{utopianVision:circle2}})).error).toBeNull()
 expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{abilities:[ability('utopians-true-believers')]},p_expected:{abilities:[]}})).error?.code).toBe('P0001')
 expect((await gm.rpc('update_crew',{p_campaign:campaign,p_patch:{utopianVision:{...circle2,vision:'Stale review'}},p_expected:{utopianVision:circle2}})).error?.code).toBe('40001')
 expect((await gm.from('crews').select('data').eq('campaign_id',campaign).single()).data?.data).toMatchObject({utopianVision:circle1,abilities:[]})
})

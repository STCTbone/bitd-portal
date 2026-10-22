import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
const client = () => createClient(url,key,{ db:{ schema:'bitd' },auth:{persistSession:false,autoRefreshToken:false} })
async function fixture() {
  const gm = client(), a = client(), b = client(), outsider = client()
  for (const person of [gm,a,b,outsider]) expect((await person.auth.signInAnonymously()).error).toBeNull()
  const campaign = (await gm.rpc('create_campaign',{p_name:'Live planning'})).data.id
  const invitations = (await gm.rpc('get_campaign_invitations',{p_campaign:campaign})).data
  for (const person of [a,b]) await person.rpc('join_campaign',{p_invitation:invitations.player})
  const bytes = readFileSync('tests/fixtures/map-grid.png')
  const reserved = (await gm.rpc('reserve_asset',{p_campaign:campaign,p_kind:'image',p_character:null,p_mime:'image/png',p_size:bytes.length,p_title:'Station'})).data
  expect((await gm.storage.from('campaign-assets').upload(reserved.object_path,bytes,{contentType:'image/png'})).error).toBeNull()
  const ready = (await gm.rpc('finish_asset',{p_asset:reserved.id})).data
  const asset = (await gm.rpc('update_asset',{p_asset:ready.id,p_title:'Station',p_annotation:'',p_shared:true,p_revision:ready.revision})).data
  expect((await gm.rpc('set_campaign_map',{p_campaign:campaign,p_asset:asset.id,p_revision:0})).error).toBeNull()
  return {gm,a,b,outsider,campaign,invitations,asset}
}
test('current members exchange bounded geometry with authoritative identity, never peer authority or saved tokens', async () => {
  const {gm,a,b,outsider,campaign,asset} = await fixture()
  const send = (person:ReturnType<typeof client>, payload:unknown, room=campaign, map=asset.id) => person.rpc('send_map_activity',{p_campaign:room,p_asset:map,p_kind:'cursor',p_points:payload})
  const read = (person:ReturnType<typeof client>, room=campaign, map=asset.id) => person.rpc('read_map_activity',{p_campaign:room,p_asset:map})
  expect((await send(a,[{x:25,y:75}])).error).toBeNull()
  const snapshot = await read(b)
  expect(snapshot.error).toBeNull()
  expect(snapshot.data[0]).toMatchObject({actor:(await a.auth.getUser()).data.user!.id,role:'player',kind:'cursor',points:[{x:25,y:75}]})
  const token = (await gm.rpc('create_map_token',{p_campaign:campaign,p_label:'Keep',p_character:null,p_controller:null})).data
  for (const points of [[{x:1,y:2,role:'gm'}],[{x:-1,y:2}],[{x:1,y:101}],[],[{x:'1',y:2}],Array(65).fill({x:1,y:2})]) expect((await send(a,points)).error).not.toBeNull()
  for (const kind of ['token-add','token-remove','token-move']) expect((await a.rpc('send_map_activity',{p_campaign:campaign,p_asset:asset.id,p_kind:kind,p_points:[{x:1,y:2}]})).error).not.toBeNull()
  const other = (await outsider.rpc('create_campaign',{p_name:'Other'})).data.id
  for (const person of [a,outsider]) {
    for (const [room,map] of [[other,asset.id],[campaign,crypto.randomUUID()]]) {
      expect((await send(person,[{x:1,y:2}],room,map)).error).not.toBeNull()
      expect((await read(person,room,map)).error).not.toBeNull()
    }
  }
  expect((await send(outsider,[{x:1,y:2}])).error?.code).toBe('42501')
  expect((await read(outsider)).error?.code).toBe('42501')
  expect((await a.from('map_activity').select('*')).error).not.toBeNull()
  expect((await a.from('map_activity').insert({campaign_id:campaign})).error).not.toBeNull()
  expect((await gm.rpc('get_map_state',{p_campaign:campaign})).data.tokens).toEqual([expect.objectContaining({id:token.id,x:50,y:50,revision:1})])
})
test('GM and two players share cursors, pings and drawings in responsive geometry, leave and reconnect', async ({browser}) => {
  const {gm,campaign,invitations} = await fixture()
  const token = (await gm.rpc('create_map_token',{p_campaign:campaign,p_label:'Saved marker',p_character:null,p_controller:null})).data
  const contexts = [await browser.newContext(),await browser.newContext(),await browser.newContext({viewport:{width:390,height:844},hasTouch:true})]
  const pages = await Promise.all(contexts.map(context=>context.newPage()))
  for (const [i,page] of pages.entries()) {
    await page.goto('/'); await page.getByLabel('Invitation',{exact:true}).fill(i===0?invitations.gm:invitations.player)
    await page.getByRole('button',{name:'Join campaign',exact:true}).click()
    await expect(page.locator('[data-live-map]')).toBeVisible()
  }
  const [host,a,b] = pages
  const actor = await a.getByLabel('Your participant ID').inputValue()
  const overlay = a.locator('[data-live-map]'); await overlay.scrollIntoViewIfNeeded()
  let rect = (await overlay.boundingBox())!
  await a.mouse.move(rect.x+rect.width*.25,rect.y+rect.height*.75)
  for (const page of [host,b]) {
    const cursor = page.locator(`[data-activity-actor="${actor}"][data-activity-kind="cursor"]`)
    await expect(cursor).toBeVisible(); await expect(cursor).toContainText(`Player ${actor.slice(0,6)}`)
    const surface = (await page.locator('[data-map-surface]').boundingBox())!
    const position = await cursor.boundingBox()
    expect(Math.abs(position!.x-(surface.x+surface.width*.25))).toBeLessThan(4)
  }
  await host.getByRole('button',{name:'Ping map',exact:true}).click()
  const gmOverlay = host.locator('[data-live-map]'); await gmOverlay.scrollIntoViewIfNeeded(); rect=(await gmOverlay.boundingBox())!
  await host.mouse.click(rect.x+rect.width*.6,rect.y+rect.height*.6)
  for (const page of [a,b]) await expect(page.locator('[data-activity-kind="ping"]')).toContainText('GM ')
  await a.getByRole('button',{name:'Draw on map',exact:true}).click()
  await overlay.scrollIntoViewIfNeeded(); rect=(await overlay.boundingBox())!
  await a.mouse.move(rect.x+rect.width*.3,rect.y+rect.height*.6); await a.mouse.down()
  await a.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.8,{steps:8}); await a.mouse.up()
  for (const page of [host,b]) await expect(page.locator(`[data-activity-actor="${actor}"][data-activity-kind="stroke"] polyline`)).toBeVisible()
  await host.getByRole('region',{name:'Campaign map',exact:true}).screenshot({path:'test-results/live-map-desktop.png'})
  await b.getByRole('region',{name:'Campaign map',exact:true}).screenshot({path:'test-results/live-map-mobile.png'})
  expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await a.getByRole('button',{name:'Leave live map',exact:true}).click()
  await expect(host.locator(`[data-activity-actor="${actor}"]`)).toHaveCount(0)
  await a.getByRole('button',{name:'Join live map',exact:true}).click()
  await expect(a.locator('[data-live-map]')).toBeVisible()
  await contexts[1].setOffline(true)
  await expect(a.getByText('Live map unavailable; reconnecting.')).toBeVisible()
  const moved = await gm.rpc('move_map_token',{p_token:token.id,p_x:80,p_y:20,p_revision:token.revision}); expect(moved.error).toBeNull()
  await contexts[1].setOffline(false)
  await expect(a.getByText('Live map connected.')).toBeVisible()
  await expect(a.getByRole('article',{name:'Token Saved marker',exact:true})).toContainText('Saved position: 80%, 20%')
  await b.getByRole('button',{name:'Ping map',exact:true}).click()
  const mobile = b.locator('[data-live-map]'); await mobile.scrollIntoViewIfNeeded(); rect=(await mobile.boundingBox())!
  await b.touchscreen.tap(rect.x+rect.width*.4,rect.y+rect.height*.7)
  const mobileActor=await b.getByLabel('Your participant ID').inputValue()
  await expect(host.locator(`[data-activity-actor="${mobileActor}"][data-activity-kind="ping"]`)).toBeVisible()
  expect((await gm.rpc('get_map_state',{p_campaign:campaign})).data.tokens[0]).toMatchObject({id:token.id,x:80,y:20,revision:2})
  for(const context of contexts) await context.close()
})
function admin() {
  const local = JSON.parse(execFileSync('node_modules/.bin/supabase',['status','-o','json'],{encoding:'utf8'}))
  return createClient(url,local.SERVICE_ROLE_KEY,{db:{schema:'bitd'},auth:{persistSession:false}})
}
test('each receive checks current membership and map selection; old gestures cannot return when a map is reselected', async () => {
  const {gm,a,b,campaign,asset} = await fixture()
  const args={p_campaign:campaign,p_asset:asset.id}
  const send=(person:ReturnType<typeof client>,kind='stroke')=>person.rpc('send_map_activity',{...args,p_kind:kind,p_points:[{x:10,y:20},{x:30,y:40}]})
  expect((await send(a)).error).toBeNull()
  expect((await b.rpc('read_map_activity',args)).data).toHaveLength(1)
  expect((await gm.rpc('set_campaign_map',{p_campaign:campaign,p_asset:null,p_revision:1})).error).toBeNull()
  expect((await b.rpc('read_map_activity',args)).error?.code).toBe('42501')
  expect((await send(a)).error?.code).toBe('42501')
  expect((await gm.rpc('set_campaign_map',{p_campaign:campaign,p_asset:asset.id,p_revision:2})).error).toBeNull()
  expect((await b.rpc('read_map_activity',args)).data).toEqual([])
  expect((await send(a)).error).toBeNull()
  const hidden = (await gm.rpc('update_asset',{p_asset:asset.id,p_title:'Station',p_annotation:'',p_shared:false,p_revision:asset.revision})).data
  expect((await b.rpc('read_map_activity',args)).error?.code).toBe('42501')
  const reshared = (await gm.rpc('update_asset',{p_asset:asset.id,p_title:'Station',p_annotation:'',p_shared:true,p_revision:hidden.revision})).data
  expect((await b.rpc('read_map_activity',args)).data).toEqual([])
  expect((await send(a)).error).toBeNull()
  const actor=(await a.auth.getUser()).data.user!.id
  expect((await admin().from('campaign_members').delete().eq('campaign_id',campaign).eq('user_id',actor)).error).toBeNull()
  expect((await a.rpc('read_map_activity',args)).error?.code).toBe('42501')
  expect((await send(a)).error?.code).toBe('42501')
  expect((await b.rpc('read_map_activity',args)).data).toEqual([])
  expect((await gm.rpc('update_asset',{p_asset:asset.id,p_title:'Station',p_annotation:'',p_shared:false,p_revision:reshared.revision})).error).toBeNull()
  expect((await b.rpc('read_map_activity',args)).error?.code).toBe('42501')
  expect((await send(b)).error?.code).toBe('42501')
})
test('transient gestures expire without disconnect messages and current roles come from membership', async () => {
  const {gm,a,b,campaign,asset}=await fixture(), args={p_campaign:campaign,p_asset:asset.id}
  const gmId=(await gm.auth.getUser()).data.user!.id
  const start=Date.now()
  for(const kind of ['cursor','ping','stroke']) expect((await gm.rpc('send_map_activity',{...args,p_kind:kind,p_points:[{x:25,y:75}]})).error).toBeNull()
  expect((await b.rpc('read_map_activity',args)).data).toHaveLength(3)
  expect((await admin().from('campaign_members').update({role:'player'}).eq('campaign_id',campaign).eq('user_id',gmId)).error).toBeNull()
  expect((await a.rpc('read_map_activity',args)).data.every((row:{role:string})=>row.role==='player')).toBe(true)
  for(const kind of ['cursor','ping','stroke']) {
    await expect.poll(async()=>((await b.rpc('read_map_activity',args)).data as {kind:string}[]).some(row=>row.kind===kind),{timeout:10000,intervals:[150]}).toBe(false)
    expect(Date.now()-start).toBeGreaterThan(({cursor:2800,ping:3800,stroke:7800})[kind]!)
  }
})
test('late receive responses cannot renew the local activity lease, and unshared maps unmount the channel', async ({page})=>{
  const {gm,campaign,invitations,asset}=await fixture(), args={p_campaign:campaign,p_asset:asset.id}
  await page.goto('/'); await page.getByLabel('Invitation',{exact:true}).fill(invitations.player)
  await page.getByRole('button',{name:'Join campaign',exact:true}).click()
  await expect(page.locator('[data-live-map]')).toBeVisible()
  expect((await gm.rpc('send_map_activity',{...args,p_kind:'stroke',p_points:[{x:20,y:50},{x:80,y:50}]})).error).toBeNull()
  await expect(page.locator('[data-activity-kind="stroke"]')).toBeVisible()
  let release!:()=>void, captured!:()=>void
  const held=new Promise<void>(resolve=>release=resolve), received=new Promise<void>(resolve=>captured=resolve)
  await page.route('**/rest/v1/rpc/read_map_activity',async route=>{
    const response=await route.fetch(); captured(); await held
    await route.fulfill({response}).catch(()=>{})
  })
  await received
  const start=Date.now()
  await expect(page.locator('[data-activity-kind="stroke"]')).toHaveCount(0,{timeout:2700})
  expect(Date.now()-start).toBeLessThan(2700)
  const actor=await page.getByLabel('Your participant ID').inputValue()
  expect((await admin().from('campaign_members').delete().eq('campaign_id',campaign).eq('user_id',actor)).error).toBeNull()
  release(); await page.unroute('**/rest/v1/rpc/read_map_activity')
  await expect(page.locator('[data-activity-kind="stroke"]')).toHaveCount(0)
  await expect(page.locator('[data-live-map]')).toHaveCount(0)
  // A new authorized browser can rejoin; unsharing the selected map then unmounts its overlay.
  await page.reload(); await page.getByLabel('Invitation',{exact:true}).fill(invitations.player)
  await page.getByRole('button',{name:'Join campaign',exact:true}).click()
  await expect(page.locator('[data-live-map]')).toBeVisible()
  expect((await gm.rpc('update_asset',{p_asset:asset.id,p_title:'Station',p_annotation:'',p_shared:false,p_revision:asset.revision})).error).toBeNull()
  await expect(page.locator('[data-live-map]')).toHaveCount(0)
  await expect(page.getByRole('img',{name:'Saved campaign map',exact:true})).toHaveCount(0)
})

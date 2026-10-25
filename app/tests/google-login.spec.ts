import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const backend = process.env.VITE_SUPABASE_URL!
if (!backend || !['127.0.0.1', 'localhost'].includes(new URL(backend).hostname)) throw new Error('Local backend required')

// Trusted fixture uses real local Auth sessions, not a simulated Google callback.
function admin() {
  const settings = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  return createClient(backend, settings.SERVICE_ROLE_KEY, { db: { schema: 'bitd' }, auth: { persistSession: false } })
}
async function signedAccount(email: string) {
  const operator = admin()
  const link = await operator.auth.admin.generateLink({ type: 'magiclink', email })
  expect(link.error).toBeNull()
  const client = createClient(backend, process.env.VITE_SUPABASE_ANON_KEY!, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: link.data.properties.verification_type })
  expect(verified.error).toBeNull()
  return { client, session: verified.data.session! }
}

test('a recoverable account resumes its campaigns and ownership on another device, signs out and never lists another account’s campaigns', async ({ browser, baseURL }) => {
  const email = `returning-${crypto.randomUUID()}@example.test`
  expect((await admin().auth.admin.createUser({ email, email_confirm: true })).error).toBeNull()
  const first = await signedAccount(email), second = await signedAccount(email)
  const saved = (await first.client.rpc('create_campaign', { p_name: 'My saved table' })).data
  const character = (await first.client.rpc('create_character', { p_campaign: saved.id, p_name: 'Across devices' })).data
  const outsider = createClient(backend, process.env.VITE_SUPABASE_ANON_KEY!, { db: { schema: 'bitd' }, auth: { persistSession: false } })
  await outsider.auth.signInAnonymously(); await outsider.rpc('create_campaign', { p_name: 'Another person’s table' })
  const storageKey = `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`
  const contexts = await Promise.all([first, second].map(account => browser.newContext({ storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: storageKey, value: JSON.stringify(account.session) }] }] } })))
  for (const context of contexts) {
    const page = await context.newPage(); await page.goto('/')
    await expect(page.getByRole('region', { name: 'Account', exact: true })).toContainText(email)
    await expect(page.getByRole('region', { name: 'My campaigns', exact: true })).toContainText('My saved table')
    await page.getByRole('region', { name: 'Account', exact: true }).screenshot({ path: 'test-results/account-desktop.png' })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('region', { name: 'Account', exact: true }).screenshot({ path: 'test-results/account-mobile.png' })
    await expect(page.getByText('Another person’s table', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Open My saved table', exact: true }).click()
    await expect(page.getByLabel('Your participant ID', { exact: true })).toHaveValue(first.session.user.id)
    await page.getByRole('tab', { name: 'Characters', exact: true }).click()
    await page.getByRole('button', { name: 'Open Across devices', exact: true }).click()
    await expect(page.getByLabel('Character name', { exact: true })).toBeEnabled()
    await page.getByRole('tab', { name: 'Account', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Character dossiers', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'My campaigns', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible()
    await page.reload(); await expect(page.getByRole('heading', { name: 'My saved table', exact: true })).toHaveCount(0)
  }
  expect((await first.client.from('characters').select('owner_id').eq('id', character.id).single()).data!.owner_id).toBe(first.session.user.id)
  for (const context of contexts) await context.close()
})

test('Google setup failures are visible and leave an existing guest campaign and ownership intact', async ({ page, request }) => {
  const settings = await request.get(backend + '/auth/v1/settings', { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY! } })
  test.skip((await settings.json()).external?.google === true, 'This case requires an unconfigured Google provider.')
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Google sign-in is not configured')
  await page.getByLabel('Campaign name', { exact: true }).fill('Keep the guest')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Keep the guest', exact: true })).toBeVisible()
  const participant = await page.getByLabel('Your participant ID', { exact: true }).inputValue()
  await page.getByRole('tab', { name: 'Characters', exact: true }).click()
  await page.getByLabel('New character name', { exact: true }).fill('Still mine')
  await page.getByRole('button', { name: 'Create Hound', exact: true }).click()
  await expect(page.getByLabel('Character name', { exact: true })).toHaveValue('Still mine')
  await page.getByRole('tab', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Link Google to this guest', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Account', exact: true }).getByRole('alert')).toContainText('Google sign-in is not configured')
  await expect(page.getByLabel('Your participant ID', { exact: true })).toHaveValue(participant)
  await expect(page.getByLabel('Character name', { exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByLabel('Your participant ID', { exact: true })).toHaveValue(participant)
})

test('a cancelled Google callback preserves guest access and sign-out in one tab clears every open workspace', async ({ browser, page }) => {
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Cancelled login')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  const id = await page.getByLabel('Your participant ID', { exact: true }).inputValue()
  await page.goto('/?error=access_denied&error_description=Not+approved')
  await expect(page.getByRole('heading', { name: 'Cancelled login', exact: true })).toBeVisible()
  await expect(page.getByLabel('Your participant ID', { exact: true })).toHaveValue(id)
  await page.getByRole('tab', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Account', exact: true }).getByRole('alert')).toContainText('could not be completed')
  expect(new URL(page.url()).searchParams.has('error')).toBe(false)

  const email = `tabs-${crypto.randomUUID()}@example.test`
  await admin().auth.admin.createUser({ email, email_confirm: true })
  const account = await signedAccount(email)
  const campaign = (await account.client.rpc('create_campaign', { p_name: 'Close all views' })).data
  const origin = new URL(page.url()).origin
  const context = await browser.newContext({ storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`, value: JSON.stringify(account.session) }] }] } })
  const tabs = await Promise.all([context.newPage(), context.newPage()])
  await tabs[0].goto('/')
  await tabs[0].getByRole('button', { name: 'Open Close all views', exact: true }).click()
  await tabs[1].goto('/') // Same browser profile restores its selected campaign.
  for (const tab of tabs) {
    await tab.getByRole('tab', { name: 'Account', exact: true }).click()
    await expect(tab.getByLabel('Secret GM invitation', { exact: true })).toBeVisible()
  }
  await tabs[0].getByRole('button', { name: 'Sign out', exact: true }).click()
  for (const tab of tabs) {
    await expect(tab.getByRole('region', { name: 'Campaign sections', exact: true })).toHaveCount(0)
    await expect(tab.getByLabel('Secret GM invitation', { exact: true })).toHaveCount(0)
    await expect(tab.getByRole('heading', { name: campaign.name, exact: true })).toHaveCount(0)
  }
  await context.close()
})

test('failed account verification conceals the saved campaign list until retry succeeds', async ({ browser, baseURL }) => {
  const email = `offline-${crypto.randomUUID()}@example.test`
  await admin().auth.admin.createUser({ email, email_confirm: true })
  const account = await signedAccount(email)
  await account.client.rpc('create_campaign', { p_name: 'Do not keep a stale account list' })
  const context = await browser.newContext({ storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`, value: JSON.stringify(account.session) }] }] } })
  const page = await context.newPage(); await page.goto('/')
  await expect(page.getByRole('region', { name: 'My campaigns', exact: true })).toContainText('Do not keep a stale account list')
  await page.route('**/auth/v1/user', route => route.abort())
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('region', { name: 'My campaigns', exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('Could not verify campaign access')
  await page.unroute('**/auth/v1/user')
  await page.getByRole('button', { name: 'Retry campaign access', exact: true }).click()
  await expect(page.getByRole('region', { name: 'My campaigns', exact: true })).toContainText('Do not keep a stale account list')
  await context.close()
})

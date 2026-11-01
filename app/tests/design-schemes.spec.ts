import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const schemes = [
  ['paperback', 'Paperback ’68'],
  ['signal', 'Signal Orange'],
  ['blue-hour', 'Blue Hour'],
  ['midnight', 'Midnight Broadcast'],
] as const

async function openDesigns(page: Page) {
  const picker = page.locator('.design-studio-picker')
  if (await picker.getAttribute('open') === null) await page.getByText('Design studio', { exact: true }).click()
  return picker
}
async function chooseDesign(page: Page, id: string, name: string) {
  const picker = await openDesigns(page)
  await picker.getByRole('button', { name, exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-design', id)
  await expect(picker.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
}

async function textContrast(locator: Locator) {
  return locator.evaluate(element => {
    const rgba = (color: string) => {
      const values = color.match(/[\d.]+/g)!.map(Number)
      return [values[0], values[1], values[2], values[3] ?? 1]
    }
    const layers: number[][] = []
    for (let node: Element | null = element; node; node = node.parentElement) layers.unshift(rgba(getComputedStyle(node).backgroundColor))
    const background = layers.reduce((under, over) => over.slice(0, 3).map((channel, i) => channel * over[3] + under[i] * (1 - over[3])), [255, 255, 255])
    const foreground = rgba(getComputedStyle(element).color)
    const text = foreground.slice(0, 3).map((channel, i) => channel * foreground[3] + background[i] * (1 - foreground[3]))
    const luminance = (channels: number[]) => channels.map(channel => {
      const srgb = channel / 255
      return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4
    }).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0)
    const a = luminance(text), b = luminance(background)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  })
}

test('all four design schemes can be selected before sign-in and survive reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-design', 'paperback')
  for (const [id, name] of schemes) {
    await chooseDesign(page, id, name)
    expect(await page.evaluate(() => localStorage.getItem('bitd.design'))).toBe(id)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-design', id)
    const picker = await openDesigns(page)
    await expect(picker.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Campaign name', { exact: true })).toBeVisible()
  }
})

test('an invalid saved design falls back safely, supports keyboard selection and keeps empty rosters readable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bitd.design', 'unknown-design'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-design', 'paperback')
  const picker = await openDesigns(page)
  const blue = picker.getByRole('button', { name: 'Blue Hour', exact: true })
  await blue.focus(); await blue.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-design', 'blue-hour')
  await expect(blue).toBeFocused()
  await expect(blue).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Campaign name', { exact: true }).fill('Empty design reference')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await page.getByRole('tab', { name: 'Characters', exact: true }).click()
  const emptyRoster = page.locator('.dossier-roster > p')
  await expect(emptyRoster).toHaveText('No characters yet. Create your first character.')
  for (const [id, name] of schemes) {
    await chooseDesign(page, id, name)
    expect(await textContrast(emptyRoster), `${name}: empty character roster contrast`).toBeGreaterThanOrEqual(4.5)
  }
})

test('live design selection still works when appearance preference storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem
    Storage.prototype.getItem = function (key: string) {
      if (key === 'bitd.design') throw new DOMException('Preference storage blocked', 'SecurityError')
      return read.call(this, key)
    }
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'bitd.design') throw new DOMException('Preference storage blocked', 'SecurityError')
      write.call(this, key, value)
    }
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-design', 'paperback')
  for (const [id, name] of schemes) await chooseDesign(page, id, name)
  await expect(page.getByLabel('Campaign name', { exact: true })).toBeVisible()
})

test('design changes preserve the current tab and unsaved notes, with readable controls and phone layouts', async ({ page }) => {
  const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local backend required')
  const gm = createClient(url, key, { db: { schema: 'bitd' }, auth: { persistSession: false, autoRefreshToken: false } })
  expect((await gm.auth.signInAnonymously()).error).toBeNull()
  const created = await gm.rpc('create_campaign', { p_name: 'The Midnight Frequency' })
  expect(created.error).toBeNull()
  const campaign = created.data.id
  const invitation = (await gm.rpc('get_campaign_invitations', { p_campaign: campaign })).data.gm
  for (const name of ['Mara Vey', 'Len Rook']) expect((await gm.rpc('create_character', { p_campaign: campaign, p_name: name, p_unclaimed: true })).error).toBeNull()
  expect((await gm.rpc('create_crew', { p_campaign: campaign, p_name: 'Night Wire', p_type: 'Shadows' })).error).toBeNull()
  const note = await gm.rpc('create_shared_note', { p_campaign: campaign, p_data: { title: 'The midnight broadcast', category: 'lore', body: 'Saved campaign record.' } })
  expect(note.error).toBeNull()
  const saved = await Promise.all(['characters', 'crews', 'codex'].map(table => gm.from(table).select('*').eq('campaign_id', campaign).order('id')))
  for (const result of saved) expect(result.error).toBeNull()
  await page.goto('/')
  await page.getByLabel('Invitation', { exact: true }).fill(invitation)
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click()
  const tab = (name: string) => page.getByRole('tab', { name, exact: true })
  await tab('Notes').click()
  const editor = page.getByRole('article', { name: 'The midnight broadcast', exact: true })
  await editor.getByRole('button', { name: 'Edit note', exact: true }).click()
  await editor.getByLabel('Note body', { exact: true }).fill('Keep this unsaved transmission.')
  const colors = new Set<string>()
  for (const [id, name] of schemes) {
    await page.setViewportSize({ width: 1280, height: 960 })
    await chooseDesign(page, id, name)
    await expect(tab('Notes')).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/#campaign-notes$/)
    await expect(editor.getByLabel('Note body', { exact: true })).toHaveValue('Keep this unsaved transmission.')
    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1)
    expect(await textContrast(tab('Notes')), `${name}: selected tab contrast`).toBeGreaterThanOrEqual(4.5)
    expect(await textContrast(editor.getByLabel('Note body', { exact: true })), `${name}: input text contrast`).toBeGreaterThanOrEqual(4.5)
    const descriptions = page.locator('.design-option-description')
    for (let i = 0; i < schemes.length; i++) expect(await textContrast(descriptions.nth(i)), `${name}: chooser description ${i + 1} contrast`).toBeGreaterThanOrEqual(4.5)
    colors.add(await page.locator('.shared-notes').evaluate(element => getComputedStyle(element).backgroundColor))
    await page.getByText('Design studio', { exact: true }).click()
    await tab('Characters').click()
    const kicker = page.locator('#character-dossiers .dossier-heading > p')
    await expect(kicker).toBeVisible()
    expect(await textContrast(kicker), `${name}: character heading kicker contrast`).toBeGreaterThanOrEqual(4.5)
    await tab('Cycle').click()
    const payoutRule = page.locator('.aftermath-checklist .aftermath-step-rule > p').first()
    await expect(payoutRule).toHaveText('Settle the score’s stacks, Rep and faction status changes.')
    expect(await textContrast(payoutRule), `${name}: Aftermath rule contrast`).toBeGreaterThanOrEqual(4.5)
    await tab('Overview').click()
    await expect(page.getByRole('link', { name: 'Open Mara Vey dossier', exact: true })).toBeVisible()
    await page.screenshot({ path: `test-results/design-${id}-desktop.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await chooseDesign(page, id, name)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: open chooser fits phone`).toBe(true)
    await page.getByText('Design studio', { exact: true }).click()
    await page.screenshot({ path: `test-results/design-${id}-mobile.png` })
    await tab('Notes').click()
    await expect(editor.getByLabel('Note body', { exact: true })).toHaveValue('Keep this unsaved transmission.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: editor fits phone`).toBe(true)
  }
  expect(colors.size).toBe(4)
  for (const [index, table] of ['characters', 'crews', 'codex'].entries()) {
    const after = await gm.from(table).select('*').eq('campaign_id', campaign).order('id')
    expect(after.error).toBeNull(); expect(after.data).toEqual(saved[index].data)
  }
})

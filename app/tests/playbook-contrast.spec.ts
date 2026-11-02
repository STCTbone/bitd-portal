import { test, expect } from '@playwright/test'

if (!['localhost', '127.0.0.1'].includes(new URL(process.env.VITE_SUPABASE_URL!).hostname)) throw new Error('Local backend required')

test('GM paranormal playbook labels remain readable outside a character dossier', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Campaign name', { exact: true }).fill('Readable playbook controls')
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
  await page.getByRole('tab', { name: 'Characters', exact: true }).click()
  const panel = page.getByRole('region', { name: 'GM paranormal availability', exact: true })
  await expect(panel.getByRole('checkbox')).toHaveCount(4)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const contrast = await panel.evaluate(section => {
      const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      const luminance = (channels: number[]) => channels.map(value => {
        value /= 255
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
      return [...section.querySelectorAll('h4, p, legend, label')].map(node => {
        let backdrop: Element | null = node
        while (backdrop && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(backdrop).backgroundColor)) backdrop = backdrop.parentElement
        const foreground = luminance(rgb(getComputedStyle(node).color))
        const background = luminance(rgb(getComputedStyle(backdrop!).backgroundColor))
        return { text: node.textContent?.trim(), ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) }
      })
    })
    for (const reading of contrast) expect(reading.ratio, reading.text).toBeGreaterThanOrEqual(4.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await panel.screenshot({ path: `test-results/playbook-controls-${width}.png` })
  }
})

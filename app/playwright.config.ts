import { defineConfig } from '@playwright/test'
const port = Number(process.env.PORTAL_PORT ?? 5173)
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1,
  use: { baseURL, headless: true, trace: 'retain-on-failure' },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
})

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const seed = 'placemat'
const token = process.env.RER_DEMO_MEASUREMENT_TOKEN
assert.ok(token, 'The run-demo environment has no measurement token')
const origin = `https://demo.test.run-${seed}.com`
const output = 'demo-proof'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const requests = []
let page
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies([{ name: 'rer_demo_measure', value: token, url: origin, secure: true, httpOnly: true, sameSite: 'Lax' }])
  page = await context.newPage()
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.origin !== origin || !['/__demo/start', '/__demo/status'].includes(url.pathname)) return
    requests.push({
      at: new Date().toISOString(),
      route: url.pathname,
      status: response.status(),
      correlation: response.headers()['x-rer-demo-correlation'] ?? null,
    })
  })
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.screenshot({ path: `${output}/start-1440.png` })
  const deadline = Date.now() + 180000
  let pressed = false
  while (Date.now() < deadline && !requests.some(request => request.route === '/__demo/status' && request.status === 200)) {
    const button = page.getByRole('button', { name: /start/i }).first()
    if (!pressed && !requests.length && await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      pressed = true
      await button.click({ timeout: 2000 }).catch(() => {})
    }
    await page.waitForTimeout(1000)
  }
  assert.ok(requests.some(request => request.route === '/__demo/start' && request.status === 202), 'The demo did not accept a start')
  const ready = requests.find(request => request.route === '/__demo/status' && request.status === 200)
  assert.ok(ready, 'The disposable demo did not become ready')
  const workspace = url => url.origin === origin && url.pathname.startsWith('/app')
  await page.waitForURL(workspace, { timeout: 15000 }).catch(() => page.goto(origin + '/app'))
  assert.ok(workspace(new URL(page.url())), 'The demo did not open its signed-in workspace')
  await page.waitForLoadState('domcontentloaded')
  const route = new URL(page.url()).pathname
  await page.getByRole('heading', { name: 'Fern & Fig', exact: true }).waitFor({ timeout: 30000 })
  const response = await page.request.get(origin + '/api/state', { maxRedirects: 0 })
  assert.equal(response.status(), 200)
  const { state } = await response.json()
  assert.equal(state.venue.name, 'Fern & Fig')
  const tables = state.tables.length, bookings = state.bookings.length
  assert.ok(tables > 0 && bookings > 0, 'The workspace must have its demo tables and reservations')
  const health = (await context.request.get(origin + '/health', { maxRedirects: 0 })).status()
  assert.equal(health, 200, 'The signed-in copy must be healthy')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: `${output}/workspace-${width}.png` })
  }
  await writeFile(`${output}/session.json`, JSON.stringify({ startedAt: ready.at, route, health, tables, bookings, requests }, null, 2) + '\n')
  console.log(`Session started at ${ready.at}. Workspace ${route} and health HTTP ${health}.`)
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png`, timeout: 5000 }).catch(() => {})
    console.error('Last browser route', new URL(page.url()).pathname)
  }
  await writeFile(`${output}/requests.json`, JSON.stringify(requests, null, 2) + '\n')
  throw error
} finally {
  await browser.close()
}

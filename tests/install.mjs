// Release/nightly public journey; first build dist/site with test:site.
// No checkout copy, source override, package pin or sample restaurant records.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, expect } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), site = join(root, 'dist/site')
const run = JSON.parse(await readFile(join(root, 'src/site/run.json'), 'utf8'))
const docs = JSON.parse(await readFile(join(root, 'docs/site.json'), 'utf8'))
const readme = await readFile(join(root, 'README.md'), 'utf8')
await readFile(join(site, 'index.html')) // Fail before launching anything if not built.
const scratch = await mkdtemp(join(tmpdir(), 'placemat-public-install-'))
const work = join(scratch, 'clean'), home = join(scratch, 'cli-home'), cache = join(scratch, 'npm-cache')
const owned = new Map()
let child, browser, server, tracker
const evidence = process.env.SITE_SCREENSHOTS && resolve(process.env.SITE_SCREENSHOTS)
async function screenshot(page, name) {
  if (!evidence) return
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, name + '.png'), fullPage: true })
}
const commands = page => page.locator('code').evaluateAll(nodes => nodes.map(node => {
  const copy = node.cloneNode(true)
  copy.querySelectorAll('[aria-hidden="true"], .cm').forEach(part => part.remove())
  return copy.textContent.trim()
}))
function launchFailure(message, output) {
  // Show actionable CLI failures, never ready/sign-in output or arbitrary logs.
  const causes = output.replace(/\u001b\[[0-9;]*m/g, '').split(/[\r\n]+/)
    .filter(line => /(?:Not started|\bError:|\brepair\b|^Run (?:npx|npm|rer)\b)/i.test(line))
    .filter(line => !/(?:RER_OPEN|RER_SIGNED_IN|secret|password|token|key|credential)/i.test(line))
    .slice(-6).map(line => line.replace(/https?:\/\/\S+/g, '[URL withheld]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email withheld]')
      .replace(/\b[A-Za-z0-9_+\/-]{24,}\b/g, '[value withheld]')
      .replace(/(?:--[\w-]+|[A-Z_]+)=\S+/g, '[argument withheld]').slice(0, 400))
  return Error(`SITE-001: ${message}${causes.length ? '\n' + causes.join('\n') : ' (credential output withheld)'}`)
}

// Track only our child's descendants, including detached launch workers.
// Remember start times too: never signal a recycled PID.
function processes() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8' }).trim().split('\n').map(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    return match && { pid: Number(match[1]), parent: Number(match[2]), start: match[3] }
  }).filter(Boolean)
}
function capture() {
  if (!child?.pid) return
  const rows = processes(), direct = rows.find(row => row.pid === child.pid)
  if (direct && !owned.has(direct.pid)) owned.set(direct.pid, direct.start)
  let added
  do {
    added = false
    for (const row of rows) {
      const parent = rows.find(candidate => candidate.pid === row.parent)
      if (!owned.has(row.pid) && parent && owned.get(parent.pid) === parent.start) {
        owned.set(row.pid, row.start); added = true
      }
    }
  } while (added)
}
async function stopOwned() {
  capture(); clearInterval(tracker)
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    capture()
    const live = new Map(processes().map(row => [row.pid, row.start]))
    for (const [pid, start] of [...owned].reverse()) {
      if (live.get(pid) !== start) continue
      try { process.kill(pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    if (signal === 'SIGTERM') await delay(1500)
  }
}

// Serve only real emitted files, with the static host's extensionless routes.
// This provides no application/API responses or fixture data.
async function serveSite() {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.woff2': 'font/woff2' }
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const target = resolve(site, '.' + (path === '/' ? '/index.html' : extname(path) ? path : path + '.html'))
      if (!target.startsWith(site + sep)) { response.writeHead(404).end(); return }
      const body = await readFile(target)
      response.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' }).end(body)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return `http://127.0.0.1:${server.address().port}`
}
async function launch(command) {
  const args = command.trim().split(/\s+/)
  assert.equal(args.shift(), 'npx', 'SITE-001: public command uses npx')
  assert.deepEqual(args.slice(0, 3), ['-y', '@runeditrun/rer', 'dev'], 'SITE-001: run the published unpinned installer')
  assert.equal(args.length, 4, 'SITE-001: public repository command has no source override or extra flags')
  assert.equal(`https://github.com/${args[3]}`, run.repository, 'SITE-001: command clones manifest repository')
  assert.deepEqual(await readdir(work), [], 'SITE-001: command starts in a clean directory')
  // Only the CLI gets scratch HOME. The Playwright driver keeps real HOME.
  child = spawn('npx', args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home, npm_config_cache: cache, CI: 'true', RER_BROWSER: '0' } })
  capture(); tracker = setInterval(capture, 500)
  let output = '', spawnError = false
  child.on('error', () => { spawnError = true })
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-2_000_000) })
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-2_000_000) }) // Keep credentials in memory only.
  const deadline = Date.now() + 600_000
  while (Date.now() < deadline) {
    const ready = output.match(/(?:^|[\r\n])RER_READY\s+(\S+)/), open = output.match(/(?:^|[\r\n])RER_OPEN\s+(\S+)/)
    if (ready && open) { capture(); return { origin: new URL(ready[1]).origin, open: open[1] } }
    if (spawnError || (child.exitCode !== null && child.exitCode !== 0) || child.signalCode) throw launchFailure('public installer failed before owner readiness', output)
    await delay(250)
  }
  throw launchFailure('public installer exceeded ten minutes', output)
}

try {
  await Promise.all([mkdir(work), mkdir(home)])
  const siteOrigin = await serveSite()
  browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  const context = await browser.newContext()
  context.setDefaultTimeout(60_000)
  const page = await context.newPage()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(siteOrigin)
    const action = page.getByRole('link', { name: `Run ${run.name}`, exact: true }).first()
    await expect(action, `SITE-001: ${width}px homepage main action targets /run`).toHaveAttribute('href', '/run')
    assert.ok((await commands(page)).includes(run.clone), `SITE-001: ${width}px homepage Run it yourself command matches manifest`)
    await screenshot(page, `homepage-${width}`)
    await action.click()
    await expect(page, `SITE-001: ${width}px homepage opens /run`).toHaveURL(siteOrigin + '/run')
    assert.ok((await commands(page)).includes(run.clone), 'SITE-001: /run command matches homepage and manifest')
    await screenshot(page, `run-${width}`)
    await page.goto(siteOrigin)
    const guideLink = page.getByRole('link', { name: 'Read the docs', exact: true }).first()
    await expect(guideLink, 'SITE-001: homepage owner guides action targets /docs').toHaveAttribute('href', '/docs')
    await guideLink.click()
    await expect(page, 'SITE-001: homepage opens /docs').toHaveURL(siteOrigin + '/docs')
    await screenshot(page, `docs-${width}`)
  }
  for (const { slug } of docs.sections.flatMap(section => section.pages)) {
    await page.goto(siteOrigin + '/docs')
    await page.locator(`a[href="/docs/${slug}"]`).first().click()
    await expect(page, `SITE-001: listed guide ${slug} opens`).toHaveURL(siteOrigin + '/docs/' + slug)
    await expect(page.locator('.docs-body'), `SITE-001: listed guide ${slug} is published`).toBeVisible()
  }
  assert.ok(readme.includes('`' + run.clone + '`') || readme.includes('\n' + run.clone + '\n'), 'SITE-001: README command matches manifest and public pages')
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  server = undefined
  const ready = await launch(run.clone), installed = join(work, run.folder)
  const health = await fetch(ready.origin + '/health', { signal: AbortSignal.timeout(30_000) })
  assert.equal(health.status, 200, 'SITE-001: fresh public installation health is ready')
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: installed, encoding: 'utf8' }).trim()
  assert.match(head, /^[a-f0-9]{40,64}$/, 'SITE-001: installer produced an identifiable source checkout')
  const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: installed, encoding: 'utf8' }).trim()
  assert.equal(origin.replace(/\.git$/, ''), run.repository, 'SITE-001: checkout came from public manifest repository')
  const installedPackage = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
  let publicCliVersion
  for (const entry of await readdir(join(cache, '_npx'))) {
    try { publicCliVersion = JSON.parse(await readFile(join(cache, '_npx', entry, 'node_modules/@runeditrun/rer/package.json'), 'utf8')).version } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  assert.ok(publicCliVersion, 'SITE-001: record public npm installer version actually fetched')
  console.log(`SITE-001 public source: ${head}; npm rer ${publicCliVersion}; checkout rer ${installedPackage.devDependencies?.['@runeditrun/rer'] ?? installedPackage.dependencies?.['@runeditrun/rer'] ?? 'vendored'}`)
  // Keep credential-bearing navigation URLs out of Playwright errors.
  try {
    await page.goto(ready.open)
    await expect(page, 'SITE-001: public command reaches owner setup').toHaveURL(ready.origin + '/setup')
  } catch { throw Error('SITE-001: owner link did not reach owner setup (credential withheld)') }
  await expect(page.getByRole('heading', { name: 'Finish setup', exact: true }), 'SITE-001: owner reviews first-run setup').toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await screenshot(page, `setup-${width}`)
  }
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
  await expect(page, 'SITE-001: finished setup opens restaurant operations').toHaveURL(ready.origin + '/app')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const lobby = await page.goto(ready.origin)
    assert.equal(lobby.headers()['x-rer-document'], 'lobby', `SITE-001: ${width}px installed root remains the Lobby`)
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }), 'SITE-001: claimed Lobby offers native sign-in').toBeVisible()
    await screenshot(page, `lobby-${width}`)
    await page.goto(ready.origin + '/app')
    await expect(page.locator('#floor-content .empty-room'), `SITE-001: ${width}px operations shows an empty restaurant`).toBeVisible()
    await screenshot(page, `empty-app-${width}`)
    const response = await context.request.get(ready.origin + '/api/state')
    assert.equal(response.status(), 200, 'SITE-001: browser owner session reads public state door')
    const snapshot = await response.json()
    assert.equal(snapshot.actor.role, 'owner', 'SITE-001: setup signs in the installation owner')
    for (const key of ['tables', 'services', 'bookings', 'waitlist', 'proposals', 'reminders', 'audit']) assert.deepEqual(snapshot.state[key], [], `SITE-001: fresh ${key} has no sample restaurant data`)
    assert.deepEqual(snapshot.guests, [], 'SITE-001: fresh guests has no sample restaurant data')
  }
  // OSS-001: finish a real service in the untouched public installation. No
  // licence, plan, payment account or provider setup is supplied at any stage.
  const request = async (path, body) => {
    const response = await context.request.post(ready.origin + path, { headers: { origin: ready.origin }, data: body })
    assert.ok(response.ok(), `OSS-001: installed ${path} succeeds (${response.status()})`)
    return response.json()
  }
  const command = async (command, payload) => (await request('/api/commands', { command, payload })).result
  await command('venue.update', { name: 'Cedar & Salt', timezone: 'America/New_York' })
  await command('table.save', { label: 'Window 4', seats: 4, x: 40, y: 40 })
  const start = new Date(Date.now() + 7 * 86400000); start.setUTCMinutes(0, 0, 0)
  const shift = await command('service.save', { name: 'Friday dinner', startAt: start.toISOString(), endAt: new Date(+start + 4 * 3600000).toISOString(), turnMinutes: 90, coverLimit: 12 })
  const publication = await command('proposal.prepare', { kind: 'service.publish', plan: { serviceId: shift.id }, reason: 'Review our first dinner service' })
  await command('proposal.approve', { proposalId: publication.id })
  const reservation = (await request('/api/public/book', { serviceId: shift.id, startAt: shift.startAt, partySize: 4, name: 'Jordan Rivera', email: 'jordan@example.test' })).result
  await command('booking.status', { bookingId: reservation.id, status: 'seated' })
  await command('booking.status', { bookingId: reservation.id, status: 'completed' })
  await command('booking.stage', { bookingId: reservation.id, stage: 'ready' })
  await command('service.close', { serviceId: shift.id, reason: 'Dinner completed' })
  const completedResponse = await context.request.get(ready.origin + '/api/state')
  assert.equal(completedResponse.status(), 200, 'OSS-001: installed owner retains service history')
  const completed = await completedResponse.json()
  assert.equal(completed.state.bookings.find(b => b.id === reservation.id).status, 'completed', 'OSS-001: free installation completes the reservation')
  assert.ok(completed.state.services.find(s => s.id === shift.id).closedAt, 'OSS-001: free installation closes its service')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(ready.origin + '/app')
    await expect(page.getByRole('heading', { name: 'Cedar & Salt', exact: true })).toBeVisible()
    await expect(page.locator('#floor-content')).toContainText('Friday dinner')
    await screenshot(page, `OSS-001-completed-service-${width}`)
  }
  console.log('OSS-001 passed: exact public install command → owner setup → published/booked/seated/completed/closed service without licence, plan or payment setup.')
  console.log('SITE-001 passed: homepage → run/docs → exact npm command → owner setup → Lobby → empty operations at 1440px and 390px.')
} finally {
  try { await browser?.close() } finally {
    try { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } } finally {
      try { await stopOwned() } finally { await rm(scratch, { recursive: true, force: true }) }
    }
  }
}

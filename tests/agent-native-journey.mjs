import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { methods, promptClient } from './agent-prompt-client.mjs'

const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.message?.error?.data?.code
export default async function journey({ request, origin, cookie, tool, docsOrigin = origin }) {
  const person = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await request(new URL(path, origin).href, { method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.ok(response.ok, `Native person request returned ${response.status}`)
    return response.json()
  }
  const state = () => person('/api/state')
  const credential = (await person('/api/agent-keys', { name: 'Coordinator prompt reader' })).result
  const mcp = promptClient({ request, origin, token: credential.key })
  const discovery = await mcp(methods.discover)
  assert.ok(discovery.result.capabilities.prompts)
  const listing = await mcp(methods.list), registry = await mcp(methods.tools)
  const publication = listing.result.prompts.find(prompt => prompt.name.includes('publication'))
  assert.ok(publication, 'Discovery offers a publication preparation job')
  const prompt = await mcp(methods.get, { name: publication.name })
  const instructions = prompt.result.messages.map(message => message.content.text).join('\n')
  const names = ['.workspace.snapshot', '.workspace.revision', '.plans.prepare'].map(suffix => {
    const registered = registry.result.tools.find(tool => tool.name.endsWith(suffix))
    assert.ok(registered && instructions.includes(registered.name))
    return registered.name
  })
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)
  const draft = (await person('/api/commands', { command: 'service.save', payload: { name: 'Coordinator publication draft', startAt: day + 'T16:00:00Z', endAt: day + 'T18:00:00Z', turnMinutes: 60, coverLimit: 24 } })).result
  const snapshot = await tool(names[0], {})
  assert.ok(snapshot.result.structuredContent.data.services.some(service => service.id === draft.id && service.status === 'draft'))
  const revision = await tool(names[1], {})
  const before = await state()
  assert.equal(revision.result.structuredContent.data.version, before.version)
  const args = { kind: 'service.publish', plan: { serviceId: draft.id }, reason: 'Coordinator prepares; the restaurant reviewer decides', idempotency_key: randomUUID(), expected_revision: revision.result.structuredContent.data.version }
  const prepared = await tool(names[2], args)
  assert.ok(!prepared.result?.isError)
  const id = prepared.result.structuredContent.data.id
  const after = await state(), proposal = after.state.proposals.find(row => row.id === id)
  assert.equal(proposal.status, 'pending')
  assert.equal(proposal.preparedBy, after.actor.id)
  assert.equal(proposal.preparation.for.id, after.actor.id)
  assert.ok(proposal.preparation.agent.id)
  assert.equal(after.state.audit.find(row => row.subject === id).preparation.label, proposal.preparation.label)
  assert.equal(after.state.services.find(row => row.id === draft.id).status, 'draft')
  const confirmed = await tool(names[0], {})
  assert.equal(confirmed.result.structuredContent.data.proposals.find(row => row.id === id).status, 'pending')
  assert.equal(confirmed.result.structuredContent.data.services.find(row => row.id === draft.id).status, 'draft')
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, reason: 'A changed effect under the same key' })), 'idempotency_conflict')
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, idempotency_key: randomUUID() })), 'revision_conflict')
  for (const name of ['placemat.plans.execute', 'placemat.keys.manage', 'placemat.bookings.create', 'placemat.refunds.create']) {
    assert.equal(code(await tool(name, { idempotency_key: randomUUID() })), 'tool_not_found')
  }
  assert.equal((await state()).version, after.version)
  await person('/agents/api/pause', { paused: true })
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, idempotency_key: randomUUID() })), 'agents_paused')
  assert.equal((await state()).version, after.version)
  await person('/agents/api/pause', { paused: false })
  await person('/api/commands', { command: 'proposal.decline', payload: { proposalId: id } })
  const decided = await state(), final = decided.state.proposals.find(row => row.id === id)
  assert.equal(final.status, 'declined')
  assert.equal(final.approvedBy, decided.actor.id)
  assert.equal(decided.state.audit.findLast(row => row.subject === id).preparation, undefined)
  await docsProof(request, docsOrigin, registry.result.tools, listing.result.prompts, publication.name, instructions)
  await person('/api/agent-keys/' + credential.id, undefined, 'DELETE')
}

export async function afterStep({ request, origin, cookie, step, result, phase, outputs }) {
  if (['autonomous', 'held'].includes(phase) && step.tool.endsWith('.audit.inspect')) await reviewOperations({ request, origin, cookie, phase, outputs })
  if (step.tool !== 'placemat.plans.prepare') return
  const response = await request(new URL('/api/state', origin).href, { headers: { Cookie: cookie } })
  assert.ok(response.ok)
  const native = await response.json(), proposal = native.state.proposals.find(row => row.id === result.data.id)
  assert.equal(proposal.status, 'pending')
  assert.equal(proposal.preparedBy, native.actor.id)
  assert.equal(proposal.preparation.for.id, native.actor.id)
  assert.equal(proposal.preparation.label, `${proposal.preparation.agent.name} for ${proposal.preparation.for.name}`)
  assert.equal(native.state.audit.find(row => row.subject === proposal.id).preparation.label, proposal.preparation.label)
  assert.equal(native.state.audit.find(row => row.subject === proposal.id).source, 'company-agent')
}

// Verify the discovered review job against the native results the Base journey
// obtained under each policy, including its signed-in person approval leg.
export async function reviewOperations({ request, origin, cookie, phase, outputs }) {
  const person = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await request(new URL(path, origin).href, { method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.ok(response.ok, `Operations review person door returned ${response.status}`)
    return response.json()
  }
  const credential = (await person('/api/agent-keys', { name: 'Operations review reader' })).result
  const mcp = promptClient({ request, origin, token: credential.key })
  try {
    assert.ok((await mcp(methods.discover)).result.capabilities.prompts)
    const registry = (await mcp(methods.tools)).result.tools
    const offered = (await mcp(methods.list)).result.prompts
    const job = offered.find(prompt => prompt.name.endsWith('.operations.review'))
    assert.ok(job, 'Discovery offers the operations review job')
    const instructions = (await mcp(methods.get, { name: job.name })).result.messages.map(message => message.content.text).join('\n')
    const names = [...new Set([...instructions.matchAll(/placemat\.[a-z.]+/g)].map(match => match[0].replace(/\.$/, '')))]
    const readers = registry.filter(tool => tool.annotations.readOnlyHint)
    assert.deepEqual(names.sort(), readers.map(tool => tool.name).sort())
    const surface = JSON.parse(await readFile(new URL('../agent-surface.json', import.meta.url), 'utf8'))
    const results = new Map(surface.journey.filter(step => Object.hasOwn(outputs, step.id)).map(step => [step.tool, outputs[step.id].data]))
    const snapshot = results.get(readers.find(tool => tool.name.endsWith('.workspace.snapshot')).name)
    const service = snapshot.services.find(service => service.status === 'published' && snapshot.bookings.some(booking => booking.serviceId === service.id))
    assert.ok(service, 'Review operates on a real populated service')
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: snapshot.venue.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(service.startAt))
    const date = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-')
    const before = await person('/api/state')
    const bookings = before.state.bookings.filter(booking => booking.serviceId === service.id)
    for (const registered of readers) {
      const properties = registered.inputSchema.properties
      const args = { ...(properties.serviceId ? { serviceId: service.id } : {}), ...(properties.date ? { date } : {}), ...(properties.partySize ? { partySize: 2 } : {}) }
      for (const required of registered.inputSchema.required ?? []) assert.ok(Object.hasOwn(args, required), 'Discovered schema is satisfied')
      const data = results.get(registered.name)
      assert.ok(data, 'The declared policy journey completed this job read')
      if (registered.name.endsWith('.workspace.snapshot')) {
        assert.deepEqual(data.services, before.state.services)
        assert.deepEqual(data.tables, before.state.tables)
        assert.ok(data.bookings.some(booking => booking.id === bookings[0].id))
      } else if (registered.name.endsWith('.workspace.revision')) assert.equal(data.version, before.version)
      else if (registered.name.endsWith('.guests.history')) {
        const native = await person('/api/guests')
        assert.ok(native.guests.length)
        assert.deepEqual(data.guests, native.guests)
      } else if (registered.name.endsWith('.availability.search')) {
        const native = await person('/api/public/search?' + new URLSearchParams(args))
        assert.ok(native.results.length)
        assert.deepEqual(data.results, native.results)
      } else if (registered.name.endsWith('.timeline.inspect')) {
        const native = await person('/api/timeline?' + new URLSearchParams(args))
        const fields = rows => rows.map(({ bookingId, guestName, tableNames, status, startAt }) => ({ bookingId, guestName, tableNames, status, startAt }))
        assert.ok(native.rows.length)
        assert.deepEqual(fields(data.rows), fields(native.rows))
      } else if (registered.name.endsWith('.staffing.inspect')) {
        const native = await person('/api/sections?' + new URLSearchParams(args))
        assert.equal(data.serviceId, service.id)
        assert.ok(native.servers.length && native.sections.length)
        assert.ok(native.servers.some(server => server.expectedBookingIds.includes(bookings[0].id)))
        assert.deepEqual(data.servers, native.servers)
        assert.deepEqual(data.sections, native.sections)
      } else if (registered.name.endsWith('.capacity.check')) {
        const native = await person('/api/pacing?' + new URLSearchParams(args))
        assert.ok(native.totalCovers > 0)
        assert.equal(data.totalCovers, native.totalCovers)
        assert.deepEqual(data.intervals, native.intervals)
      } else if (registered.name.endsWith('.allocations.advise')) {
        const native = await person('/api/allocation-advice?' + new URLSearchParams(args))
        assert.equal(data.allocation.serviceId, service.id)
        assert.deepEqual(data.allocation.before, native.before)
        assert.deepEqual(data.allocation.alternatives, native.alternatives)
      } else if (registered.name.endsWith('.audit.inspect')) {
        const native = await person('/api/audit')
        assert.ok(native.rows.some(row => row.action === 'service.save' && row.subject === service.id))
        assert.deepEqual(data.rows, native.rows)
      } else assert.fail('Operations job reader has no native outcome proof')
    }
    const after = await person('/api/state')
    assert.equal(after.version, before.version)
    assert.deepEqual(after.state, before.state)
    assert.deepEqual(after.guests, before.guests)
    console.log(`PROBE BASE-AGENT-013 operations-${phase}: discovered review job and ${readers.length} registered reads -> native parity after required person approvals; unchanged records`)
  } finally { await person('/api/agent-keys/' + credential.id, undefined, 'DELETE') }
}

async function docsProof(request, origin, tools, prompts, publication, instructions) {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.route(origin + '/**', async route => {
      const response = await request(route.request().url(), { method: 'GET' })
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(new URL('/docs/agents', origin).href)
      await page.locator('[data-agent-job] details').evaluateAll(nodes => nodes.forEach(node => node.open = true))
      if (width === 1440) {
        assert.deepEqual((await page.locator('[data-agent-tool]').evaluateAll(nodes => nodes.map(node => node.dataset.agentTool))).sort(), tools.map(tool => tool.name).sort())
        assert.deepEqual((await page.locator('[data-agent-job]').evaluateAll(nodes => nodes.map(node => node.dataset.agentJob))).sort(), prompts.map(prompt => prompt.name).sort())
        assert.equal(await page.locator(`[data-agent-job="${publication}"] details p`).textContent(), instructions)
        for (const tool of tools) {
          const section = page.locator(`[data-agent-tool="${tool.name}"]`)
          assert.ok((await section.textContent()).includes(tool._meta['com.runeditrun/scope']))
          for (const cls of tool._meta['com.runeditrun/classes']) assert.ok((await section.textContent()).includes(cls))
          assert.ok(await section.locator('[data-agent-class-fixture]').count())
        }
        assert.deepEqual(await page.evaluate(() => {
          const issues = []
          if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('Horizontal overflow')
          for (const el of document.querySelectorAll('main *')) {
            if (!el.getClientRects().length) continue
            const style = getComputedStyle(el)
            if ([...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) && parseFloat(style.fontSize) < 13) issues.push('Text below 13px')
            const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(style['border' + side + 'Width']))
            if (parseFloat(style.borderRadius) > 0 && sides.some(value => value > 0) && sides.some(value => value === 0)) issues.push('Partial rounded border')
          }
          return issues
        }), [])
        assert.deepEqual(errors, [])
      }
      if (process.env.PLACEMAT_SCREENSHOTS) {
        await mkdir(process.env.PLACEMAT_SCREENSHOTS, { recursive: true })
        await page.screenshot({ path: resolve(process.env.PLACEMAT_SCREENSHOTS, `BASE-AGENT-013-docs-${width}.png`), fullPage: true })
      }
    }
    await context.close()
  } finally { await browser.close() }
}

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { methods, promptClient } from './agent-prompt-client.mjs'

import { completedPublication, tightenedRecovery, recoveryCovered, persistedPublication } from './agent-replay.mjs'
import { csvRecords } from './api/business-fixture.mjs'

const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.message?.error?.data?.code
const target = service => ({ kind: 'service', id: service.id })
const claims = { target: { kind: 'booking', id: 'synthetic-placemat-3' }, confirmed: true, person_confirmation: true }
const historyAudits = new Map()
const historyKey = context => `${context.origin}:${context.phase}:${context.step.id}`
const personReads = ({ request, origin, cookie }) => async path => {
  const response = await request(new URL(path, origin).href, { headers: { Cookie: cookie } })
  assert.ok(response.ok)
  return response.json()
}
async function auditRows(person) {
  const rows = []
  let cursor
  for (let page = 0; page < 100; page++) {
    const result = await person(`/agents/api/audit${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`)
    rows.push(...result.rows)
    if (result.cursor === null || result.cursor === cursor) return rows
    cursor = result.cursor
  }
  assert.fail('Native audit pagination did not finish')
}

// A policy refusal still names the native target when schema and authority resolve.
export async function preparationRefusals({ person, tool, draft, published, refusal }) {
  const before = await person('/api/state')
  for (const [kind, service, classes] of [['service.publish', draft, ['standard']], ['reminders', published, ['sensitive', 'standard']]]) {
    const key = randomUUID()
    const answer = await tool('placemat.plans.prepare', { kind, plan: { serviceId: service.id }, reason: 'No preparation while policy refuses', idempotency_key: key, ...claims })
    assert.equal(code(answer), refusal)
    assert.equal(answer.result?.structuredContent, undefined)
    const row = (await auditRows(person)).find(row => row.idempotency_key === key)
    assert.deepEqual(row.resource, target(service))
    assert.deepEqual(row.classes.map(item => item.class).sort(), classes)
    assert.equal(row.code, refusal)
    assert.equal(row.outcome, 'refused')
  }
  assert.deepEqual(await person('/api/state'), before)
  console.log(`PROBE BASE-AGENT-009 ${refusal}: resolvable native services retain targets and classes; native state unchanged`)
}

export default async function journey({ request, origin, cookie, tool, docsOrigin = origin }) {
  recoveryCovered(origin)
  await persistedPublication()
  const person = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await request(new URL(path, origin).href, { method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.ok(response.ok, `Native person request returned ${response.status}`)
    return response.json()
  }
  const state = () => person('/api/state')
  const promptCredential = (await person('/api/agent-keys', { name: 'Coordinator prompt reader' })).result
  const mcp = promptClient({ request, origin, token: promptCredential.key })
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
  const repeated = await tool('placemat.plans.prepare', { ...args, ...claims })
  assert.deepEqual(repeated.result.structuredContent, prepared.result.structuredContent)
  assert.deepEqual(repeated.decision.classes, prepared.decision.classes)
  assert.deepEqual(await state(), after)
  const calls = (await auditRows(person)).filter(row => row.idempotency_key === args.idempotency_key)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(row => row.resource), [target(draft), target(draft)])
  assert.equal(calls[1].replay_of, calls[0].id)
  assert.ok(['target', 'confirmed', 'person_confirmation'].every(name => calls[1].ignored_arguments.includes(name)))
  console.log('PROBE BASE-AGENT-009 replay: claimed target and person confirmation ignored; original service target retained; no second proposal')
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, reason: 'A changed effect under the same key' })), 'idempotency_conflict')
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, idempotency_key: randomUUID() })), 'revision_conflict')
  for (const name of ['placemat.plans.execute', 'placemat.keys.manage', 'placemat.bookings.create', 'placemat.refunds.create']) {
    assert.equal(code(await tool(name, { idempotency_key: randomUUID() })), 'tool_not_found')
  }
  assert.equal((await state()).version, after.version)
  const published = after.state.services.find(row => row.name === 'Agent journey dinner')
  for (const [kind, service] of [['service.publish', draft], ['reminders', published]]) {
    const missingKey = randomUUID()
    const missing = await tool('placemat.plans.prepare', { kind, plan: { serviceId: service.id + '-missing' }, reason: 'Missing native record must not resolve', idempotency_key: missingKey, ...claims })
    assert.equal(code(missing), 'resource_unavailable')
    assert.equal(missing.result?.structuredContent, undefined)
    const missingRow = (await auditRows(person)).find(row => row.idempotency_key === missingKey)
    assert.equal(missingRow.resource, null)
    assert.deepEqual(missingRow.classes, [])
    const unauthenticated = await tool('placemat.plans.prepare', { kind, plan: { serviceId: service.id }, reason: 'Identity claims grant no native access', idempotency_key: randomUUID(), ...claims }, { token: '' })
    assert.equal(unauthenticated.status, 401)
    assert.equal(unauthenticated.result?.structuredContent, undefined)
    assert.ok(!JSON.stringify([missing, unauthenticated]).includes(service.name))
  }
  assert.deepEqual(await state(), after)
  console.log('PROBE BASE-AGENT-009 private records: missing and unauthenticated preparation disclose no service content and change no native state')
  const credential = (await person('/api/agent-keys', { name: 'synthetic-placemat-4' })).result
  await person(`/api/agent-keys/${credential.id}`, undefined, 'DELETE')
  const revokedState = await state()
  for (const [kind, service] of [['service.publish', draft], ['reminders', published]]) {
    const revoked = await tool('placemat.plans.prepare', { kind, plan: { serviceId: service.id }, reason: 'Revoked preparation identity must not resolve private targets', idempotency_key: randomUUID(), ...claims }, { token: credential.key })
    assert.equal(revoked.status, 401)
    assert.equal(revoked.result?.structuredContent, undefined)
    assert.ok(!JSON.stringify(revoked).includes(service.name))
  }
  assert.deepEqual(await state(), revokedState)
  console.log('PROBE BASE-AGENT-009 revoked credential: existing service targets confer no access; private content withheld and native state unchanged')
  await person('/agents/api/pause', { paused: true })
  await preparationRefusals({ person, tool, draft, published, refusal: 'agents_paused' })
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, idempotency_key: randomUUID() })), 'agents_paused')
  assert.equal((await state()).version, revokedState.version)
  await person('/agents/api/pause', { paused: false })
  await person('/api/commands', { command: 'proposal.decline', payload: { proposalId: id } })
  const decided = await state(), final = decided.state.proposals.find(row => row.id === id)
  assert.equal(final.status, 'declined')
  assert.equal(final.approvedBy, decided.actor.id)
  assert.deepEqual(final.preparation, proposal.preparation)
  await attributionExports({ request, origin, cookie }, final)
  assert.equal(decided.state.audit.findLast(row => row.subject === id).preparation, undefined)
  await docsProof(request, docsOrigin, registry.result.tools, listing.result.prompts, publication.name, instructions)
  await person('/api/agent-keys/' + promptCredential.id, undefined, 'DELETE')
}

export async function beforeStep(context) {
  if (context.phase === 'held' && context.step.id === 'workspace-snapshot') await tightenedRecovery(context)
  if (context.step.tool === 'placemat.guests.history') {
    const rows = await auditRows(personReads(context))
    historyAudits.set(historyKey(context), rows.at(-1)?.sequence ?? 0)
  }
}

export async function afterStep({ request, origin, cookie, step, args, phase, result, tool, outputs }) {
  if (step.tool === 'placemat.guests.history') {
    const person = personReads({ request, origin, cookie })
    const visible = (await person('/api/guests?search=' + encodeURIComponent(args.search ?? ''))).guests
    assert.deepEqual(result.data.guests.map(row => row.id).sort(), visible.map(row => row.id).sort())
    assert.equal(visible.length, step.expect[0].facts.measure)
    assert.ok(visible.every(row => !row.erased))
    const key = historyKey({ origin, phase, step })
    assert.ok(historyAudits.has(key))
    const rows = (await auditRows(person)).filter(row => row.tool === step.tool && row.sequence > historyAudits.get(key))
    historyAudits.delete(key)
    assert.ok(rows.length)
    for (const row of rows) assert.deepEqual(row.classes, step.expect)
    if (phase === 'held') {
      const pending = rows.find(row => row.outcome === 'pending')
      assert.ok(pending)
      const execution = rows.find(row => row.decision_id === pending.id)
      assert.equal(execution.outcome, 'done')
      assert.deepEqual(execution.classes, step.expect)
    }
    console.log(`PROBE BASE-AGENT-006 ${phase} ${step.id}: native search and MCP identities agree; audited sensitive measure=${visible.length}; facts contain no guest values`)
    return
  }
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
  await attributionExports({ request, origin, cookie }, proposal)
  const person = async path => {
    const response = await request(new URL(path, origin).href, { headers: { Cookie: cookie } })
    assert.ok(response.ok)
    return response.json()
  }
  const service = native.state.services.find(row => row.name === (proposal.kind === 'service.publish' ? 'Agent journey draft' : 'Agent journey dinner'))
  assert.equal(proposal.plan.serviceId, service.id)
  const replayed = await tool(step.tool, { ...args, ...claims })
  assert.deepEqual(replayed.result?.structuredContent, result)
  assert.deepEqual(await person('/api/state'), native)
  const rows = (await auditRows(person)).filter(row => row.idempotency_key === args.idempotency_key)
  assert.ok(rows.length >= 2)
  for (const row of rows) assert.deepEqual(row.resource, target(service))
  assert.ok(rows.some(row => row.outcome === 'replayed' && row.replay_of))
  if (phase === 'held' && proposal.kind === 'reminders') {
    const pending = rows.find(row => row.outcome === 'pending')
    const execution = rows.find(row => row.decision_id === pending.id)
    assert.equal(execution.outcome, 'done')
    assert.ok(execution.approval.by.includes(native.actor.id))
    const { approval } = await person(`/agents/api/approvals/${pending.approval.id}`)
    assert.deepEqual(approval.summary.nativeTarget, target(service))
    assert.equal(approval.state, 'executed')
  }
  if (phase === 'blocked:sensitive' && proposal.kind === 'reminders') {
    const refused = rows.find(row => row.code === 'policy_blocked')
    assert.equal(refused.outcome, 'refused')
    assert.deepEqual(refused.classes.map(item => item.class).sort(), ['sensitive', 'standard'])
  }
  console.log(`PROBE BASE-AGENT-009 ${phase} ${proposal.kind}: native service target retained through admission and replay${phase === 'held' && proposal.kind === 'reminders' ? ', approval summary and execution audit' : ''}`)
  if (['autonomous', 'held'].includes(phase) && step.id === 'prepare-publication') await completedPublication({ request, origin, cookie }, phase)
}

// Both existing policy journeys retain the independently stored preparation identity in owner exports.
async function attributionExports({ request, origin, cookie }, proposal) {
  for (const path of ['/api/business-export/proposals.csv', '/api/audit.csv?' + new URLSearchParams({ subject: proposal.id })]) {
    const response = await request(new URL(path, origin).href, { headers: { Cookie: cookie } })
    assert.ok(response.ok)
    const rows = csvRecords(await response.text())
    const row = rows.find(row => path.startsWith('/api/audit.csv') ? row.action === 'proposal.prepare' && row.subject === proposal.id : row.id === proposal.id)
    assert.ok(row)
    const exported = JSON.parse(row.data_json)
    assert.deepEqual(exported.preparation, proposal.preparation)
    if (path.startsWith('/api/business-export/')) assert.equal(exported.approvedBy, proposal.approvedBy)
  }
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
    const results = new Map(surface.journey.filter(step => Object.hasOwn(outputs, step.id) && (step.tool !== 'placemat.guests.history' || step.id === 'guests-history')).map(step => [step.tool, outputs[step.id].data]))
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

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
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

export async function afterStep({ request, origin, cookie, step, result }) {
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

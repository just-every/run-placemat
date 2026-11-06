import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installation } from './api/harness.mjs'
import { preparationDoors } from './agent-replay.mjs'

const approvalPath = approval => '/agents/api/approvals/' + approval.id
const evidence = approval => ({ revision: approval.revision, summary_sha256: approval.summary_sha256 })
const operations = state => Object.fromEntries(Object.entries(state).filter(([key]) => !['proposals', 'audit'].includes(key)))

// The same native lifecycle runs in normal agent conformance and the browser shard.
export async function approvalOutcomes(screens) {
  let now = Date.parse('2030-06-01T12:00:00Z')
  const h = await installation({ entry: 'tests/api/clock-worker.mjs', clock: () => now })
  try {
    await h.command('table.save', { label: 'Window four', seats: 4, x: 25, y: 40 })
    const draft = await h.command('service.save', { name: 'Cedar & Salt private tasting service',
      startAt: '2030-06-05T18:00:00Z', endAt: '2030-06-05T20:00:00Z', turnMinutes: 60, coverLimit: 24 })
    const owner = (await h.api('/api/state')).actor
    const credential = (await h.api('/api/agent-keys', { name: 'synthetic-placemat-1' })).result
    const document = { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1',
      rules: [{ id: 'native-preparation', class: '*', do: 'approval', approver: ['person:' + owner.id], wait: 'PT1H' }], spend: { none: true } }
    await h.api('/agents/api/policy', { document }, { method: 'PUT' })
    const { call } = preparationDoors({ origin: h.origin, cookie: h.cookie, request: (absolute, init) =>
      h.mf.dispatchFetch(absolute, { ...init, headers: { ...init.headers, 'x-placemat-test-clock': String(now) } }) })
    const before = await h.api('/api/state')
    const args = () => ({ kind: 'service.publish', plan: { serviceId: draft.id },
      reason: 'Private tasting is awaiting the restaurant publication decision',
      expected_revision: before.version, idempotency_key: randomUUID() })
    const decide = async (approval, action) => {
      if (screens) return screens.decide(h, approval, action, now)
      const response = await h.request(approvalPath(approval) + '/' + action, { method: 'POST', body: evidence(approval) })
      return { status: response.status, body: await response.json() }
    }
    const pending = async input => {
      const answer = await call(credential.key, input)
      assert.equal(answer.status, 200)
      assert.equal(answer.body.result?.resultType, 'input_required')
      assert.equal(answer.body.result.structuredContent, undefined)
      const handle = answer.body.result._meta['com.runeditrun/approval']
      assert.ok(handle?.id)
      assert.equal(new URL(handle.url).pathname, '/agents/approvals/' + handle.id)
      const { approval } = await h.api(approvalPath(handle))
      assert.equal(approval.state, 'pending')
      assert.equal(approval.expires_at, handle.expires_at)
      assert.ok(Date.parse(approval.expires_at) > now)
      assert.deepEqual(approval.approvers, ['person:' + owner.id])
      assert.deepEqual(approval.classes, [{ class: 'standard', facts: { measure: 1 } }])
      assert.deepEqual(approval.summary.nativeTarget, { kind: 'service', id: draft.id })
      assert.deepEqual(await h.api('/api/state'), before, 'Waiting creates no native proposal or operational effect')
      return approval
    }
    const refused = async (input, expected) => {
      const answer = await call(credential.key, input)
      assert.equal(answer.status, 200)
      assert.equal(answer.body.result?.isError, true)
      assert.equal(answer.body.result._meta['com.runeditrun/error'].code, expected)
      assert.equal(answer.body.result.structuredContent, undefined)
      assert.equal(answer.body.result._meta['com.runeditrun/receipt'], undefined)
      for (const privateValue of [draft.name, input.reason, credential.key]) {
        assert.ok(!JSON.stringify(answer.body).includes(privateValue), 'Refusal withholds private preparation content')
      }
      assert.deepEqual(await h.api('/api/state'), before, 'Refusal preserves the complete native witness')
    }

    const rejectedArgs = args(), rejection = await pending(rejectedArgs)
    await screens?.pending(h, rejection, now)
    const rejected = await decide(rejection, 'reject')
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.approval.state, 'rejected')
    assert.deepEqual(rejected.body.approval.approvals, [])
    await screens?.terminal(h, rejected.body.approval, now)
    for (let attempt = 0; attempt < 2; attempt++) await refused(rejectedArgs, 'approval_rejected')
    const afterReject = await h.request(approvalPath(rejection) + '/approve', { method: 'POST', body: evidence(rejection) })
    assert.equal(afterReject.status, 200)
    assert.equal((await afterReject.json()).approval.state, 'rejected', 'Late approval cannot revive a declined preparation')
    assert.deepEqual(await h.api('/api/state'), before)
    console.log('PROBE BASE-AGENT-007 rejection: MCP pending preparation, named signed-in person declines, exact-key retries and late approval -> approval_rejected, no private result or native effect')

    const expiredArgs = args(), expiring = await pending(expiredArgs)
    const deadline = Date.parse(expiring.expires_at)
    now = deadline - 1
    const waiting = await call(credential.key, expiredArgs)
    assert.equal(waiting.body.result?.resultType, 'input_required', 'The saved request still waits immediately before its deadline')
    assert.deepEqual(waiting.body.result._meta['com.runeditrun/approval'], { id: expiring.id,
      url: h.origin + '/agents/approvals/' + expiring.id, expires_at: expiring.expires_at }, 'A retry never extends the saved deadline')
    assert.deepEqual((await h.api(approvalPath(expiring))).approval, expiring)
    assert.deepEqual(await h.api('/api/state'), before)
    await screens?.pending(h, expiring, now)
    now = deadline
    await refused(expiredArgs, 'approval_expired')
    const expired = (await h.api(approvalPath(expiring))).approval
    assert.equal(expired.state, 'expired', 'Expiry applies at the exact saved deadline')
    const late = await decide(expiring, 'approve')
    assert.equal(late.status, 409)
    assert.equal(late.body.code, 'approval_expired')
    assert.deepEqual((await h.api(approvalPath(expiring))).approval, expired)
    await screens?.terminal(h, expired, now)
    now = deadline + 1
    await refused(expiredArgs, 'approval_expired')
    for (const input of [rejectedArgs, expiredArgs]) {
      const rows = (await h.api('/agents/api/audit?agent=' + credential.id)).rows.filter(row => row.idempotency_key === input.idempotency_key)
      assert.ok(rows.some(row => row.outcome === 'pending'))
      assert.ok(!rows.some(row => row.outcome === 'done'), 'A terminal refusal has no successful execution audit')
    }
    console.log('PROBE BASE-AGENT-007 expiry: saved deadline minus 1 ms -> same pending handle; exact deadline and beyond, exact-key retry and stale signed-in approval -> approval_expired, no private result or native effect')

    const successArgs = args(), successful = await pending(successArgs)
    await screens?.pending(h, successful, now)
    const approved = await decide(successful, 'approve')
    assert.equal(approved.status, 200)
    assert.equal(approved.body.approval.state, 'executed')
    assert.deepEqual(approved.body.approval.approvals.map(mark => mark.person), [owner.id])
    const result = (await call(credential.key, successArgs)).body.result
    assert.equal(result.isError, false)
    assert.equal(result._meta['com.runeditrun/receipt'].approval_id, successful.id)
    const prepared = await h.api('/api/state')
    assert.equal(prepared.state.proposals.length, before.state.proposals.length + 1)
    const proposal = prepared.state.proposals.find(row => row.id === result.structuredContent.data.id)
    assert.ok(proposal)
    assert.equal(proposal.status, 'pending', 'Approval authorizes only a restaurant proposal preparation')
    assert.equal(proposal.preparation.for.id, owner.id)
    assert.equal(proposal.preparation.agent.id, credential.id)
    assert.equal(prepared.state.services.find(row => row.id === draft.id).status, 'draft')
    assert.deepEqual(operations(prepared.state), operations(before.state), 'Preparation publishes nothing and changes no operational data')
    assert.deepEqual(prepared.guests, before.guests)
    for (let attempt = 0; attempt < 2; attempt++) {
      const replay = (await call(credential.key, successArgs)).body.result
      assert.deepEqual(replay.structuredContent, result.structuredContent)
      assert.deepEqual(replay._meta['com.runeditrun/receipt'], result._meta['com.runeditrun/receipt'])
      assert.deepEqual(await h.api('/api/state'), prepared, 'Approved retry creates no second proposal')
    }
    await screens?.terminal(h, approved.body.approval, now)
    assert.equal(h.messages.length, 0, 'Neither refusal nor successful preparation sends outbound mail')
    assert.equal(h.analytics.length, 0)
    console.log('PROBE BASE-AGENT-007 contrast: named person approves a fresh MCP preparation -> exactly one pending restaurant proposal and replay receipt; service stays draft, no publication or outbound effect')
  } finally { try { await screens?.close() } finally { await h.close() } }
}

async function approvalScreens(browser) {
  const { browserServer } = await import('./browser-server.mjs')
  const shots = process.env.PLACEMAT_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  let transport, context, page
  const errors = []
  const open = async (h, approval, now) => {
    if (!context) {
      transport = await browserServer(h)
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true, timezoneId: 'UTC' })
      await context.addCookies(h.cookie.split('; ').map(value => {
        const at = value.indexOf('=')
        return { name: value.slice(0, at), value: value.slice(at + 1), url: transport.origin, secure: true, sameSite: 'Lax' }
      }))
      page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: now })
    }
    await context.setExtraHTTPHeaders({ 'x-placemat-test-clock': String(now) })
    await page.clock.setFixedTime(now)
    await page.goto(transport.origin + '/agents/approvals/' + approval.id)
    await page.locator(`[data-approval-state="${approval.state}"]`).waitFor()
  }
  const capture = async (approval, state) => {
    if (!shots) return
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.locator('[data-approval-summary]').isVisible())
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Approval fits the viewport')
      await page.screenshot({ path: resolve(shots, `BASE-AGENT-007-${approval.id}-${state}-${width}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  return {
    async pending(h, approval, now) {
      await open(h, approval, now)
      assert.ok(await page.locator('[data-approval-action="approve"]').isVisible())
      assert.ok(await page.locator('[data-approval-action="reject"]').isVisible())
      await capture(approval, 'pending')
    },
    async decide(h, approval, action, now) {
      await context.setExtraHTTPHeaders({ 'x-placemat-test-clock': String(now) })
      await page.clock.setFixedTime(now)
      const response = page.waitForResponse(response => new URL(response.url()).pathname === approvalPath(approval) + '/' + action)
      await page.locator(`[data-approval-action="${action}"]`).click()
      const answer = await response, body = await answer.json()
      if (answer.status() === 409) {
        await page.locator('#action-status:focus').waitFor()
        assert.ok((await page.locator('#action-status').innerText()).trim(), 'The stale approval reports its refusal to the person')
      }
      else await page.locator(`[data-approval-state="${body.approval.state}"]`).waitFor()
      return { status: answer.status(), body }
    },
    async terminal(h, approval, now) {
      await open(h, approval, now)
      assert.equal(await page.locator('[data-approval-action]').count(), 0, 'Terminal approval offers no decision controls')
      await capture(approval, approval.state)
    },
    async close() {
      try { assert.deepEqual(errors, []) } finally { await context?.close(); await transport?.close() }
    },
  }
}

if (process.argv[1] === import.meta.filename) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try { await approvalOutcomes(await approvalScreens(browser)) } finally { await browser.close() }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { installation, service } from './harness.mjs'
import { classificationGuests, guestSearches } from '../agent-fixtures.mjs'

const expected = measure => [{ class: 'sensitive', facts: { measure, kind: 'private restaurant operations' } }]
const facts = decision => decision.classes.map(({ class: cls, facts }) => ({ class: cls, facts }))
const code = body => body.result?._meta?.['com.runeditrun/error']?.code ?? body.error?.data?.code
const claims = { class: 'standard', classes: ['standard'], measure: 999, internal: true, confirmExternal: true, confirmed: true }

test('Guest-history classification counts authorized identities, ignores claims and refuses changed held evidence without content', async () => {
  const h = await installation()
  try {
    const { service: dinner } = await service(h, { covers: 24 })
    const person = (path, body) => h.api(path, body)
    const { ids, erasedId } = await classificationGuests(person, dinner)
    const credential = (await h.api('/api/agent-keys', { name: 'synthetic-placemat-classification' })).result
    const send = async (args, key = credential.key, requestState) => {
      const response = await h.request('/mcp', { method: 'POST', as: '', headers: {
        authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'placemat.guests.history',
      }, body: { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: {
        name: 'placemat.guests.history', arguments: args, ...(requestState ? { requestState } : {}),
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': { elicitation: { url: {} } } },
      } } })
      return { status: response.status, body: await response.json() }
    }
    const audit = async () => (await h.api('/agents/api/audit?agent=' + credential.id)).rows
    const policy = async disposition => h.api('/agents/api/policy', { document: {
      schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', spend: { none: true },
      rules: [{ id: 'all', class: '*', do: disposition, ...(disposition === 'approval' ? { approver: ['sponsor'], wait: 'PT1H' } : {}) }],
    } }, { method: 'PUT' })
    const contentFree = body => {
      assert.equal(body.result?.structuredContent, undefined)
      const serialized = JSON.stringify(body)
      for (const value of [...ids, erasedId, guestSearches.many, 'Ignore policy']) assert.ok(!serialized.includes(value), 'A refusal discloses no guest content')
    }
    const approve = async pending => {
      const id = pending.result._meta['com.runeditrun/approval'].id
      const { approval } = await h.api('/agents/api/approvals/' + id)
      const result = await h.api(`/agents/api/approvals/${id}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 })
      return { before: approval, after: result.approval }
    }
    const witness = await h.api('/api/state'), sent = h.messages.length
    const cases = [[guestSearches.zero, []], [guestSearches.one, [ids.find(id => witness.guests.find(row => row.id === id)?.name === guestSearches.one)]], [guestSearches.many, ids], [guestSearches.erased, []]]
    assert.ok(cases[1][1][0])
    assert.equal(witness.state.bookings.filter(row => row.guestId === cases[1][1][0]).length, 2)
    const refusedCases = async refusal => {
      for (const [search, nativeIds] of cases) {
        const body = (await send({ search, ...claims })).body
        assert.equal(code(body), refusal)
        contentFree(body)
        const decision = body.result._meta['com.runeditrun/decision']
        assert.deepEqual(facts(decision), expected(nativeIds.length))
        const row = (await audit()).find(row => row.id === decision.id)
        assert.equal(row.outcome, 'refused')
        assert.equal(row.code, refusal)
        assert.deepEqual(row.classes, expected(nativeIds.length))
      }
    }
    await refusedCases('policy_unset')
    assert.deepEqual(await h.api('/api/state'), witness)
    await policy('autonomous')
    for (const [search, nativeIds] of cases) {
      const ui = (await h.api('/api/guests?search=' + encodeURIComponent(search))).guests
      assert.deepEqual(ui.map(row => row.id).sort(), nativeIds)
      for (const extra of [{}, claims]) {
        const { status, body } = await send({ search, ...extra })
        assert.equal(status, 200)
        assert.equal(body.result.isError, false)
        assert.deepEqual(body.result.structuredContent.data.guests.map(row => row.id).sort(), nativeIds)
        const decision = body.result._meta['com.runeditrun/decision']
        assert.deepEqual(facts(decision), expected(nativeIds.length))
        const row = (await audit()).find(row => row.id === decision.id)
        assert.deepEqual(row.classes, expected(nativeIds.length))
        assert.equal(row.outcome, 'done')
        if (extra === claims) assert.ok(Object.keys(claims).every(name => row.ignored_arguments.includes(name)))
      }
    }
    assert.deepEqual(await h.api('/api/state'), witness)
    assert.equal(h.messages.length, sent)
    assert.equal(h.analytics.length, 0)
    console.log('PROBE BASE-AGENT-006 points 2 and 3: HTTP-created bookings, UI search and MCP -> measures 0, 1, 3 and erased 0; repeated identity counted once; record instructions and argument claims ignored')

    await policy('approval')
    for (const [search, nativeIds] of cases) {
      const args = { search, ...claims }, pending = (await send(args)).body
      contentFree(pending)
      assert.deepEqual(facts(pending.result._meta['com.runeditrun/decision']), expected(nativeIds.length))
      const approval = await approve(pending)
      assert.deepEqual(approval.before.classes, expected(nativeIds.length))
      assert.equal(approval.after.state, 'executed')
      const completed = (await send(args, credential.key, pending.result.requestState)).body
      assert.equal(completed.result.isError, false)
      assert.deepEqual(completed.result.structuredContent.data.guests.map(row => row.id).sort(), nativeIds)
      const execution = (await audit()).find(row => row.decision_id === pending.result._meta['com.runeditrun/decision'].id)
      assert.deepEqual(execution.classes, expected(nativeIds.length))
    }

    const staleArgs = { search: guestSearches.many, ...claims }, pending = (await send(staleArgs)).body
    await h.api('/api/public/book', { serviceId: dinner.id, startAt: dinner.startAt, name: guestSearches.many + ' 5',
      email: ['synthetic-placemat-classification-5', 'example.invalid'].join('@'), partySize: 2 }, { as: '', status: 201 })
    const changed = await h.api('/api/state'), approval = await approve(pending)
    assert.deepEqual(approval.before.classes, expected(3))
    assert.equal(approval.after.state, 'refused')
    assert.equal(approval.after.code, 'approval_evidence_changed')
    const stale = (await send(staleArgs, credential.key, pending.result.requestState)).body
    assert.equal(code(stale), 'approval_evidence_changed')
    contentFree(stale)
    const refused = (await audit()).find(row => row.decision_id === pending.result._meta['com.runeditrun/decision'].id)
    assert.equal(refused.code, 'approval_evidence_changed')
    assert.deepEqual(refused.classes, expected(4))
    assert.deepEqual(await h.api('/api/state'), changed)
    console.log('PROBE BASE-AGENT-006 held execution: search grows from 3 to 4 before exact person approval -> approval_evidence_changed, audited current measure 4, no guest content or native effect')

    const retained = (await send(staleArgs)).body
    assert.equal((await approve(retained)).after.state, 'executed')
    assert.equal((await send(staleArgs, credential.key, retained.result.requestState)).body.result.structuredContent.data.guests.length, 4)
    const beforeErasure = (await send(staleArgs)).body
    const removed = changed.guests.find(row => row.name === guestSearches.many + ' 5')
    assert.ok(removed)
    await h.command('guest.erase', { guestId: removed.id, confirm: 'ERASE' })
    const erasedState = await h.api('/api/state'), erasureApproval = await approve(beforeErasure)
    assert.deepEqual(erasureApproval.before.classes, expected(4))
    assert.equal(erasureApproval.after.state, 'refused')
    assert.equal(erasureApproval.after.code, 'approval_evidence_changed')
    for (let replay = 0; replay < 2; replay++) {
      const refused = (await send(staleArgs, credential.key, beforeErasure.result.requestState)).body
      assert.equal(code(refused), 'approval_evidence_changed')
      contentFree(refused)
      assert.deepEqual(facts(refused.result._meta['com.runeditrun/decision']), expected(3))
    }
    const erasureAudit = (await audit()).find(row => row.decision_id === beforeErasure.result._meta['com.runeditrun/decision'].id)
    assert.equal(erasureAudit.code, 'approval_evidence_changed')
    assert.deepEqual(erasureAudit.classes, expected(3))
    const refreshed = (await send(staleArgs, credential.key, retained.result.requestState)).body
    assert.equal(refreshed.result.isError, false)
    assert.deepEqual(refreshed.result.structuredContent.data.guests.map(row => row.id).sort(), ids)
    assert.deepEqual(facts(refreshed.result._meta['com.runeditrun/decision']), expected(3))
    assert.ok(!JSON.stringify(refreshed).includes(removed.id))
    assert.ok(!JSON.stringify(refreshed).includes(removed.email))
    const refreshedAudit = (await audit()).find(row => row.id === refreshed.result._meta['com.runeditrun/decision'].id)
    assert.equal(refreshedAudit.outcome, 'replayed')
    assert.deepEqual(refreshedAudit.classes, expected(3))
    const uiAfterErasure = (await h.api('/api/guests?search=' + encodeURIComponent(guestSearches.many))).guests
    assert.deepEqual(uiAfterErasure.map(row => row.id).sort(), ids)
    await h.api('/api/public/book', { serviceId: dinner.id, startAt: dinner.startAt, name: removed.name,
      email: removed.email, partySize: 2 }, { as: '', status: 409 })
    assert.deepEqual(await h.api('/api/state'), erasedState)
    console.log('PROBE BASE-AGENT-006 erasure: held search falls from 4 to 3 -> stale approval and repeated capture refused; completed read replay refreshes native identities and facts; erased contact cannot rebook')

    await policy('blocked')
    await refusedCases('policy_blocked')
    assert.deepEqual(await h.api('/api/state'), erasedState)
    console.log('PROBE BASE-AGENT-006 refusal facts: unset and blocked policy -> no guest content or native effect; sensitive class and exact measures retained even for zero matches')

    await h.api('/agents/api/pause', { paused: true })
    for (const capture of [undefined, retained.result.requestState]) {
      const paused = (await send(staleArgs, credential.key, capture)).body
      assert.equal(code(paused), 'agents_paused'); contentFree(paused)
    }
    await h.api('/agents/api/pause', { paused: false })
    await policy('autonomous')
    assert.equal((await send({ search: guestSearches.many })).body.result.structuredContent.data.guests.length, 3)
    const unauthenticated = await send(staleArgs, '')
    assert.equal(unauthenticated.status, 401); contentFree(unauthenticated.body)
    await h.api('/api/agent-keys/' + credential.id, undefined, { method: 'DELETE' })
    const revokedState = await h.api('/api/state'), revoked = await send(staleArgs)
    assert.equal(revoked.status, 401); contentFree(revoked.body)
    const revokedCapture = await send(staleArgs, credential.key, retained.result.requestState)
    assert.equal(revokedCapture.status, 401); contentFree(revokedCapture.body)
    assert.deepEqual(await h.api('/api/state'), revokedState)
    assert.equal(h.messages.length, sent)
    assert.equal(h.analytics.length, 0)
    console.log('PROBE BASE-AGENT-006 authority: Pause, missing credential and revoked owner-issued key -> content-free refusal; resume permits ordinary reads; native state and outbound counts unchanged')
  } finally { await h.close() }
})

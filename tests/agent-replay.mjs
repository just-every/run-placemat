import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { replayDraft } from './agent-fixtures.mjs'
import { installation } from './api/harness.mjs'

const recoveries = new Map()
const facts = decision => decision.classes.map(({ class: cls, facts }) => ({ class: cls, facts }))
const error = answer => answer.result?._meta?.['com.runeditrun/error'] ?? answer.error?.data

function doors({ request, origin, cookie }) {
  const person = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await request(new URL(path, origin).href, { method,
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.ok(response.ok, `Replay person door returned HTTP ${response.status}`)
    return response.json()
  }
  const send = (key, args, id = randomUUID()) => request(new URL('/mcp', origin).href, {
    method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${key}`,
      Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'placemat.plans.prepare' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: {
      name: 'placemat.plans.prepare', arguments: args,
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
    } }),
  })
  const call = async (key, args) => {
    const id = randomUUID(), response = await send(key, args, id), body = await response.json()
    assert.equal(body.id, id, 'Each retry uses its own JSON-RPC response id')
    return { status: response.status, body }
  }
  return { person, send, call }
}

export async function completedPublication(context, phase = 'autonomous') {
  const { person, send, call } = doors(context)
  const draft = await replayDraft(person)
  const unconsumed = await replayDraft(person, 'synthetic-placemat-stale')
  const credential = (await person('/api/agent-keys', { name: 'synthetic-placemat-recovery' })).result
  const before = await person('/api/state')
  const args = { kind: 'service.publish', plan: { serviceId: draft.id },
    reason: 'synthetic-placemat-recovery', expected_revision: before.version, idempotency_key: randomUUID() }

  // Observe the native commit independently, then discard the unread response.
  const lostId = randomUUID(), lost = await send(credential.key, args, lostId)
  assert.equal(lost.status, 200)
  const prepared = await person('/api/state')
  const proposals = prepared.state.proposals.filter(row => row.plan.serviceId === draft.id)
  assert.equal(proposals.length, 1, 'The lost response left exactly one committed proposal')
  const originalResult = proposals[0]
  assert.equal(originalResult.status, 'pending')
  assert.equal(originalResult.preparation.agent.id, credential.id)
  assert.equal(prepared.state.services.find(row => row.id === draft.id).status, 'draft')
  await lost.body.cancel()

  const audit = await person('/agents/api/audit?agent=' + credential.id)
  const original = audit.rows.find(row => row.idempotency_key === args.idempotency_key)
  assert.equal(original.outcome, 'done')
  assert.deepEqual(original.resource, { kind: 'service', id: draft.id })
  assert.deepEqual(original.classes, [{ class: 'standard', facts: { measure: 1 } }])
  await person('/api/commands', { command: 'proposal.approve', payload: { proposalId: originalResult.id } })
  const published = await person('/api/state')
  assert.equal(published.state.services.find(row => row.id === draft.id).status, 'published')
  assert.equal(published.state.proposals.find(row => row.id === originalResult.id).approvedBy, published.actor.id)

  for (let retry = 0; retry < 2; retry++) {
    const { status, body } = await call(credential.key, args)
    assert.equal(status, 200)
    assert.equal(body.result?.isError, false, 'A consumed publication draft must replay successfully')
    assert.notEqual(body.id, lostId)
    assert.deepEqual(body.result.structuredContent, { data: originalResult }, 'Replay returns the original pending preparation result')
    assert.deepEqual(facts(body.result._meta['com.runeditrun/decision']), original.classes)
    assert.deepEqual(await person('/api/state'), published, 'Replay leaves the approved proposal and published service unchanged')
  }
  const rows = (await person('/agents/api/audit?agent=' + credential.id)).rows
  const replays = rows.filter(row => row.replay_of === original.id)
  assert.equal(replays.length, 2)
  assert.ok(replays.every(row => row.outcome === 'replayed'))
  for (const row of replays) {
    assert.deepEqual(row.classes, original.classes)
    assert.deepEqual(row.resource, original.resource)
  }
  console.log('PROBE BASE-AGENT-012 recovery: unread MCP response, person publication, new RPC ids -> original result, one proposal, unchanged service and original class facts')

  const conflict = await call(credential.key, { ...args, reason: 'synthetic-placemat-changed' })
  assert.equal(error(conflict.body)?.code, 'idempotency_conflict')
  assert.equal(conflict.body.result?.structuredContent, undefined)
  const stale = await call(credential.key, { ...args, plan: { serviceId: unconsumed.id }, idempotency_key: randomUUID() })
  assert.equal(error(stale.body)?.code, 'revision_conflict')
  assert.equal(error(stale.body).current_revision, published.version)
  const fresh = await call(credential.key, { ...args, expected_revision: published.version, idempotency_key: randomUUID() })
  assert.equal(error(fresh.body)?.code, 'native_conflict', 'A fresh call still requires an unconsumed draft')
  assert.deepEqual(await person('/api/state'), published)
  console.log('PROBE BASE-AGENT-012 conflicts: changed arguments, fresh stale revision and fresh consumed draft -> typed conflicts, current revision and no native effect')

  await person('/agents/api/pause', { paused: true })
  try {
    const paused = await call(credential.key, args)
    assert.equal(error(paused.body)?.code, 'agents_paused')
    assert.equal(paused.body.result?.structuredContent, undefined)
    for (const value of [originalResult.id, draft.name, args.reason]) {
      assert.ok(!JSON.stringify(paused.body).includes(value), 'Pause withholds the saved preparation content')
    }
    assert.deepEqual(await person('/api/state'), published)
  } finally { await person('/agents/api/pause', { paused: false }) }
  assert.equal((await call(credential.key, args)).body.result?.isError, false, 'Resume restores completed recovery')
  if (phase === 'autonomous') recoveries.set(context.origin, { credential, args, proposalId: originalResult.id, policyChecked: false, heldChecked: false })
  else {
    const saved = recoveries.get(context.origin)
    assert.ok(saved?.policyChecked, 'The held policy must first refuse the autonomous recovery')
    saved.heldChecked = true
  }
  console.log(`PROBE BASE-AGENT-012 ${phase}: completed publication recovery obeys the current company policy`)
  console.log('PROBE BASE-AGENT-012 pause: completed key while paused -> content-free refusal; resume -> recovery')
}

export async function tightenedRecovery(context) {
  const saved = recoveries.get(context.origin)
  assert.ok(saved, 'Autonomous recovery must run before the held-policy contrast')
  const { person, call } = doors(context), before = await person('/api/state')
  const tightened = await call(saved.credential.key, saved.args)
  assert.equal(error(tightened.body)?.code, 'review_required', 'Current held policy must refuse the older autonomous result')
  assert.equal(tightened.body.result?.structuredContent, undefined)
  for (const value of [saved.proposalId, saved.args.reason]) {
    assert.ok(!JSON.stringify(tightened.body).includes(value), 'Tightened policy withholds the saved preparation content')
  }
  assert.deepEqual(facts(tightened.body.result._meta['com.runeditrun/decision']), [{ class: 'standard', facts: { measure: 1 } }])
  assert.deepEqual(await person('/api/state'), before)
  await person('/api/agent-keys/' + saved.credential.id, undefined, 'DELETE')
  const afterRevocation = await person('/api/state')
  assert.ok(afterRevocation.keys.find(row => row.id === saved.credential.id).revoked_at)
  assert.deepEqual(afterRevocation.state, before.state)
  assert.equal(afterRevocation.version, before.version)
  const revoked = await call(saved.credential.key, saved.args)
  assert.equal(revoked.status, 401)
  assert.equal(revoked.body.result, undefined)
  for (const value of [saved.proposalId, saved.args.reason]) {
    assert.ok(!JSON.stringify(revoked.body).includes(value), 'Revocation withholds the saved preparation content')
  }
  assert.deepEqual(await person('/api/state'), afterRevocation)
  saved.policyChecked = true
  console.log('PROBE BASE-AGENT-012 authority: tightened held policy and revoked native credential -> content-free refusals, unchanged native state')
}

export function recoveryCovered(origin) {
  assert.equal(recoveries.get(origin)?.policyChecked, true, 'Normal conformance must execute completed recovery and held-policy refusal')
  assert.equal(recoveries.get(origin)?.heldChecked, true, 'Normal conformance must also execute completed recovery under the held policy')
  recoveries.delete(origin)
}

// The unpaired installation lets its owner select an approval policy through
// the real policy door. The clock and process lifetime belong to the harness.
export async function persistedPublication() {
  let now = Date.parse('2030-06-01T12:00:00Z')
  const h = await installation({ entry: 'tests/api/clock-worker.mjs', clock: () => now })
  try {
    const person = h.api
    await h.command('table.save', { label: 'synthetic-placemat-1', seats: 4, x: 25, y: 40 })
    const draft = await h.command('service.save', { name: 'synthetic-placemat-2',
      startAt: '2030-06-05T18:00:00Z', endAt: '2030-06-05T20:00:00Z', turnMinutes: 60, coverLimit: 24 })
    const credential = (await person('/api/agent-keys', { name: 'synthetic-placemat-3' })).result
    const policy = { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1',
      rules: [{ id: 'all', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }], spend: { none: true } }
    await person('/agents/api/policy', { document: policy }, { method: 'PUT' })
    const { call } = doors({ origin: h.origin, cookie: h.cookie, request: (absolute, init) =>
      h.mf.dispatchFetch(absolute, { ...init, headers: { ...init.headers, 'x-placemat-test-clock': String(now) } }) })
    const before = await person('/api/state')
    const args = { kind: 'service.publish', plan: { serviceId: draft.id }, reason: 'synthetic-placemat-4',
      expected_revision: before.version, idempotency_key: randomUUID() }
    const pending = (await call(credential.key, args)).body.result
    assert.equal(pending.resultType, 'input_required')
    assert.equal(pending.structuredContent, undefined)
    assert.deepEqual(await person('/api/state'), before, 'Pending approval creates no native proposal')
    const held = pending._meta['com.runeditrun/approval']
    assert.ok(held?.id)
    const snapshot = (await person('/agents/api/approvals/' + held.id)).approval
    const replayed = (await call(credential.key, args)).body.result
    assert.equal(replayed._meta['com.runeditrun/approval'].id, held.id)
    assert.equal(replayed.structuredContent, undefined)
    assert.deepEqual(await person('/api/state'), before)

    // A different person action consumes the draft before agent approval.
    const prepared = await h.command('proposal.prepare', { kind: args.kind, plan: args.plan, reason: 'synthetic-placemat-5' })
    await h.command('proposal.approve', { proposalId: prepared.id })
    const published = await person('/api/state')
    assert.equal(published.state.services.find(row => row.id === draft.id).status, 'published')
    const consumed = await call(credential.key, args)
    assert.equal(error(consumed.body)?.code, 'native_conflict', 'A pending call must still validate its consumed draft')
    assert.equal(consumed.body.result?.structuredContent, undefined)
    assert.deepEqual((await person('/agents/api/approvals/' + held.id)).approval, snapshot)
    const refused = (await person('/agents/api/approvals/' + held.id + '/approve',
      { revision: snapshot.revision, summary_sha256: snapshot.summary_sha256 })).approval
    assert.equal(refused.state, 'refused', 'Person approval cannot execute a consumed pending draft')
    assert.deepEqual(await person('/api/state'), published)
    console.log('PROBE BASE-AGENT-012 pending: pending publication, person consumes draft, retry -> native conflict; approval -> refused, no agent proposal or content')

    const revisionDraft = await h.command('service.save', { name: 'synthetic-placemat-6',
      startAt: '2030-06-06T18:00:00Z', endAt: '2030-06-06T20:00:00Z', turnMinutes: 60, coverLimit: 24 })
    const current = await person('/api/state')
    const revisionArgs = { ...args, plan: { serviceId: revisionDraft.id }, expected_revision: current.version, idempotency_key: randomUUID() }
    const revisionPending = (await call(credential.key, revisionArgs)).body.result._meta['com.runeditrun/approval']
    const revisionApproval = (await person('/agents/api/approvals/' + revisionPending.id)).approval
    await h.command('table.save', { label: 'synthetic-placemat-7', seats: 4, x: 65, y: 40 })
    const edited = await person('/api/state')
    const stale = (await person('/agents/api/approvals/' + revisionPending.id + '/approve',
      { revision: revisionApproval.revision, summary_sha256: revisionApproval.summary_sha256 })).approval
    assert.equal(stale.code, 'revision_conflict', 'Pending approval rechecks the native revision before preparing')
    assert.deepEqual(await person('/api/state'), edited)
    console.log('PROBE BASE-AGENT-012 pending revision: native table edit before approval -> revision conflict and no preparation')

    const recoveryArgs = { ...revisionArgs, expected_revision: edited.version, idempotency_key: randomUUID() }
    const recoveryPending = (await call(credential.key, recoveryArgs)).body.result
    assert.equal(recoveryPending.resultType, 'input_required')
    assert.deepEqual(await person('/api/state'), edited)
    const recoveryApprovalId = recoveryPending._meta['com.runeditrun/approval'].id
    const recoveryApproval = (await person('/agents/api/approvals/' + recoveryApprovalId)).approval
    const approved = (await person('/agents/api/approvals/' + recoveryApprovalId + '/approve',
      { revision: recoveryApproval.revision, summary_sha256: recoveryApproval.summary_sha256 })).approval
    assert.equal(approved.state, 'executed', 'A current exact approval prepares the native proposal once')
    const original = (await call(credential.key, recoveryArgs)).body.result
    assert.equal(original.isError, false)
    assert.equal(original._meta['com.runeditrun/receipt'].approval_id, recoveryApprovalId)
    const result = original.structuredContent
    assert.equal(result.data.status, 'pending', 'Agent approval still grants only native proposal preparation')
    const preparedState = await person('/api/state')
    assert.equal(preparedState.state.proposals.filter(row => row.plan.serviceId === revisionDraft.id).length, 1)
    assert.equal(preparedState.state.services.find(row => row.id === revisionDraft.id).status, 'draft')
    await h.command('proposal.approve', { proposalId: result.data.id })
    const completed = await person('/api/state')
    const originalAudit = (await person('/agents/api/audit?agent=' + credential.id)).rows.find(row => row.idempotency_key === recoveryArgs.idempotency_key)
    // Dispose the actual workerd process and start another against its same D1.
    await h.restart()
    for (const elapsed of [1, 24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000 + 1]) {
      now = Date.parse('2030-06-01T12:00:00Z') + elapsed
      const replay = (await call(credential.key, recoveryArgs)).body.result
      assert.equal(replay.isError, false)
      assert.deepEqual(replay.structuredContent, result)
      assert.deepEqual(replay._meta['com.runeditrun/receipt'], original._meta['com.runeditrun/receipt'])
      assert.deepEqual(facts(replay._meta['com.runeditrun/decision']), originalAudit.classes)
      // The owner session also remains within its native lifetime at this point.
      const state = await person('/api/state')
      assert.deepEqual(state.state, completed.state)
      assert.equal(state.version, completed.version)
      const audit = (await person('/agents/api/audit?agent=' + credential.id)).rows
      const row = audit.findLast(row => row.idempotency_key === recoveryArgs.idempotency_key)
      assert.equal(row.replay_of, originalAudit.id)
      assert.deepEqual(row.resource, originalAudit.resource)
    }
    const changed = await call(credential.key, { ...recoveryArgs, expected_revision: completed.version })
    assert.equal(error(changed.body)?.code, 'idempotency_conflict')
    assert.equal(changed.body.result?.structuredContent, undefined)
    assert.deepEqual((await person('/api/state')).state, completed.state)
    assert.equal(h.messages.length, 0, 'Recovery sends no outbound messages')
    assert.equal(h.analytics.length, 0)
    console.log('PROBE BASE-AGENT-012 persistence: exact person-approved preparation, person publication, new workerd process and pinned clock at and beyond 24 hours -> original result, receipt and facts, one unchanged native effect; changed revision under the same key -> content-free conflict')
  } finally { await h.close() }
}

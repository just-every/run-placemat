import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { replayDraft } from './agent-fixtures.mjs'

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

export async function completedPublication(context) {
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
  recoveries.set(context.origin, { credential, args, proposalId: originalResult.id, policyChecked: false })
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
  recoveries.delete(origin)
}

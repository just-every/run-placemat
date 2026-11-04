import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.message?.error?.data?.code
const target = service => ({ kind: 'service', id: service.id })
const claims = { target: { kind: 'booking', id: 'synthetic-placemat-3' }, confirmed: true, person_confirmation: true }
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

export default async function journey({ request, origin, cookie, tool }) {
  const person = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await request(new URL(path, origin).href, { method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.ok(response.ok, `Native person request returned ${response.status}`)
    return response.json()
  }
  const state = () => person('/api/state')
  const before = await state(), draft = before.state.services.find(row => row.name === 'Agent journey draft')
  const args = { kind: 'service.publish', plan: { serviceId: draft.id }, reason: 'Coordinator prepares; the restaurant reviewer decides', idempotency_key: randomUUID(), expected_revision: before.version }
  const prepared = await tool('placemat.plans.prepare', args)
  assert.ok(!prepared.result?.isError)
  const id = prepared.result.structuredContent.data.id
  const after = await state(), proposal = after.state.proposals.find(row => row.id === id)
  assert.equal(proposal.status, 'pending')
  assert.equal(proposal.preparedBy, after.actor.id)
  assert.equal(proposal.preparation.for.id, after.actor.id)
  assert.ok(proposal.preparation.agent.id)
  assert.equal(after.state.audit.find(row => row.subject === id).preparation.label, proposal.preparation.label)
  assert.equal(after.state.services.find(row => row.id === draft.id).status, 'draft')
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
  await person('/agents/api/pause', { paused: true })
  await preparationRefusals({ person, tool, draft, published, refusal: 'agents_paused' })
  assert.equal(code(await tool('placemat.plans.prepare', { ...args, idempotency_key: randomUUID() })), 'agents_paused')
  assert.equal((await state()).version, after.version)
  await person('/agents/api/pause', { paused: false })
  await person('/api/commands', { command: 'proposal.decline', payload: { proposalId: id } })
  const decided = await state(), final = decided.state.proposals.find(row => row.id === id)
  assert.equal(final.status, 'declined')
  assert.equal(final.approvedBy, decided.actor.id)
  assert.equal(decided.state.audit.findLast(row => row.subject === id).preparation, undefined)
}

export async function afterStep({ request, origin, cookie, step, args, phase, result, tool }) {
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
}

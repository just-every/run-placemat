import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.message?.error?.data?.code
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

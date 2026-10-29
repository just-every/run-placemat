// Disposable conformance state uses only the real native person and guest doors.
export default async function prepare({ request, origin, cookie }) {
  const json = async (path, body) => {
    const response = await request(new URL(path, origin).href, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    if (!response.ok) throw new Error(`Native preparation failed (${response.status})`)
    return response.json()
  }
  const command = async (command, payload) => (await json('/api/commands', { command, payload })).result
  let { state } = await json('/api/state')
  let published = state.services.find(row => row.name === 'Agent journey dinner')
  let draft = state.services.find(row => row.name === 'Agent journey draft')
  if (!published) {
    await command('venue.update', { name: 'Cedar & Salt', timezone: 'Australia/Brisbane' })
    await command('table.save', { label: 'Window 1', seats: 4, x: 25, y: 40 })
    await command('table.save', { label: 'Garden 2', seats: 4, x: 65, y: 40 })
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    published = await command('service.save', { name: 'Agent journey dinner', startAt: day + 'T08:00:00Z', endAt: day + 'T12:00:00Z', turnMinutes: 60, coverLimit: 24 })
    const plan = await command('proposal.prepare', { kind: 'service.publish', plan: { serviceId: published.id }, reason: 'Venue manager reviewed this disposable dinner' })
    await command('proposal.approve', { proposalId: plan.id })
    await json('/api/public/book', { serviceId: published.id, startAt: published.startAt, name: 'Morgan Lee', email: 'morgan@example.invalid', partySize: 2 })
    draft = await command('service.save', { name: 'Agent journey draft', startAt: day + 'T13:00:00Z', endAt: day + 'T15:00:00Z', turnMinutes: 60, coverLimit: 24 })
  }
  return { values: { service: published.id, draft: draft.id, date: published.startAt.slice(0, 10) } }
}

import { inactiveSponsor } from './agent-inactive-sponsor.mjs'

// Disposable conformance state uses only the real native person and guest doors.
export default async function prepare({ request, origin, cookie, phase }) {
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
    await json('/api/public/book', { serviceId: published.id, startAt: published.startAt, name: 'Morgan Lee', email: ['synthetic-placemat-2', 'example.invalid'].join('@'), partySize: 2 })
    draft = await command('service.save', { name: 'Agent journey draft', startAt: day + 'T13:00:00Z', endAt: day + 'T15:00:00Z', turnMinutes: 60, coverLimit: 24 })
  }
  const sponsors = phase === 'negative' ? { inactive: await inactiveSponsor({ request, origin, cookie }) } : {}
  state = (await json('/api/state')).state
  let table = state.tables.find(row => row.label === 'Synthetic placemat resource table')
  if (!table) table = await command('table.save', { label: 'Synthetic placemat resource table', seats: 4, x: 40, y: 70 })
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: state.venue.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(published.startAt))
  return { sponsors, values: { service: published.id, draft: draft.id, date,
    resourceTable: `placemat://tables/${table.id}`, resourceService: `placemat://services/${published.id}/dates/${date}` } }
}

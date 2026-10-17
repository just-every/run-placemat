// Fern & Fig's book: last week's dinners, tonight, and the coming week, each
// booking placed by Placemat's own availability engine (15-minute starts, the
// turn inside the service, cover limits, no table clashes, smallest table fit)
// and moved through the same status transitions staff use.
import type { Booking, Service, State, Waiting } from '../model'
import { allocation, interval } from '../availability'
import { fixedId, type Clock, random } from './clock'
import { table, tables, type Guests } from './venue'

const dinner = { open: '17:00', close: '22:30', turn: 90, covers: 120, last: '21:00' }
const brunch = { open: '10:30', close: '14:30', turn: 75, covers: 70, last: '13:15' }
const parties = [[2, 46], [3, 10], [4, 30], [5, 5], [6, 6], [8, 3]] as const
const dinnerStarts = ['17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45', '20:00', '20:15', '20:30', '20:45', '21:00'].map((t, i) => [t, [5, 2, 4, 3, 6, 5, 7, 6, 8, 7, 8, 6, 6, 4, 4, 2, 2][i]] as const)
const brunchStarts = ['10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45', '13:00', '13:15'].map((t, i) => [t, [3, 2, 5, 4, 6, 5, 6, 4, 4, 3, 2, 1][i]] as const)
// How full each night's book is: busier for the near days and weekends.
const ahead = [30, 26, 22, 19, 15, 12, 9, 6]

// Tonight, from the homepage's service sheet: who, how many, when, at which tables.
const tonight: [string, number, string, string[]?][] = [
  ['Rachel Abrams', 2, '17:00'], ['Daniel Cho', 4, '17:00'], ['Lucia Diaz', 4, '17:00'], ['Henry Moss', 4, '17:00'],
  ['Ethan Feld', 8, '18:00', ['Cole 41', 'Cole 34']], ['Olivia Gray', 4, '18:00'], ['Hannah Kowalski', 2, '18:30'], ['Mateo Ibarra', 4, '18:30'],
  ['Siobhan Kerr', 4, '19:00', ['Ben 24']], ['Marcus Daniels', 4, '19:15'], ['Priya Raman', 4, '19:30', ['Ana 12']], ['Jordan Blake', 4, '19:30'],
  ['Chidi Okafor', 8, '20:15', ['Ana 21', 'Ana 22']], ["Danny O'Neill", 4, '20:00'], ['Noah Weiss', 4, '20:00'], ['Wei Lin', 2, '20:30'],
  ['Grace Park', 4, '20:30', ['Ben 14']], ['Camila Ortiz', 2, '21:00', ['Bar 1']], ['Owen Quinn', 6, '21:00'], ['Miriam Stein', 2, '21:00'],
]

export type Book = { state: State; tonight: Service; tomorrow: Service; draft: Service; published: Service[] }

export function book(clock: Clock, people: Guests, venue: State['venue']): Book {
  const rng = random(0x0f16f19), state: State = { venue, tables: structuredClone(tables), services: [], bookings: [], waitlist: [], proposals: [], reminders: [], audit: [] }
  let serviceN = 0, bookingN = 0, waitN = 0
  const service = (day: number, kind: typeof dinner | typeof brunch, name: string): Service => {
    const s: Service = { id: fixedId(2, ++serviceN), name, startAt: clock.at(day, kind.open), endAt: clock.at(day, kind.close), turnMinutes: kind.turn, coverLimit: kind.covers, status: 'published', version: 2 }
    state.services.push(s); return s
  }
  const place = (s: Service, guestId: string, partySize: number, start: string, source: Booking['source'], requested?: string[]) => {
    const slot = interval(s, start)
    try {
      const fit = allocation(state, s, partySize, slot, requested?.map(label => table(label).id))
      const createdAt = source === 'online' ? new Date(Date.parse(slot.startAt) - (2 + Math.floor(rng.next() * 12)) * 86400000 - Math.floor(rng.next() * 600) * 60000).toISOString() : slot.startAt
      const b: Booking = { id: fixedId(3, ++bookingN), serviceId: s.id, guestId, partySize, ...slot, tableIds: fit.map(t => t.id), status: 'booked', source, createdAt: [createdAt, slot.startAt, new Date(clock.now - Math.floor(rng.next() * 900) * 60000).toISOString()].sort()[0] }
      state.bookings.push(b); return b
    } catch (error) { if ((error as { status?: number }).status === 409) return null; throw error }
  }
  const fill = (s: Service, day: number, target: number, starts: readonly (readonly [string, number])[]) => {
    const booked = new Set(state.bookings.filter(b => b.serviceId === s.id).map(b => b.guestId))
    for (let tries = 0, made = booked.size; made < target && tries < target * 4; tries++) {
      const g = rng.next() < 0.3 ? rng.pick(people.regulars) : rng.pick(people.others)
      if (booked.has(g.id)) continue
      if (place(s, g.id, rng.weighted(parties), clock.at(day, rng.weighted(starts)), 'online')) { booked.add(g.id); made++ }
    }
  }
  const walkIns = (s: Service, day: number, count: number, before = Infinity) => {
    for (let made = 0, tries = 0; made < count && tries < count * 6; tries++) {
      const start = clock.at(day, rng.weighted(dinnerStarts.filter(([t]) => t >= '18:00')))
      if (Date.parse(start) < before && place(s, rng.pick(people.others).id, rng.pick([2, 2, 3, 4]), start, 'walk-in')) made++
    }
  }

  // Tonight first: the floor opens on it.
  const tonightService = service(0, dinner, `${clock.weekday(0)} dinner`)
  for (const [name, size, time, at] of tonight) place(tonightService, people.byName(name).id, size, clock.at(0, time), 'online', at)
  fill(tonightService, 0, ahead[0], dinnerStarts)
  const opened = Date.parse(tonightService.startAt) <= clock.now
  // Walk-ins and seated waitlist parties exist only once the doors are open.
  if (opened) {
    walkIns(tonightService, 0, 4, clock.now)
    for (const [i, size] of [[4, 2], [5, 4]] as const) {
      const start = Math.min(clock.now, Date.parse(clock.at(0, dinner.last)))
      const slot = new Date(start - start % 900000 - 900000).toISOString()
      const seated = place(tonightService, people.waiting[i].id, size, slot < tonightService.startAt ? tonightService.startAt : slot, 'waitlist')
      if (seated) state.waitlist.push({ id: fixedId(5, ++waitN), serviceId: tonightService.id, guestId: seated.guestId, partySize: size, status: 'seated' })
    }
  }
  state.waitlist.push(...([[0, 2, 'waiting'], [1, 4, 'waiting'], [2, 5, 'waiting'], [3, 2, 'waiting'], [5, 3, 'cancelled']] as const)
    .map(([i, partySize, status]): Waiting => ({ id: fixedId(5, ++waitN), serviceId: tonightService.id, guestId: people.waiting[i].id, partySize, status })))

  // Today's brunch on a weekend, the coming week, then last week.
  const published: Service[] = [tonightService]
  if (clock.weekend(0)) { const b = service(0, brunch, `${clock.weekday(0)} brunch`); fill(b, 0, 18, brunchStarts); published.push(b) }
  for (let day = 1; day <= 7; day++) {
    if (clock.weekend(day)) { const b = service(day, brunch, `${clock.weekday(day)} brunch`); fill(b, day, Math.round(ahead[day] * 0.6), brunchStarts); published.push(b) }
    const d = service(day, dinner, `${clock.weekday(day)} dinner`); fill(d, day, ahead[day] + (clock.weekend(day) ? 4 : 0), dinnerStarts); published.push(d)
  }
  const draft: Service = { id: fixedId(2, ++serviceN), name: 'Harvest supper club', startAt: clock.at(9, '18:30'), endAt: clock.at(9, '22:00'), turnMinutes: 180, coverLimit: 40, status: 'draft', version: 1 }
  state.services.push(draft)
  for (let day = -1; day >= -6; day--) {
    if (clock.weekend(day)) fill(service(day, brunch, `${clock.weekday(day)} brunch`), day, 16, brunchStarts)
    const d = service(day, dinner, `${clock.weekday(day)} dinner`); fill(d, day, 26, dinnerStarts); walkIns(d, day, 3)
  }

  // Where each party is now: seated or finished once its time has come, with
  // the occasional cancellation ahead of time and no-show on the night.
  for (const b of state.bookings) {
    const r = rng.next(), started = Date.parse(b.startAt) <= clock.now, ended = Date.parse(b.endAt) <= clock.now
    if (b.source === 'online' && r < 0.05) b.status = 'cancelled'
    else if (b.source === 'online' && started && r < 0.09) b.status = 'no-show'
    else if (ended) b.status = 'completed'
    else if (started) b.status = 'seated'
  }
  return { state, tonight: tonightService, tomorrow: state.services.find(s => s.startAt > tonightService.startAt && s.name.endsWith('dinner'))!, draft, published }
}

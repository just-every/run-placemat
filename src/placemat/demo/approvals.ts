// What the team and the planning assistant decided around the book: the
// week's services published from exact drafts, reminder batches approved for
// the venue's own sender, and three plans still waiting for a person.
import type { Proposal, State } from '../model'
import { allocation } from '../availability'
import { reminderMessage } from '../commands'
import { fixedId, type Clock } from './clock'
import { manager } from './venue'
import type { Book } from './book'

export const assistant = { id: fixedId(10, 1), name: 'Dinner planning assistant' }
export const retiredKey = { id: fixedId(10, 2), name: 'Spring menu import' }

export function decide({ state: s, tonight, tomorrow, draft, published }: Book, clock: Clock, ownerId: string) {
  let n = 0
  const minutes = (iso: string, delta: number) => new Date(Date.parse(iso) + delta * 60000).toISOString()
  const proposal = (kind: Proposal['kind'], plan: unknown, preparedBy: string, preparedAt: string, reason: string, decided?: { by: string; at: string; status: 'approved' | 'declined' }): Proposal => {
    const p: Proposal = { id: fixedId(6, ++n), kind, plan, status: decided?.status ?? 'pending', preparedBy, preparedAt, reason, ...(decided ? { approvedBy: decided.by, approvedAt: decided.at } : {}) }
    s.proposals.push(p)
    s.audit.push({ id: fixedId(8, s.audit.length + 1), at: preparedAt, actor: preparedBy, action: 'proposal.prepare', subject: p.id })
    if (decided) s.audit.push({ id: fixedId(8, s.audit.length + 1), at: decided.at, actor: decided.by, action: `proposal.${decided.status === 'approved' ? 'approve' : 'decline'}`, subject: p.id })
    return p
  }
  const venue = structuredClone(s.venue), floor = structuredClone(s.tables)

  // Each published service went out from its exact draft (version 1 -> 2).
  for (const service of published) {
    const day = Math.floor((Date.parse(service.startAt) - Date.parse(tonight.startAt) + 43200000) / 86400000), preparedAt = clock.at(day - 8, '10:15')
    proposal('service.publish', { serviceId: service.id, service: { ...structuredClone(service), status: 'draft', version: 1 }, tables: floor, venue }, assistant.id, preparedAt,
      `${service.name}: usual hours, ${service.coverLimit} covers, ${service.turnMinutes}-minute turns.`, { by: ownerId, at: minutes(preparedAt, 95), status: 'approved' })
  }

  // Tonight's reminders went out yesterday afternoon through the venue's own sender.
  const approvedAt = clock.at(-1, '15:40'), reminded = s.bookings.filter(b => b.serviceId === tonight.id && b.source === 'online' && b.createdAt < approvedAt && b.status !== 'cancelled')
  proposal('reminders', { serviceId: tonight.id, bookings: structuredClone(reminded.map(b => ({ ...b, status: 'booked' }))), venue }, assistant.id, clock.at(-1, '15:05'),
    `Reminder batch for ${tonight.name}: ${reminded.length} parties.`, { by: manager, at: approvedAt, status: 'approved' })
  for (const b of reminded) s.reminders.push({ id: fixedId(7, s.reminders.length + 1), bookingId: b.id, guestId: b.guestId, message: reminderMessage(s, b), status: 'exported', approvedBy: manager, approvedAt })

  // Last week a move was declined: the guest had asked for that table.
  const earlier = s.bookings.find(b => b.serviceId !== tonight.id && Date.parse(b.endAt) < clock.now && b.status === 'completed' && b.partySize === 4)
  if (earlier) proposal('table.assign', { bookingId: earlier.id, booking: { ...structuredClone(earlier), status: 'booked' }, tableIds: [s.tables[5].id] }, assistant.id, minutes(earlier.startAt, -300),
    'Free a four-top for walk-ins.', { by: manager, at: minutes(earlier.startAt, -250), status: 'declined' })

  // Waiting for a person: the supper club draft, tomorrow's reminders, and a table move tonight.
  proposal('service.publish', { serviceId: draft.id, service: structuredClone(draft), tables: structuredClone(s.tables), venue: structuredClone(s.venue) }, assistant.id, minutes(new Date(clock.now).toISOString(), -95),
    'Harvest supper club: one long sitting, set menu, 40 covers. Ready to open for bookings.')
  const rows = s.bookings.filter(b => b.serviceId === tomorrow.id && b.status === 'booked' && !s.reminders.some(r => r.bookingId === b.id))
  if (rows.length) proposal('reminders', { serviceId: tomorrow.id, bookings: structuredClone(rows), venue: structuredClone(s.venue) }, assistant.id, minutes(new Date(clock.now).toISOString(), -40),
    `Reminder batch for ${tomorrow.name}: ${rows.length} parties.`)
  const move = [tonight, tomorrow].flatMap(service => s.bookings.filter(b => b.serviceId === service.id && b.status === 'booked' && b.partySize === 4)
    .map(b => ({ b, service, to: s.tables.find(t => t.seats >= 4 && t.seats <= 6 && !b.tableIds.includes(t.id) && fits(s, service, b, t.id)) }))).find(m => m.to)
  if (move) proposal('table.assign', { bookingId: move.b.id, booking: structuredClone(move.b), tableIds: [move.to!.id] }, assistant.id, minutes(new Date(clock.now).toISOString(), -25),
    `Move this party to ${move.to!.label}, a quieter table, so their current one can take walk-ins.`)
  s.audit.sort((a, b) => a.at.localeCompare(b.at))
}

function fits(s: State, service: Parameters<typeof allocation>[1], b: State['bookings'][number], tableId: string) {
  try { allocation(s, service, b.partySize, b, [tableId], b.id); return true } catch { return false }
}

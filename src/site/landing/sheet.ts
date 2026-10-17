// Fern & Fig's Friday service (Fri, Oct 23), the one source of every record the
// homepage draws (the desk's SERVICE-SHEET.md). A figure shown in two sections
// is read from here in both, so the night adds up: 112 covers and 30 parties in
// the book at 3:05, 120 booked after the agent's two bookings, 148 seated by close.

export type Channel = 'web' | 'google' | 'instagram' | 'phone'
export interface Party { name: string; size: number; channel?: Channel; note?: string; fresh?: boolean }
export interface Slot { time: string; covers: number; parties: Party[]; more?: number; offer?: string }

export const venue = { name: 'Fern & Fig', date: 'Fri, Oct 23', pace: 16 }

export const book: Slot[] = [
  { time: '5:00', covers: 6, parties: [{ name: 'Abrams', size: 2, channel: 'web' }, { name: 'Cho', size: 4, channel: 'google' }] },
  { time: '5:30', covers: 8, parties: [{ name: 'Diaz', size: 4, channel: 'google' }, { name: 'Moss', size: 4, channel: 'web' }] },
  { time: '6:00', covers: 12, parties: [{ name: 'Feld', size: 8, channel: 'web', note: 'deposit' }, { name: 'Gray', size: 4, channel: 'phone' }] },
  { time: '6:30', covers: 14, parties: [{ name: 'Hannah K.', size: 2, channel: 'google', fresh: true }, { name: 'Ibarra', size: 4, channel: 'instagram' }], more: 2 },
  { time: '7:00', covers: 16, parties: [{ name: 'Daniels', size: 4, channel: 'phone', note: '7:15' }, { name: 'Kerr', size: 4, channel: 'google' }], more: 3 },
  { time: '7:30', covers: 16, parties: [{ name: 'Priya Raman', size: 4, channel: 'web', note: 'anniversary' }, { name: 'Jordan B.', size: 4, channel: 'google' }], more: 3, offer: 'offered 6:45 or 8:30' },
  { time: '8:00', covers: 16, parties: [{ name: 'Okafor', size: 8, channel: 'web', note: '8:15', fresh: true }, { name: 'Danny O.', size: 4, channel: 'instagram', fresh: true }, { name: 'Weiss', size: 4, channel: 'web' }] },
  { time: '8:30', covers: 10, parties: [{ name: 'Lin', size: 2, channel: 'web', note: "chef's counter" }, { name: 'Park', size: 4, channel: 'instagram' }], more: 1 },
  { time: '9:00', covers: 8, parties: [{ name: 'Ortiz', size: 2, channel: 'google' }, { name: 'Quinn', size: 6, channel: 'web' }] },
  { time: '9:30', covers: 4, parties: [{ name: 'Reyes', size: 4, channel: 'instagram' }] },
  { time: '10:00', covers: 2, parties: [{ name: 'Stein', size: 2, channel: 'google' }] },
]
export const bookCovers = book.reduce((sum, slot) => sum + slot.covers, 0)
export const bookParties = book.reduce((sum, slot) => sum + slot.parties.length + (slot.more ?? 0), 0)
export const fullSlots = book.filter(slot => slot.covers === venue.pace).map(slot => slot.time)
export const channels: { channel: Channel; label: string; covers: number }[] = [
  { channel: 'web', label: 'Website', covers: 44 },
  { channel: 'google', label: 'Google', covers: 38 },
  { channel: 'instagram', label: 'Instagram', covers: 21 },
  { channel: 'phone', label: 'Phone', covers: 9 },
]

export const confirmations = { confirmed: 25, awaiting: 5, cancelled: 4 }
export const deposit = { perGuest: 25, okafor: 8 * 25, lin: 2 * 25, card: '4242' }

export type TableState = 'seated' | 'mains' | 'dessert' | 'check' | 'reserved' | 'bussing'
export interface FloorTable { id: string; seats: number; shape: 'round' | 'square' | 'long'; state: TableState; timer: string }
export const sections: { name: string; tables: FloorTable[] }[] = [
  { name: 'Ana', tables: [
    { id: '11', seats: 2, shape: 'round', state: 'seated', timer: '52m' },
    { id: '12', seats: 4, shape: 'square', state: 'reserved', timer: '7:30' },
    { id: '13', seats: 4, shape: 'round', state: 'reserved', timer: '7:15' },
    { id: '21+22', seats: 8, shape: 'long', state: 'mains', timer: '36m' },
  ] },
  { name: 'Ben', tables: [
    { id: '14', seats: 4, shape: 'square', state: 'bussing', timer: '' },
    { id: '23', seats: 4, shape: 'round', state: 'dessert', timer: '1h 14m' },
    { id: '24', seats: 4, shape: 'square', state: 'check', timer: '1h 31m' },
  ] },
  { name: 'Cole', tables: [
    { id: '31', seats: 4, shape: 'square', state: 'seated', timer: '47m' },
    { id: '32', seats: 2, shape: 'round', state: 'reserved', timer: '7:00' },
    { id: '33', seats: 4, shape: 'square', state: 'seated', timer: '12m' },
    { id: '34', seats: 4, shape: 'square', state: 'bussing', timer: '' },
    { id: '41', seats: 4, shape: 'round', state: 'dessert', timer: '1h 08m' },
    { id: '42', seats: 6, shape: 'round', state: 'dessert', timer: '1h 12m' },
  ] },
]
export const states: { state: TableState; label: string }[] = [
  { state: 'seated', label: 'Seated' }, { state: 'mains', label: 'Mains' }, { state: 'dessert', label: 'Dessert' },
  { state: 'check', label: 'Check dropped' }, { state: 'reserved', label: 'Reserved' }, { state: 'bussing', label: 'Needs bussing' },
]
export const floor = { seated: 34, dueBy: '7:15', due: 16, turn: '1h 28m' }

export interface Waiting { name: string; size: number; quote: string; waiting: string; text?: boolean }
export const waitlist: Waiting[] = [
  { name: 'Marco', size: 2, quote: 'quoted 15', waiting: '11m', text: true },
  { name: 'Jasmine', size: 4, quote: 'quoted 25', waiting: '9m' },
  { name: 'Ruiz', size: 5, quote: 'quoted 35', waiting: '4m' },
  { name: 'Leo', size: 2, quote: 'quoted 40', waiting: '2m' },
  { name: 'Ama', size: 2, quote: 'bar ok', waiting: '1m' },
]
export const reservationsTonight = bookParties

export const noShow = { table: '23', party: 'Daniels', size: 4, due: '7:15', fee: 4 * 20, refill: { name: 'Nguyen', size: 4, quote: 35, waited: 34, seated: '7:39' } }

export const report = { covers: 148, booked: 114, walkIns: 34, noShows: 2, fees: 120, turn: '1h 31m', recovered: 6 }
export const priya = { visits: 15, average: 186, tonight: 238, table: '12' }

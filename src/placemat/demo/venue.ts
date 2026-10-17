// Fern & Fig, the restaurant the run site's homepage follows through a Friday:
// a 58-seat room in three server sections (Ana by the windows, Ben in the
// middle, Cole at the back), its team and the guests who keep coming back.
import type { Guest, Table } from '../model'
import { fixedId, type Clock } from './clock'

export const venue = { name: 'Fern & Fig', timezone: 'America/Los_Angeles' }

const room: [string, number, number, number][] = [
  ['Ana 11', 2, 0, 0], ['Ana 12', 4, 11, 0], ['Ana 13', 4, 22, 0], ['Ana 21', 4, 0, 55], ['Ana 22', 4, 11, 55],
  ['Ben 14', 4, 35, 0], ['Ben 23', 4, 46, 0], ['Ben 24', 4, 40, 55],
  ['Cole 31', 4, 59, 0], ['Cole 32', 2, 70, 0], ['Cole 33', 4, 81, 0], ['Cole 34', 4, 59, 55], ['Cole 41', 4, 70, 55], ['Cole 42', 6, 81, 55],
  ['Bar 1', 2, 92, 0], ['Bar 2', 2, 92, 55],
]
export const tables: Table[] = room.map(([label, seats, x, y], i) => ({ id: fixedId(1, i + 1), label, seats, x, y }))
export const table = (label: string) => tables.find(t => t.label === label)!

export const owner = 'Nina Alvarez'
export const team = [
  { id: fixedId(9, 1), email: 'marcus@fernandfig.example', name: 'Marcus Bell', role: 'admin', status: 'active' },
  { id: fixedId(9, 2), email: 'ana@fernandfig.example', name: 'Ana Torres', role: 'member', status: 'active' },
  { id: fixedId(9, 3), email: 'ben@fernandfig.example', name: 'Ben Okoye', role: 'member', status: 'active' },
  { id: fixedId(9, 4), email: 'cole@fernandfig.example', name: 'Cole Ramirez', role: 'member', status: 'active' },
  { id: fixedId(9, 5), email: 'sofia@fernandfig.example', name: 'Sofia Grant', role: 'member', status: 'invited' },
] as const
export const manager = team[0].id

// Regulars: name, notes, visits before this fortnight, usual party.
const regulars: [string, string, number, number][] = [
  ['Priya Raman', 'Anniversary dinner every October. Severe shellfish allergy: tell the kitchen when the order goes in. Prefers the window, Ana 12.', 13, 2],
  ['Chidi Okafor', 'Family of eight: push Ana 21 and 22 together. Two high chairs.', 6, 8],
  ['Wei Lin', 'Vegetarian. Likes a seat where she can see the pass.', 9, 2],
  ['Marcus Daniels', 'Usually 15 minutes late; hold the table. No-show once in August.', 7, 4],
  ['Ethan Feld', 'Books the 6:00 for his team on Fridays. Sparkling water on arrival.', 5, 8],
  ['Rachel Abrams', 'Early sitting regular. Gluten-free.', 11, 2],
  ['Daniel Cho', 'Tree nut allergy (their son). A booth if one is free.', 4, 4],
  ['Lucia Diaz', 'Birthday at the end of October. Prefers a quiet corner.', 3, 4],
  ['Henry Moss', 'Wine club member; bring the reserve list.', 8, 4],
  ['Olivia Gray', 'Books by phone. Call to confirm the day before.', 6, 4],
  ['Mateo Ibarra', 'Found us on Instagram. Dairy-free.', 2, 4],
  ['Siobhan Kerr', 'Thursday regular. Corner table Ben 24.', 10, 4],
  ['Noah Weiss', 'Pescatarian.', 3, 4],
  ['Grace Park', 'Wheelchair user: seat in Ben’s section with a clear path from the door.', 5, 4],
  ['Camila Ortiz', 'Late sitting; happy at the bar.', 4, 2],
  ['Owen Quinn', 'Celebrations; often brings a cake (plating fee waived).', 2, 6],
  ['Miriam Stein', 'Late dinner after the theater. Decaf with dessert.', 6, 2],
  ['Thao Nguyen', 'Happy to wait at the bar for a table.', 2, 4],
  ['Isabel Reyes', '', 1, 4],
  ['Jordan Blake', '', 1, 4],
  ['Hannah Kowalski', 'First visit, booked online.', 0, 2],
  ["Danny O'Neill", 'Celiac: strictly gluten-free.', 0, 4],
]
const others = ['Ava Thompson', 'Liam Carter', 'Sophia Bennett', 'James Holloway', 'Emma Fitzgerald', 'Benjamin Hart', 'Mia Castillo', 'Lucas Brennan',
  'Charlotte Kim', 'Henry Adeyemi', 'Amelia Novak', 'Alexander Price', 'Harper Sullivan', 'Sebastian Ward', 'Evelyn Choi', 'Jack Morrison',
  'Abigail Foster', 'Samuel Ortega', 'Emily Shah', 'David Kaplan', 'Ella Romano', 'Joseph Gallagher', 'Scarlett Huang', 'Matthew Reid',
  'Victoria Lopez', 'Andrew Patel', 'Chloe Martin', 'Ryan Murphy', 'Zoe Alexander', 'Nathan Brooks', 'Lily Watanabe', 'Gabriel Silva',
  'Nora Hughes', 'Isaac Goldberg', 'Hazel Wright', 'Julian Torres', 'Aria Coleman', 'Christopher Lee', 'Stella Ivanova', 'Anthony Russo',
  'Lucy Bishop', 'Elijah Grant', 'Violet Kowal', 'Adrian Mendes', 'Ruby Osei', 'Thomas Byrne', 'Clara Jensen', 'Max Weber']
// Walk-up parties leave a phone number for the waitlist text, not an email.
const waiting = ['Marco Bellini', 'Jasmine Carter', 'Andres Ruiz', 'Leo Fischer', 'Ama Mensah', 'Felix Moreau']

const email = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.')}@example.com`
const phone = (n: number) => `(213) 555-01${String(n % 100).padStart(2, '0')}`

export type Guests = { all: Guest[]; regulars: Guest[]; others: Guest[]; waiting: Guest[]; byName: (name: string) => Guest }

export function guests(clock: Clock): Guests {
  let n = 0
  const guest = (name: string, notes = '', contact: 'email' | 'phone' = 'email'): Guest => {
    n++
    return { id: fixedId(4, n), name, email: contact === 'email' ? email(name) : '', phone: contact === 'phone' || n % 3 === 0 ? phone(n) : '', notes }
  }
  const known = regulars.map(([name, notes, visits, size], r) => {
    const g = guest(name, notes)
    // Earlier visits, every three weeks or so before this fortnight.
    g.history = Array.from({ length: visits }, (_, i) => ({ date: clock.isoDate(-10 - i * 19 - (r % 5)), partySize: size, status: name === 'Marcus Daniels' && i === 3 ? 'no-show' : 'completed' }))
    return g
  })
  const rest = others.map(name => guest(name)), walkUps = waiting.map(name => guest(name, '', 'phone'))
  const all = [...known, ...rest, ...walkUps]
  return { all, regulars: known, others: rest, waiting: walkUps, byName: name => all.find(g => g.name === name)! }
}

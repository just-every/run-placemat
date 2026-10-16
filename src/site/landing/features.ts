// The six feature sections: a heading, one or two lines and one small drawing
// on a fragment of the plan, text and drawing alternating sides at 1440.
import { esc } from '../shell'
import { dashed, icon, table } from './plan'

interface Feature { id: string; title: string; body: string; label: string; art: string }

const legend = '<p class="legend"><span>Available</span><span class="booked">Booked</span><span class="seated">Seated</span></p>'
const lines = (n: number) => `<span class="lines" aria-hidden="true">${'<i></i>'.repeat(n)}</span>`
const room = (className: string, furniture: string, content: string) => `<div class="floor-map frag ${className}">${furniture}<div class="frag-content">${content}</div></div>`

const floorArt = `<div class="card art-card floor-card"><div class="card-head"><p class="card-title">Floor &amp; bookings</p><span class="pill">6 / 8 covers</span></div>`
  + `<div class="floor-map mini-room">${[
    table({ x: 18, y: 28, state: 'booked', lines: ['T1', 'Booked'] }),
    table({ x: 50, y: 28, lines: ['T2'] }),
    table({ x: 82, y: 28, round: true, state: 'seated', lines: ['T3', 'Seated'] }),
    table({ x: 18, y: 74, state: 'booked', lines: ['T4', 'Booked'] }),
    table({ x: 50, y: 74, lines: ['T5'] }),
    table({ x: 82, y: 74, lines: ['T6'] }),
  ].join('')}</div><div class="card-foot">${legend}<span class="ink-btn">Seat walk-in</span></div></div>`

const freeArt = room('corner', table({ x: 12, y: 30, state: 'booked', narrow: [30, 9] }) + table({ x: 12, y: 72, round: true, narrow: [70, 91] }),
  `<div class="card art-card licence-card"><p class="card-title">MIT License</p>${lines(3)}</div>`)

const noShowArt = room('wide', table({ x: 19, y: 18, state: 'booked', narrow: [30, 9] }) + table({ x: 82, y: 17, round: true, narrow: [70, 9] }) + table({ x: 20, y: 84, round: true, narrow: [30, 91] }) + table({ x: 80, y: 85, round: true, state: 'seated', narrow: [70, 91] }),
  `<div class="card art-card small"><p class="card-title">Sam Lee</p><span class="pill outline">no-show</span></div>${dashed('inline')}`
  + `<div class="card art-card small"><p class="card-title">Ana Ruiz</p><p class="row bare">${icon('person')}2 guests</p><span class="ink-btn">Seat party</span></div>`)

const guestArt = room('wide', table({ x: 11, y: 28, round: true, narrow: [30, 9] }) + table({ x: 11, y: 74, state: 'booked', narrow: [30, 91] }) + table({ x: 89, y: 55, round: true, narrow: [70, 91] }),
  `<div class="card art-card guest-card"><p class="card-title">Mia Chen</p><p class="meta">4 recorded visits</p><p class="row">${icon('calendar')}17 Oct, 18:00 · 2 guests</p>`
  + `<div class="notes"><span>Guest notes</span><span class="note">Window table.</span></div></div>`)

const remindersArt = room('wide', table({ x: 12, y: 28, state: 'booked', narrow: [30, 9] }) + table({ x: 12, y: 74, round: true, narrow: [30, 91] }) + table({ x: 88, y: 28, round: true, narrow: [70, 9] }) + table({ x: 88, y: 74, round: true, state: 'seated', narrow: [70, 91] }),
  `<div class="card art-card"><p class="card-title">Approved reminders</p><p class="meta">3 reminders ready</p><span class="fake-link">Download reminders CSV</span></div>`)

const importArt = room('wide', table({ x: 30, y: 17, round: true, narrow: [30, 9] }) + table({ x: 58, y: 17, state: 'booked', narrow: false }) + table({ x: 86, y: 18, round: true, narrow: [70, 9] }) + table({ x: 12, y: 82, state: 'booked', narrow: [30, 91] }) + table({ x: 86, y: 82, seats: 2, narrow: [70, 91] }),
  `<span class="ink-btn outline">Preview import</span>${dashed('inline straight')}<span class="ink-btn">Apply reviewed import</span>`)

const features: Feature[] = [
  { id: 'floor', title: 'The whole service, on one floor.', body: 'Online bookings, walk-ins and the waitlist share the same room. Tables are assigned for you, combined when a party needs it.', label: 'The Floor & bookings card: 6 of 8 covers, tables T1 and T4 booked, T3 seated, and a Seat walk-in button.', art: floorArt },
  { id: 'free', title: '100% free.', body: 'Free as in code, free as in cost. MIT licensed, on your own computer or your own account.', label: 'A corner of the room with the MIT License.', art: freeArt },
  { id: 'no-show', title: 'A no-show frees the table.', body: 'Mark a no-show and seat the next party from the waitlist. The visit stays in their history.', label: 'Sam Lee is marked no-show, and Ana Ruiz, 2 guests, is seated from the waitlist.', art: noShowArt },
  { id: 'guests', title: 'Your guest list stays yours.', body: 'Every visit and note lives in your own installation. Erase a guest’s details whenever they ask.', label: 'Mia Chen’s guest history: 4 recorded visits, 17 Oct at 18:00 for 2 guests, and the note Window table.', art: guestArt },
  { id: 'reminders', title: 'Reminders for your own sender.', body: 'Download each service’s reminder messages as a CSV for the email or SMS tool you already use.', label: 'Approved reminders: 3 reminders ready, with a Download reminders CSV link.', art: remindersArt },
  { id: 'import', title: 'Bring your guest list.', body: 'Preview a CSV of guests and past visits, then apply it. Undo it if you need to.', label: 'Preview import, then Apply reviewed import.', art: importArt },
]

export const featureSections = () => features.map(({ id, title, body, label, art }, i) =>
  `<section class="feature${i % 2 ? ' flip' : ''}" id="${id}" aria-labelledby="${id}-title"><div class="feature-copy"><h2 id="${id}-title">${esc(title)}</h2><p>${esc(body)}</p></div>`
  + `<figure class="feature-art" role="img" aria-label="${esc(label)}">${art}</figure></section>`).join('')

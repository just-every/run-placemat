// The hero: the headline block over the dining room drawn as a floor plan,
// with the three step cards set into it (Booked online → On the floor →
// Remembered). Every string in the drawing is real text from the app.
import run from '../run.json'
import { arrow, esc } from '../shell'
import { counter, dashed, icon, table, type TableSpec } from './plan'

export const docsHref = (docs: boolean) => docs ? '/docs' : run.repository

const label = 'Placemat in three steps: a guest books Friday dinner at 18:00 online, the booking appears on the floor plan as table T1 booked beside T3 seated, and Mia Chen’s guest history shows 4 recorded visits.'

// The room around the cards: tables at % positions (wide), their phone
// positions along the side strips, or hidden on the phone.
const room: TableSpec[] = [
  { x: 8, y: 25, round: true, narrow: [9, 8] },
  { x: 8, y: 52, state: 'booked', narrow: [9, 25] },
  { x: 36.5, y: 17, state: 'booked', narrow: [9, 43] },
  { x: 36.5, y: 55, seats: 2, narrow: [9, 61] },
  { x: 36.5, y: 86, narrow: [9, 79] },
  { x: 63.5, y: 17, round: true, narrow: [91, 10] },
  { x: 63.5, y: 55, state: 'booked', narrow: [91, 28] },
  { x: 63.5, y: 86, seats: 2, narrow: [91, 46] },
  { x: 46, y: 88, round: true, narrow: [9, 94] },
  { x: 54.5, y: 88, state: 'booked', narrow: false },
  { x: 73, y: 87, narrow: [91, 64] },
  { x: 83.5, y: 87, round: true, narrow: [91, 82] },
  { x: 92.5, y: 21, state: 'booked', narrow: false },
  { x: 92.5, y: 45, seats: 2, narrow: false },
  { x: 92.5, y: 69, state: 'booked', narrow: false },
]

const step = (n: number, title: string, body: string) =>
  `<div class="step s${n}"><p class="step-head"><span class="num" aria-hidden="true">${n}</span><span>${esc(title)}</span></p>${body}</div>`

const booked = `<div class="mini"><p class="mini-title">Book a table</p><p class="row">${icon('calendar')}Friday dinner · 18:00</p><p class="row">${icon('person')}2 guests</p><span class="ink-btn">Confirm booking</span></div>`
const floor = `<div class="mini-floor">${[
  table({ x: 0, y: 0, seats: 2, state: 'booked', lines: ['T1', 'Booked'] }),
  table({ x: 0, y: 0, round: true, lines: ['T2'] }),
  table({ x: 0, y: 0, round: true, state: 'seated', lines: ['T3', 'Seated'] }),
  table({ x: 0, y: 0, seats: 2, lines: ['T4'] }),
].join('')}</div><p class="legend"><span>Available</span><span class="booked">Booked</span><span class="seated">Seated</span></p>`
const remembered = '<div class="mini"><p class="mini-title">Mia Chen</p><p class="meta">4 recorded visits</p><div class="notes"><span>Guest notes</span><i></i><i></i><i></i></div></div>'

export function hero(docs: boolean): string {
  return `<section class="hero" aria-labelledby="hero-title"><div class="hero-copy">`
    + `<h1 id="hero-title">Tables booked. <span class="nowrap">Guests remembered.</span></h1>`
    + `<p class="sub">Guests book online, walk-ins and the waitlist share one floor, and every visit stays yours.</p>`
    + `<p class="alt">100% free, open source alternative to <b>OpenTable</b>, <b>Tablein</b> and <b>ResDiary</b></p>`
    + `<div class="actions"><a class="btn" href="/run">Run Placemat${arrow}</a><a class="text-link" href="${esc(docsHref(docs))}">Read the docs</a></div>`
    + `<p class="fine">Free and open source, MIT licensed.</p></div>`
    + `<figure class="hero-room floor-map" role="img" aria-label="${esc(label)}">`
    + room.map(spec => table(spec)).join('') + counter(19.5, 88, '23%', 6, false)
    + `<div class="steps">${step(1, 'Booked online', booked)}${dashed('d1')}${step(2, 'On the floor', floor)}${dashed('d2')}${step(3, 'Remembered', remembered)}</div>`
    + `</figure></section>`
}

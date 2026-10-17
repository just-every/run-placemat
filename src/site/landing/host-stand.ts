// 6:40 PM · The host stand, the page's widest card: the floor by server section
// with chairs matching each table's seats, six table states with timers, the
// waitlist with quotes and waits, and tonight's quote accuracy.
import { esc } from '../shell'
import { sky } from './glyphs'
import { avatar, eyebrow, heading, lede, section } from './parts'
import { floor, reservationsTonight, sections, states, waitlist, type FloorTable } from './sheet'

const stateLabel = Object.fromEntries(states.map(s => [s.state, s.label]))
const chairs = (t: FloorTable) => Array.from({ length: t.seats }, (_, i) => `<i class="c c${i + 1}"></i>`).join('')

const table = (t: FloorTable) => `<li class="ft ft-${t.shape} ft-s${t.seats} st-${t.state}">${chairs(t)}<span class="top"><b>${esc(t.id)}${t.shape === 'long' ? ` · ${t.seats}` : ''}</b>${t.timer ? `<span>${esc(t.timer)}</span>` : ''}</span>`
  + `<span class="vh">, ${t.seats} seats, ${stateLabel[t.state]}</span></li>`

// The phone floor: the same tables as chips (number, seats, state, timer).
const chip = (t: FloorTable) => `<li class="fc st-${t.state}"><b>${esc(t.id)}</b><span>${t.seats} seats</span><span>${t.timer || '—'}</span></li>`

const tones = ['mint', 'amber', 'lilac', 'sky', 'rose'] as const

export const hostStand = () => section('host', '6:40',
  `<div class="svc-head center">${eyebrow('6:40 PM · The host stand', sky.sunset)}${heading('host', 'The whole room, one screen.')}${lede('Tables, sections, waits and turns, live as the room moves.')}</div>`
  + `<div class="card hs"><div class="hs-main"><div class="hs-top"><p class="tabs" role="presentation"><span class="on">Floor plan</span><span>Waitlist <em>${waitlist.length}</em></span><span>Reservations <em>${reservationsTonight}</em></span></p></div>`
  + `<div class="hs-floor">${sections.map(s => `<div class="zone zone-${s.name.toLowerCase()}"><p class="zone-name">${esc(s.name)}</p><ul class="zone-tables">${s.tables.map(table).join('')}</ul><ul class="zone-chips">${s.tables.map(chip).join('')}</ul></div>`).join('')}</div>`
  + `<ul class="legend">${states.map(s => `<li><i class="sw st-${s.state}"></i>${esc(s.label)}</li>`).join('')}</ul></div>`
  + `<div class="hs-side"><div class="hs-stats"><p><span>Seated</span><b>${floor.seated} covers</b></p><p><span>Due by ${floor.dueBy}</span><b>${floor.due} covers</b></p><p><span>Avg turn</span><b>${floor.turn}</b></p></div>`
  + `<div class="hs-wait"><h3>Waitlist (${waitlist.length})</h3><ul>${waitlist.map((w, i) => `<li>${avatar(w.name[0], tones[i])}<div><p class="n">${esc(w.name)}</p><p class="m">${w.size} · ${esc(w.quote)} · waiting ${esc(w.waiting)}${w.text ? ' · <b>text sent</b>' : ''}</p></div></li>`).join('')}</ul>`
  + `<p class="hs-quote">Quoted vs actual tonight ±3 min</p></div></div></div>`)

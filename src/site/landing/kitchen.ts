// 7:48 PM · Kitchen pace: mains ticket time from Toast climbing past the usual
// 14 minutes, and the agent's applied suggestion to space the next seatings.
import { glyph, sky } from './glyphs'
import { eyebrow, heading, lede, section } from './parts'

// Ticket time (minutes) every four minutes from 7:00 to 7:48, on a 10–25 axis.
const minutes = [13.4, 13.6, 14.4, 14.7, 15.6, 16.6, 16.6, 17.2, 18.0, 18.6, 20.0, 21.0, 22.0]
const x = (i: number) => 52 + i * 4 * 9.6
const y = (m: number) => 232 - (m - 10) * 13.6
const line = minutes.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(m).toFixed(1)}`).join('')
const chart = `<svg class="kc-chart" viewBox="0 0 600 270" role="img" aria-label="Mains ticket time rose from 13 minutes at 7:00 to 22 minutes at 7:48, against a usual 14 minutes">`
  + `<defs><linearGradient id="kc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D8C4C" stop-opacity=".16"/><stop offset="1" stop-color="#2D8C4C" stop-opacity="0"/></linearGradient></defs>`
  + [25, 20, 15, 10].map(m => `<text class="ax" x="22" y="${y(m) + 5}">${m}</text><path class="grid" d="M52 ${y(m)}H530"/>`).join('')
  + ['7:00', '7:15', '7:30', '7:45'].map((t, i) => `<path class="grid" d="M${52 + i * 144} 30V232"/><text class="ax ax-x" x="${52 + i * 144}" y="262" text-anchor="middle">${t}</text>`).join('')
  + `<path class="axis" d="M52 30V232H530"/><path class="usual" d="M52 ${y(14)}H486"/><text class="ax usual-label" x="492" y="${y(14) + 5}">usual 14 min</text>`
  + `<path d="${line}L${x(minutes.length - 1)} 232H52Z" fill="url(#kc-fill)"/><path class="tline" d="${line}"/><circle class="now" cx="${x(minutes.length - 1)}" cy="${y(22)}" r="7"/></svg>`
  + `<span class="kc-tip">22 min</span>`

const move = (icon: Parameters<typeof glyph>[0], tone: string, text: string) => `<li><span class="ic ${tone}">${glyph(icon)}</span><span>${text}</span></li>`

export const kitchenPace = () => section('kitchen', '7:48',
  `<div class="svc-head">${eyebrow('7:48 PM · Kitchen pace', sky.moon)}${heading('kitchen', "Seat to the kitchen's pace.")}${lede('Placemat reads tickets from Toast, Square or Clover and spaces the next seatings.')}</div>`
  + `<div class="kc"><div class="card kc-ticket"><h3>Mains ticket time · from Toast</h3><div class="kc-plot">${chart}</div></div>`
  + `<div class="card kc-agent"><p class="kc-badge">${glyph('headset')}<span>Agent · 7:48 PM</span></p><h3>Mains are running 8 min behind.</h3>`
  + `<ul>${move('calendar', 'amber', 'Hold Tables 31 and 33 (8:00, 8 covers) until 8:10')}${move('people', 'mint', 'Seat walk-in Kim, 4 at 8:10, as quoted')}${move('list', 'lilac', 'Send the waitlist a bar snack offer (3 parties)')}</ul>`
  + `<p class="kc-done"><span class="applied">${glyph('check')}Applied 7:49</span><span class="back">${glyph('bars')}Kitchen back to 15 min by 8:20</span></p></div></div>`)

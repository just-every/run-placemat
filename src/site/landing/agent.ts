// 6:52 PM · The service agent: a call, a text and an Instagram DM, each booked
// or held into live tables mid-rush.
import { glyph, sky } from './glyphs'
import { eyebrow, heading, lede, section } from './parts'

const done = (text: string) => `<p class="done">${glyph('check', 'tick-round')}<span>${text}</span></p>`

export const serviceAgent = () => section('agent', '6:52',
  `<div class="svc-head center">${eyebrow('6:52 PM · The service agent', sky.dusk)}${heading('agent', 'The phone, answered mid-rush.')}${lede('The agent takes calls, texts and DMs, and books into live tables.')}</div>`
  + `<div class="ag">`
  + `<div class="card ag-call"><p class="ag-head"><span class="ag-icon">${glyph('phone')}</span><b>Incoming call · (212) 555-0187 · 1:42</b></p>`
  + `<dl><dt>Caller:</dt><dd>Table for 6 at 8:00?</dd><dt>Placemat:</dt><dd>8:00 is full. I have 8:45 by the window, or 9:30.</dd><dt>Caller:</dt><dd>8:45, by the window.</dd></dl>${done('Booked · Lee, 6 · 8:45 · Table 42')}</div>`
  + `<div class="card ag-text"><p class="ag-head"><span class="ag-icon">${glyph('chat')}</span><b>Text · Jordan B.</b></p>`
  + `<p class="bubble in">Running 15 late, still ok?</p><p class="bubble out mint">No problem, we'll hold your table until 7:45.</p>${done('Table 14 held to 7:45')}</div>`
  + `<div class="card ag-dm"><p class="ag-head"><span class="ag-icon">${glyph('at')}</span><b>Instagram DM · @sofia.m</b></p>`
  + `<p class="bubble in">Any room for 2 tonight?</p><p class="bubble out">Yes, 9:15 at the bar. Shall I book it?</p><p class="bubble in">Yes please!</p>${done('Booked · Sofia M., 2 · 9:15 · bar')}</div>`
  + `</div><p class="ag-foot"><i class="dot"></i>Tonight: 23 calls answered · 0 missed</p>`)

// "Also included" (six tiles, each a small ink line icon with one sea-glass
// fill) and the closing band: a white card centred on a strip of the room.
import { arrow, esc } from '../shell'
import { docsHref } from './hero'
import { table } from './plan'

// 40×40 line icons: `f` marks the one sea-glass fill.
const tiles: [string, string][] = [
  ['Table combinations', '<rect class="f" x="11" y="11" width="18" height="18" rx="3"/><rect x="5" y="15" width="4" height="10" rx="2"/><rect x="31" y="15" width="4" height="10" rx="2"/><rect x="15" y="5" width="10" height="4" rx="2"/><rect x="15" y="31" width="10" height="4" rx="2"/>'],
  ['Calendar file for every booking', '<rect class="f" x="7" y="9" width="26" height="25" rx="3"/><path d="M7 16h26M14 5v7M26 5v7"/>'],
  ['Manager and read-only staff', '<circle cx="11" cy="15" r="4"/><circle cx="29" cy="15" r="4"/><path d="M3 31c.6-4.6 3.6-7 8-7M37 31c-.6-4.6-3.6-7-8-7"/><circle class="f" cx="20" cy="12" r="5"/><path class="f" d="M11 33c.8-6 4.2-9 9-9s8.2 3 9 9z"/>'],
  ['Your venue’s timezone', '<circle class="f" cx="20" cy="20" r="14"/><path d="M20 11v9l6 5"/>'],
  ['Backup and restore', '<ellipse class="f" cx="20" cy="10" rx="12" ry="4.5"/><path d="M8 10v20c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5V10M8 20c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5"/>'],
  ['Agent preparation keys', '<circle class="f" cx="26" cy="13" r="7"/><circle cx="27" cy="12" r="1.6"/><path d="M21 18L7 32l3 3M12 27l3 3"/>'],
]

export const included = () => `<section class="included" aria-labelledby="included-title"><h2 id="included-title">Also included</h2><ul class="tiles">`
  + tiles.map(([text, art]) => `<li><svg class="tile-icon" viewBox="0 0 40 40" aria-hidden="true">${art}</svg><span>${esc(text)}</span></li>`).join('')
  + '</ul></section>'

export const closing = (docs: boolean) => `<section class="closing" aria-labelledby="closing-title"><div class="floor-map closing-room">`
  + [table({ x: 9, y: 26, round: true, narrow: false }), table({ x: 9, y: 70, state: 'booked', narrow: false }), table({ x: 91, y: 26, state: 'booked', narrow: false }), table({ x: 91, y: 70, round: true, state: 'seated', narrow: false })].join('')
  + `<div class="card closing-card"><h2 id="closing-title">Try it on one service.</h2><p>Keep what you use today. Open one night in Placemat and see how the floor runs.</p>`
  + `<div class="actions"><a class="btn" href="/run">Run Placemat${arrow}</a><a class="text-link" href="${esc(docsHref(docs))}">Read the docs</a></div></div></div></section>`

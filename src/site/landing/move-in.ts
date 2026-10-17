// Day one · Moving in: the import from OpenTable and the one line that starts
// Placemat on your own computer, before the Friday begins (no rail).
import run from '../run.json'
import { esc } from '../shell'
import { glyph } from './glyphs'
import { eyebrow, heading, lede, section } from './parts'

const row = (label: string, value = '') => `<li><span>${esc(label)}</span><span class="num">${esc(value)}</span>${glyph('check', 'ok')}</li>`

export const moveIn = () => section('move-in', null,
  `<div class="mi-copy">${eyebrow('Day one · Moving in')}${heading('move-in', 'Bring your book from OpenTable.')}${lede('Guests, tags and future reservations come with you. Resy and SevenRooms too.')}</div>`
  + `<div class="card mi-import"><h3>Importing from OpenTable</h3><div class="bar" role="img" aria-label="Import 100% complete"><i></i></div><span class="pct">100%</span>`
  + `<ul>${row('Guests', '18,402')}${row('Future reservations', '2,113')}${row('Tags and notes', '41,960')}${row('Reserve with Google switched')}</ul></div>`
  + `<div class="term mi-term"><p class="term-dots" aria-hidden="true"><i></i><i></i><i></i></p><h3>Run it yourself</h3>`
  + `<pre><code><span class="pr" aria-hidden="true">$ </span>${esc(run.clone)}\n<span class="cm"># clones, installs and starts Placemat on your computer</span></code></pre></div>`
  + `<p class="card mi-not"><svg class="sky moon" viewBox="0 0 28 28" aria-hidden="true"><path d="M17.5 4.2A10 10 0 1 0 23.8 19 8.2 8.2 0 0 1 17.5 4.2z"/></svg><span><b>Not in Placemat:</b> online ordering, gift cards or the POS itself.</span></p>`)

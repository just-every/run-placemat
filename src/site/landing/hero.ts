// The hero: the approved golden-hour dining room seen from the host stand
// (plates/plate-hero.png, its menu-book emboss redrawn as the real mark), with
// every string laid over it as HTML: the copy, the five tags and the tablet's
// floor plan and waitlist, set into the screen's perspective. The art and its
// overlays share one 1536 x 1024 stage that CSS scales per breakpoint.
import run from '../run.json'
import { arrow, esc } from '../shell'
import { glyph } from './glyphs'
import { sections, waitlist, type FloorTable } from './sheet'

const tag = (cls: string, dot: string, title: string, lines: string[], tick = false) =>
  `<div class="tag ${cls}"><p class="tag-title"><i class="dot ${dot}"></i>${esc(title)}</p>${lines.map((line, i) => `<p>${esc(line)}${tick && i === lines.length - 1 ? glyph('check', 'tick') : ''}</p>`).join('')}</div>`

const tags = tag('t-table', 'd-green', 'Table 12', ['Priya +3 · 7:30', 'anniversary'])
  + tag('t-regular', 'd-blue', 'Regular', ['15th visit', 'likes the window'])
  + tag('t-deposit', 'd-amber', 'Deposit $50', ['held'])
  + tag('t-wait', 'd-violet', 'Waitlist', ['Marco, 2 · 15 min', 'text sent'])
  + tag('t-cancel', 'd-red', 'Cancellation', ['8:00 → filled', 'from waitlist'], true)

// The tablet shows the host stand at 6:40, the same tables and states as the
// host stand section, in the desk's three-by-three room.
const table = (id: string) => sections.flatMap(s => s.tables).find(t => t.id === id || t.id.split('+').includes(id)) as FloorTable
const room = [['11', '12', '13'], ['21', '22', '23'], ['31', '32', '33']]
const tile = (id: string) => { const t = table(id); return `<span class="tt ${t.shape === 'round' || id === '22' ? 'round' : 'sq'} st-${t.state}">${id}</span>` }
const tablet = `<div class="screen" aria-hidden="true"><div class="scr-tabs"><span class="on">Floor plan</span><span>Waitlist</span><span>Reservations</span></div>`
  + `<div class="scr-body"><div class="scr-floor">${room.map(row => row.map(tile).join('')).join('')}<i class="leaf l1"></i><i class="leaf l2"></i><i class="leaf l3"></i><i class="leaf l4"></i></div>`
  + `<div class="scr-wait"><p class="scr-wait-title">Waitlist (${waitlist.length})</p>${waitlist.slice(0, 3).map((w, i) => `<div class="scr-party">${glyph('people')}<p><b>${esc(w.name)}</b><span>${w.size} · ${esc(w.quote.replace('quoted ', ''))} min</span></p>${glyph('chat', 'g msg')}${i === 0 ? '<em>text sent</em>' : ''}</div>`).join('')}</div></div></div>`

const label = 'The host stand at golden hour: a tablet shows the floor plan and a waitlist of five, with notes for Table 12 (Priya, party of 4 at 7:30, anniversary), a regular on her 15th visit, Marco on the waitlist with a text sent, a $50 deposit held and an 8:00 cancellation filled from the waitlist.'

const art = (prefix: string, sizes: string, widths: number[], width: number, height: number, eager: boolean) => {
  const set = (type: string) => widths.map(w => `/site/${prefix}-${w}.${type} ${w}w`).join(', ')
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">`
    + `<img src="/site/${prefix}-${widths[widths.length - 1]}.webp" alt="" width="${width}" height="${height}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></picture>`
}

export function hero(docs: boolean): string {
  return `<section class="hero" aria-labelledby="hero-title">`
    + `<div class="hero-stage" role="img" aria-label="${esc(label)}"><div class="stage">${art('hero', '(max-width:1199px) 1px, 100vw', [768, 1152, 1536], 1536, 1024, true)}<div class="stage-ui">${tablet}</div>${tags}</div></div>`
    + `<div class="hero-copy"><h1 id="hero-title">Every table, filled.</h1>`
    + `<p class="sub">Placemat takes reservations from your site, Google and Instagram, runs the host stand and waitlist, and remembers every guest.</p>`
    + `<p class="alt">100% free, open source alternative to <b>OpenTable</b>, <b>Resy</b> and <b>SevenRooms</b></p>`
    + `<div class="actions"><a class="btn" href="/run">Run Placemat${arrow}</a><a class="text-link" href="${docs ? '/docs' : esc(run.repository)}">Read the docs</a></div></div>`
    + `<div class="hero-phone" aria-hidden="true"><div class="stage">${art('hero-phone', '(max-width:1199px) 760px, 1px', [380, 760], 760, 774, false)}<div class="stage-ui">${tablet}</div></div></div>`
    + `<div class="hero-cards">${tag('t-table', 'd-green', 'Table 12', ['Priya +3 · 7:30 · anniversary'])}${tag('t-wait', 'd-violet', 'Waitlist', ['Marco, 2 · 15 min · text sent'])}</div>`
    + `</section>`
}

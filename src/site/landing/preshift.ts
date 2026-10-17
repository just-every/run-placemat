// 4:45 PM · Pre-shift: the host's sheet at lineup, drawn as UI: guests to
// know, server sections with a small plan of the room, and kitchen notes.
import { esc } from '../shell'
import { glyph, sky } from './glyphs'
import { avatar, eyebrow, heading, lede, section } from './parts'
import { bookCovers, bookParties, deposit, fullSlots, venue } from './sheet'

const guest = (initials: string, tone: 'mint' | 'amber' | 'sky', name: string, detail: string, tags: string) =>
  `<li class="ps-guest">${avatar(initials, tone)}<div><p><b>${esc(name)}</b>${detail}</p><p class="tags">${tags}</p></div></li>`
const tag = (text: string, tone = '') => `<span class="tg${tone ? ` tg-${tone}` : ''}">${esc(text)}</span>`

const sectionRow = (letter: string, tone: 'mint' | 'amber' | 'sky', name: string, tables: string) =>
  `<li>${avatar(letter, tone)}<p><b>${name}</b> · Tables ${tables}</p></li>`

// The room by section (Ana green, Ben amber, Cole blue), the same tables as the host stand.
const plan = `<svg class="ps-plan" viewBox="0 0 400 170" role="img" aria-label="The room by section: Ana's four tables at left, Ben's three in the middle, Cole's six at right">`
  + `<path class="wall" d="M4 14h96v12h34v-12h126v12h80l40 34v104h-90v6H140v-6H4z"/>`
  + `<path class="z-ana" d="M8 18h88v12h34v126H8z"/><path class="z-ben" d="M134 18h120v138H134z"/><path class="z-cole" d="M270 30h80l36 30v96H270z"/>`
  + `<g class="t-ana"><circle cx="56" cy="44" r="11"/><rect x="82" y="54" width="22" height="22" rx="3"/><circle cx="56" cy="108" r="11"/><rect x="12" y="72" width="16" height="56" rx="3"/></g>`
  + `<g class="t-ben"><rect x="152" y="34" width="26" height="26" rx="3"/><circle cx="222" cy="58" r="14"/><rect x="170" y="104" width="26" height="26" rx="3"/></g>`
  + `<rect class="bar" x="258" y="58" width="12" height="70" rx="2"/>`
  + `<g class="t-cole"><rect x="286" y="44" width="22" height="22" rx="3"/><circle cx="342" cy="58" r="9"/><rect x="286" y="88" width="22" height="22" rx="3"/><rect x="332" y="86" width="22" height="22" rx="3"/><circle cx="298" cy="136" r="11"/><circle cx="350" cy="134" r="14"/></g></svg>`

const kitchen = (icon: Parameters<typeof glyph>[0], text: string, cls = '') => `<li class="${cls}">${glyph(icon)}<span>${text}</span></li>`

export const preShift = () => section('preshift', '4:45',
  `<div class="svc-head center">${eyebrow('4:45 PM · Pre-shift', sky.dusk, true)}${heading('preshift', 'Every server, briefed.')}${lede('One sheet at lineup: who is coming, who is special, who serves where.')}</div>`
  + `<div class="card ps"><div class="ps-head"><h3>Pre-shift · ${esc(venue.date)} · 4:45 PM</h3><p class="pills"><span class="pill">${bookCovers} covers</span><span class="pill">${bookParties} parties</span><span class="pill pill-amber">${fullSlots.join(', ')} full</span></p></div>`
  + `<div class="ps-cols"><div class="ps-col"><p class="cap">Guests to know</p><ul class="ps-guests">`
  + guest('PR', 'mint', 'Priya Raman', ', 4 · 7:30 · Table 12', tag('Anniversary') + tag('Shellfish allergy', 'red') + tag('Window'))
  + guest('OK', 'amber', 'Okafor', ', 8 · 8:15 · Tables 21+22', tag(`$${deposit.okafor} deposit held`, 'green'))
  + guest('LIN', 'sky', 'Lin', ", 2 · 8:30 · Chef's counter", tag(`$${deposit.lin} deposit held`, 'green'))
  + `</ul></div><div class="ps-col"><p class="cap">Sections</p><ul class="ps-sections">${sectionRow('A', 'mint', 'Ana', '11, 12, 13, 21+22')}${sectionRow('B', 'amber', 'Ben', '14, 23, 24')}${sectionRow('C', 'sky', 'Cole', '31 to 34, 41, 42')}</ul>${plan}</div>`
  + `<div class="ps-col"><p class="cap">Kitchen</p><ul class="ps-kitchen">${kitchen('fish', 'Halibut · 12 portions')}${kitchen('chef', `Pace · ${venue.pace} covers per half hour`)}${kitchen('alert', 'Shellfish allergy at Table 12', 'warn')}</ul></div></div></div>`)

// 7:15 PM · The no-show: Table 23's timeline, the fee from the card on file in
// red, the refill from the waitlist in green, and the table-ready text.
import { esc } from '../shell'
import { sky } from './glyphs'
import { eyebrow, heading, lede, section } from './parts'
import { noShow, venue } from './sheet'

const step = (time: string, text: string) => `<li><i></i><b>${time}</b><span>${text}</span></li>`
const { refill } = noShow

export const theNoShow = () => section('noshow', '7:15',
  `<div class="svc-head">${eyebrow('7:15 PM · The no-show', sky.moon)}${heading('noshow', 'A no-show, refilled in nine minutes.')}${lede('The card on file covers the no-show. The waitlist fills the table.')}</div>`
  + `<div class="ns"><div class="card ns-line"><h3>Table ${noShow.table} · ${noShow.party}, ${noShow.size} · ${noShow.due}</h3><div class="ns-bands">`
  + `<div class="band red"><p class="band-title">No-show → $${noShow.fee} fee charged</p><ol>${step('7:15', 'Due')}${step('7:25', 'No arrival')}${step('7:28', '2 calls, no answer')}${step('7:30', 'Marked no-show')}</ol></div>`
  + `<div class="band green"><p class="band-title">Refilled from the waitlist → seated ${refill.seated}</p><ol>${step('7:31', `Table ready text to ${refill.name}, ${refill.size}`)}${step('7:33', '‘On our way!’')}${step(refill.seated, 'Seated')}</ol></div></div></div>`
  + `<div class="card ns-text"><h3>${refill.name} · ${refill.size}</h3><p class="bubble in">${esc(venue.name)}: Your table is ready. We'll hold it 10 minutes.</p><p class="bubble out">On our way!</p></div>`
  + `<p class="card ns-fact"><b>${refill.name}, ${refill.size} · quoted ${refill.quote} · waited ${refill.waited}m</b></p><p class="card ns-fact fee"><b>No-show fee $${noShow.fee}</b></p></div>`)

// 4:10 PM · Confirmations: Priya's two-way text, Okafor's deposit hold and the
// tally of replies.
import { esc } from '../shell'
import { glyph, sky } from './glyphs'
import { avatar, eyebrow, heading, lede, section } from './parts'
import { confirmations, deposit, venue } from './sheet'

const line = (icon: Parameters<typeof glyph>[0], text: string) => `<li>${glyph(icon)}<span>${text}</span></li>`

export const confirmed = () => section('confirm', '4:10',
  `<div class="cf-copy">${eyebrow('4:10 PM · Confirmations', sky.sun)}${heading('confirm', 'Confirmed before they leave home.')}${lede('Reminders go out by text. Guests reply. Deposits hold the big tables.')}</div>`
  + `<div class="cf-cards"><div class="card cf-text"><p class="who">${avatar('PR')}<span><b>Priya Raman</b> · Party of 4 · 7:30</span></p>`
  + `<p class="bubble out">${esc(venue.name)}: See you tonight at 7:30. Reply C to confirm or R to reschedule.</p><p class="bubble in">C! It's our anniversary.</p>`
  + `<p class="tagged">${glyph('check', 'tick-round')}Tagged: anniversary · candle on dessert</p></div>`
  + `<div class="card cf-deposit"><p class="who">${avatar('OK', 'amber')}<span><b>Okafor</b> · Party of 8 · 8:15</span><span class="pill pill-amber">Held</span></p>`
  + `<ul>${line('card', `Deposit · $${deposit.perGuest} per guest`)}${line('lock', `Held · $${deposit.okafor} · card ending ${deposit.card}`)}${line('clock', 'Released at seating')}</ul></div>`
  + `<div class="card cf-tally"><p><span class="k"><i class="dot d-green"></i>Confirmed</span><b>${confirmations.confirmed}</b></p><p><span class="k"><i class="dot d-grey"></i>Awaiting reply</span><b>${confirmations.awaiting}</b></p>`
  + `<p><span class="k"><i class="dot d-red"></i>Cancelled</span><b>${confirmations.cancelled}</b></p><p class="cf-offer">${glyph('arrow')}<span>${confirmations.cancelled} tables offered to the waitlist</span></p></div></div>`)

// 3:05 PM · The book: tonight's reservation book as slot rows, covers against
// the pacing limit and party chips marked with their booking channel.
import { esc } from '../shell'
import { channelGlyph, channelLabel, glyph, sky } from './glyphs'
import { eyebrow, heading, lede, section } from './parts'
import { book, bookCovers, bookParties, channels, venue, type Party } from './sheet'

const fresh = book.flatMap(slot => slot.parties).filter(party => party.fresh).length

const chip = (party: Party) => `<li class="chip${party.fresh ? ' fresh' : ''}"><span>${esc(party.name)}, ${party.size}${party.note ? ` · ${esc(party.note)}` : ''}</span>`
  + `${party.channel ? `<span class="ch" title="${channelLabel[party.channel]}">${glyph(channelGlyph[party.channel])}<span class="vh">${channelLabel[party.channel]}</span></span>` : ''}${party.fresh ? '<i class="new" aria-label="new"></i>' : ''}</li>`

export const theBook = () => section('book', '3:05',
  `<div class="svc-head center">${eyebrow('3:05 PM · The book', sky.sun)}${heading('book', 'The book fills itself.')}${lede('Guests book on Google, Instagram and your site. Pacing keeps the kitchen even.')}</div>`
  + `<div class="card bk"><p class="bk-new"><i></i>${fresh} new since 3:00 PM</p><div class="bk-head"><h3>Tonight <span>·</span> ${esc(venue.date)}</h3><p>${bookCovers} covers · ${bookParties} parties</p></div>`
  + `<ol class="bk-rows">${book.map(slot => {
    const full = slot.covers === venue.pace
    return `<li class="bk-row"><b class="bk-time">${slot.time}</b><span class="bk-covers${full ? ' full' : ''}">${slot.covers}/${venue.pace}${full ? ' full' : ''}</span>`
      + `<ul class="chips">${slot.parties.map(chip).join('')}${slot.more ? `<li class="chip more">+${slot.more} more</li>` : ''}${slot.offer ? `<li class="chip offer">${esc(slot.offer)}</li>` : ''}</ul></li>`
  }).join('')}</ol></div>`
  + `<p class="bk-channels">${channels.map(c => `<span>${c.label} ${c.covers}</span>`).join('<i aria-hidden="true">·</i>')}</p>`)

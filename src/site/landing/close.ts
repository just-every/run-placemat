// 10:40 PM · Close: Priya's guest profile with tonight's check from the POS,
// and the night's service report.
import { glyph, sky } from './glyphs'
import { avatar, eyebrow, heading, lede, section } from './parts'
import { priya, report } from './sheet'

const fact = (icon: Parameters<typeof glyph>[0], label: string, value = '') => `<li>${glyph(icon)}<span>${label}</span>${value ? `<b>${value}</b>` : ''}</li>`
const line = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`

export const close = () => section('close', '10:40',
  `<div class="cl-copy">${eyebrow('10:40 PM · Close', sky.moon, true)}${heading('close', 'Every guest, remembered.')}${lede('Each check from your POS lands on the guest. Next visit, the host already knows.')}</div>`
  + `<div class="cl-cards"><div class="card cl-guest"><p class="who">${avatar('PR', 'sky')}<b>Priya Raman</b></p>`
  + `<p class="tags"><span class="tg tg-green">Regular · ${priya.visits} visits</span><span class="tg tg-amber">Anniversary Oct 23</span><span class="tg tg-red">Shellfish allergy</span><span class="tg">Window table</span></p>`
  + `<ul>${fact('card', 'Average check', `$${priya.average}`)}${fact('cutlery', `Tonight · Table ${priya.table} · $${priya.tonight}`)}${fact('cloche', 'Usually orders halibut, Sancerre')}${fact('chat', 'Texts: opted in')}</ul>`
  + `<p class="bubble in">How was tonight?</p><p class="bubble out mint">Perfect, thank you!</p></div>`
  + `<div class="card cl-report"><h3>Friday, Oct 23 · service report</h3><dl>${line('Covers', `${report.covers} · ${report.booked} booked, ${report.walkIns} walk-in`)}${line('No-shows', `${report.noShows} · both refilled`)}`
  + `${line('No-show fees', `$${report.fees}`)}${line('Average turn', report.turn)}${line('Quoted vs actual', '±3 min')}${line('Covers recovered', String(report.recovered))}</dl></div></div>`)

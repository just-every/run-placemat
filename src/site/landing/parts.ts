// Pieces every service section shares: the eyebrow with its light, the
// service-clock rail in the left margin, small cards and avatars.
import { esc } from '../shell'

/** A section of the Friday: `time` steps the rail (none on day one). */
export const section = (id: string, time: string | null, inner: string, labelledBy = `${id}-title`) =>
  `<section class="svc svc-${id}" id="${id}" aria-labelledby="${labelledBy}">${time ? `<div class="rail" aria-hidden="true"><span class="rail-pill">${esc(time)}</span></div>` : ''}<div class="svc-in">${inner}</div></section>`

export const eyebrow = (text: string, icon = '', iconAfter = false) =>
  `<p class="eyebrow">${iconAfter ? '' : icon}<span>${esc(text)}</span>${iconAfter ? icon : ''}</p>`

export const heading = (id: string, text: string) => `<h2 id="${id}-title">${esc(text)}</h2>`
export const lede = (text: string) => `<p class="lede">${esc(text)}</p>`

/** Initials in a soft round chip; `tone` picks the wash. */
export const avatar = (initials: string, tone: 'mint' | 'amber' | 'sky' | 'lilac' | 'rose' = 'mint') =>
  `<span class="av av-${tone}" aria-hidden="true">${esc(initials)}</span>`

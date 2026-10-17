// The homepage's small line icons, drawn on a 24-unit grid in currentColor.
// Booking channels are generic glyphs (a globe, a map pin, a camera, a phone),
// never a company's logo, and carry no colour.
import type { Channel } from './sheet'

const paths = {
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z"/>',
  pin: '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  camera: '<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10H4z"/><circle cx="12" cy="13.2" r="3.2"/>',
  phone: '<path d="M8.6 3.8 6 4.5c-1 .3-1.6 1.3-1.4 2.3 1.2 6.1 6.5 11.4 12.6 12.6 1 .2 2-.4 2.3-1.4l.7-2.6-3.9-1.8-1.6 1.8c-2.2-1-4-2.8-5-5l1.8-1.6z"/>',
  check: '<path d="M6 12.5l4 4 8-9"/>',
  card: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M7 14.5h3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  fish: '<path d="M3 12c3-4.2 7.6-5.6 11.5-3.6 1.4.7 2.6 1.9 3.5 3.6-.9 1.7-2.1 2.9-3.5 3.6C10.6 17.6 6 16.2 3 12z"/><path d="M18 12l3-3v6zM7.5 11.2v.1"/>',
  chef: '<path d="M7.5 15.5h9V19h-9zM7.5 15.5c-2.5-.4-4-2.4-3.6-4.6.4-2 2.4-3.3 4.3-3 .6-2 2.2-3.4 3.8-3.4s3.2 1.4 3.8 3.4c1.9-.3 3.9 1 4.3 3 .4 2.2-1.1 4.2-3.6 4.6"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.1"/>',
  chat: '<path d="M5 18.5V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6a2.5 2.5 0 0 1-2.5 2.5H9z"/>',
  at: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 6.9"/>',
  headset: '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3"/><rect x="3.5" y="13.5" width="4" height="6" rx="1.5"/><rect x="16.5" y="13.5" width="4" height="6" rx="1.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-3 2.7-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="16.5" cy="8.5" r="2.4"/><path d="M15.5 13.6c2.6-.3 4.6 1.3 5.1 4.4"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.1M4.5 12h.1M4.5 17h.1"/>',
  bars: '<path d="M6 19v-6M12 19V7M18 19v-9"/>',
  cutlery: '<path d="M7 3.5v7M4.5 3.5v5a2.5 2.5 0 0 0 5 0v-5M7 10.5v10M16.5 20.5v-17c-2.2 1.2-3.3 3.8-3.3 7.2v3.3h3.3"/>',
  cloche: '<path d="M4 17.5h16M5.5 17.5a6.5 6.5 0 0 1 13 0M12 9V7.5M10.5 7.5h3"/>',
  arrow: '<path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
} as const
export type Glyph = keyof typeof paths

export const glyph = (name: Glyph, className = 'g') => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`

export const channelGlyph: Record<Channel, Glyph> = { web: 'globe', google: 'pin', instagram: 'camera', phone: 'phone' }
export const channelLabel: Record<Channel, string> = { web: 'Website', google: 'Google', instagram: 'Instagram', phone: 'Phone' }

/** The time-of-day marks beside each eyebrow: filled, in the light's own colour. */
export const sky = {
  sun: '<svg class="sky" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="5.5" fill="#F0A92B"/><path d="M14 3v3.2M14 21.8V25M3 14h3.2M21.8 14H25M6.2 6.2l2.3 2.3M19.5 19.5l2.3 2.3M6.2 21.8l2.3-2.3M19.5 8.5l2.3-2.3" stroke="#F0A92B" stroke-width="1.8" stroke-linecap="round"/></svg>',
  dusk: '<svg class="sky" viewBox="0 0 36 28" aria-hidden="true"><path d="M8 18a10 10 0 0 1 20 0z" fill="#E59A2E"/><path d="M3 21h30M8 24.5h20" stroke="#C98A2C" stroke-width="1.8" stroke-linecap="round"/><path d="M18 3.5v3M9.5 7l1.8 2.2M26.5 7l-1.8 2.2" stroke="#E59A2E" stroke-width="1.8" stroke-linecap="round"/></svg>',
  sunset: '<svg class="sky" viewBox="0 0 36 28" aria-hidden="true"><path d="M7 20a11 8 0 0 1 22 0z" fill="#E39A3B"/><path d="M4 22.5h28" stroke="#C97F2B" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg class="sky" viewBox="0 0 28 28" aria-hidden="true"><path d="M17.5 4.2A10 10 0 1 0 23.8 19 8.2 8.2 0 0 1 17.5 4.2z" fill="currentColor"/></svg>',
}

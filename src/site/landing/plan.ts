// Drawing parts for the landing: tables and fixtures on the shared floor plan
// (public/plan.css), the small line icons and the dashed arrow. Decorative
// furniture is aria-hidden; each drawing names itself on its figure.
import { esc } from '../shell'

type State = 'available' | 'booked' | 'seated'
export interface TableSpec {
  /** Position in % of the room: across, down. */
  x: number; y: number
  seats?: 2 | 4; round?: boolean; state?: State
  /** Table size in px (CSS length allowed). */
  size?: string
  /** Real text inside the table top. */
  lines?: string[]
  /** On the phone layout: its own position, or hidden. */
  narrow?: [number, number] | false
}

export function table({ x, y, seats = 4, round = false, state = 'available', size, lines = [], narrow }: TableSpec): string {
  const style = [`--x:${x}%`, `--y:${y}%`, size ? `--t:${size}` : '', narrow ? `--nx:${narrow[0]}%;--ny:${narrow[1]}%` : ''].filter(Boolean).join(';')
  const text = lines.map((line, i) => i === 0 ? `<strong>${esc(line)}</strong>` : `<small>${esc(line)}</small>`).join('')
  return `<span class="floor-table" data-seats="${seats}"${round ? ' data-shape="round"' : ''} data-occupancy="${state}"${narrow === false ? ' data-narrow="hide"' : ''}${lines.length ? '' : ' aria-hidden="true"'} style="${style}"><span class="top">${text}</span></span>`
}

/** A bar counter with stools, placed by % like a table. */
export const counter = (x: number, y: number, width: string, stools: number, narrow?: false) =>
  `<span class="counter" aria-hidden="true"${narrow === false ? ' data-narrow="hide"' : ''} style="--x:${x}%;--y:${y}%;--w:${width}">${'<i></i>'.repeat(stools)}</span>`

const icons: Record<string, string> = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-5.8 7-5.8s6.2 2 7 5.8"/>',
}
export const icon = (name: keyof typeof icons) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`

/** The dashed arrow between drawing parts; `turn` bends it down for stacked layouts. */
export const dashed = (className = '') => `<svg class="dashed ${className}" viewBox="0 0 80 40" aria-hidden="true"><path d="M4 22c18-16 40-16 64-2"/><path d="M60 13l9 7-11 3"/></svg>`

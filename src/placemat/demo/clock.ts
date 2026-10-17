// Venue-local wall times for the sample restaurant, relative to the demo's `now`.
// Day 0 is tonight's service: once dinner has closed it moves to tomorrow.

const parts = (t: number, timeZone: string) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(t)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)])) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>
const offset = (t: number, zone: string) => { const p = parts(t, zone); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000 }
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export type Clock = ReturnType<typeof venueClock>

export function venueClock(now: Date, zone: string, closesAt: string) {
  const p = parts(now.getTime(), zone), [h, m] = closesAt.split(':').map(Number)
  const anchor = Date.UTC(p.year, p.month - 1, p.day + (p.hour * 60 + p.minute >= h * 60 + m ? 1 : 0))
  const date = (day: number) => new Date(anchor + day * 86400000)
  return {
    now: now.getTime(),
    weekday: (day: number) => weekdays[date(day).getUTCDay()],
    weekend: (day: number) => [0, 6].includes(date(day).getUTCDay()),
    isoDate: (day: number) => date(day).toISOString().slice(0, 10),
    /** The instant of a venue wall time on a day relative to day 0. */
    at(day: number, time: string) {
      const [hour, minute] = time.split(':').map(Number), d = date(day), wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute)
      return new Date(wall - offset(wall - offset(wall, zone), zone)).toISOString()
    },
  }
}

/** A small fixed-seed generator, so every demo draws the same restaurant. */
export function random(seed: number) {
  let a = seed >>> 0
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  return {
    next,
    pick: <T>(rows: readonly T[]) => rows[Math.floor(next() * rows.length)],
    weighted: <T>(rows: readonly (readonly [T, number])[]) => { let r = next() * rows.reduce((n, [, w]) => n + w, 0); for (const [value, w] of rows) if ((r -= w) < 0) return value; return rows[rows.length - 1][0] },
  }
}

/** Fixed, UUID-shaped ids per kind, so a repeated seed writes nothing new. */
export const fixedId = (kind: number, n: number) => `0d3e0000-0000-4000-8${kind.toString(16).padStart(3, '0')}-${n.toString(16).padStart(12, '0')}`

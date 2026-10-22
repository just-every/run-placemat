import { fail, type Booking, type State } from './model'

const sources = ['online', 'phone', 'walk-in', 'waitlist'] as const
const statuses = ['booked', 'seated', 'completed', 'cancelled', 'no-show'] as const
const periods = ['all', 'past', 'current', 'future'] as const

type Period = typeof periods[number]
export type ReportFilters = {
  venue: string | null; dateFrom: string | null; dateTo: string | null
  serviceId: string | null; area: string | null; source: Booking['source'] | null
  status: Booking['status'] | null; partyMin: number | null; partyMax: number | null; period: Period
}
export type ReservationReportRow = {
  bookingId: string; serviceId: string; service: string; venue: string; serviceDate: string
  startAt: string; endAt: string; areas: string[]; tables: string[]; partySize: number
  source: Booking['source']; status: Booking['status']; pacingOverride:boolean
}
export type CoverMetric = { covers: number; bookings: number; bookingIds: string[]; definition: string }
export type CoverRate = {
  percentage: number | null; numerator: number; denominator: number; bookingIds: string[]; definition: string
}

function filterValue(search: URLSearchParams, key: string): string | null {
  if (search.getAll(key).length > 1) fail(400, `${key} must be supplied only once.`)
  const value = search.get(key)
  return value === null || value === '' ? null : value
}

function enumFilter<T extends string>(value: string | null, key: string, choices: readonly T[]): T | null {
  if (value === null) return null
  if (!choices.includes(value as T)) fail(400, `${key} must be one of: ${choices.join(', ')}.`)
  return value as T
}

function dateFilter(value: string | null, key: string): string | null {
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) fail(400, `${key} must be a valid YYYY-MM-DD date.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, `${key} must be a valid YYYY-MM-DD date.`)
  return value
}

// Reservations, walk-ins and queued parties are all accepted up to 500 guests.
const maxParty = 500

function partyFilter(value: string | null, key: string): number | null {
  if (value === null) return null
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maxParty) fail(400, `${key} must be an integer from 1 to ${maxParty}.`)
  return Number(value)
}

function readFilters(search: URLSearchParams): ReportFilters {
  const filters: ReportFilters = {
    venue: filterValue(search, 'venue'), dateFrom: dateFilter(filterValue(search, 'dateFrom'), 'dateFrom'),
    dateTo: dateFilter(filterValue(search, 'dateTo'), 'dateTo'), serviceId: filterValue(search, 'serviceId'),
    area: filterValue(search, 'area'), source: enumFilter(filterValue(search, 'source'), 'source', sources),
    status: enumFilter(filterValue(search, 'status'), 'status', statuses),
    partyMin: partyFilter(filterValue(search, 'partyMin'), 'partyMin'), partyMax: partyFilter(filterValue(search, 'partyMax'), 'partyMax'),
    period: enumFilter(filterValue(search, 'period'), 'period', periods) ?? 'all',
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) fail(400, 'dateFrom must be on or before dateTo.')
  if (filters.partyMin !== null && filters.partyMax !== null && filters.partyMin > filters.partyMax) fail(400, 'partyMin must be no greater than partyMax.')
  return filters
}

function metric(rows: ReservationReportRow[], definition: string): CoverMetric {
  return { covers: rows.reduce((sum, row) => sum + row.partySize, 0), bookings: rows.length, bookingIds: rows.map(row => row.bookingId), definition }
}

function rate(numerator: CoverMetric, denominator: CoverMetric, definition: string): CoverRate {
  return {
    percentage: denominator.covers === 0 ? null : numerator.covers / denominator.covers * 100,
    numerator: numerator.covers, denominator: denominator.covers, bookingIds: [...numerator.bookingIds], definition,
  }
}

/** Reservation covers, scoped to the supplied filters. No guest records enter this result. */
export function reservationReport(state: State, search: URLSearchParams, now: Date = new Date()) {
  const filters = readFilters(search)
  if (!Number.isFinite(now.getTime())) fail(400, 'The report time must be a valid date.')
  const services = new Map(state.services.map(service => [service.id, service]))
  const tables = new Map(state.tables.map(table => [table.id, table]))
  const tableArea = (table: State['tables'][number]) => table.area || 'Dining room'
  const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: state.venue.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const serviceDate = (startAt: string) => {
    const parts = dateFormatter.formatToParts(new Date(startAt))
    return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`
  }
  const rows: ReservationReportRow[] = []
  for (const booking of state.bookings) {
    const service = services.get(booking.serviceId) ?? fail(500, 'A reservation references a missing service.')
    const start = new Date(service.startAt).getTime()
    const end = new Date(service.endAt).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail(500, 'A service has an invalid reporting interval.')
    const day = serviceDate(service.startAt)
    const period: Period = end <= now.getTime() ? 'past' : start > now.getTime() ? 'future' : 'current'
    const assignedTables = booking.tableIds.map(tableId => tables.get(tableId))
    if (assignedTables.some(table => !table)) fail(500, 'A reservation references a missing table.')
    const areas = [...new Set(assignedTables.flatMap(table => table ? [tableArea(table)] : []))].sort()
    if ((filters.venue && filters.venue !== state.venue.name)
      || (filters.dateFrom && day < filters.dateFrom) || (filters.dateTo && day > filters.dateTo)
      || (filters.serviceId && booking.serviceId !== filters.serviceId) || (filters.area && !areas.includes(filters.area))
      || (filters.source && booking.source !== filters.source) || (filters.status && booking.status !== filters.status)
      || (filters.partyMin !== null && booking.partySize < filters.partyMin) || (filters.partyMax !== null && booking.partySize > filters.partyMax)
      || (filters.period !== 'all' && filters.period !== period)) continue
    rows.push({
      bookingId: booking.id, serviceId: service.id, service: service.name, venue: state.venue.name, serviceDate: day,
      startAt: booking.startAt, endAt: booking.endAt, areas,
      tables: assignedTables.flatMap(table => table ? [table.label] : []), partySize: booking.partySize, source: booking.source, status: booking.status, pacingOverride:Boolean(booking.pacingOverride),
    })
  }
  rows.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.startAt.localeCompare(b.startAt) || a.bookingId.localeCompare(b.bookingId))
  const booked = metric(rows, 'All filtered reservation covers, including cancelled reservations and no-shows; excludes the waiting list.')
  const attended = metric(rows.filter(row => row.status === 'seated' || row.status === 'completed'), 'Filtered reservation covers with status seated or completed; a status-based attendance measure.')
  const cancelled = metric(rows.filter(row => row.status === 'cancelled'), 'Filtered reservation covers with status cancelled.')
  const noShow = metric(rows.filter(row => row.status === 'no-show'), 'Filtered reservation covers with status no-show.')
  const activeBooked = metric(rows.filter(row => row.status === 'booked'), 'Filtered reservation covers still in booked status; excludes seated, completed, cancelled and no-show reservations.')
  return {
    venue: state.venue.name, timezone: state.venue.timezone, generatedAt: now.toISOString(), filters,
    options: {
      venues: [state.venue.name], services: state.services.map(service => ({ id: service.id, name: service.name })),
      areas: [...new Set(state.tables.map(tableArea))].sort(), sources: [...sources], statuses: [...statuses], periods: [...periods],
    },
    summary: {
      booked, attended, cancelled, noShow, activeBooked, pacingOverrides:metric(rows.filter(row=>row.pacingOverride),'Reservations with a staff pacing override, including later cancellations; each reservation counts once.'),
      rates: {
        attended: rate(attended, booked, 'Attended covers / all filtered booked covers × 100. Null when booked covers are zero.'),
        cancelled: rate(cancelled, booked, 'Cancelled covers / all filtered booked covers × 100. Null when booked covers are zero.'),
        noShow: rate(noShow, booked, 'No-show covers / all filtered booked covers × 100. Null when booked covers are zero.'),
      },
      definitions: {
        serviceDate: 'The service start date in the venue timezone, regardless of reservation start date. Date bounds are inclusive.',
        period: 'Service interval relative to generatedAt: past when end ≤ now; current when start ≤ now < end; future when start > now.',
        areas: 'A reservation appears once, including when assigned to tables in multiple areas. Unassigned reservations have no area.',
        scope: 'Every metric and rate uses only the filtered rows; status filters also change the denominator.',
      },
    },
    rows,
  }
}

export type ReservationReport = ReturnType<typeof reservationReport>

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  // Spreadsheet programs may interpret formulas even after whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/** Rows use the report's exact filtered population; numeric cover columns can be summed independently. */
export function reportCsv(report: ReservationReport, extra?: { header: string[]; values: (row: ReservationReportRow) => unknown[] }): string {
  const filterKeys = ['venue', 'dateFrom', 'dateTo', 'serviceId', 'area', 'source', 'status', 'partyMin', 'partyMax', 'period'] as const
  const header = ['generatedAt', 'timezone', ...filterKeys.map(key => `filter_${key}`),
    'bookingId', 'serviceId', 'service', 'venue', 'serviceDate', 'startAt', 'endAt', 'areas', 'tables', 'partySize', 'source', 'status',
    'bookedCount', 'attendedCount', 'cancelledCount', 'noShowCount', 'activeBookedCount',
    'bookedCovers', 'attendedCovers', 'cancelledCovers', 'noShowCovers', 'activeBookedCovers', 'pacingOverrideCount', ...(extra?.header ?? [])]
  const lines: unknown[][] = [header]
  for (const row of report.rows) {
    const attended = Number(row.status === 'seated' || row.status === 'completed')
    const cancelled = Number(row.status === 'cancelled')
    const noShow = Number(row.status === 'no-show')
    const activeBooked = Number(row.status === 'booked')
    lines.push([report.generatedAt, report.timezone, ...filterKeys.map(key => report.filters[key]),
      row.bookingId, row.serviceId, row.service, row.venue, row.serviceDate, row.startAt, row.endAt, JSON.stringify(row.areas), JSON.stringify(row.tables), row.partySize, row.source, row.status,
      1, attended, cancelled, noShow, activeBooked,
      row.partySize, attended * row.partySize, cancelled * row.partySize, noShow * row.partySize, activeBooked * row.partySize, Number(row.pacingOverride), ...(extra?.values(row) ?? [])])
  }
  return lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

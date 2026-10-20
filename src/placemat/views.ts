import { fontHead } from '../base/font-head'
import { themeFrame } from '../base/theme-frame'
import branding from '../branding.json'
import type { Actor } from './model'

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// 20px ink line icons for the staff navigation, as drawn.
const icon = (paths: string) => `<svg class="nav-icon" viewBox="0 0 20 20" aria-hidden="true">${paths}</svg>`
const nav: [string, string, string][] = [
  ['floor', 'Floor & bookings', '<rect x="2.5" y="4" width="15" height="13.5" rx="2"/><path d="M2.5 8h15M6.5 2v4M13.5 2v4"/>'],
  ['services', 'Services & tables', '<path d="M2.5 15h15M4 15a6 6 0 0 1 12 0M10 9V7.5M8.5 7.5h3"/>'],
  ['waitlist', 'Waitlist', '<path d="M7 5h10M7 10h10M7 15h10M3 5h.5M3 10h.5M3 15h.5"/>'],
  ['inquiries','Group inquiries','<path d="M3 3h14v11H8l-5 3z"/>'],
  ['guests', 'Guests', '<circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.3.7 2.2 2.1 2.5 4.2"/>'],
  ['approvals', 'Approvals & reminders', '<path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13zM8.5 17.5h3"/>'],
  ['move-in', 'Move in', '<path d="M2 5h10v9H2zM12 8h3.5l2.5 3v3h-6M5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM14.5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>'],
  ['reports', 'Reservation reports', '<path d="M3 3h14v14H3zM6 13V9M10 13V6M14 13v-3"/>'],
  ['settings', 'Settings', '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'],
]

/** Authentication and first-run setup are enforced by the caller. */
export async function productPage(request: Request, _env: unknown, actor?: Actor): Promise<Response> {
  const publicPage = new URL(request.url).pathname === '/book'
  // Staff who manage the venue also load the team list; the page says so, so it is fetched beside the state.
  const editor = !!actor && !actor.agent && ['owner', 'admin'].includes(actor.role)
  // The staff screen's first reads and its empty-room drawing start with the document, not after the script runs.
  const staffPreloads = `<link rel="preload" href="/api/state" as="fetch" crossorigin>${editor ? '<link rel="preload" href="/auth/operators" as="fetch" crossorigin>' : ''}<link rel="preload" href="/brand/empty-room.svg" as="image">`
  const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor })
  const section = (id: string, title: string, copy: string) => `<section id="${id}" class="panel"><div class="section-heading"><h2>${title}</h2><p>${copy}</p></div><div id="${id}-content"><p>Loading…</p></div></section>`
  const body = publicPage
    ? `<main class="booking-shell">${frame.brand}<h1>Book a table</h1><p id="venue-line">Choose a service and a time for your visit.</p><div id="notice" role="status" aria-live="polite">Loading available services…</div><p><a href="/inquiry">Group and private dining inquiry</a></p><div id="public-content"></div><noscript><p>Enable JavaScript to check live availability and book a table.</p></noscript><a class="staff-link" href="/app">Staff sign in</a></main>`
    : `<header class="app-header">${frame.brand}<div class="who"><span>${escape(actor?.name ?? 'Staff')}</span><span class="badge">${escape(actor?.role ?? '')}</span></div><a class="guest-link" href="/book">Guest booking page ↗</a></header>`
      + `<div class="app-layout"><nav class="app-nav" aria-label="Operations">${nav.map(([id, label, paths]) => `<a href="#${id}">${icon(paths)}<span>${escape(label)}</span></a>`).join('')}</nav>`
      + `<main class="app-main"><div class="page-heading"><div><p class="eyebrow">Restaurant operations</p><h1 id="venue-name">Placemat</h1><p id="venue-zone">Loading venue…</p></div><button type="button" class="secondary" data-action="refresh">Refresh</button></div><div id="notice" role="status" aria-live="polite">Loading your venue…</div>`
      + `${section('floor', 'Floor & bookings', 'See the room at a selected time. Seated and booked parties reserve their tables through the listed turn and reset.')}<section id="bookings" class="panel" aria-label="Bookings" hidden><div id="bookings-list"></div></section>${section('services', 'Services & tables', 'Set the room, service hours and capacity. Prepare a publication for a person to approve.')}${section('waitlist', 'Waitlist', 'Keep the queue together and seat a party when capacity becomes available.')}${section('inquiries', 'Group inquiries', 'Review guest requests and exact offers; conversion requires explicit guest acceptance.')}${section('guests', 'Guest history', 'Keep useful notes beside a guest’s previous visits.')}${section('approvals', 'Approvals & reminders', 'Review the exact plan before applying it. Approved reminders are exported for your own sender.')}${section('move-in', 'Move in', 'Preview a CSV import, review its plan, then apply it explicitly.')}${section('reports', 'Reservation reports', 'Filter covers and open the reservations behind each total.')}${section('settings', 'Venue & access', 'Manage the venue, delegated preparation and portable data.')}<noscript><p>Enable JavaScript to use live restaurant operations.</p></noscript></main></div>`
  return new Response(request.method === 'HEAD' ? null : `<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${publicPage ? 'Book a table' : 'Operations'} · ${escape(branding.name)}</title>${fontHead}${frame.head}<link rel="stylesheet" href="/plan.css"><link rel="stylesheet" href="/placemat.css"><script type="module" src="/placemat.js"></script>${publicPage ? '' : staffPreloads}</head><body data-page="${publicPage ? 'public' : 'staff'}"${editor ? ' data-editor' : ''}>${body}</body></html>`, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
    'content-security-policy': `default-src 'self'; script-src 'self'; ${frame.policy}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  } })
}

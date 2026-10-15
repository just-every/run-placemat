import { fontHead } from '../base/font-head'
import { themeFrame } from '../base/theme-frame'
import branding from '../branding.json'
import type { Actor } from './model'

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Authentication and first-run setup are enforced by the caller. */
export async function productPage(request: Request, _env: unknown, actor?: Actor): Promise<Response> {
  const publicPage = new URL(request.url).pathname === '/book'
  const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor })
  const section = (id: string, title: string, copy: string) => `<section id="${id}" class="panel"><div class="section-heading"><h2>${title}</h2><p>${copy}</p></div><div id="${id}-content"><p>Loading…</p></div></section>`
  const body = publicPage
    ? `<main class="booking-shell">${frame.brand}<h1>Book a table</h1><p id="venue-line">Choose a service and a time for your visit.</p><div id="notice" role="status" aria-live="polite">Loading available services…</div><div id="public-content"></div><noscript><p>Enable JavaScript to check live availability and book a table.</p></noscript><a class="staff-link" href="/app">Staff sign in</a></main>`
    : `<header class="app-header">${frame.brand}<div><span>${escape(actor?.name ?? 'Staff')}</span><span class="badge">${escape(actor?.role ?? '')}</span><a href="/book">Guest booking page ↗</a></div></header><div class="app-layout"><nav class="app-nav" aria-label="Operations"><a href="#floor">Floor & bookings</a><a href="#services">Services & tables</a><a href="#waitlist">Waitlist</a><a href="#guests">Guests</a><a href="#approvals">Approvals & reminders</a><a href="#move-in">Move in</a><a href="#settings">Settings</a></nav><main class="app-main"><div class="page-heading"><div><p class="eyebrow">Restaurant operations</p><h1 id="venue-name">Placemat</h1><p id="venue-zone">Loading venue…</p></div><button type="button" class="secondary" data-action="refresh">Refresh</button></div><div id="notice" role="status" aria-live="polite">Loading your venue…</div>${section('floor', 'Floor & bookings', 'See the room at a selected time. Seated and booked parties reserve their tables until their booking ends.')}${section('services', 'Services & tables', 'Set the room, service hours and capacity. Prepare a publication for a person to approve.')}${section('waitlist', 'Waitlist', 'Keep the queue together and seat a party when capacity becomes available.')}${section('guests', 'Guest history', 'Keep useful notes beside a guest’s previous visits.')}${section('approvals', 'Approvals & reminders', 'Review the exact plan before applying it. Approved reminders are exported for your own sender.')}${section('move-in', 'Move in', 'Preview a CSV import, review its plan, then apply it explicitly.')}${section('settings', 'Venue & access', 'Manage the venue, delegated preparation and portable data.')}<noscript><p>Enable JavaScript to use live restaurant operations.</p></noscript></main></div>`
  return new Response(request.method === 'HEAD' ? null : `<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${publicPage ? 'Book a table' : 'Operations'} · ${escape(branding.name)}</title>${fontHead}${frame.head}<link rel="stylesheet" href="/placemat.css"><script type="module" src="/placemat.js"></script></head><body data-page="${publicPage ? 'public' : 'staff'}">${body}</body></html>`, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
    'content-security-policy': `default-src 'self'; script-src 'self'; ${frame.policy}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  } })
}

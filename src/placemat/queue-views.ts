import { fontHead } from '../base/font-head'
import { themeFrame } from '../base/theme-frame'
import branding from '../branding.json'

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

/** WAIT-002: a public queue surface, isolated from staff and booking documents. */
export async function queuePage(request: Request): Promise<Response> {
  const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor })
  const body = `<main class="booking-shell">${frame.brand}<h1>Join the queue</h1><p id="venue-line">Choose a service for your party.</p><p class="help">Queued only; no table or time promised. Staff check live pacing and availability before seating.</p><div id="notice" role="status" aria-live="polite">Loading queue…</div><div id="queue-content"></div><noscript><p>Enable JavaScript to join the live queue or manage your party.</p></noscript><p><a href="/book">Book a table</a></p><a class="staff-link" href="/app">Staff sign in</a></main>`
  return new Response(request.method === 'HEAD' ? null : `<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Queue · ${escape(branding.name)}</title>${fontHead}${frame.head}<link rel="stylesheet" href="/plan.css"><link rel="stylesheet" href="/placemat.css"><script type="module" src="/placemat-queue-join.js"></script></head><body data-page="queue">${body}</body></html>`, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
    'content-security-policy': `default-src 'self'; script-src 'self'; ${frame.policy}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  } })
}

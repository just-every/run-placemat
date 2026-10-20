import { fontHead } from '../base/font-head'
import { themeFrame } from '../base/theme-frame'
import branding from '../branding.json'

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

/** BOOK-007: a scoped guest inquiry surface, isolated from staff and booking documents. */
export async function inquiryPage(request: Request): Promise<Response> {
  const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor })
  const body = `<main class="booking-shell">${frame.brand}<h1>Group and private dining inquiries</h1><p class="help">An inquiry is not a reservation. Replies appear on this guest page; no email or text delivery is claimed.</p><div id="notice" role="status" aria-live="polite"></div><div id="inquiry-content"></div><p><a href="/book">Book a table</a></p><a class="staff-link" href="/app">Staff sign in</a></main>`
  return new Response(request.method === 'HEAD' ? null : `<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inquiry · ${escape(branding.name)}</title>${fontHead}${frame.head}<link rel="stylesheet" href="/plan.css"><link rel="stylesheet" href="/placemat.css"><script type="module" src="/placemat-inquiry.js"></script></head><body data-page="inquiry">${body}</body></html>`, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'content-security-policy': `default-src 'self'; script-src 'self'; ${frame.policy}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  } })
}

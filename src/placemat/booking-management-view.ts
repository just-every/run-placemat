import {fontHead} from '../base/font-head'
import {themeFrame} from '../base/theme-frame'
import branding from '../branding.json'

/** Reuses the existing guest booking shell and its approved typography and controls. */
export async function managementPage(request:Request){
 const frame=await themeFrame({href:'/rer-theme.css',productName:branding.name,accentColor:branding.primaryColor})
 return new Response(request.method==='HEAD'?null:`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manage your reservation</title>${fontHead}${frame.head}<link rel="stylesheet" href="/plan.css"><link rel="stylesheet" href="/placemat.css"><script type="module" src="/placemat-booking-manage.js"></script></head><body><main class="booking-shell">${frame.brand}<h1>Manage your reservation</h1><p id="venue-line">Your private link opens only your reservation.</p><div id="notice" role="status" aria-live="polite">Opening reservation…</div><div id="management-content"></div><noscript><p>Enable JavaScript to review and confirm reservation changes.</p></noscript></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'self'; script-src 'self'; ${frame.policy}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}})
}

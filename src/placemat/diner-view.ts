import {fontHead} from '../base/font-head'
import {themeFrame} from '../base/theme-frame'
import branding from '../branding.json'

export async function dinerPage(request:Request){
 const frame=await themeFrame({href:'/rer-theme.css',productName:branding.name,accentColor:branding.primaryColor})
 return new Response(request.method==='HEAD'?null:`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your diner account</title>${fontHead}${frame.head}<link rel="stylesheet" href="/plan.css"><link rel="stylesheet" href="/placemat.css"><link rel="stylesheet" href="/placemat-diner.css"><script type="module" src="/placemat-diner.js"></script></head><body><main class="booking-shell diner-shell">${frame.brand}<h1>Your diner account</h1><p>Keep your favorites and verified reservations together at this restaurant.</p><p><a href="/book">Book as a guest</a></p><div id="notice" role="status" aria-live="polite"></div><div id="diner-content"></div><noscript><p>Enable JavaScript to verify a booking and manage your diner account.</p></noscript></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'self'; script-src 'self'; ${frame.policy}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}})
}

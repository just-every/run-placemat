import {fontHead} from '../base/font-head'
import {themeFrame} from '../base/theme-frame'
import {preshiftLines,type Preshift} from './preshift'
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export async function preshiftPage(sheet:Preshift){
 const frame=await themeFrame({href:'/rer-theme.css',productName:'Placemat',accentColor:'#36746B'})
 const lines=preshiftLines(sheet)
 const content=lines.map((l,i)=>i===0?`<h1>${esc(l.text)}</h1>`:l.size===14?`<h2>${esc(l.text)}</h2>`:l.bold?`<h3>${esc(l.text)}</h3>`:`<p>${esc(l.text)}</p>`).join('')
 return new Response(`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pre-shift sheet · Placemat</title>${fontHead}${frame.head}<link rel="stylesheet" href="/placemat.css"><link rel="stylesheet" href="/placemat-preshift.css"><script src="/placemat-preshift.js" defer></script></head><body><main class="preshift-shell"><nav aria-label="Sheet actions"><a href="/app">Back to operations</a><form action="/preshift"><label>Service date <input type="date" name="date" value="${sheet.date}" required></label><button>Open sheet</button></form><a href="/api/preshift.pdf?date=${sheet.date}">Download PDF</a><button id="print-sheet">Print sheet</button></nav><article aria-label="Pre-shift sheet">${content}</article></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':`default-src 'self'; script-src 'self'; ${frame.policy}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,'x-frame-options':'DENY','referrer-policy':'no-referrer'}})
}

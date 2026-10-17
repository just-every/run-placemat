// The run site's frame, shared by the landing and the docs: the document head
// (fonts, tokens, floor plan and the compiled site stylesheet), the header and
// the footer. Static HTML for `rer build --site`; no instance-only link.
import run from './run.json'
import { identity } from '../identity'

export const esc = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const arrow = '<svg class="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>'
export const mark = (size = 32) => `<img class="mark" src="${identity.mark}" alt="" width="${size}" height="${size}">`

export interface Page { title: string; description: string; body: string; current?: 'docs' }

export function documentHtml(styles: string[], { title, description, body, current }: Page): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="theme-color" content="#FBFAF6">`
    + `<link rel="icon" type="image/svg+xml" href="${identity.mark}">`
    + `<link rel="preload" href="/fonts/gelasio/gelasio-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`
    + `<link rel="stylesheet" href="${identity.fonts}"><link rel="stylesheet" href="${identity.theme}"><link rel="stylesheet" href="/plan.css">`
    + styles.map(href => `<link rel="stylesheet" href="${esc(href)}">`).join('')
    + `</head><body class="site">${header(current)}${body}${footer()}</body></html>`
}

function header(current?: 'docs'): string {
  return `<header class="site-bar"><a class="lockup" href="/">${mark(32)}<span>${esc(identity.product)}</span></a>`
    + `<nav aria-label="Site"><a href="/docs"${current === 'docs' ? ' aria-current="page"' : ''}>Docs</a><a href="/contract">Contract</a><a href="${esc(run.repository)}">Source</a></nav></header>`
}

function footer(): string {
  return `<footer class="site-foot"><p class="lockup small">${mark(26)}<span>${esc(identity.product)}</span><span class="dot" aria-hidden="true">·</span><span class="licence">${esc(run.licence)} licensed</span></p>`
    + `<nav aria-label="Footer"><a href="/docs">Docs</a><a href="${esc(run.repository)}">Source</a></nav></footer>`
}

// The run site's frame, shared by the landing and the docs: the document head
// (fonts, tokens, icons, share card and the compiled site stylesheets), the
// header and the footer. Static HTML for `rer build --site`; no instance-only link.
import run from './run.json'
import { identity } from '../identity'

export const esc = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const arrow = '<svg class="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>'
/** The approved mark, cropped to the card by the SVG's `lockup` view. */
export const mark = (light = false) => `<img class="mark" src="/brand/${light ? 'mark-light' : 'mark'}.svg#lockup" alt="" width="780" height="432">`

const shareImage = `${identity.runSite}/site/share.jpg`

export interface Page { title: string; description: string; body: string; current?: 'docs'; bodyClass?: string; script?: string }

export function documentHtml(styles: string[], { title, description, body, current, bodyClass, script }: Page): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="theme-color" content="#FBF8F2">`
    + `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(identity.product)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">`
    + `<meta property="og:image" content="${shareImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`
    + `<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">`
    + `<link rel="preload" href="/fonts/hanken-grotesk/hanken-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`
    + `<link rel="stylesheet" href="${identity.fonts}"><link rel="stylesheet" href="${identity.theme}">`
    + styles.map(href => `<link rel="stylesheet" href="${esc(href)}">`).join('')
    + `</head><body class="site${bodyClass ? ` ${bodyClass}` : ''}">${header(current)}${body}${footer()}${script ? `<script>${script}</script>` : ''}</body></html>`
}

function header(current?: 'docs'): string {
  return `<header class="site-bar"><a class="lockup" href="/" aria-label="${esc(identity.product)} home">${mark()}<span>${esc(identity.product)}</span></a>`
    + `<nav aria-label="Site"><a href="/docs"${current === 'docs' ? ' aria-current="page"' : ''}>Docs</a><a href="/contract">Contract</a><a href="${esc(run.repository)}">Source</a></nav></header>`
}

function footer(): string {
  return `<footer class="site-foot"><div class="site-foot-in"><a class="lockup" href="/">${mark(true)}<span>${esc(identity.product)}</span></a>`
    + `<nav aria-label="Footer"><a href="/docs">Docs</a><a href="/contract">Contract</a><a href="${esc(run.repository)}">Source</a><a href="${esc(run.repository)}/blob/main/LICENSE">${esc(run.licence)} licensed</a></nav></div></footer>`
}

// The run site `rer build --site` writes: the approved homepage at /, whose
// Run Placemat opens /run; the docs at /docs and /docs/<slug>, built from the
// repository's Markdown; the not-found page; and the public files they use.
// Every Run page string and command is in run.json; nothing here reads
// installation data.
import { contractPageHtml } from '../base/contract-page'
import { runPricing } from '../base/run-pricing'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { docsArticleBody, docsIndexBody, docsMeta } from './docs/docs'
import { docsPages } from './docs/content'
import { landingBody, landingMeta } from './landing/landing'
import { documentHtml } from './shell'
import run from './run.json'

// Code cards get their Copy button only when script runs; without it the command is still there to select.
// Base's shared Run page (src/base/run-site.ts, copied unchanged) prints British "licence";
// Placemat is a US product, so its /run says "license".
const usSpelling = (html: string) => html.replaceAll(`${run.licence} licence<`, `${run.licence} license<`)

const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"
import './site.css'
import './landing/landing.css'
import './landing/hero.css'
import './landing/afternoon.css'
import './landing/host.css'
import './landing/evening.css'
import './docs/docs.css'

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const data: RunData = {
    name: run.name,
    repository: run.repository,
    clone: run.clone,
    licence: run.licence,
    docs: run.docs,
    paths: run.paths,
    pricing: runPricing,
  }
  return {
    pages: [
      { path: '/', html: documentHtml(styles, { ...landingMeta, body: landingBody(data.docs), bodyClass: 'home' }) },
      { path: '/run', html: usSpelling(runPageHtml(identity, data, contract)) },
      ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, data, contract) }] : []),
      { path: '/docs', html: documentHtml(styles, { ...docsMeta, body: docsIndexBody(), current: 'docs' }) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: documentHtml(styles, { title: `${page.title} · Placemat docs`, description: page.summary, body: docsArticleBody(page), current: 'docs' as const, script: COPY }) })),
      { path: '/404', html: siteNotFoundHtml(identity, data, contract) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'apple-touch-icon.png'],
  }
}

// The run site `rer build --site` writes: the approved homepage at /, whose
// Run Placemat opens /run; the docs at /docs and /docs/<slug>, built from the
// repository's Markdown; the not-found page; and the public files they use.
// Every Run page string and command is in run.json; nothing here reads
// installation data.
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { docsArticleBody, docsIndexBody, docsMeta } from './docs/docs'
import { docsPages } from './docs/content'
import { landingBody, landingMeta } from './landing/landing'
import { documentHtml } from './shell'
import run from './run.json'
import './site.css'
import './landing/landing.css'
import './docs/docs.css'

export function sitePages({ styles }: SiteContext): SiteBuild {
  const data: RunData = run
  return {
    pages: [
      { path: '/', html: documentHtml(styles, { ...landingMeta, body: landingBody(data.docs) }) },
      { path: '/run', html: runPageHtml(identity, data) },
      { path: '/docs', html: documentHtml(styles, { ...docsMeta, body: docsIndexBody(), current: 'docs' }) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: documentHtml(styles, { title: `${page.title} · Placemat docs`, description: page.summary, body: docsArticleBody(page), current: 'docs' as const }) })),
      { path: '/404', html: siteNotFoundHtml(identity, data) },
    ],
    assets: ['rer-theme.css', 'plan.css', 'fonts', 'brand'],
  }
}

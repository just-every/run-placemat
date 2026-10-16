// The docs pages in the landing's look: the index of every guide by section,
// and each article with the docs menu, its contents and the next/previous page.
import { esc } from '../shell'
import { docsPages, docsSections, renderDocsPage, type DocsPage } from './content'

export const docsMeta = {
  title: 'Docs · Placemat',
  description: 'Run Placemat for your restaurant: set up the room, run service, keep your guest list and move in from your current system.',
}

const menu = (current?: string) => `<nav class="docs-menu" aria-label="Docs">${docsSections.map(section =>
  `<p class="docs-menu-title">${esc(section.title)}</p><ul>${section.pages.map(page =>
    `<li><a href="/docs/${page.slug}"${page.slug === current ? ' aria-current="page"' : ''}>${esc(page.title)}</a></li>`).join('')}</ul>`).join('')}</nav>`

export function docsIndexBody(): string {
  return `<main class="docs docs-index"><div class="docs-intro"><h1>Placemat docs</h1><p>Set up the room, run service, keep your guest list and bring it with you. Every guide describes the app as it is.</p></div>`
    + docsSections.map(section => `<section class="docs-group" aria-labelledby="g-${esc(section.title.toLowerCase().replace(/\W+/g, '-'))}"><h2 id="g-${esc(section.title.toLowerCase().replace(/\W+/g, '-'))}">${esc(section.title)}</h2><ul class="docs-cards">`
      + section.pages.map(page => `<li><a href="/docs/${page.slug}"><span class="docs-card-title">${esc(page.title)}</span><span class="docs-card-summary">${esc(page.summary)}</span></a></li>`).join('')
      + '</ul></section>').join('') + '</main>'
}

export function docsArticleBody(page: DocsPage): string {
  const { html, toc } = renderDocsPage(page), index = docsPages.indexOf(page)
  const previous = docsPages[index - 1], next = docsPages[index + 1]
  const pager = `<nav class="docs-pager" aria-label="Previous and next">${previous ? `<a class="prev" href="/docs/${previous.slug}"><span>Previous</span>${esc(previous.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="/docs/${next.slug}"><span>Next</span>${esc(next.title)}</a>` : ''}</nav>`
  const contents = toc.length > 1 ? `<nav class="docs-toc" aria-label="On this page"><p>On this page</p><ul>${toc.map(entry => `<li><a href="#${entry.id}">${esc(entry.text)}</a></li>`).join('')}</ul></nav>` : ''
  return `<main class="docs docs-page">${menu(page.slug)}<article class="docs-article"><p class="docs-crumb"><a href="/docs">Docs</a> · ${esc(page.section)}</p><h1>${esc(page.title)}</h1><p class="docs-lead">${esc(page.summary)}</p>${contents}<div class="docs-body">${html}</div>${pager}</article></main>`
}

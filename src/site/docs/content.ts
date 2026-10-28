// The docs, from docs/site.json and the Markdown beside it, rendered once
// when `rer build --site` loads this module. A missing file, a bad link or an
// image fails the build.
import manifest from '../../../docs/site.json'
import run from '../run.json'
import rulings from '../../../RULINGS.md?raw'
import { renderMarkdown, type Rendered } from './render'

export interface DocsPage { slug: string; file: string; title: string; summary: string; section: string }

const files: Record<string, string> = {
  ...import.meta.glob('../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
  '../../../docs/../RULINGS.md': rulings,
}
const source = `${run.repository}/blob/main`

export const docsSections = manifest.sections
export const docsPages: DocsPage[] = manifest.sections.flatMap(section => section.pages.map(page => ({ ...page, section: section.title })))
const slugs = new Map(docsPages.map(page => [page.file, page.slug]))

export function renderDocsPage(page: DocsPage): Rendered {
  const markdown = files[`../../../docs/${page.file}`]
  if (markdown === undefined) throw new Error(`docs/site.json lists ${page.file}, which does not exist.`)
  const rendered = renderMarkdown(markdown, slugs, source)
  if (rendered.problems.length) throw new Error(`docs/${page.file} ${rendered.problems.join('; ')}.`)
  return rendered
}

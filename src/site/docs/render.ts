// One Markdown page to static HTML at build time. A leading level-1 heading is
// dropped (the page title comes from docs/site.json); raw HTML is shown as
// text; headings get ids and the h2s become the page's contents list. Links to
// another docs page become /docs/<slug>, anchors stay, and links to any other
// repository file go to its source on GitHub.
import { Marked } from 'marked'

export interface Rendered { html: string; toc: { id: string; text: string }[]; problems: string[] }

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const plain = (value: string) => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const slugify = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
// One block per source line, its newline kept inside so Copy and selection read
// the text unchanged; docs.css hangs a wrapped line's continuation under it.
const codeLines = (text: string) => text.replace(/\n$/, '').split('\n')
  .map((line, i, all) => `<span class="docs-line">${escapeHtml(line)}${i < all.length - 1 ? '\n' : ''}</span>`).join('')

/** `slugs` maps each docs file name to its slug; `source` is the repository's blob URL prefix. */
export function renderMarkdown(markdown: string, slugs: Map<string, string>, source: string): Rendered {
  const toc: Rendered['toc'] = [], problems: string[] = [], used = new Map<string, number>()
  const href = (target: string) => {
    if (/^(https?:|mailto:|#)/.test(target)) return target
    const [path, hash = ''] = target.split('#'), file = path.replace(/^\.\//, '')
    if (slugs.has(file)) return `/docs/${slugs.get(file)}${hash ? `#${hash}` : ''}`
    const resolved = new URL(file, 'https://repo.invalid/docs/').pathname.slice(1)
    if (!/^[A-Za-z0-9._/-]+$/.test(resolved)) problems.push(`links to ${target}`)
    return `${source}/${resolved}${hash ? `#${hash}` : ''}`
  }
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens), text = plain(inner)
        let id = slugify(text); const n = used.get(id) ?? 0; used.set(id, n + 1); if (n) id += `-${n}`
        if (depth === 2) toc.push({ id, text })
        const level = Math.max(2, depth)
        return `<h${level} id="${id}">${inner}</h${level}>\n`
      },
      code({ text, lang }) {
        const language = (lang ?? '').trim().split(/\s+/)[0]
        if (!language) problems.push('has a code block without a language')
        return `<div class="docs-code" data-lang="${escapeHtml(language)}"><pre><code>${codeLines(text)}</code></pre><button class="docs-copy" type="button" hidden>Copy</button></div>\n`
      },
      html({ text }) { return escapeHtml(text) },
      link({ href: target, title, tokens }) {
        return `<a href="${escapeHtml(href(target))}"${title ? ` title="${escapeHtml(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
      },
      image({ href: target }) { problems.push(`has an image (${target}); the docs publish text only`); return '' },
      table(token) {
        const head = token.header.map(cell => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join('')
        const rows = token.rows.map(row => `<tr>${row.map(cell => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`).join('')
        return `<div class="docs-table" role="region" tabindex="0" aria-label="Table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
      },
    },
  })
  const body = markdown.replace(/^[\t ]*<!--[^\n]*-->[\t ]*\r?\n/gm, '').replace(/^# .*\n+/, '')
  const html = marked.parse(body, { async: false }) as string
  return { html, toc, problems }
}

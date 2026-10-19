// The run site through its public door: `rer build --site` builds it, the
// homepage's main action opens /run, and every guide docs/site.json lists is
// published and linked from /docs. (rer itself refuses broken links,
// instance-only links and other origins.)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const cli = 'node_modules/@runeditrun/rer/global/rer.mjs'
const build = spawnSync(process.execPath, [cli, 'build', '--site', ...(process.env.CI === 'true' ? ['--no-queue'] : [])], { encoding: 'utf8' })
assert.equal(build.status, 0, 'SITE-001: rer build --site succeeds\n' + build.stdout + build.stderr)
const page = path => readFile(new URL(`../dist/site/${path}`, import.meta.url), 'utf8')
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1])
const text = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const commands = html => [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map(match => text(match[1].replace(/<span\b[^>]*(?:aria-hidden="true"|class="cm")[^>]*>[\s\S]*?<\/span>/g, '')).trim())
const actions = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({ href: match[1], label: text(match[2]).trim() }))

const home = await page('index.html')
const run = JSON.parse(await readFile(new URL('../src/site/run.json', import.meta.url), 'utf8'))
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
for (const [label, href] of [[`Run ${run.name}`, '/run'], ['Read the docs', '/docs']]) {
  const matches = actions(home).filter(action => action.label === label)
  assert.ok(matches.length, `SITE-001: homepage exposes ${label}`)
  assert.ok(matches.every(action => action.href === href), `SITE-001: every ${label} action opens ${href}`)
}
assert.match(home, /<a class="btn" href="\/run">/, 'SITE-001: homepage main action opens /run')
assert.ok(commands(home).includes(run.clone), 'SITE-001: homepage Run it yourself command equals run.json clone')
assert.ok(commands(await page('run.html')).includes(run.clone), 'SITE-001: /run command equals run.json clone')
assert.ok(readme.includes('`' + run.clone + '`') || readme.includes('\n' + run.clone + '\n'), 'SITE-001: README command equals run.json clone')
const manifest = JSON.parse(await readFile(new URL('../docs/site.json', import.meta.url), 'utf8'))
const index = links(await page('docs.html'))
for (const { slug } of manifest.sections.flatMap(section => section.pages)) {
  assert.ok(index.includes(`/docs/${slug}`), `SITE-001: /docs links ${slug}`)
  assert.ok((await page(`docs/${slug}.html`)).includes('docs-body'), `SITE-001: ${slug} is published`)
}
console.log('Run site passed: homepage → /run, every listed guide published and linked from /docs')

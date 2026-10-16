// The run site through its public door: `rer build --site` builds it, the
// homepage's main action opens /run, and every guide docs/site.json lists is
// published and linked from /docs. (rer itself refuses broken links,
// instance-only links and other origins.)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const cli = 'node_modules/@runeditrun/rer/global/rer.mjs'
const build = spawnSync(process.execPath, [cli, 'build', '--site', ...(process.env.CI === 'true' ? ['--no-queue'] : [])], { encoding: 'utf8' })
assert.equal(build.status, 0, build.stdout + build.stderr)
const page = path => readFile(new URL(`../dist/site/${path}`, import.meta.url), 'utf8')
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1])

const home = await page('index.html')
assert.match(home, /<a class="btn" href="\/run">/, 'the main action opens the Run page')
assert.ok(links(home).includes('/docs'), 'the homepage links the docs')
assert.match(await page('run.html'), /rer dev/)
const manifest = JSON.parse(await readFile(new URL('../docs/site.json', import.meta.url), 'utf8'))
const index = links(await page('docs.html'))
for (const { slug } of manifest.sections.flatMap(section => section.pages)) {
  assert.ok(index.includes(`/docs/${slug}`), `/docs links ${slug}`)
  assert.ok((await page(`docs/${slug}.html`)).includes('docs-body'), `${slug} is published`)
}
console.log('Run site passed: homepage → /run, every listed guide published and linked from /docs')

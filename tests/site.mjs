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
// A prompt or comment span is dropped with the word spans nested in it.
const commands = html => [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map(match => text(match[1].replace(/<span\b[^>]*(?:aria-hidden="true"|class="cm")[^>]*>(?:[^<]|<(?!\/?span\b)[^>]*>|<span\b[^>]*>[^<]*<\/span>)*?<\/span>/g, '')).trim())
const actions = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({ href: match[1], label: text(match[2]).trim() }))

const home = await page('index.html')
const run = JSON.parse(await readFile(new URL('../src/site/run.json', import.meta.url), 'utf8'))
// The one start line every Run Edit Run page shows: the installer, then the same rer dev the npx line runs.
const startLine = `curl -fsSL https://runeditrun.com/install.sh | sh -s -- ${run.clone.slice('npx -y @runeditrun/rer '.length)}`
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
for (const [label, href] of [[`Run ${run.name}`, '/run'], ['Read the docs', '/docs']]) {
  const matches = actions(home).filter(action => action.label === label)
  assert.ok(matches.length, `SITE-001: homepage exposes ${label}`)
  assert.ok(matches.every(action => action.href === href), `SITE-001: every ${label} action opens ${href}`)
}
assert.match(home, /<a class="btn" href="\/run">/, 'SITE-001: homepage main action opens /run')
assert.ok(commands(home).includes(startLine), 'SITE-001: homepage Run it yourself command is the one start line')
assert.ok(commands(await page('run.html')).includes(run.clone), 'SITE-001: /run command equals run.json clone')
assert.ok(readme.includes('`' + run.clone + '`') || readme.includes('\n' + run.clone + '\n'), 'SITE-001: README command equals run.json clone')
const manifest = JSON.parse(await readFile(new URL('../docs/site.json', import.meta.url), 'utf8'))
const index = links(await page('docs.html'))
for (const { slug } of manifest.sections.flatMap(section => section.pages)) {
  assert.ok(index.includes(`/docs/${slug}`), `SITE-001: /docs links ${slug}`)
  assert.ok((await page(`docs/${slug}.html`)).includes('docs-body'), `SITE-001: ${slug} is published`)
}
console.log('Run site passed: homepage → /run, every listed guide published and linked from /docs')


// BOUND-001 compares the meaning of the published boundary, rather than pinning its copy.
const boundary = text(home.match(/<p[^>]*class="[^"]*mi-not[^"]*"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '')
const contract = await readFile(new URL('../CONTRACT.md', import.meta.url), 'utf8')
const clause = contract.split('\n').find(line => line.startsWith('- **BOUND-001 —'))
const declared = clause?.match(/homepage says “([^”]+)”/)?.[1]
assert.ok(declared, 'BOUND-001: contract declares the homepage boundary')
const meaning = value => value.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
assert.equal(meaning(boundary), meaning(declared), 'BOUND-001: built homepage and contract make the same exclusion statement')
const exclusions = [/online ordering/i, /gift cards/i, /POS/i]
assert.match(boundary, /not in|does not|no /i, 'BOUND-001: homepage marks its exclusions')
for (const exclusion of exclusions) {
 assert.match(boundary, exclusion, 'BOUND-001: homepage declares each excluded capability')
 for (const source of [readme, text(await page('docs/getting-started.html')), text(await page('docs/http-contract.html'))]) {
  assert.match(source, exclusion, 'BOUND-001: owner docs carry the same exclusions')
  assert.match(source, /restaurant[’']s POS or its payment provider/i, 'BOUND-001: owner docs point to the venue POS/payment provider')
 }
}
assert.match(text(home), /(?:from|in) your POS/i, 'BOUND-001: homepage places check taking in the venue POS')
assert.doesNotMatch(text(home.replace(/<p[^>]*class="[^"]*mi-not[^"]*"[^>]*>[\s\S]*?<\/p>/, '')), /gift[- ]?cards?|stored[- ]?value|vouchers?|online (?:food )?ordering/i, 'BOUND-001: homepage makes no excluded capability claim elsewhere')
console.log('BOUND-001: built homepage and owner docs agree on the product boundary')

// OSS-001: the actual permission grant and every published entry point agree.
const licence = await readFile(new URL('../LICENSE', import.meta.url), 'utf8')
assert.match(licence, /MIT License/, 'OSS-001: source grants the MIT licence')
assert.match(licence, /Permission is hereby granted[\s\S]*use, copy, modify[\s\S]*distribute/, 'OSS-001: source grants use, modification and redistribution')
for (const [name, content] of [['homepage', text(home)], ['/run', text(await page('run.html'))], ['README', readme]]) {
 assert.match(content, /MIT(?: licensed| licen[cs]e)?/i, `OSS-001: ${name} identifies the source licence`)
 assert.match(content, /free|no (?:licen[cs]e )?fee/i, `OSS-001: ${name} describes free operation`)
}
assert.ok(links(await page('run.html')).some(href => href.replace(/\.git$/, '') === run.repository), 'OSS-001: /run links the actual public source')
console.log('OSS-001: MIT permission grant and published free/source entry points passed')

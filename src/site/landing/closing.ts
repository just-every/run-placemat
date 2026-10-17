// 11:00 PM · Friday, closing: the white headline and the Run action set on the
// night sky over the painted street after close (plates/plate-close.png, its
// chalkboard left blank); the site footer follows in deep green.
import run from '../run.json'
import { arrow } from '../shell'

const art = `<picture><source type="image/avif" media="(max-width:760px)" srcset="/site/closing-phone-390.avif 390w, /site/closing-phone-780.avif 780w" sizes="100vw">`
  + `<source type="image/webp" media="(max-width:760px)" srcset="/site/closing-phone-390.webp 390w, /site/closing-phone-780.webp 780w" sizes="100vw">`
  + `<source type="image/avif" srcset="/site/closing-768.avif 768w, /site/closing-1152.avif 1152w, /site/closing-1536.avif 1536w" sizes="100vw">`
  + `<source type="image/webp" srcset="/site/closing-768.webp 768w, /site/closing-1152.webp 1152w, /site/closing-1536.webp 1536w" sizes="100vw">`
  + `<img src="/site/closing-1536.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async"></picture>`

export const closing = (docs: boolean) => `<section class="closing" aria-labelledby="closing-title"><div class="closing-art" aria-hidden="true">${art}</div>`
  + `<div class="closing-copy"><p class="eyebrow">11:00 PM · Friday</p><h2 id="closing-title">Full house, every night.</h2>`
  + `<div class="actions"><a class="btn btn-light" href="/run">Run Placemat${arrow}</a>${docs ? '<a class="text-link" href="/docs">Read the docs</a>' : `<a class="text-link" href="${run.repository}">Read the docs</a>`}</div>`
  + `<p class="fine">Free and open source, MIT licensed.</p></div></section>`

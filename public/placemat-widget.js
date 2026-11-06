/* BOOK-002: website booking widget. The framed page only reports its height to the allowlisted website; it accepts no messages. */
export const sourceLabel = b => b.staffIntake ? `${b.staffIntake.source} · ${b.staffIntake.contactPreference} contact preference` : b.attribution?.door === 'widget' ? `${b.source} · website widget on ${b.attribution.origin}` : b.attribution?.door === 'booking-page' ? `${b.source} · booking page` : b.source;
export function reportHeight(origin) {
  if (window.parent === window) return;
  const main = document.querySelector('main');
  const send = () => window.parent.postMessage({type: 'placemat:height', height: Math.ceil(main.getBoundingClientRect().bottom + scrollY)}, origin);
  new ResizeObserver(send).observe(main);
  send();
}
export const parseOrigins = value => String(value || '').split(/[\s,]+/).filter(Boolean);
export function widgetSettings(state, {esc, form, who, time}) {
  const origins = state.embed?.origins || [], changes = state.audit.filter(a => a.action === 'embed.origins').slice(-5).reverse();
  const snippet = `<div data-placemat-book></div>\n<script src="${location.origin}/placemat-embed.js" async></script>`;
  return `<details id="widget-settings"><summary>Website booking widget</summary><p class="help">Only the exact https website origins listed here can show the booking widget. Staff pages can never be framed. Guests always confirm a booking themselves; the widget never submits on its own.</p>${form('embed.origins', `<label class="wide">Allowed website origins (one per line)<textarea name="origins" rows="3" placeholder="https://www.example.com">${esc(origins.join('\n'))}</textarea></label>`, 'Save allowed websites')}<p>${origins.length ? `Allowed now: ${origins.map(o => `<code>${esc(o)}</code>`).join(' ')}` : 'No website can embed booking yet.'}</p><p class="help">Paste this into a custom HTML or code block on each allowed page (WordPress Custom HTML, Squarespace Code, Wix Embed HTML or your own site). Add the exact origin of every page that frames it.</p><pre class="code-block">${esc(snippet)}</pre>${changes.length ? `<ul class="widget-changes">${changes.map(a => `<li>${esc(time(a.at))} · ${esc(who(a.actor))} · ${esc((a.after?.origins || []).join(', ') || 'none')}</li>`).join('')}</ul>` : ''}</details>`;
}

/** Same public projection on the venue page and the booking widget. */
export function reviewCards(view,esc,actions=()=> ''){
 return `<section aria-label="Verified visit reviews"><h2>Verified visit reviews</h2><p>${view.count} review${view.count===1?'':'s'} · ${view.average===null?`Average available after ${view.minimumCount} reviews`:`Average ${view.average} out of 5`}</p>${view.reviews.map(r=>`<article class="review-card" data-review="${esc(r.id)}"><h3>${r.rating} out of 5</h3><p class="review-meta">Visit: <time datetime="${esc(r.visitDate)}">${esc(r.visitDate)}</time> · Published ${esc(r.publishedAt.slice(0,10))}</p><p class="review-comment">${esc(r.comment)}</p>${r.reply?`<div class="review-reply"><strong>Restaurant reply</strong><p class="review-comment">${esc(r.reply)}</p><p class="review-meta">Updated ${esc(r.replyAt)}</p></div>`:''}${r.reports.map(report=>`<p class="review-outcome">Report: ${esc(report.category)} · ${esc(report.outcome)}${report.decided_at?` · ${esc(report.decided_at)}`:''}</p>`).join('')}${actions(r)}</article>`).join('')||'<p>No public reviews yet.</p>'}</section>`
}
export async function mountPublicReviews(){
 const root=document.querySelector('#public-reviews');if(!root)return
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 try{const response=await fetch('/api/public/reviews',{credentials:'omit'});if(!response.ok)throw Error();root.innerHTML=reviewCards(await response.json(),esc)+'<p><a href="/reviews" target="_blank" rel="noopener">Read guidelines or review your visit</a></p>'}catch{root.textContent='Reviews are temporarily unavailable.'}
}

/* BOOK-002: website booking widget. The framed page only reports its height to the allowlisted website; it accepts no messages. */
const originalSourceLabel = b => b.staffIntake ? `${b.staffIntake.source} · ${b.staffIntake.contactPreference} contact preference` : b.attribution?.door === 'widget' ? `${b.source} · website widget on ${b.attribution.origin}` : b.attribution?.door === 'booking-page' ? `${b.source} · booking page` : b.source;
export const sourceLabel = b => originalSourceLabel(b)+((b.staffIntake?.campaign||b.attribution?.campaign)?` · Campaign: ${b.staffIntake?.campaign||b.attribution?.campaign}`:'');
export const nativeChannel=b=>b.staffIntake?.source||(b.source==='online'?'website':b.source);
export function channelSummary(rows,esc){
 const totals=new Map();
 for(const row of rows){const key=nativeChannel(row),total=totals.get(key)||{parties:0,covers:0};total.parties++;total.covers+=row.partySize;totals.set(key,total);}
 return `<section aria-label="Listed channel totals"><h3>Listed channel totals</h3><p>All listed reservations, including cancelled and no-show parties.</p>${[...totals].map(([channel,total])=>`<p data-channel-total="${esc(channel)}">${esc(channel)}: ${total.parties} parties · ${total.covers} covers</p>`).join('')}<p>Total: ${rows.length} parties · ${rows.reduce((n,b)=>n+b.partySize,0)} covers</p></section>`;
}
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

/* Existing operations readers inspect history; the existing owner export right applies to CSV. */
export function createAudit({api,esc,field,select,time,isOwner}) {
 let filters={actor:'',action:'',subject:'',from:'',to:''},opened=false,root,rows=[],names={},requestId=0;
 const optionalSelect=(...args)=>select(...args).replace(' required','');
 const label=value=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
 const value=v=>v===undefined?'Not recorded':v===null?'No record':typeof v==='object'?JSON.stringify(v):String(v);
 function comparison(before,after) {
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{value:v};
  const old=object(before),next=object(after);
  const keys=[...new Set([...Object.keys(old),...Object.keys(next)])].filter(key=>JSON.stringify(old[key])!==JSON.stringify(next[key]));
  return `<div class="table-scroll"><table class="audit-values"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${keys.map(key=>`<tr><th>${esc(label(key))}</th><td>${esc(value(old[key]))}</td><td>${esc(value(next[key]))}</td></tr>`).join('')||'<tr><td colspan="3">No stored value changed.</td></tr>'}</tbody></table></div>`;
 }
 function results() {
  root.querySelector('[data-audit-results]').innerHTML=`<p role="status">${rows.length} history entries</p>${isOwner()?`<p><a href="/api/audit.csv?${esc(new URLSearchParams(filters))}" download>Download filtered history CSV</a></p>`:''}`+rows.map(row=>`<article class="card" data-audit-entry="${esc(row.id)}"><strong>${esc(row.action)}</strong><p>${esc(names[row.actor]||row.actor)} · ${esc(time(row.at))} · ${esc(row.source||'Source not recorded')}</p><p class="help">Actor: ${esc(row.actor)}<br>Subject: ${esc(row.subject)}</p>${row.reason?`<p>${esc(row.reason)}</p>`:''}${(row.changes?.length?row.changes:row.before!==undefined||row.after!==undefined?[{kind:'Settings / assignment',id:row.subject,before:row.before,after:row.after}]:[]).map(change=>`<details><summary>${esc(label(change.kind))} · ${esc(change.id)}</summary>${comparison(change.before,change.after)}</details>`).join('')}${row.before!==undefined&&row.changes?.length?`<details><summary>Decision details</summary>${comparison(row.before,row.after)}</details>`:''}${!row.changes?.length&&row.before===undefined?'<p class="help">Before/after values were not recorded for this historical action.</p>':''}</article>`).join('');
 }
 async function load() {
  const target=root,current=++requestId,response=await api('/api/audit?'+new URLSearchParams(filters));
  if(target!==root||current!==requestId||!root.isConnected)return;
  rows=response.rows;names=response.names;results();
 }
 return {mount(target,state,who){
  root=target;
  const actors=[...new Set(state.audit.map(row=>row.actor))],actions=[...new Set(state.audit.map(row=>row.action))].sort();
  root.innerHTML=`<details ${opened?'open':''}><summary>Change history</summary><p>Inspect the recorded changes and the person or guest action behind them. Times use the venue timezone; time filters use an explicit offset.</p><form data-audit-filter><div class="form-grid">${optionalSelect('Actor','actor',[['','All actors'],...actors.map(id=>[id,who(id)||id])],filters.actor)}${optionalSelect('Action','action',[['','All actions'],...actions.map(action=>[action,action])],filters.action)}${field('Booking or record ID','subject','text',filters.subject)}${field('From (inclusive offset time)','from','text',filters.from,'placeholder="2026-10-21T00:00:00Z"')}${field('Through (inclusive offset time)','to','text',filters.to,'placeholder="2026-10-22T00:00:00Z"')}<div class="wide"><button type="submit">Filter history</button></div></div></form><div data-audit-results></div><p data-audit-error role="alert"></p></details>`;
  const showError=error=>{root.querySelector('[data-audit-error]').textContent=error.message};
  root.querySelector('details').addEventListener('toggle',event=>{opened=event.target.open;if(opened)load().catch(showError)});
  root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();filters=Object.fromEntries(new FormData(event.target));root.querySelector('[data-audit-error]').textContent='';load().catch(showError)});
  if(opened)load().catch(showError);
 }};
}

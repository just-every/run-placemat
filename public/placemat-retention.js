const $=selector=>document.querySelector(selector),content=$('#retention-content'),notice=$('#notice')
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const labels={'welcome':'Welcome','birthday':'Birthday','anniversary':'Anniversary','first-to-second':'First to second visit','lapsed':'Lapsed guest','experience':'Experience invitation'}
const field=(label,name,type='text',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`
async function api(path,p){const r=await fetch(path,{method:p===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(p===undefined?{}:{body:JSON.stringify(p)})});const v=await r.json();if(!r.ok)throw Error(v.error||'Unable to save.');return v}
let token=location.hash.slice(1);if(token)history.replaceState(null,'',location.pathname)
window.addEventListener('hashchange',()=>{if(location.hash)location.reload()})
let state,preview
function workflow(row){return `<article class="panel" data-workflow="${esc(row.id)}"><h3>${esc(row.name)}</h3><p>${esc(labels[row.trigger]||row.trigger)} · ${esc(row.status)}</p><div class="offer">${esc(row.offer)}</div><p class="meta">${esc(state.deliveries.filter(d=>d.workflowId===row.id&&d.state==='accepted').length)} provider accepted · ${esc(state.deliveries.filter(d=>d.workflowId===row.id).reduce((n,d)=>n+d.repeatBookings,0))} repeat bookings</p>${row.status==='draft'?`<form data-action="preview"><input type="hidden" name="workflowId" value="${esc(row.id)}"><button>Preview recipients</button></form>`:''}${row.status==='approved'?`<form data-action="stop"><input type="hidden" name="workflowId" value="${esc(row.id)}"><button class="secondary">Stop workflow</button></form>`:''}</article>`}
function render(){
 content.innerHTML=`<section class="panel"><h2>Marketing authority</h2><form data-action="grant"><label class="check-label"><input type="checkbox" name="enabled" ${state.granted?'checked':''}> Allow my owner account to approve marketing email</label><p class="meta" id="grant-state">Saved</p></form><p><a href="/retention">Guest opt-in and unsubscribe</a></p></section>${state.granted?`<details><summary>Create workflow</summary><section class="panel"><form data-action="draft">${field('Workflow name','name','text','','required maxlength="120"')}<label>Trigger<select name="trigger">${Object.entries(labels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>Exact offer<textarea name="offer" required maxlength="2000" rows="3"></textarea></label><div class="form-grid">${field('Delay after trigger (days)','delayDays','number',0,'required min="0" max="365"')}${field('Lapsed after (days)','lapsedDays','number',90,'required min="1" max="730"')}${field('Minimum gap between email (days)','capDays','number',7,'required min="1" max="365"')}${field('Quiet hours begin','quietStart','time','20:00','required')}${field('Quiet hours end','quietEnd','time','09:00','required')}${field('Workflow ends','expiresAt','datetime-local',new Date(Date.now()+30*86400000).toISOString().slice(0,16),'required')}</div><label>Published experience<select name="experienceId"><option value="">Choose for experience invitations</option>${(state.experiences||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select></label><button>Create draft</button></form></section></details><details><summary>Guest dates</summary><section class="panel"><form data-action="facts"><label>Guest<select name="guestId">${(state.guests||[]).map(g=>`<option value="${esc(g.id)}">${esc(g.name)} · ${esc(g.email)}</option>`).join('')}</select></label>${field('Birthday (month-day)','birthday','text','','placeholder="MM-DD" pattern="[0-9]{2}-[0-9]{2}"')}${field('Anniversary (month-day)','anniversary','text','','placeholder="MM-DD" pattern="[0-9]{2}-[0-9]{2}"')}<p class="meta" id="facts-state">Dates are recorded as owner-observed facts.</p></form></section></details>`:''}<section><h2>Workflows</h2>${state.workflows.map(workflow).join('')||'<p>No workflows yet.</p>'}</section><section id="preview"></section><section class="panel"><h2>Delivery and return visits</h2>${(state.deliveries||[]).map(d=>`<p data-delivery="${esc(d.id)}"><strong>${esc(d.guestName||d.name||'Guest')}</strong> · ${esc(d.workflowName||d.workflow_id)} · ${esc(d.state||d.status)}${d.repeatBookings?` · ${esc(d.repeatBookings)} repeat bookings`:''}</p>`).join('')||'<p>No marketing messages sent.</p>'}</section>`
 if(preview){const p=preview.preview||preview;$('#preview').innerHTML=`<article class="panel"><h2>Exact draft preview</h2><div class="offer">${esc(p.offer)}</div><h3>Recipients</h3><ul>${(p.recipients||[]).map(g=>`<li>${esc(g.name)} · ${esc(g.email)}</li>`).join('')||'<li>No eligible recipients</li>'}</ul><form data-action="approve"><input type="hidden" name="workflowId" value="${esc(p.workflowId||p.id)}"><input type="hidden" name="previewHash" value="${esc(p.previewHash)}"><button>Approve exact workflow</button></form></article>`}
}
async function refresh(){state=await api('/api/retention');render();notice.textContent=''}
async function publicPage(){
 if(!token){notice.textContent='Choose marketing email separately from booking messages.';content.innerHTML=`<section class="panel"><h2>Email preferences</h2><form id="request-consent">${field('Your email','email','email','','required autocomplete="email"')}<label class="check-label"><input name="permission" type="checkbox" required> Send me a link to opt in to this venue’s offers and invitations</label><button>Send confirmation link</button></form><p class="meta">Use the unsubscribe link in any marketing email to stop offers. Booking management stays available.</p></section>`;return}
 const view=await api('/api/public/retention/status',{token})
 notice.textContent=''
 if(view.kind==='confirm'||view.type==='confirm'||view.confirmation){content.innerHTML=`<section class="panel"><h2>Confirm marketing email</h2><p>${esc(view.maskedEmail)}</p><form id="confirm-consent"><label class="check-label"><input name="permission" type="checkbox" required> I agree to receive this venue’s offers and invitations by email</label><button>Confirm email opt-in</button></form></section>`}
 else if(view.offer){content.innerHTML=`<section class="panel"><h2>Your invitation</h2><div class="offer">${esc(view.offer)}</div><p><a id="campaign-book" href="${esc(view.bookingUrl||'/book#campaign='+token)}">Find a table</a></p><button id="unsubscribe" class="secondary">Unsubscribe from marketing</button></section>`}
 else {content.innerHTML='<section class="panel"><h2>Email preferences</h2><button id="unsubscribe">Unsubscribe from marketing</button></section>'}
}
content.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target,p=Object.fromEntries(new FormData(form));notice.textContent='Saving…'
 try{
  if(form.id==='request-consent'){await api('/api/public/retention/request',{email:p.email});content.innerHTML='<section class="panel"><h2>Check your email</h2><p>If this address is eligible, a confirmation link is on its way.</p></section>';notice.textContent='';return}
  if(form.id==='confirm-consent'){const confirmed=await api('/api/public/retention/confirm',{token,confirm:true});token=confirmed.unsubscribeToken;content.innerHTML='<section class="panel"><h2>Marketing email enabled</h2><p>You can unsubscribe in any offer. Your booking permissions are separate.</p><button id="unsubscribe" class="secondary">Unsubscribe from marketing</button></section>';notice.textContent='';return}
  for(const key of ['delayDays','lapsedDays','capDays'])if(key in p)p[key]=Number(p[key])
  if(p.expiresAt)p.expiresAt=new Date(p.expiresAt).toISOString()
  if(p.experienceId==='')delete p.experienceId
  const action=form.dataset.action,result=await api('/api/retention/'+action,p)
  if(action==='preview')preview=result;else preview=null
  await refresh();notice.textContent=action==='approve'?'Exact workflow approved.':action==='stop'?'Workflow stopped.':'Saved'
 }catch(error){notice.textContent=error.message}
})
content.addEventListener('change',async event=>{
 const form=event.target.closest('form'),action=form?.dataset.action
 if(!['grant','facts'].includes(action))return
 let p=Object.fromEntries(new FormData(form));if(action==='grant')p.enabled=form.elements.enabled.checked
 if(action==='facts'){
  if(event.target.name==='guestId'){const facts=state.guests.find(g=>g.id===p.guestId)?.facts;for(const field of ['birthday','anniversary'])form.elements[field].value=facts?.[field]||'';return}
  p={guestId:p.guestId,[event.target.name]:event.target.value}
 }
 notice.textContent='Saving…'
 try{const result=await api('/api/retention/'+action,p);if(action==='grant')await refresh();else {state=result;$('#facts-state').textContent='Saved'}notice.textContent='Saved'}catch(error){notice.textContent=error.message}
})
content.addEventListener('click',async event=>{if(!event.target.closest('#unsubscribe'))return;try{await api('/api/public/retention/unsubscribe',{token});content.innerHTML='<section class="panel"><h2>Unsubscribed</h2><p>Marketing email has stopped. You can still manage your reservations.</p></section>';notice.textContent=''}catch(error){notice.textContent=error.message}})
try{if(document.body.dataset.retentionPage==='settings')await refresh();else await publicPage()}catch(error){notice.textContent=error.message}

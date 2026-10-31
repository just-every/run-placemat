const $=s=>document.querySelector(s)
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const kind=document.body.dataset.feedbackPage
const token=kind==='public'?location.hash.slice(1):''
let view,saving=Promise.resolve()
const notice=(message,error=false)=>{const el=$('#notice');el.textContent=message;el.dataset.kind=error?'error':'info';el.setAttribute('role',error?'alert':'status')}
async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},credentials:kind==='public'?'omit':'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})})
 const data=await response.json()
 if(!response.ok)throw Error(data.error||'The request could not be completed. Please try again.')
 return data
}
const owner=(path,body)=>api('/api/feedback'+path,body)
const guest=(path,body={})=>api('/api/public/feedback'+path,{...body,token})
const date=value=>!value?'Not set':/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00').toLocaleDateString(undefined,{dateStyle:'medium'}):new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
const localInput=value=>{if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
const mailState=state=>({accepted:'Provider accepted; mailbox delivery unconfirmed',delivered:'Delivery confirmed',unconfirmed:'Mailbox delivery unconfirmed',pending:'Awaiting provider acceptance',recorded:'Recorded',suppressed:'Recorded',sent:'Mailbox delivery unconfirmed',failed:'Send failed',withdrawn:'Consent withdrawn',queued:'Queued',ineligible:'Not eligible'}[state]||state||'Not sent')
const messages=items=>(items||[]).map(m=>`<div class="feedback-message"><strong>${m.author==='guest'?'Guest':'Restaurant'}</strong><p>${esc(m.message)}</p><p class="feedback-meta">${esc(date(m.at))} · ${esc(mailState(m.state))}</p></div>`).join('')||'<p class="help">No messages yet.</p>'
function reviewInvitation(url){
 try{if(new URL(url).protocol!=='https:')return ''}catch{return ''}
 return `<section class="panel" id="public-review-invitation"><h2>Share a public review</h2><p>You’re welcome to share your experience publicly, whatever your rating.</p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Leave a public review</a></section>`
}
function publicView(){
 $('#feedback-intro').textContent=`${view.venueName} · ${date(view.visitDate)}`
 if(view.withdrawn){$('#feedback-content').innerHTML='<section class="panel"><h2>Consent withdrawn</h2><p>You will not receive further feedback messages for this visit.</p></section>';return}
 const rated=view.rating!==null&&view.rating!==undefined
 $('#feedback-content').innerHTML=reviewInvitation(view.publicReviewUrl)+`<p><a href="/reviews" data-review-invitation>Publish a separate verified Placemat review</a></p>`+`<section class="panel"><h2>${rated?'Your feedback':'Tell us about your visit'}</h2>${rated?`<p><strong>${esc(view.rating)} out of 5</strong></p><p class="feedback-comment">${esc(view.comment)}</p><p class="help">Your response is recorded for this visit.</p>`:`<form id="feedback-survey"><fieldset><legend>Overall rating</legend><div class="rating-options">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="rating" value="${n}" required aria-label="${n} out of 5">${n}</label>`).join('')}</div></fieldset><label>What would you like us to know?<textarea name="comment" maxlength="4000" rows="4"></textarea></label><button type="submit">Send feedback</button></form>`}</section>${rated?`<section class="panel" id="guest-conversation"><div class="split-heading"><h2>Conversation</h2><button class="secondary" type="button" data-refresh>Refresh</button></div>${view.case?`<p class="feedback-case">${view.case.state==='closed'?`Follow-up closed · ${esc(view.case.outcome)}`:'The restaurant is following up on your visit.'}</p>`:''}${messages(view.messages)}${view.case?.state==='closed'?'<p class="help">This follow-up is closed.</p>':`<form id="guest-reply"><label>Message to the restaurant<textarea name="message" required maxlength="4000" rows="3"></textarea></label><button type="submit">Send message</button></form>`}</section>`:''}<details><summary>Feedback consent</summary><p>Withdrawing consent stops further feedback messages for this visit and closes this private link.</p><button class="secondary" type="button" id="withdraw-feedback">Withdraw feedback consent</button></details>`
}
const staffOptions=selected=>(view.staff||[]).map(s=>`<option value="${esc(s.id)}"${s.id===selected?' selected':''}>${esc(s.name)} · ${esc(s.role)}</option>`).join('')
function caseView(v){
 const c=v.case
 if(!c)return ''
 return `<section class="feedback-case"><h3>${c.state==='closed'?'Follow-up closed':c.overdue?'Follow-up overdue':'Follow-up assigned'}</h3><p>Owner: ${esc(c.assigneeName)} · Due ${esc(date(c.dueAt))}</p>${c.state==='closed'?`<p>Outcome: ${esc(c.outcome)}</p>`:`<details><summary>Reassign follow-up</summary><form data-feedback-action="assign" data-visit="${esc(v.id)}"><label>Follow-up owner<select name="assigneeId" required>${staffOptions(c.assigneeId)}</select></label><label>Due by<input name="dueAt" type="datetime-local" value="${esc(localInput(c.dueAt))}" required></label><button type="submit">Update assignment</button></form></details>`}</section>`
}
function manageView(){
 const open=new Set([...document.querySelectorAll('[data-feedback-visit][open]')].map(el=>el.dataset.feedbackVisit))
 $('#feedback-content').innerHTML=`<div class="feedback-actions"><button class="secondary" type="button" data-refresh>Refresh feedback</button><p class="help">${view.visits.length} completed visit${view.visits.length===1?'':'s'}</p></div>`+(view.visits.map(v=>`<details class="feedback-visit" data-feedback-visit="${esc(v.id)}"${open.has(v.id)?' open':''}><summary><strong>${esc(v.guestName)}</strong><span>${esc(date(v.visitDate))} · ${v.rating==null?'Awaiting response':`${esc(v.rating)} out of 5`} · Invitation: ${esc(mailState(v.inviteState))}${v.withdrawn?' · Consent withdrawn':''}</span>${v.case?`<span class="badge">${v.case.state==='closed'?'Closed':v.case.overdue?'Overdue':'Follow-up assigned'}</span>`:''}</summary><div><p class="feedback-comment">${esc(v.comment)}</p>${caseView(v)}<h3>Conversation</h3>${messages(v.messages)}${v.withdrawn?'<p class="help">Consent withdrawn. Further feedback messages are stopped.</p>':v.case?.state==='closed'?`<p class="help">Closed · ${esc(v.case.outcome)}</p>`:v.case?.state==='open'?`<form data-feedback-action="reply" data-visit="${esc(v.id)}"><label>Reply to ${esc(v.guestName)}<textarea name="message" maxlength="4000" rows="3" required></textarea></label><button type="submit">Send reply</button></form>${v.case?`<details><summary>Close follow-up</summary><form data-feedback-action="close" data-visit="${esc(v.id)}"><label>Resolution outcome<textarea name="outcome" required maxlength="2000" rows="3"></textarea></label><p class="help">A reply must be accepted by the mail provider before closure.</p><button type="submit"${v.messages.some(m=>m.author==='manager'&&m.state==='accepted')?'':' disabled'}>Close follow-up</button></form></details>`:''}`:'<p class="help">No recovery case is open for this visit.</p>'}</div></details>`).join('')||'<section class="panel"><h2>No completed visits yet</h2><p>Consented guests will appear here after their visit is complete.</p></section>')
}
function settingsView(){
 const form=$('#feedback-settings');form.elements.enabled.checked=view.settings.enabled
 form.elements.publicReviewUrl.value=view.settings.publicReviewUrl||''
 form.elements.recoveryAssigneeId.innerHTML=staffOptions(view.settings.recoveryAssigneeId)
 $('#settings-state').textContent='Saved'
}
async function refresh(){
 view=kind==='public'?await guest('/status'):await owner('')
 if(kind==='public')publicView();else if(kind==='manage')manageView();else settingsView()
 notice('')
}
const run=fn=>async event=>{event.preventDefault();const button=event.submitter||event.target.closest('button');if(button)button.disabled=true;try{await fn(event)}catch(error){notice(error.message,true)}finally{if(button?.isConnected)button.disabled=false}}
document.addEventListener('submit',run(async event=>{
 const form=event.target,p=Object.fromEntries(new FormData(form))
 if(form.id==='feedback-survey'){await guest('/submit',{rating:Number(p.rating),comment:p.comment});await refresh();notice('Thank you. Your feedback has been recorded.')}
 else if(form.id==='guest-reply'){await guest('/reply',{message:p.message});await refresh();notice('Message recorded for the restaurant.')}
 else if(form.dataset.feedbackAction){
  const action=form.dataset.feedbackAction
  const requestId=action==='reply'?(form.dataset.requestId||=crypto.randomUUID()):undefined
  await owner('/'+action,{...p,visitId:form.dataset.visit,...requestId?{requestId}:{},...action==='assign'?{dueAt:new Date(p.dueAt).toISOString()}:{}})
  await refresh();notice(action==='reply'?'Reply recorded. See provider status in the conversation.':action==='close'?'Follow-up closed.':'Assignment updated.')
 }
}))
document.addEventListener('click',event=>{
 if(event.target.closest('[data-review-invitation]')){sessionStorage.setItem('placemat-review-invitation',token);return}
 if(!event.target.closest('[data-refresh],#withdraw-feedback'))return
 return run(async event=>{
 if(event.target.closest('[data-refresh]'))await refresh()
 else if(event.target.closest('#withdraw-feedback')){await guest('/withdraw');$('#feedback-content').innerHTML='<section class="panel"><h2>Consent withdrawn</h2><p>You will not receive further feedback messages for this visit.</p></section>';notice('Feedback consent withdrawn.')}
 })(event)
})
if(kind==='settings'){
 $('#feedback-settings').addEventListener('change',()=>{
  const form=$('#feedback-settings'),state=$('#settings-state')
  if(!form.reportValidity()){state.textContent='Enter a valid HTTPS review URL.';return}
  const changes={enabled:form.elements.enabled.checked,publicReviewUrl:form.elements.publicReviewUrl.value.trim(),recoveryAssigneeId:form.elements.recoveryAssigneeId.value}
  state.textContent='Saving…'
  saving=saving.catch(()=>{}).then(async()=>{await owner('/settings',changes);state.textContent='Saved'}).catch(error=>{state.textContent=error.message;notice('Settings could not be saved. Your values are still here.',true)})
 })
}
if(kind==='public'&&!token)notice('Open the private feedback link from your invitation to share your visit.',true)
else refresh().catch(error=>notice(error.message,true))

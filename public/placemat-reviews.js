import {reviewCards} from './placemat-widget.js'
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const manage=document.body.dataset.reviewsPage==='manage',key='placemat-diner-session',invitationToken=location.hash.slice(1)
let token=sessionStorage.getItem(key)||'',bookingId=new URLSearchParams(location.search).get('booking')||'',view,busy=false
history.replaceState(null,'',location.pathname)
const notice=(message,error=false)=>{const el=$('#notice');el.textContent=message;el.setAttribute('role',error?'alert':'status')}
async function api(path,body){const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},credentials:manage?'same-origin':'omit',...(body===undefined?{}:{body:JSON.stringify(body)})}),v=await r.json();if(!r.ok)throw Error(v.error||'The request could not be completed.');return v}
const proof=()=>({token,bookingId,...invitationToken?{invitationToken}:{}})
const reportForm=id=>`<details><summary>Report abuse</summary><form data-review-action="report" data-review="${esc(id)}"><label>Guideline category<select name="category"><option value="spam">Spam</option><option value="personal-data">Personal information</option><option value="threat">Threat</option><option value="other">Other guideline concern</option></select></label><label>Explain the concern<textarea name="detail" required maxlength="2000" rows="3"></textarea></label><button type="submit">Send abuse report</button></form></details>`
async function refresh(){
 view=await api(manage?'/api/reviews':'/api/public/reviews')
 $('#venue-name').textContent=view.venueName;$('#review-guidelines').textContent=view.guidelines
 $('#review-list').innerHTML=reviewCards(view,esc,r=>`${manage?`<details><summary>${r.reply?'Edit restaurant reply':'Reply as restaurant'}</summary><form data-review-action="reply" data-review="${esc(r.id)}" data-revision="${view.records.find(record=>record.id===r.id).revision}"><label>Public reply<textarea name="message" required maxlength="2000" rows="3">${esc(r.reply)}</textarea></label><button type="submit">Publish reply</button></form></details>`:''}${reportForm(r.id)}`)
 if(manage)$('#moderation').innerHTML='<h2>Moderation reports</h2>'+view.reports.map(r=>`<article class="review-card" data-report="${esc(r.id)}"><p>${esc(r.category)} · ${esc(r.outcome)}</p><p class="review-comment">${esc(r.detail)}</p>${r.outcome==='pending'&&view.canModerate?`<form data-review-action="moderate" data-report="${esc(r.id)}"><label>Rating-neutral outcome<select name="outcome"><option value="retained">Retain review</option><option value="escalated">Escalate; keep visible</option></select></label><label>Reason under the published guidelines<textarea name="reason" required maxlength="2000" rows="3"></textarea></label><button type="submit">Record moderation outcome</button></form>`:`<p>${esc(r.reason||'The venue owner must review this report.')} ${esc(r.decided_at||'')}</p>`}</article>`).join('')
}
function identity(){
 $('#review-identity').innerHTML=`<form id="review-request"><label>Booking reference<input name="bookingId" value="${esc(bookingId)}" required maxlength="100"></label><label>Current booking email<input name="email" type="email" required></label><label class="check-label"><input name="acknowledged" type="checkbox" required> Email me a private code for this booking.</label><button type="submit">Request booking code</button></form><details id="review-code"><summary>Enter your booking code</summary><form id="review-verify"><label>Private verification code<input name="code" required pattern="[a-f0-9]{64}" minlength="64" maxlength="64" autocomplete="one-time-code"></label><label class="check-label"><input name="acknowledged" type="checkbox" required> Attach only this verified booking.</label><button type="submit">Verify review booking</button></form></details>`
}
async function compose(){
 if(!token||!bookingId)return
 const result=await api('/api/public/reviews/status',proof())
 $('#review-form').innerHTML=result.alreadyPublished?'<p>This visit already has a public review.</p>':`<h3>Publish a separate review</h3><form id="publish-review"><label>Public rating<select name="rating" required>${[1,2,3,4,5].map(n=>`<option value="${n}">${n} out of 5</option>`).join('')}</select></label><label>Public review<textarea name="comment" required maxlength="4000" rows="4"></textarea></label><label class="check-label"><input type="checkbox" name="notStaff" required> I am not venue staff.</label><label class="check-label"><input type="checkbox" name="publish" required> Publish this rating, review and visit date publicly under these guidelines.</label><button type="submit">Publish my review</button></form>`
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!form.matches('#review-request,#review-verify,#publish-review,[data-review-action]'))return
 event.preventDefault();if(busy)return;busy=true;const button=event.submitter;button.disabled=true;notice('Saving…')
 try{
  const p=Object.fromEntries(new FormData(form))
  if(form.id==='review-request'){bookingId=p.bookingId;$('#review-form').innerHTML='';await api('/api/public/diner/request',{...p,acknowledged:true});$('#review-code').open=true;notice('Code requested. Provider acceptance does not establish mailbox delivery.')}
  else if(form.id==='review-verify'){const verified=await api('/api/public/diner/verify',{code:p.code,acknowledged:true});token=verified.token;bookingId=verified.bookingId;sessionStorage.setItem(key,token);await compose();notice('Booking verified. Publication still needs your explicit confirmation.')}
  else if(form.id==='publish-review'){await api('/api/public/reviews/submit',{...proof(),rating:Number(p.rating),comment:p.comment,publish:p.publish==='on',notStaff:p.notStaff==='on'});await refresh();await compose();notice('Your public review is published.')}
  else {const action=form.dataset.reviewAction;const result=await api((manage?'/api/reviews/':'/api/public/reviews/')+action,{...p,reviewId:form.dataset.review,reportId:form.dataset.report,revision:Number(form.dataset.revision)});await refresh();notice(action==='report'?`Abuse report recorded: ${result.outcome}. Review remains visible.`:action==='reply'?'Restaurant reply published.':'Moderation outcome recorded. Review remains visible.')}
 }catch(error){notice(error.message,true)}finally{busy=false;if(button.isConnected)button.disabled=false}
})
async function start(){
 await refresh()
 if(!manage){
  if(invitationToken){const invitation=await api('/api/public/feedback/status',{token:invitationToken});bookingId=invitation.bookingId}
  identity();await compose()
 }
 notice('')
}
start().catch(error=>{if(!manage)identity();notice(error.message,true)})

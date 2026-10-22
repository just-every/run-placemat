import {localTime,toUtc} from './placemat-local-time.js'

const root=document.querySelector('#management-content'),notice=document.querySelector('#notice')
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const tokenFromLink=new URLSearchParams(location.hash.slice(1)).get('token')
let token=tokenFromLink,view,preview,busy=false
// Keep the bearer out of browser history and subsequent referrers. It is held only by this page.
history.replaceState(null,'',location.pathname)
const field=(label,name,type,value,attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`
const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:view.venue.timezone,dateStyle:'full',timeStyle:'short'}).format(new Date(value))
async function api(action,p={}){
 const response=await fetch('/api/public/booking-management/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,...p})})
 const result=await response.json();if(!response.ok)throw new Error(result.error??'The request could not be completed.');return result
}
function render(){
 document.querySelector('#venue-line').textContent=`${view.venue.name} · All times in ${view.venue.timezone}`
 root.innerHTML=`<article class="card"><h2>${esc(view.guest.name)}</h2><p>${esc(view.service.name)} · ${esc(time(view.booking.startAt))}</p><p>${view.booking.partySize} guests · ${esc(view.booking.status)}${view.booking.serviceStatus?' · '+esc(view.booking.serviceStatus):''}</p><p class="help">${view.booking.area?'Required area: '+esc(view.booking.area)+'. ':''}${view.booking.requiredAccessTags.length?'Required table access: '+esc(view.booking.requiredAccessTags.join(', '))+'.':''}</p><p class="help">This private link expires ${esc(time(view.expiresAt))}. Contact the venue if it expires or the reservation changes elsewhere.</p></article>`
 if(view.managerReviewRequired){root.insertAdjacentHTML('beforeend',`<article class="card"><h2>Manager review required</h2><p>${esc(view.managerReviewMessage)}</p><p>Your reservation stays unchanged. No fee is charged and no refund is submitted by this page.</p></article>`);return}
 if(view.managementAccessEnded){root.insertAdjacentHTML('beforeend','<p>Your reservation contact has been updated. This link is closed. Ask the venue to explicitly send a new private link to the updated email address.</p>');return}
 if(view.booking.status!=='booked'){root.insertAdjacentHTML('beforeend','<p>This reservation is resolved. Contact the venue for help.</p>');return}
 root.insertAdjacentHTML('beforeend',`<article class="card"><h2>Change your visit</h2><form data-management="change"><fieldset><div class="form-grid">${field('Arrival time','startAt','datetime-local',localTime(view.booking.startAt,view.venue.timezone),'required')}${field('Party size','partySize','number',view.booking.partySize,'required min="1" max="500"')}${field('Reservation contact name','name','text',view.guest.name,'required maxlength="200"')}${field('Reservation contact email','email','email',view.guest.email,'required')}${field('Reservation contact phone (optional)','phone','tel',view.guest.phone)}<p class="help wide">Your area and access requirements remain in place. A failed availability check keeps your current reservation. Contact edits apply to this reservation only. Changing the email closes this link; ask the venue to send a new link to the updated address.</p><div class="wide"><button type="submit">Review changes</button></div></div></fieldset></form></article><article class="card"><h2>Confirm or cancel</h2><div class="actions"><button type="button" data-management-action="reconfirm">Review reconfirmation</button><button type="button" class="secondary" data-management-action="cancel">Review cancellation</button></div></article><div id="management-preview"></div>`)
}
function showPreview(result){
 preview=result
 root.querySelector('#management-preview').innerHTML=`<article class="card"><h2>Review ${result.action==='cancel'?'cancellation':result.action==='reconfirm'?'reconfirmation':'reservation changes'}</h2><p>${result.booking.partySize} guests · ${esc(time(result.booking.startAt))}</p><p>${esc(result.guest.name)} · ${esc(result.guest.email)}${result.guest.phone?' · '+esc(result.guest.phone):''}</p><p>${esc(result.consequences.message)}</p><p>Fee: $${(result.consequences.feeCents/100).toFixed(2)} USD · Refund: $${(result.consequences.refundCents/100).toFixed(2)} USD</p><form data-management="commit"><fieldset><label><input type="checkbox" name="acknowledged" required> I have reviewed these consequences and want to ${result.action==='cancel'?'cancel this reservation':result.action==='reconfirm'?'reconfirm this reservation':'apply these changes'}.</label><button type="submit">${result.action==='cancel'?'Confirm cancellation':result.action==='reconfirm'?'Confirm reconfirmation':'Confirm changes'}</button></fieldset></form></article>`
 root.querySelector('#management-preview').scrollIntoView({block:'nearest'})
}
async function run(work){
 if(busy)return;busy=true;notice.setAttribute('role','status');notice.textContent='Checking your reservation…';root.inert=true
 try{await work()}catch(error){notice.setAttribute('role','alert');notice.textContent=error.message}finally{busy=false;root.inert=false}
}
root.addEventListener('click',event=>{
 const button=event.target.closest('[data-management-action]');if(!button)return
 run(async()=>{showPreview(await api('preview',{action:button.dataset.managementAction}));notice.textContent='Review the consequences before confirming.'})
})
root.addEventListener('submit',event=>{
 const form=event.target.closest('[data-management]');if(!form)return;event.preventDefault()
 run(async()=>{
  if(form.dataset.management==='change'){
   const data=new FormData(form),startAt=toUtc(String(data.get('startAt')),view.venue.timezone)
   showPreview(await api('preview',{action:'change',startAt,partySize:Number(data.get('partySize')),contact:Object.fromEntries(['name','email','phone'].map(key=>[key,String(data.get(key)||'')]))}));notice.textContent='Review the consequences before confirming.'
  }else{
   const result=await api('commit',{previewId:preview.previewId,acknowledged:new FormData(form).get('acknowledged')==='on'})
   token=result.token;view=result;preview=undefined;render();notice.textContent=result.managementAccessEnded?'Your reservation contact has been updated. Ask the venue for a new link.':result.booking.status==='cancelled'?'Your reservation is cancelled.':'Your reservation has been updated.'
  }
 })
})
// A newly delivered fragment can open in the same tab after history was cleared.
// Reload to discard the old in-memory capability and open exactly the new link.
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).has('token'))location.reload()})
run(async()=>{view=await api('status');render();notice.textContent='Reservation opened. Every change requires your confirmation.'})

import {esc,hidden,field,paymentLink} from './placemat-hoststand-forms.js';
import {floorMarkup} from './placemat-hoststand-floor.js';
import {toUtc} from './placemat-local-time.js';
import {renderPacingWarning} from './placemat-pacing.js';

const root=document.querySelector('#host-stand'),notice=document.querySelector('#host-notice');
let data,serviceId='',working=false,lockAt=0,epoch=0,roster=[],lockPending=false,renewalWarning=false,pacingReviews=new WeakMap();
async function api(path,body){
 const r=await fetch('/api/hoststand/'+path,{credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const result=await r.json();
 if(!r.ok){const error=new Error(result.error||'Host stand action failed.');error.status=r.status;throw error}
 return result;
}
function message(text,error=false){notice.textContent=text;notice.setAttribute('role',error?'alert':'status')}
const renewalMarkup=()=>renewalWarning?'<p class="help" role="status">This host stand lease needs renewal within seven days. Ask the owner to renew it to keep this stand available.</p>':'';
const renewalNotice=()=>`<div id="host-renewal">${renewalMarkup()}</div>`;
function clear(){epoch++;data=undefined;lockAt=0;working=false;pacingReviews=new WeakMap();message('');root.replaceChildren()}
function rosterMarkup(){
 return `${renewalNotice()}<article class="card"><h2>Host stand locked</h2><p>Tap your name, then enter your personal PIN.</p><div class="actions" aria-label="Enrolled staff">${roster.map(p=>`<button type="button" data-host-operator="${esc(p.id)}"${lockPending?' disabled':''}>${esc(p.name)}</button>`).join('')||'<p>No enrolled hosts. Ask the owner to grant host access and set up a personal PIN.</p>'}</div><div id="host-pin"></div></article>`;
}
function locked(){clear();root.innerHTML=rosterMarkup()}
function register(){
 clear();roster=[];renewalWarning=false;
 root.innerHTML=`<article class="card"><h2>Register this device</h2><p>Ask the venue owner for a one-use registration code. It expires in ten minutes. Registration signs out any personal account on this browser.</p><form data-host-action="claim"><label>Owner-issued code<input name="claimCode" type="password" autocomplete="off" required maxlength="64"></label><button>Register host stand</button></form></article>`;
}
function renderFloor(){
 lockAt=data.lockAt;
 if(!data.services.some(s=>s.id===serviceId))serviceId=data.services[0]?.id||'';
 root.innerHTML=renewalNotice()+floorMarkup(data,serviceId);
}
async function refresh(at=epoch){
 const previous=data,next=await api('floor');
 if(at!==epoch)return false;
 if(previous&&(previous.generation!==next.generation||previous.actor.id!==next.actor.id)){locked();message('Staff changed. Unlock with your personal PIN.');return false}
 data=next;roster=next.roster;renderFloor();return true;
}
async function load(at=epoch){
 try{
  const status=await api('status');if(at!==epoch)return;
  roster=status.roster;renewalWarning=status.renewalWarning;
  if(status.locked)locked();else await refresh(at);
 }catch(error){if(at!==epoch)return;register();message(error.message,error.status!==401)}
}
async function lockNow(){
 if(lockPending)return;
 lockPending=true;locked();const at=epoch;
 try{await api('lock',{});if(at!==epoch)return;lockPending=false;await load(at)}
 catch(error){if(at!==epoch)return;lockPending=false;if([401,403].includes(error.status))register();else locked();message(error.message,true)}
 finally{if(at===epoch){lockPending=false;for(const button of root.querySelectorAll('button'))button.disabled=false}}
}
function payloadFor(values,action){
 const payload=Object.fromEntries(values);
 if(payload.partySize!==undefined)payload.partySize=Number(payload.partySize);
 if(values.has('tableIds'))payload.tableIds=values.getAll('tableIds');
 if(action==='booking.lock')payload.locked=payload.locked==='true';
 if(action==='waitlist.add')payload.contactConsent=values.has('contactConsent');
 for(const key of ['startAt','dueAt'])if(payload[key])payload[key]=toUtc(payload[key],data.venue.timezone,payload.startOffset||undefined);
 delete payload.startOffset;
 if(['move','booking.swap','booking.lock','booking.phone.change'].includes(action))payload.version=data.version;
 return payload;
}
async function reviewPacing(form,command,payload,at){
 if(!['booking.walkin','waitlist.seat'].includes(command))return true;
 const base={...payload};delete base.pacingConfirm;delete base.pacingReason;
 const stamp=JSON.stringify(base),previous=pacingReviews.get(form);
 if(previous?.stamp===stamp&&payload.pacingConfirm==='yes'){payload.pacingReview=previous.review;return true}
 const preview=await api('pacing-preview',{generation:data.generation,command,payload:base});
 if(at!==epoch)return false;
 if(!preview.violations.length)return true;
 pacingReviews.set(form,{stamp,review:preview.review});
 form.querySelector('[data-pacing-warning]').innerHTML=renderPacingWarning(preview.violations,{esc,field});
 message('Review the pacing warning, add a reason and confirm before submitting again.');return false;
}
root.addEventListener('change',e=>{if(e.target.name==='deviceService'&&data&&!working){serviceId=e.target.value;message('');renderFloor()}});
root.addEventListener('click',async e=>{
 if(e.target.closest('[data-host-action="lock"]')){void lockNow();return}
 const operator=e.target.closest('[data-host-operator]');
 if(operator&&!lockPending){
  message('');const person=roster.find(p=>p.id===operator.dataset.hostOperator);
  root.querySelector('#host-pin').innerHTML=`<h3>${esc(person.name)}</h3><form data-host-action="unlock">${hidden('operatorId',person.id)}<label>Personal PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" autocomplete="off" required minlength="6" maxlength="12"></label><button>Unlock host stand</button></form>`;
  root.querySelector('[name="pin"]').focus();return;
 }
 if(e.target.closest('[data-host-action="refresh"]')&&data&&!working){const at=epoch;try{await refresh(at)}catch(error){if(at!==epoch)return;if([401,403,423].includes(error.status))locked();message(error.message,true)}}
});
root.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-host-action]');if(!form)return;e.preventDefault();
 if(working||lockPending||!form.reportValidity())return;
 const at=epoch,action=form.dataset.hostAction,values=new FormData(form),generation=data?.generation;
 working=true;message('');
 for(const button of root.querySelectorAll('button:not([data-host-action="lock"])'))button.disabled=true;
 try{
  if(action==='claim'){const payload=Object.fromEntries(values);form.reset();await api('claim',payload);if(at!==epoch)return;await load(at);}
  else if(action==='unlock'){const payload=Object.fromEntries(values);form.reset();await api('unlock',payload);if(at!==epoch)return;if(await refresh(at))message('Host stand unlocked.');}
  else{
   const payload=payloadFor(values,action),command=action==='move'?'booking.move':action==='stage'?'booking.stage':action;
   if(!await reviewPacing(form,command,payload,at)||at!==epoch)return;
   const saved=await api('commands',{generation,command,payload});if(at!==epoch)return;
   if(await refresh(at)){
    message(action==='payment.link'?'Guest payment link issued. Share it with the guest.':['stage','move'].includes(action)?'Seating operation recorded.':'Operation recorded.');
    if(action==='payment.link'){const markup=paymentLink(saved.result.url),container=document.createElement('div');container.innerHTML=markup;notice.append(container)}
   }
  }
 }catch(error){
  if(at!==epoch)return;
  pacingReviews.delete(form);form.querySelector('[data-pacing-warning]')?.replaceChildren();
  if([401,403,423].includes(error.status)&&action!=='claim')locked();
  message(error.message,true);
 }finally{if(at===epoch){working=false;for(const button of root.querySelectorAll('button'))button.disabled=false}}
});
setInterval(()=>{if(data&&Date.now()>=lockAt)void lockNow()},1000);
setInterval(async()=>{
 if(!data||working||lockPending)return;const at=epoch;
 try{const status=await api('status');if(at!==epoch)return;roster=status.roster;renewalWarning=status.renewalWarning;if(status.locked){locked();message('Host stand locked.')}else root.querySelector('#host-renewal').innerHTML=renewalMarkup()}
 catch{if(at!==epoch)return;locked();message('Host stand access is unavailable. Unlock again.',true)}
},10000);
document.addEventListener('visibilitychange',()=>{if(data&&Date.now()>=lockAt)void lockNow()});
window.addEventListener('pagehide',()=>{clear()});
window.addEventListener('pageshow',e=>{if(e.persisted)void load()});
void load();

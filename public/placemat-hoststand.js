const root=document.querySelector('#host-stand'),notice=document.querySelector('#host-notice');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,serviceId='',working=false,lockAt=0;
async function api(path,body){const r=await fetch('/api/hoststand/'+path,{credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok){const error=new Error(result.error||'Host stand action failed.');error.status=r.status;throw error}return result}
function message(text,error=false){notice.textContent=text;notice.setAttribute('role',error?'alert':'status')}
function locked(){data=undefined;lockAt=0;root.innerHTML=`<article class="card"><h2>Host stand locked</h2><form data-host-action="unlock"><label>Staff email<input name="email" type="email" autocomplete="off" required></label><label>Personal PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" autocomplete="off" required minlength="6" maxlength="12"></label><button>Unlock host stand</button></form></article>`}
function register(){data=undefined;lockAt=0;root.innerHTML=`<article class="card"><h2>Register this device</h2><p>Ask the venue owner for a one-use registration code. It expires in ten minutes. Registration signs out any personal account on this browser.</p><form data-host-action="claim"><label>Owner-issued code<input name="claimCode" type="password" autocomplete="off" required maxlength="64"></label><button>Register host stand</button></form></article>`}
function renderFloor(){
 lockAt=data.lockAt;if(!data.services.some(s=>s.id===serviceId))serviceId=data.services[0]?.id||'';
 const names=ids=>ids.map(id=>data.tables.find(t=>t.id===id)?.label||'Unassigned cover').join(', '),time=at=>new Intl.DateTimeFormat('en-US',{timeZone:data.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(at));
 root.innerHTML=`<article class="card"><h2>${esc(data.device.label)}</h2><p>Signed in as <strong>${esc(data.actor.name)}</strong></p><div class="actions"><button type="button" data-host-action="lock">Switch staff</button><button type="button" class="secondary" data-host-action="lock">Lock stand</button></div></article><label>Service<select name="deviceService">${data.services.map(s=>`<option value="${esc(s.id)}"${s.id===serviceId?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label><section aria-label="Host stand parties">${data.bookings.filter(b=>b.serviceId===serviceId).map(b=>`<article class="card" data-device-booking="${esc(b.id)}"><h3>${esc(b.name)}</h3><p>${b.partySize} guests · ${esc(time(b.startAt))}</p><p>${esc(names(b.tableIds))} · ${esc(b.status)}</p>${b.nextStages.length?`<form data-host-action="stage"><input type="hidden" name="bookingId" value="${esc(b.id)}"><label>Next seating step<select name="stage">${b.nextStages.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><button>Record seating step</button></form>`:''}<details><summary>Change seats</summary><form data-host-action="move"><input type="hidden" name="bookingId" value="${esc(b.id)}"><label>Physical seats or table<select name="tableIds" multiple required>${data.tables.map(t=>`<option value="${esc(t.id)}"${b.tableIds.includes(t.id)?' selected':''}>${esc(t.label)} · ${t.seats} seats</option>`).join('')}</select></label><label>Seating reason (optional)<input name="reason" maxlength="500"></label><button>Move party</button></form></details></article>`).join('')||'<p>No current parties for this service.</p>'}</section>`;
}
async function refresh(){data=await api('floor');renderFloor()}
async function load(){try{const status=await api('status');if(status.locked)locked();else await refresh()}catch(error){register();message(error.message,error.status!==401)}}
async function lockNow(){locked();message('Host stand locked.');try{await api('lock',{})}catch(error){if([401,403].includes(error.status))register();message(error.message,true)}}
root.addEventListener('change',e=>{if(e.target.name==='deviceService'){serviceId=e.target.value;renderFloor()}});
root.addEventListener('click',e=>{if(e.target.closest('[data-host-action="lock"]'))lockNow()});
root.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-host-action]');if(!form)return;e.preventDefault();if(working||!form.reportValidity())return;working=true;
 const action=form.dataset.hostAction,values=new FormData(form),payload=Object.fromEntries(values),generation=data?.generation,version=data?.version;
 if(action==='unlock'||action==='claim')form.reset();
 for(const button of root.querySelectorAll('button'))button.disabled=true;
 try{
  if(action==='claim'){await api('claim',payload);locked();message('Device registered. Unlock with your personal PIN.');}
  else if(action==='unlock'){await api('unlock',payload);await refresh();message('Host stand unlocked.');}
  else{await api('commands',{generation,command:action==='move'?'booking.move':'booking.stage',payload:{...payload,...action==='move'?{tableIds:values.getAll('tableIds'),version}:{}}});await refresh();message('Seating operation recorded.');}
 }catch(error){if([401,423].includes(error.status))locked();else if(error.status===403){locked()}message(error.message,true)}
 finally{working=false;for(const button of root.querySelectorAll('button'))button.disabled=false}
});
setInterval(()=>{if(data&&Date.now()>=lockAt)lockNow()},1000);
setInterval(async()=>{if(!data||working)return;try{const status=await api('status');if(status.locked){locked();message('Host stand locked.')}}catch{locked();message('Host stand access is unavailable. Unlock again.',true)}},10000);
document.addEventListener('visibilitychange',()=>{if(data&&Date.now()>=lockAt)lockNow()});
load();

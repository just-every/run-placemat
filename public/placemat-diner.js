const root=document.querySelector('#diner-content'),notice=document.querySelector('#notice')
const key='placemat-diner-session',esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let token=sessionStorage.getItem(key),account,busy=false
const selectedBooking=new URLSearchParams(location.search).get('booking')||''
history.replaceState(null,'',location.pathname)
const field=(label,name,type,value='',attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`
async function api(action,p={}){
 const response=await fetch('/api/public/diner/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,...p})})
 const result=await response.json()
 if(!response.ok){if(response.status===404&&token&&!['request','verify'].includes(action)){sessionStorage.removeItem(key);token=null;account=null;render()}throw Error(result.error||'The request could not be completed.')}
 return result
}
const verifyForms=()=>`<article class="card"><h2>Verify one booking</h2><p>Use its booking reference and recorded email. Each booking needs its own proof, even when contact details match.</p><form data-diner="request"><fieldset><div class="form-grid">${field('Booking reference','bookingId','text',selectedBooking,'required maxlength="100"')}${field('Booking email','email','email','','required autocomplete="email"')}<label class="wide"><input type="checkbox" name="acknowledged" required> Send me a private email code for this booking.</label><button type="submit">Request verification code</button></div></fieldset></form></article><article class="card"><h2>Enter your email code</h2><p>The code expires after 15 minutes and works once. Request a new code on each device; never share a code.</p><form data-diner="verify"><fieldset>${field('Private verification code','code','text','','required minlength="64" maxlength="64" pattern="[a-f0-9]{64}" autocomplete="one-time-code" spellcheck="false"')}<label><input type="checkbox" name="acknowledged" required> Attach only the booking proved by this code to my diner account.</label><button type="submit">Verify booking</button></fieldset></form></article>`
function render(){
 if(!account){root.innerHTML=verifyForms();return}
 const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:account.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
 const upcoming=account.bookings.filter(b=>b.status==='booked'&&Date.parse(b.startAt)>Date.now())
 const previous=account.bookings.filter(b=>!upcoming.includes(b))
 const rows=(bookings,manage)=>bookings.length?`<ul class="diner-bookings">${bookings.map(b=>`<li data-booking="${esc(b.id)}"><div><strong>${esc(time(b.startAt))}</strong><p>${b.partySize} guests · ${esc(b.status)}</p><p>Reference: <code>${esc(b.id)}</code></p></div><div class="actions">${manage?`<a href="/diner/manage?booking=${encodeURIComponent(b.id)}">Manage reservation</a>`:''}<a href="/book">Book another visit</a></div></li>`).join('')}</ul>`:'<p>No verified reservations in this list.</p>'
 root.innerHTML=`<article class="card"><h2>${esc(account.venue.name)}</h2><p>${esc(account.email)} · Times in ${esc(account.venue.timezone)}</p><p>Only bookings you explicitly verify appear here. This device stays signed in for up to 24 hours.</p><div class="actions"><button type="button" data-action="refresh">Refresh account</button><button type="button" class="secondary" data-action="logout">Sign out this device</button></div></article><article class="card"><h2>Favorite restaurants</h2>${account.favorite?`<p>${esc(account.venue.name)} is saved as a favorite.</p><p><a href="/book">Book again at ${esc(account.venue.name)}</a></p>`:'<p>No favorite saved at this restaurant.</p>'}</article><article class="card"><h2>Upcoming reservations</h2>${rows(upcoming,true)}</article><article class="card"><h2>Previous and resolved reservations</h2>${rows(previous,false)}</article><article class="card"><h2>Preferences for ${esc(account.venue.name)}</h2><p>Saved only at this restaurant. Preferences are not automatically applied to a reservation or shared with other restaurants.</p><form data-diner="preferences"><fieldset><label><input type="checkbox" name="favorite"${account.favorite?' checked':''}> Save this restaurant as a favorite</label><label>Saved preferences<textarea name="preferences" maxlength="500" rows="3">${esc(account.preferences)}</textarea></label><label><input type="checkbox" name="acknowledged" required> Save these choices for this restaurant.</label><button type="submit">Save restaurant preferences</button></fieldset></form><p><button type="button" class="secondary" data-action="revoke">Revoke saved preferences</button></p></article><details class="card"><summary>Verify another booking</summary>${verifyForms()}</details><details class="card"><summary>Account settings</summary><p>Forgetting this account removes its favorite, preferences and verified links and signs out every device. Restaurant reservations remain in place.</p><form data-diner="forget"><fieldset><label><input type="checkbox" name="acknowledged" required> Forget my account at this restaurant and sign out all devices.</label><button type="submit" class="secondary">Forget diner account</button></fieldset></form></details>`
}
async function load(){account=await api('account');render()}
async function run(work){
 if(busy)return;busy=true;root.inert=true;notice.setAttribute('role','status');notice.textContent='Checking…'
 try{await work()}catch(error){notice.setAttribute('role','alert');notice.textContent=error.message}finally{busy=false;root.inert=false}
}
root.addEventListener('submit',event=>{
 const form=event.target.closest('[data-diner]');if(!form)return;event.preventDefault()
 const data=new FormData(form),acknowledged=data.get('acknowledged')==='on'
 run(async()=>{
  switch(form.dataset.diner){
   case 'request':notice.textContent=(await api('request',{bookingId:data.get('bookingId'),email:data.get('email'),acknowledged})).message;break
   case 'verify':{
    const verified=await api('verify',{code:String(data.get('code')).trim(),acknowledged})
    token=verified.token;sessionStorage.setItem(key,token);await load();notice.textContent='Booking verified. Only that booking was attached.';break
   }
   case 'preferences':await api('preferences',{favorite:data.get('favorite')==='on',preferences:String(data.get('preferences')),acknowledged});await load();notice.textContent='Restaurant preferences saved.';break
   case 'forget':await api('forget',{acknowledged});token=null;account=null;sessionStorage.removeItem(key);render();notice.textContent='Account forgotten. Your reservations remain unchanged.';break
  }
 })
})
root.addEventListener('click',event=>{
 const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return
 run(async()=>{
  if(action==='refresh'){await load();notice.textContent='Account refreshed.'}
  if(action==='logout'){await api('logout');token=null;account=null;sessionStorage.removeItem(key);render();notice.textContent='This device is signed out.'}
  if(action==='revoke'){await api('preferences',{favorite:account.favorite,preferences:'',acknowledged:true});await load();notice.textContent='Saved preferences revoked at this restaurant.'}
 })
})
render()
if(token)run(async()=>{await load();notice.textContent='Your verified reservations are ready.'})

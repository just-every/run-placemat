const root=document.querySelector('#diner-content'),notice=document.querySelector('#notice')
const key='placemat-diner-session',esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let token=sessionStorage.getItem(key),account,group,busy=false
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
function groupSettings(){
 if(!group?.connected)return ''
 const choices=['preferences','visits','rebooking'].map(p=>`<label><input type="checkbox" name="${p}"${group.purposes[p]?' checked':''}> ${esc({preferences:'Share my saved restaurant preferences',visits:'Share my attended visits',rebooking:'Offer rebooking at this restaurant'}[p])}</label>`).join('')
 return `<details class="card" id="diner-group"><summary>Group sharing settings</summary><p>Group home: ${esc(group.homeOrigin)}. Each purpose is separate and off until you choose it. A verified booking at each restaurant is required. Private staff notes, tags, contact details and spend are never shared by these choices.</p><form data-diner="group-consent"><fieldset>${choices}<label><input type="checkbox" name="acknowledged" required> Save these group choices for this restaurant.</label><button type="submit">Save group choices</button></fieldset></form>${group.member?`<form data-diner="group-link"><fieldset>${field('One-use group link code','code','text','','required autocomplete="off"')}${choices}<label><input type="checkbox" name="acknowledged" required> Link only my verified bookings with these separate group choices.</label><button type="submit">Link verified restaurant</button></fieldset></form>`:`<form data-diner="group-code"><fieldset><label>Sister restaurant<select name="venueId">${group.venues.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select></label><label><input type="checkbox" name="acknowledged" required> Create a one-use code to enter at that restaurant after separately verifying my booking there.</label><button type="submit">Create group link code</button></fieldset></form><div id="diner-group-code" role="status"></div>`}</details>`
}
function render(){
 if(!account){root.innerHTML=verifyForms();return}
 const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:account.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
 const upcoming=account.bookings.filter(b=>b.status==='booked'&&Date.parse(b.startAt)>Date.now())
 const previous=account.bookings.filter(b=>!upcoming.includes(b))
 const rows=(bookings,manage)=>bookings.length?`<ul class="diner-bookings">${bookings.map(b=>`<li data-booking="${esc(b.id)}"><div><strong>${esc(time(b.startAt))}</strong><p>${b.partySize} guests · ${esc(b.status)}</p><p>Reference: <code>${esc(b.id)}</code></p></div><div class="actions">${manage?`<a href="/diner/manage?booking=${encodeURIComponent(b.id)}">Manage reservation</a>`:''}<a href="/book">Book another visit</a></div></li>`).join('')}</ul>`:'<p>No verified reservations in this list.</p>'
 root.innerHTML=`<article class="card"><h2>${esc(account.venue.name)}</h2><p>${esc(account.email)} · Times in ${esc(account.venue.timezone)}</p><p>Only bookings you explicitly verify appear here. This device stays signed in for up to 24 hours.</p><div class="actions"><button type="button" data-action="refresh">Refresh account</button><button type="button" class="secondary" data-action="logout">Sign out this device</button></div></article><article class="card"><h2>Favorite restaurants</h2>${account.favorite?`<p>${esc(account.venue.name)} is saved as a favorite.</p><p><a href="/book">Book again at ${esc(account.venue.name)}</a></p>`:'<p>No favorite saved at this restaurant.</p>'}</article><article class="card"><h2>Upcoming reservations</h2>${rows(upcoming,true)}</article><article class="card"><h2>Previous and resolved reservations</h2>${rows(previous,false)}</article><article class="card"><h2>Preferences for ${esc(account.venue.name)}</h2><p>Saved only at this restaurant. Preferences are not automatically applied to a reservation or shared with other restaurants.</p><form data-diner="preferences"><fieldset><label><input type="checkbox" name="favorite"${account.favorite?' checked':''}> Save this restaurant as a favorite</label><label>Saved preferences<textarea name="preferences" maxlength="500" rows="3">${esc(account.preferences)}</textarea></label><label><input type="checkbox" name="acknowledged" required> Save these choices for this restaurant.</label><button type="submit">Save restaurant preferences</button></fieldset></form><p><button type="button" class="secondary" data-action="revoke">Revoke saved preferences</button></p></article><details class="card"><summary>Verify another booking</summary>${verifyForms()}</details>${groupSettings()}<details class="card"><summary>Account settings</summary><p>Forgetting this account removes its favorite, preferences and verified links and signs out every device. Restaurant reservations remain in place.</p><form data-diner="forget"><fieldset><label><input type="checkbox" name="acknowledged" required> Forget my account at this restaurant and sign out all devices.</label><button type="submit" class="secondary">Forget diner account</button></fieldset></form></details>`
}
async function load(){account=await api('account');group=await api('group');render()}
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
   case 'group-consent':case 'group-link':{
    await api(form.dataset.diner,{acknowledged,code:data.get('code'),...Object.fromEntries(['preferences','visits','rebooking'].map(p=>[p,data.get(p)==='on']))});await load();notice.textContent='Group choices saved. Each read checks your current choices.';break
   }
   case 'group-code':{const result=await api('group-code',{acknowledged,venueId:data.get('venueId')});document.querySelector('#diner-group-code').textContent='Enter this code only at your chosen restaurant within 15 minutes: '+result.code;break}
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

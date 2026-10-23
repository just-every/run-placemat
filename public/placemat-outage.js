// Anonymous outage drafts never auto-submit. Only ciphertext is retained on the device.
const storageSlot='placemat.outage.v1',encoder=new TextEncoder(),decoder=new TextDecoder();
const base64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);};
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function derive(passphrase,salt){
 if(passphrase.length<16)throw Error('Use a passphrase of at least 16 characters. It cannot be recovered.');
 const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function createOutage({api,esc,field,select:baseSelect}){
 const select=(label,name,choices,selected)=>baseSelect(label,name,choices,selected,`required aria-label="${esc(label)}"`);
 let root,actorId,services=[],sheet,draft,key,salt,review,selected=0,busy=false,lastCiphertext=null,activity=Date.now();
 const exists=()=>!!localStorage.getItem(storageSlot);
 const message=(text,error=false)=>{const target=root?.querySelector('[data-outage-notice]');if(!target)return;target.textContent=text;target.setAttribute('role',error?'alert':'status');};
 const when=at=>new Intl.DateTimeFormat('en-US',{timeZone:sheet.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(at));
 function lock(){sheet=draft=key=salt=review=undefined;if(root)render();}
 async function persist(next){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(next)));
  const ciphertext=JSON.stringify({format:1,salt:base64(salt),iv:base64(iv),data:base64(new Uint8Array(data)),expiresAt:next.sheet.expiresAt});
  await navigator.locks.request(storageSlot,()=>{
   if(localStorage.getItem(storageSlot)!==lastCiphertext)throw Error('The saved outage draft changed in another tab. Lock and unlock its latest copy.');
   localStorage.setItem(storageSlot,ciphertext);lastCiphertext=ciphertext;
  });
 }
 function alive(){if(!sheet||Date.parse(sheet.expiresAt)<=Date.now()){localStorage.removeItem(storageSlot);lock();throw Error('The outage sheet expired. Prepare a fresh sheet online.');}}
 function render(){
  const label=tables=>tables.map(id=>sheet.tables.find(t=>t.id===id)?.label??'Retired table').join(', ');
  root.innerHTML=`<details data-outage-panel${sheet?' open':''}><summary>Outage preparation & pending walk-ins</summary><p>Personal owner session only. Save an anonymous service sheet on this device with a private passphrase. Keep this page open during an outage; reloading requires a connection. This sheet is a snapshot, never live availability. No names, contacts or guest notes are saved here.</p><p data-outage-notice role="status" aria-live="polite"></p>${sheet?`
   <p data-outage-timestamp>Saved ${esc(when(sheet.generatedAt))} · expires ${esc(when(sheet.expiresAt))} · ${esc(sheet.venue.timezone)}</p><h3>${esc(sheet.service.name)}</h3>
   <div class="table-scroll"><table aria-label="Anonymous outage service sheet"><thead><tr><th>Tables</th><th>Party</th><th>Arrival / reset end</th><th>Snapshot status</th></tr></thead><tbody>${sheet.bookings.map(b=>`<tr><td>${esc(label(b.tableIds))}</td><td>${b.partySize}</td><td>${esc(when(b.startAt))}<br>${esc(when(b.endAt))}</td><td>${esc(b.status)}${b.needsBussing?' · needs bussing':''}</td></tr>`).join('')||'<tr><td colspan="4">No reservations in this snapshot.</td></tr>'}</tbody></table></div>
   <p>${sheet.tables.map(t=>`${esc(t.label)} · ${t.seats} seats · ${esc(t.area)}`).join('; ')}</p>
   ${draft.pending.length?draft.pending.map(p=>`<article class="card" data-pending-id="${esc(p.actionId)}"><h4>Pending walk-in · ${p.partySize} people</h4><p>${esc(label(p.tableIds))} · ${esc(when(p.startAt))}<br>Captured ${esc(when(p.capturedAt))}. Unconfirmed; no table held.</p><button type="button" data-outage="review" data-id="${esc(p.actionId)}">Review current floor</button><button type="button" class="secondary" data-outage="discard" data-id="${esc(p.actionId)}">Discard pending walk-in</button></article>`).join(''):'<p>No pending walk-ins.</p>'}
   ${draft.pending.length<30?`<form data-outage-form="capture"><div class="form-grid">${field('Pending party size','partySize','number',2,'required min="1" max="500"')}${field('Pending arrival (venue local)','arrival','datetime-local',new Intl.DateTimeFormat('sv-SE',{timeZone:sheet.venue.timezone,dateStyle:'short',timeStyle:'short'}).format(new Date(sheet.service.startAt)).replace(' ','T'),'required')}<label>UTC offset for arrival<input name="offset" required pattern="[+-][0-9]{2}:[0-9]{2}" placeholder="-04:00"></label>${select('Proposed table','tableId',sheet.tables.map(t=>[t.id,t.label+' · '+t.seats+' seats']))}${field('Pending access tags (comma separated)','accessTags','text','','maxlength="500"')}<p class="help wide">Record operational details only. Review the venue’s access needs and current staffing online before seating. Use the explicit offset shown by your service; repeated hours need the correct offset.</p><div class="wide"><button>Save pending walk-in on this device</button></div></div></form>`:''}
   <div data-outage-review></div><p><button type="button" class="secondary" data-outage="lock">Lock outage sheet</button></p>
   `:`<form data-outage-form="prepare"><div class="form-grid">${select('Outage service','serviceId',services.map(s=>[s.id,s.name]))}${field('New outage passphrase','passphrase','password','','required minlength="16" maxlength="200" autocomplete="new-password"')}<label class="wide"><input type="checkbox" name="consent" required> I consent to storing this anonymous encrypted sheet on this device. It expires within 12 hours and is cleared when this page next runs after expiry. Live seating always needs manual review.</label><div class="wide"><button>Prepare encrypted sheet</button></div></div></form>${exists()?`<form data-outage-form="unlock">${field('Outage passphrase','passphrase','password','','required minlength="16" maxlength="200" autocomplete="off"')}<button>Unlock saved outage sheet</button></form>`:''}`}
   ${exists()?'<button type="button" class="secondary" data-outage="forget">Delete saved outage sheet</button>':''}</details>`;
 }
 function showReview(){
  root.querySelector('[data-outage-review]').innerHTML=`<section aria-label="Outage reconciliation"><h3>Review before seating</h3><p>${esc(review.conflict?`Original table refused: ${review.conflict}`:'Original table currently fits.')} Availability was checked at ${esc(when(review.generatedAt))}; it can change again.</p>${review.alternatives.length?`<form data-outage-form="commit">${select('Reviewed replacement','choice',review.alternatives.map((a,i)=>[i,a.tableLabels.join(', ')+' · until '+when(a.endAt)]),selected)}<label><input type="checkbox" name="confirm" required> I reviewed conflicts, guest access needs and staffing, and choose this exact live seating.</label><button>Seat reviewed walk-in</button></form>`:'<p>No valid seating remains. Keep the pending walk-in and review again later. Nothing was seated.</p>'}</section>`;
 }
 async function run(task){if(busy)return;busy=true;message('Working…');try{await task()}catch(error){message(error.message,true)}finally{busy=false}}
 function mount(state,actor){
  if(actor.agent||actor.deviceId||actor.role!=='owner'){if(root){localStorage.removeItem(storageSlot);lock();root.remove();root=undefined}return;}
  actorId=actor.id;services=state.services.filter(s=>s.status==='published'&&!s.closedAt);
  if(root){const choice=root.querySelector('[name=serviceId]');if(choice){for(const service of services)if(![...choice.options].some(o=>o.value===service.id))choice.add(new Option(service.name,service.id));}return;}
  root=document.createElement('div');root.id='outage-preparation';document.querySelector('#floor').append(root);render();
  root.addEventListener('input',()=>{activity=Date.now()});root.addEventListener('click',()=>{activity=Date.now()});
  root.addEventListener('submit',event=>{
   const form=event.target.closest('[data-outage-form]');if(!form)return;event.preventDefault();
   const values=new FormData(form),operation=form.dataset.outageForm;
   run(async()=>{
    if(operation==='prepare'){
     if(exists())throw Error('Delete the saved sheet explicitly before replacing it; pending walk-ins may still need review.');
     const passphrase=String(values.get('passphrase'));form.reset();lastCiphertext=null;salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(passphrase,salt);
     const saved=(await api('/api/commands',{command:'outage.sheet',payload:{serviceId:values.get('serviceId'),consent:values.has('consent')?'SAVE ANONYMOUS SHEET':''}})).result;
     const next={origin:location.origin,ownerId:actorId,sheet:saved,pending:[]};await persist(next);draft=next;sheet=saved;activity=Date.now();render();message('Encrypted anonymous snapshot saved. No inventory changed.');
    }else if(operation==='unlock'){
     const passphrase=String(values.get('passphrase'));form.reset();const stored=localStorage.getItem(storageSlot),saved=JSON.parse(stored||'null');
     if(!saved||saved.format!==1)throw Error('No supported outage sheet is saved.');
     salt=bytes(saved.salt);const candidate=await derive(passphrase,salt);let next;
     try{next=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(saved.iv)},candidate,bytes(saved.data))))}catch{throw Error('Passphrase incorrect or saved sheet damaged. Nothing was opened.');}
     if(next.origin!==location.origin||next.ownerId!==actorId)throw Error('Use the owner session that prepared this sheet.');
     sheet=next.sheet;alive();draft=next;key=candidate;lastCiphertext=stored;activity=Date.now();render();message('Snapshot unlocked. Pending walk-ins remain unconfirmed.');
    }else if(operation==='capture'){
     alive();const local=String(values.get('arrival')),offset=String(values.get('offset')),startAt=new Date(local+offset).toISOString();
     const roundtrip=new Intl.DateTimeFormat('sv-SE',{timeZone:sheet.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(startAt)).replace(' ','T');
     if(roundtrip!==local)throw Error('This offset does not match the venue local time. Resolve daylight saving time explicitly.');
     const pending={actionId:crypto.randomUUID(),serviceId:sheet.service.id,partySize:Number(values.get('partySize')),startAt,capturedAt:new Date().toISOString(),requiredAccessTags:String(values.get('accessTags')||'').split(',').map(v=>v.trim()).filter(Boolean),tableIds:[String(values.get('tableId'))]};
     const next={...draft,pending:[...draft.pending,pending]};await persist(next);draft=next;review=undefined;render();message('Pending walk-in saved on this device only. No table or booking is confirmed.');
    }else if(operation==='commit'){
     alive();if(!values.has('confirm')||!review)throw Error('Review and explicitly confirm before seating.');
     const alternative=review.alternatives[Number(values.get('choice'))];if(!alternative)throw Error('Choose a reviewed seating.');
     const originalId=alternative.payload.actionId;
     try{
      const result=(await api('/api/commands',{command:'booking.outage',payload:{...alternative.payload,version:review.version,review:alternative.review,confirm:'SEAT REVIEWED WALK-IN'}})).result;
      const next={...draft,pending:draft.pending.filter(p=>p.actionId!==originalId)};await persist(next);draft=next;review=undefined;render();message(`Walk-in ${result.id} ${result.replayed?'was already reconciled':'seated on the reviewed tables'}. Refresh the live floor to see its current state.`);
     }catch(error){review=undefined;root.querySelector('[data-outage-review]').innerHTML='';throw error;}
    }
   });
  });
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-outage]');if(!button)return;
   run(async()=>{
    if(button.dataset.outage==='lock'){lock();return;}
    if(button.dataset.outage==='forget'){if(confirm('Delete the saved sheet and every unconfirmed pending walk-in on this device?')){localStorage.removeItem(storageSlot);lock();message('Saved outage sheet deleted. Live inventory is unchanged.');}return;}
    alive();const pending=draft.pending.find(p=>p.actionId===button.dataset.id);if(!pending)return;
    if(button.dataset.outage==='discard'){
     if(!confirm('Discard this unconfirmed pending walk-in?'))return;
     const next={...draft,pending:draft.pending.filter(p=>p!==pending)};await persist(next);draft=next;review=undefined;render();return;
    }
    const current=await api('/api/outage/review',pending);
    if(current.applied){
     const next={...draft,pending:draft.pending.filter(p=>p!==pending)};await persist(next);draft=next;review=undefined;render();message(`Walk-in ${current.applied.id} was already reconciled. No additional seating was created.`);return;
    }
    review=current;selected=0;showReview();message('Review loaded. No inventory changed.');
   });
  });
  setInterval(()=>{
   const stored=localStorage.getItem(storageSlot);
   if(stored){try{if(Date.parse(JSON.parse(stored).expiresAt)<=Date.now()){localStorage.removeItem(storageSlot);lock();message('Outage sheet expired and was deleted.');}}catch{localStorage.removeItem(storageSlot);lock();}}
   if(key&&Date.now()-activity>=5*60000){lock();message('Outage sheet locked after five minutes without use.');}
  },15000);
  addEventListener('storage',event=>{if(event.key===storageSlot){lock();message('Saved outage draft changed in another tab. Unlock the latest copy before continuing.');}});
  addEventListener('pagehide',()=>{sheet=draft=key=salt=review=undefined});
 }
 return {mount};
}

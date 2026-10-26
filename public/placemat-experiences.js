import {optionEditor,editOption,readOptions,optionSummary} from './placemat-experience-options.js'
import {localTime,resolveLocalTime} from './placemat-local-time.js'

/* Catalog configuration mounts inside the existing Services & tables section. */
export function renderExperiences({root,state,canEdit,command,refresh,esc,notice}){
 const entries=state.experiences||[],zone=state.venue.timezone;
 const services=state.services.filter(service=>service.status==='published'&&!service.closedAt);
 const areas=[...new Set(state.tables.filter(table=>!table.retiredAt&&!table.inventoryId).map(table=>table.area||'Dining room'))];
 const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const serviceLabel=service=>`${service.name} · ${time(service.startAt)}`;
 const escape=value=>esc(String(value??''));
 const field=(label,name,type,value,attributes='')=>`<label>${escape(label)}<input name="${escape(name)}" type="${type}" value="${escape(value)}" ${attributes}></label>`;
 let editing,busy=false;
 function ticketRow(ticket={}){
  return `<div class="form-grid wide" data-experience-ticket data-class-id="${escape(ticket.id)}">${field('Ticket class name','className','text',ticket.name,'required maxlength="120"')}${field('Quantity limit','quantityLimit','number',ticket.quantityLimit??1,'required min="1" max="500"')}<div><button type="button" class="secondary" data-experience-action="remove-class">Remove class</button></div></div>`;
 }
 function summary(entry){
  const dates=entry.serviceIds.map(id=>state.services.find(service=>service.id===id)).filter(Boolean);
  return `<p>${escape(entry.kind==='free'?'Free':`Required ${entry.kind==='deposit'?'deposit':'prepayment'} · ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(entry.amountCents/100)} per guest`)} · ${escape(entry.areas.join(', '))}</p>${entry.image?`<img src="${escape(entry.image)}" alt="${escape(entry.name)}" width="240" class="experience-image">`:''}<dl><dt>Menu</dt><dd class="experience-copy">${escape(entry.menu)}</dd><dt>Service dates</dt><dd>${dates.map(service=>`${escape(serviceLabel(service))} · last seating ${escape(time(entry.lastSeatingAt[service.id]))}`).join('<br>')}</dd><dt>Ticket classes</dt><dd>${entry.ticketClasses.map(ticket=>`${escape(ticket.name)} · quantity limit ${ticket.quantityLimit}`).join('<br>')}</dd><dt>Dining time and reset</dt><dd>${entry.turnMinutes} minutes dining · ${entry.cleanupMinutes} minutes cleanup</dd>${optionSummary(entry,escape)}<dt>Cancellation rules</dt><dd class="experience-copy">${escape(entry.cancellationRules)}</dd></dl>`;
 }
 function review(entry){
  return `<details class="card"><summary>${escape(entry.name)}${entry.status==='published'?' · Published':' · Draft'}</summary>${summary(entry)}${entry.kind!=='free'?'<p>Online payment checkout is unavailable. This priced catalog listing takes no money and creates no reservation.</p>':''}${canEdit?entry.status==='draft'?`<button type="button" class="secondary" data-experience-action="edit" data-id="${escape(entry.id)}">Edit draft</button><form data-experience-command="experience.publish" data-id="${escape(entry.id)}" data-version="${entry.version}"><label><input type="checkbox" name="confirm" required> I reviewed these dates, terms and limits for catalog publication.</label><button type="submit">Publish catalog entry</button></form>`:`<form data-experience-command="experience.withdraw" data-id="${escape(entry.id)}" data-version="${entry.version}"><label><input type="checkbox" name="confirm" required> Withdraw this entry from the public catalog.</label><button type="submit" class="secondary">Withdraw catalog entry</button></form>`:''}</details>`;
 }
 function editor(entry){
  editing=entry;
  const availableServices=[...services,...(entry?.serviceIds||[]).flatMap(id=>services.some(service=>service.id===id)?[]:state.services.filter(service=>service.id===id))];
  const availableAreas=[...new Set([...areas,...(entry?.areas||[])])];
  const target=root.querySelector('[data-experience-editor]');
  target.innerHTML=`<details ${!entries.length||entry?'open':''}><summary>${entry?'Edit experience draft':'Create an experience draft'}</summary><form data-experience-command="experience.save"><fieldset><div class="form-grid">${field('Experience name','name','text',entry?.name,'required maxlength="120"')}<label>Pricing<select name="kind">${[['free','Free'],['deposit','Required deposit'],['prepaid','Required prepayment']].map(([value,label])=>`<option value="${value}"${entry?.kind===value?' selected':''}>${label}</option>`).join('')}</select></label>${field('Per-guest price (USD cents)','amountCents','number',entry?.amountCents??0,'required min="0" max="100000000"')}<label class="wide">Menu<textarea name="menu" rows="4" required maxlength="8000">${escape(entry?.menu)}</textarea></label><label>Image (PNG, JPEG or WebP, up to 200 KB)<input type="file" name="imageFile" accept="image/png,image/jpeg,image/webp"></label>${entry?.image?'<label><input type="checkbox" name="removeImage"> Remove current image</label>':''}<fieldset class="wide"><legend>Published service dates</legend>${availableServices.map(service=>`<label><input type="checkbox" name="serviceIds" value="${escape(service.id)}"${entry?.serviceIds.includes(service.id)?' checked':''}> ${escape(serviceLabel(service))}</label>`).join('')||'<p>Publish a service before creating an experience.</p>'}</fieldset><fieldset class="wide"><legend>Seating areas</legend>${availableAreas.map(area=>`<label><input type="checkbox" name="areas" value="${escape(area)}"${entry?.areas.includes(area)?' checked':''}> ${escape(area)}</label>`).join('')||'<p>Add physical dining tables first.</p>'}</fieldset>${field('Experience turn (minutes)','turnMinutes','number',entry?.turnMinutes??90,'required min="15" max="360"')}${field('Cleanup (minutes)','cleanupMinutes','number',entry?.cleanupMinutes??0,'required min="0" max="120"')}<fieldset class="wide"><legend>Last seating in ${escape(zone)}</legend><div data-experience-cutoffs></div></fieldset><fieldset class="wide"><legend>Ticket classes</legend><div data-experience-classes>${(entry?.ticketClasses||[{}]).map(ticketRow).join('')}</div><button type="button" class="secondary" data-experience-action="add-class">Add ticket class</button></fieldset>${optionEditor(entry,field,escape)}<label class="wide">Cancellation rules<textarea name="cancellationRules" rows="3" required maxlength="4000">${escape(entry?.cancellationRules)}</textarea></label><div class="wide"><button type="submit">Save draft</button>${entry?'<button type="button" class="secondary" data-experience-action="new">Start another draft</button>':''}</div></div></fieldset></form></details>`;
  renderCutoffs();
 }
 function offset(at){
  const minutes=Math.round((Date.parse(`${localTime(at,zone)}:00Z`)-Math.floor(Date.parse(at)/60000)*60000)/60000);
  return `${minutes<0?'-':'+'}${String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')}:${String(Math.abs(minutes)%60).padStart(2,'0')}`;
 }
 function renderCutoffs(){
  const form=root.querySelector('[data-experience-command="experience.save"]'),target=form.querySelector('[data-experience-cutoffs]');
  const retained=new Map([...target.querySelectorAll('[data-service-cutoff]')].map(row=>[row.dataset.serviceCutoff,{local:row.querySelector('[name="lastSeatingLocal"]').value,offset:row.querySelector('[name="lastSeatingOffset"]').value}]));
  const turn=Number(form.elements.turnMinutes.value),cleanup=Number(form.elements.cleanupMinutes.value);
  if(!Number.isInteger(turn)||turn<15||turn>360||!Number.isInteger(cleanup)||cleanup<0||cleanup>120){message('Set a valid dining duration and cleanup before choosing dates.',true);return;}
  const selected=new FormData(form).getAll('serviceIds');
  target.innerHTML=selected.map(id=>{
   const service=state.services.find(row=>row.id===id),duration=(Number(form.elements.turnMinutes.value)+Number(form.elements.cleanupMinutes.value))*60000;
   const latest=new Date(Math.min(Date.parse(service.endAt)-duration,Date.parse(service.turnPolicy?.lastSeatingAt||service.endAt))).toISOString();
   const value=retained.get(id),at=editing?.lastSeatingAt[id]||latest;
   return `<div class="form-grid" data-service-cutoff="${escape(id)}">${field(`${service.name}: last seating`,'lastSeatingLocal','datetime-local',value?.local??localTime(at,zone),'required')}${field('UTC offset for this date','lastSeatingOffset','text',value?.offset??offset(at),'required pattern="[+-][0-9]{2}:[0-9]{2}" placeholder="-04:00"')}</div>`;
  }).join('')||'<p>Choose service dates to set their last seating.</p>';
 }
  root.innerHTML=`<details open><summary>Experience catalog</summary><p>Guests book free experiences through shared table availability. Deposit and prepaid experiences can be published with their terms; online payment checkout is unavailable, so those listings take no money and create no reservation.</p><p data-experience-message role="status" aria-live="polite"></p><div>${entries.map(review).join('')||'<p>No experiences yet.</p>'}</div>${canEdit?'<div data-experience-editor></div>':''}</details>`;
 if(canEdit)editor();
 function message(value,error=false){
  const target=root.querySelector('[data-experience-message]');target.textContent=value;target.setAttribute('role',error?'alert':'status');notice(value,error?'error':'success');
 }
 function readImage(file){
  if(file.size>200000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP image up to 200 KB.');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read. Choose the file again.'));reader.readAsDataURL(file);});
 }
 root.onsubmit=async event=>{
  const form=event.target.closest('[data-experience-command]');if(!form)return;
  event.preventDefault();event.stopPropagation();if(!canEdit||busy||!form.reportValidity())return;
  const values=new FormData(form),name=form.dataset.experienceCommand;
  busy=true;const controls=form.querySelector('fieldset')||form.querySelector('button');
  controls.disabled=true;
  try{
   let payload;
   if(name==='experience.save'){
    const selected=values.getAll('serviceIds').map(String),selectedAreas=values.getAll('areas').map(String);
    if(!selected.length||!selectedAreas.length)throw new Error('Choose service dates and seating areas.');
    const cutoffs=Object.fromEntries([...form.querySelectorAll('[data-service-cutoff]')].map(row=>[row.dataset.serviceCutoff,resolveLocalTime(row.querySelector('[name="lastSeatingLocal"]').value,zone,row.querySelector('[name="lastSeatingOffset"]').value).at]));
    const imageFile=values.get('imageFile');
    payload={...readOptions(form),...(editing?{id:editing.id,version:editing.version}:{}),name:values.get('name'),kind:values.get('kind'),amountCents:Number(values.get('amountCents')),currency:'USD',menu:values.get('menu'),image:imageFile?.size?await readImage(imageFile):values.has('removeImage')?'':editing?.image||'',serviceIds:selected,areas:selectedAreas,turnMinutes:Number(values.get('turnMinutes')),cleanupMinutes:Number(values.get('cleanupMinutes')),lastSeatingAt:cutoffs,cancellationRules:values.get('cancellationRules'),ticketClasses:[...form.querySelectorAll('[data-experience-ticket]')].map(row=>({...row.dataset.classId?{id:row.dataset.classId}:{},name:row.querySelector('[name="className"]').value,quantityLimit:Number(row.querySelector('[name="quantityLimit"]').value)}))};
   }else payload={id:form.dataset.id,version:Number(form.dataset.version),confirm:values.has('confirm')};
   await command(name,payload);await refresh();notice(name==='experience.save'?'Experience draft saved.':name==='experience.publish'?'Experience published in the catalog.':'Experience withdrawn from the catalog.','success');
  }catch(error){message(error.message,true);}finally{controls.disabled=false;busy=false;}
 };
 root.onclick=event=>{
  if(canEdit&&!busy&&(event.target.closest('[data-add-experience-option]')||event.target.closest('[data-remove-experience-option]'))){event.preventDefault();event.stopPropagation();try{editOption(event,field,escape);}catch(error){message(error.message,true);}return;}
  const button=event.target.closest('[data-experience-action]');if(!button)return;
  event.preventDefault();event.stopPropagation();if(!canEdit||busy)return;
  const action=button.dataset.experienceAction;
  if(action==='edit')editor(entries.find(row=>row.id===button.dataset.id));
  if(action==='new')editor();
  if(action==='add-class'){
   const target=root.querySelector('[data-experience-classes]');
   if(target.children.length>=20)return message('Choose up to 20 ticket classes.',true);
   target.insertAdjacentHTML('beforeend',ticketRow());
  }
  if(action==='remove-class'){
   if(root.querySelectorAll('[data-experience-ticket]').length===1)return message('Keep at least one ticket class.',true);
   button.closest('[data-experience-ticket]').remove();
  }
 };
 root.onchange=event=>{
  if(!canEdit||busy)return;
  if(event.target.name==='serviceIds')renderCutoffs();
 };
}

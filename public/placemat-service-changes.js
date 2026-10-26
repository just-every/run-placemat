import {decisionFields,decisionPayload} from './placemat-service-decisions.js';
/* SERVICE-003: an approved inventory hold preserves every existing commitment. */
export function renderServiceChanges({root,state,refunds=[],canEdit,command,refresh,esc,who,guest,time,notice=()=>{}}) {
 root.style.overflowWrap='anywhere';
 const scopes=[['service','Full service closure'],['room','Room closure'],['arrival','Arrival window closure'],['private','Private table hold']];
 const scopeName=scope=>scopes.find(([id])=>id===scope)?.[1]||scope;
 const services=state.services.filter(service=>service.status==='published'&&!service.closedAt&&Date.parse(service.endAt)>Date.now());
 const serviceName=id=>state.services.find(service=>service.id===id)?.name||id;
 const tableName=id=>state.tables.find(table=>table.id===id)?.label||'Retained table';
 const bookingName=id=>{const b=state.bookings.find(b=>b.id===id);return b?`${guest(b.guestId)?.name||'Erased guest'} · party of ${b.partySize} · ${time(b.startAt)}`:'Retained booking';};
 const options=rows=>rows.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
 const local=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
 const areas=[...new Set(state.tables.filter(table=>!table.retiredAt).map(table=>table.area||'Dining room'))];
 const pending=(state.proposals||[]).filter(proposal=>proposal.kind==='service.closure'&&proposal.status==='pending');
 const list=values=>values.length?`<ul>${values.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`:'<p>None.</p>';
 function planSummary(plan) {
  return `<p>${esc(serviceName(plan.serviceId))} · ${esc(scopeName(plan.scope))}</p><p>${esc(time(plan.startAt))} to ${esc(time(plan.endAt))}${plan.area?` · ${esc(plan.area)}`:''}</p><h5>Exact tables (${plan.tableIds.length})</h5>${list(plan.tableIds.map(tableName))}<h5>Existing booking impacts (${plan.bookingIds.length})</h5>${list(plan.bookingIds.map(id=>`${bookingName(id)} · commitment unchanged`))}`;
 }
 function taskCard(change,task) {
  return `<article class="card" data-service-task="${esc(task.id)}"><h5>${esc(bookingName(task.bookingId))}</h5><p>Owner: ${esc(who(task.ownerId))} · ${esc(task.status==='failed-contact'?'Failed contact recorded':'Open')}</p><p>Reason: ${esc(task.reason)}</p>${task.outcome?`<p>Staff-recorded outcome: ${esc(task.outcome)}</p>`:''}${task.updatedAt?`<p class="help">${esc(task.updatedAt)} · ${esc(who(task.updatedBy))}</p>`:''}${canEdit?`<form data-service-followup data-change-id="${esc(change.id)}" data-task-id="${esc(task.id)}"><div class="form-grid"><label>Follow-up status<select name="status">${[['open','Open'],['failed-contact','Failed contact recorded']].map(([id,name])=>`<option value="${id}"${task.status===id?' selected':''}>${name}</option>`).join('')}</select></label><label>Staff-recorded contact outcome<input name="outcome" required maxlength="500"></label><div class="wide"><button type="submit">Record follow-up</button></div></div></form>${decisionFields({state,refunds,change,task,esc,time})}`:''}</article>`;
 }
 root.innerHTML=`<h3>Closures and private holds</h3><p class="help">Review the exact tables, times and existing booking impacts before approval. Approval stops new allocations in that scope. Existing reservations keep their tables, times and status. Managers own each follow-up. Review relocation offers, explicitly send permitted email, and record cancellation after a confirmed refund in Payments.</p><p data-service-change-message aria-live="polite"></p>${canEdit&&services.length?`<details><summary>Review a closure or private hold</summary><form data-service-closure><fieldset><div class="form-grid"><label>Service to change<select name="serviceId">${options(services.map(service=>[service.id,service.name]))}</select></label><label>Closure or hold scope<select name="scope">${options(scopes)}</select></label><label data-closure-room hidden>Room to close<select name="area" disabled>${options(areas.map(area=>[area,area]))}</select></label><label data-closure-window hidden>Starts (this device’s local date and time)<input name="startAt" type="datetime-local" disabled></label><label data-closure-window hidden>Ends (this device’s local date and time)<input name="endAt" type="datetime-local" disabled></label><label data-closure-tables class="wide" hidden>Exact tables to hold<span class="help">Use Ctrl or ⌘ to select several.</span><select name="tableIds" multiple disabled>${options(state.tables.filter(table=>!table.retiredAt).map(table=>[table.id,`${table.label} · ${table.area||'Dining room'}`]))}</select></label><label class="wide">Closure or hold reason<input name="reason" required maxlength="1000"></label><div class="wide"><button type="submit">Preview closure impacts</button></div></div></fieldset></form></details>`:!services.length?'<p>Publish a service before reviewing a closure.</p>':''}<section data-service-previews><h4>Exact plans awaiting approval (${pending.length})</h4>${pending.map(proposal=>`<article class="card" data-service-proposal="${esc(proposal.id)}"><h4>Review closure impacts</h4>${planSummary(proposal.plan)}<p>Reason: ${esc(proposal.reason)}</p><p class="help">Prepared by ${esc(who(proposal.preparedBy))} · ${esc(proposal.preparedAt)}. Changed inputs require a new preview.</p>${canEdit?`<button type="button" data-approve-service-change="${esc(proposal.id)}">Approve exact closure plan</button>`:''}</article>`).join('')||'<p>No closure plans awaiting approval.</p>'}</section><section data-service-impact-queue><h4>Manager-owned booking impact queue</h4>${(state.serviceChanges||[]).slice().reverse().map(change=>`<article class="card" data-service-change="${esc(change.id)}"><h4>${esc(serviceName(change.serviceId))} · ${esc(scopeName(change.scope))}</h4><p>${esc(time(change.startAt))} to ${esc(time(change.endAt))}</p><p>Reason: ${esc(change.reason)}</p><p class="help">Approved by ${esc(who(change.approvedBy))} · ${esc(change.approvedAt)}</p>${change.tasks.map(task=>taskCard(change,task)).join('')||'<p>No existing bookings were impacted.</p>'}</article>`).join('')||'<p>No approved closures or private holds.</p>'}</section>`;
 function message(text,error=false) {
  const target=root.querySelector('[data-service-change-message]');
  target.textContent=text;target.setAttribute('role',error?'alert':'status');
  notice(text,error?'error':'success');
 }
 for(const button of root.querySelectorAll('button')){button.style.whiteSpace='normal';button.style.maxWidth='100%';}
 async function save(control,name,payload,success) {
  control.disabled=true;
  try {await command(name,payload);await refresh();notice(success,'success');}
  catch(error){message(error.message,true);}
  finally{control.disabled=false;}
 }
 const form=root.querySelector('[data-service-closure]');
 function scopeFields() {
  const scope=form.elements.scope.value,window=scope==='arrival'||scope==='private';
  for(const [selector,enabled] of [['[data-closure-room]',scope==='room'],['[data-closure-window]',window],['[data-closure-tables]',scope==='private']]) {
   for(const label of form.querySelectorAll(selector)) {
    label.hidden=!enabled;label.style.display=enabled?'':'none';const input=label.querySelector('input,select');input.disabled=!enabled;input.required=enabled;
   }
  }
 }
 function serviceTimes() {
  const service=services.find(item=>item.id===form.elements.serviceId.value);
  form.elements.startAt.value=local(service.startAt);form.elements.endAt.value=local(service.endAt);
 }
 if(form){scopeFields();serviceTimes();form.addEventListener('change',event=>{if(event.target.name==='scope')scopeFields();if(event.target.name==='serviceId')serviceTimes();});}
 root.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.matches('[data-service-closure],[data-service-followup],[data-service-action]'))return;
  event.preventDefault();event.stopPropagation();
  try {
   if(form.matches('[data-service-action]')){const {name,payload}=decisionPayload(form);return save(form.querySelector('button'),name,payload,'Decision recorded. Review the current booking and delivery outcome.');}
   if(form.matches('[data-service-followup]')) {
    const outcome=form.elements.outcome.value.trim();if(!outcome)throw new Error('Enter the staff-recorded contact outcome.');
    return save(form.querySelector('button'),'service.followup',{changeId:form.dataset.changeId,taskId:form.dataset.taskId,status:form.elements.status.value,outcome},'Follow-up recorded; booking commitment unchanged.');
   }
   const values=Object.fromEntries(new FormData(form)),plan={serviceId:values.serviceId,scope:values.scope};
   const reason=values.reason.trim();if(!reason)throw new Error('Enter a closure or hold reason.');
   if(values.scope==='room')plan.area=values.area;
   if(values.scope==='private')plan.tableIds=[...form.elements.tableIds.selectedOptions].map(option=>option.value);
   if(values.scope==='arrival'||values.scope==='private') {
    const start=new Date(values.startAt),end=new Date(values.endAt);
    if(!values.startAt||!values.endAt||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('Enter a valid end time after the start time.');
    plan.startAt=start.toISOString();plan.endAt=end.toISOString();
   }
   return save(form.querySelector('fieldset'),'proposal.prepare',{kind:'service.closure',plan,reason},'Exact closure impacts prepared for manager review.');
  }catch(error){message(error.message,true);}
 });
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-approve-service-change]');
  if(!button)return;
  event.stopPropagation();
  save(button,'proposal.approve',{proposalId:button.dataset.approveServiceChange},'Closure approved; existing bookings remain unchanged.');
 });
}

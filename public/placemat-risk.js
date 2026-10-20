/* AGENT-005: managers review recorded facts and own every resulting task. */
export function renderRisk({root,state,api,esc,select,field,empty,who}) {
 const services=state.services;
 if(!services.length){root.innerHTML=empty('Create a service to review no-show flags.');return;}
 const kinds=[['contact','Contact review'],['policy-review','Policy review']];
 const kindName=kind=>kinds.find(([value])=>value===kind)?.[1]||kind;
 const list=(values,none)=>values.length?`<ul>${values.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`:empty(none);
 root.innerHTML=`<h3>No-show review assistant</h3><p class="help">Deterministic review flags use recorded booking facts. They are uncertain prompts for human review, not probabilities or predictions. Protected traits are not used. Nothing automatically cancels a booking or applies fees.</p><form id="risk-filters"><div class="form-grid">${select('No-show review service','serviceId',services.map(service=>[service.id,service.name]))}<div><button type="submit">Open no-show review</button></div></div></form><p data-risk-message aria-live="polite"></p><div id="risk-result" aria-live="polite"></div>`;
 const filter=root.querySelector('#risk-filters'),result=root.querySelector('#risk-result'),message=root.querySelector('[data-risk-message]');
 let request=0;
 function notify(text,error=false){message.textContent=text;message.setAttribute('role',error?'alert':'status');}
 function decisionForm(row) {
  return `<details><summary>Review contact or policy suggestion</summary><p class="help">Accepting creates a manager-owned task only. This does not send contact, change policy, cancel a booking or charge a fee.</p><form data-risk-decide data-booking-id="${esc(row.bookingId)}"><div class="form-grid">${select('Suggested action','kind',kinds)}${select('Manager decision','decision',[['accepted','Accept task'],['declined','Decline suggestion']])}${field('Decision reason','reason','text','','required maxlength="1000"')}${field('Task due (this device’s local date and time)','dueAt','datetime-local','','required')}<div class="wide"><button type="submit">Record manager decision</button></div></div></form></details>`;
 }
 function bookingCard(row) {
  const facts=row.facts;
  return `<article class="card" data-risk-booking="${esc(row.bookingId)}"><h4>${esc(row.guestName)} · ${row.flagged?'Review flagged':'No review flags'}</h4><p>Booking <code>${esc(row.bookingId)}</code> · ${esc(row.startAt)} · Recorded status: ${esc(row.status)}</p><h5>Fact-based review flags</h5>${list(row.flags,'No review flags recorded.')}<p>Booking lead time: ${facts.leadMinutes===null?'Unknown':`${esc(facts.leadMinutes)} minutes`}. Reconfirmation recorded: ${facts.reconfirmed?'Yes':'No'}.</p><details><summary>Attendance and reconfirmation evidence</summary><h5>Recorded attendance</h5>${facts.attendance.length?`<ul>${facts.attendance.map(item=>`<li>Booking <code>${esc(item.bookingId)}</code> · ${esc(item.startAt)} · Recorded status: ${esc(item.status)} · Source: ${item.source==='imported-history'?'Imported history':'Booking record'}</li>`).join('')}</ul>`:empty('No attendance records; attendance is unknown.')}<h5>Staff-recorded reconfirmation outcomes</h5>${facts.reconfirmations.length?`<ul>${facts.reconfirmations.map(item=>`<li>Event <code>${esc(item.eventId)}</code> · Booking <code>${esc(item.bookingId)}</code> · ${esc(item.at)} · Staff-recorded outcome: ${esc(item.outcome)}</li>`).join('')}</ul>`:empty('No reconfirmation events recorded. Absence is not evidence of a no-show.')}</details><h5>Caveats</h5>${list(row.caveats,'No additional caveats supplied.')}${row.status==='booked'?decisionForm(row):''}</article>`;
 }
 function decisionCard(decision,task=false) {
  return `<article class="card" data-risk-decision="${esc(decision.id)}"><h5>${esc(kindName(decision.kind))} · ${esc(decision.decision)}</h5><p>Decision <code>${esc(decision.id)}</code> · Booking <code>${esc(decision.bookingId)}</code></p><p>Manager: ${esc(who(decision.actor))} · Recorded ${esc(decision.at)}${decision.dueAt?` · Due ${esc(decision.dueAt)}`:''}</p><p>Reason: ${esc(decision.reason)}</p><details><summary>Facts retained at decision time</summary><p>Staff-recorded booking status: ${esc(decision.snapshot.status)}</p>${list(decision.snapshot.flags,'No flags in this decision snapshot.')}</details>${decision.completedAt?`<p>Completed ${esc(decision.completedAt)} by ${esc(who(decision.completedBy))} · Staff-recorded outcome: ${esc(decision.outcome)}</p>`:task?`<form data-risk-complete data-decision-id="${esc(decision.id)}"><div class="form-grid">${field('Staff-recorded task outcome','outcome','text','','required maxlength="1000"')}<div><button type="submit">Mark task complete</button></div></div></form>`:''}</article>`;
 }
 async function refresh() {
  const current=++request;
  result.textContent='Loading no-show review…';
  try {
   const report=await api('/api/reports/no-show?'+new URLSearchParams({serviceId:filter.elements.serviceId.value}));
   if(current!==request)return;
   const tasks=report.decisions.filter(decision=>decision.decision==='accepted'&&!decision.completedAt).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
   const m=report.monitoring;
   result.innerHTML=`<p class="help">Generated ${esc(report.generatedAt)}. Recorded timestamps and task deadlines below include their timezone offsets.</p><section class="card"><h4>False-positive monitoring</h4><p>Reviewed with flags: ${esc(m.flagged)} · Attended: ${esc(m.attended)} · No-show: ${esc(m.noShow)} · Pending: ${esc(m.pending)}</p><p class="help">${esc(report.definitions.monitoring)} These are recorded outcomes among reviewed flagged bookings. Attendance can reveal an unnecessary flag; pending bookings have no final outcome. These counts do not measure predictive accuracy.</p></section><section><h4>Manager-owned due tasks (${tasks.length})</h4>${tasks.map(task=>decisionCard(task,true)).join('')||empty('No outstanding accepted tasks.')}</section><section><h4>Booking facts and suggestions</h4>${report.rows.map(bookingCard).join('')||empty('No bookings need review for this service.')}</section><details class="card"><summary>Decision history (${report.decisions.length})</summary>${report.decisions.map(decision=>decisionCard(decision)).join('')||empty('No manager decisions recorded.')}</details>`;
  }catch(error){if(current===request)result.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}
 }
 filter.addEventListener('submit',event=>{event.preventDefault();notify('');refresh();});
 result.addEventListener('change',event=>{
  if(event.target.name!=='decision')return;
  const due=event.target.form.elements.dueAt;
  due.required=event.target.value==='accepted';due.disabled=!due.required;
 });
 result.addEventListener('submit',async event=>{
  const form=event.target;
  if(!form.matches('[data-risk-decide],[data-risk-complete]'))return;
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;notify('Saving manager record…');
  try {
   let command,payload;
   if(form.hasAttribute('data-risk-decide')) {
    command='risk.decide';
    const values=Object.fromEntries(new FormData(form));
    if(!values.reason.trim())throw new Error('Enter a reason for this manager decision.');
    payload={bookingId:form.dataset.bookingId,kind:values.kind,decision:values.decision,reason:values.reason.trim()};
    if(values.decision==='accepted') {
     const due=new Date(values.dueAt);
     if(!values.dueAt||Number.isNaN(due.getTime()))throw new Error('Enter a valid task deadline in this device’s local date and time.');
     payload.dueAt=due.toISOString();
    }
   }else {
    command='risk.complete';
    const outcome=form.elements.outcome.value.trim();
    if(!outcome)throw new Error('Enter the staff-recorded task outcome.');
    payload={decisionId:form.dataset.decisionId,outcome};
   }
   await api('/api/commands',{command,payload});
   notify(command==='risk.complete'?'Task completion recorded.':'Manager decision recorded.');
   await refresh();
  }catch(error){notify(error.message,true);}
  finally{button.disabled=false;}
 });
 refresh();
}

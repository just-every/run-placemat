/* Allocation advice remains conditional until a manager approves an exact plan. */
export function renderAllocation({root,state,api,esc,select,field,empty,tableNames,time,who,onChange}) {
 const services=state.services;
 if(!services.length){root.innerHTML=empty('Create a service to review allocation alternatives.');return;}
 const proposals=new Map((state.proposals||[]).filter(p=>p.kind==='allocation.improve').map(p=>[p.id,p]));
 const errors=new Map(),stale=new Set();
 let report=null,request=0,busy=false;
 const stamp=value=>value?esc(time(value)):'Not recorded';
 const list=values=>`<ul>${values.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`;
 root.innerHTML=`<h3>Allocation alternatives</h3><p class="help">Review table changes against recorded queue demand. Conditional wait estimates are not confirmed seats or promises to guests. A manager must review and approve an exact prepared plan before assignments change.</p><form data-allocation-filter><div class="form-grid">${select('Allocation service','serviceId',services.map(s=>[s.id,s.name]))}<div><button type="submit">Refresh alternatives</button></div></div></form><p data-allocation-message aria-live="polite"></p><div data-allocation-report aria-live="polite"></div><div data-allocation-proposals></div>`;
 const filter=root.querySelector('[data-allocation-filter]'),result=root.querySelector('[data-allocation-report]'),prepared=root.querySelector('[data-allocation-proposals]'),message=root.querySelector('[data-allocation-message]');
 function notify(text,error=false){message.textContent=text;message.setAttribute('role',error?'alert':'status');}
 function counts(before,after) {
  return `<p>Feasible queued covers: <strong>${esc(before.feasibleQueuedCovers)}${after?` → ${esc(after.feasibleQueuedCovers)}`:''}</strong><br>Covers feasible at their requested slot: <strong>${esc(before.requestedSlotCovers)}${after?` → ${esc(after.requestedSlotCovers)}`:''}</strong></p>`;
 }
 function assignment(value) {
  return `${esc(tableNames(value.tableIds))}${value.serverName?` · Server: ${esc(value.serverName)}`:''}${value.sectionName?` · Section: ${esc(value.sectionName)}`:''} · ${value.locked?'Locked':'Unlocked'}`;
 }
 function wait(value) {
  if(!value||!value.earliestAt)return 'No feasible slot found';
  return `${stamp(value.earliestAt)} · ${esc(value.waitMinutes)} min from calculation${value.delayMinutes===null||value.delayMinutes===undefined?'':` · ${esc(value.delayMinutes)} min after requested slot`}`;
 }
 function preview(value) {
  return `${list(value.explanations)}<h5>Booking changes and preserved commitments</h5>${value.affectedBookings.map(row=>{
   const original=row.original;
   return `<article class="card"><p><strong>Booking ${esc(row.bookingId)} · ${esc(row.partySize)} covers</strong></p><p>Before: ${assignment(row.before)}<br>After: ${assignment(row.after)}</p><p>Original arrival: ${stamp(original.startAt)}<br>Original turn ends: ${stamp(original.endAt)}<br>Setup begins: ${stamp(original.setupStartAt)}<br>Cleanup ends: ${stamp(original.cleanupEndAt)}</p><p>Required area: ${esc(original.requiredArea||'No specific area')}<br>Required access: ${esc(original.requiredAccessTags?.join(', ')||'None recorded')}</p></article>`;
  }).join('')||empty('No bookings change.')}<h5>Conditional wait estimates</h5><p class="help">These estimates depend on recorded demand and operational constraints. No queue entry is seated or given a confirmed reservation by this plan.</p>${value.waits.map(row=>`<article class="card"><p>Queue entry <code>${esc(row.waitlistId)}</code> · ${esc(row.partySize)} covers<br>Demand requested for: ${stamp(row.requestedAt)}<br>Requested slot: ${stamp(row.requestedSlotAt)}</p><p>Before: ${wait(row.before)}<br>After: ${wait(row.after)}</p></article>`).join('')||empty('No queued demand to estimate.')}`;
 }
 function renderReport() {
  if(!report)return;
  const current=report.current;
  result.innerHTML=`<p class="help">Generated ${stamp(report.generatedAt)}. Times use the venue timezone.</p>${current?`<section class="card"><h4>Recorded service utilization</h4><p>Seated covers: <strong>${esc(current.seatedCovers)}</strong><br>Booked covers: ${esc(current.bookedCovers)}<br>Physical seats: ${esc(current.physicalSeats)}</p><p class="help">Booked and seated covers count records across this service, not point-in-time floor occupancy. Feasible queued covers below project additional demand across available service time.</p></section>`:''}<section class="card"><h4>Current allocation projection</h4>${counts(report.before)}</section><h4>Demand-based alternatives</h4>${report.alternatives.map((alternative,index)=>`<article class="card"><h4>Alternative ${index+1}</h4>${counts(alternative.before,alternative.after)}${preview(alternative.preview)}<form data-allocation-prepare data-alternative-id="${esc(alternative.id)}" data-service-id="${esc(report.serviceId)}"><div class="form-grid">${field('Reason for this allocation change','reason','text','','required maxlength="1000"')}<div><button type="submit"${busy?' disabled':''}>Prepare allocation</button></div></div></form></article>`).join('')||empty('No actionable allocation changes improve the recorded queue demand while preserving constraints.')}<details><summary>Calculation basis</summary><pre class="code-block">${esc(typeof report.basis==='string'?report.basis:JSON.stringify(report.basis,null,2))}</pre></details>`;
 }
 function renderProposals() {
  const rows=[...proposals.values()].filter(p=>p.plan.serviceId===filter.elements.serviceId.value).reverse();
  prepared.innerHTML=`<h4>Prepared allocation plans</h4>${rows.map(p=>`<article class="card" data-allocation-proposal="${esc(p.id)}"><h4>Allocation ${esc(p.status)}</h4><p>Proposal <code>${esc(p.id)}</code><br>Reason: ${esc(p.reason)}</p><p class="help">Prepared by ${esc(who(p.preparedBy))} · ${stamp(p.preparedAt)}${p.approvedBy?`<br>${p.status==='declined'?'Declined':'Approved'} by ${esc(who(p.approvedBy))} · ${stamp(p.approvedAt)}`:''}</p>${p.plan.preview?preview(p.plan.preview):''}<details><summary>Exact prepared allocation plan</summary><pre class="code-block">${esc(JSON.stringify(p.plan,null,2))}</pre></details>${errors.has(p.id)?`<p role="alert">${esc(errors.get(p.id))}</p>`:''}${stale.has(p.id)?'<p class="help">Refresh alternatives and prepare a new plan before approval. This exact prepared plan has been retained for review.</p>':''}${p.status==='pending'?`<div class="actions"><button type="button" data-allocation-decision="approve" data-proposal-id="${esc(p.id)}"${busy||stale.has(p.id)?' disabled':''}>Approve allocation</button><button type="button" data-allocation-decision="decline" data-proposal-id="${esc(p.id)}"${busy?' disabled':''}>Decline allocation</button></div>`:''}</article>`).join('')||empty('No allocation plan prepared for this service.')}`;
 }
 async function refresh() {
  const current=++request,serviceId=filter.elements.serviceId.value;
  report=null;result.textContent='Loading allocation alternatives…';renderProposals();
  try {
   const next=await api('/api/allocation-advice?'+new URLSearchParams({serviceId}));
   if(current!==request)return;
   report=next;renderReport();
  }catch(error){if(current===request)result.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}
 }
 function setBusy(value) {
  busy=value;root.setAttribute('aria-busy',String(value));
  root.querySelectorAll('button,select,input').forEach(control=>{control.disabled=value;});
  if(!value)renderProposals();
 }
 filter.addEventListener('submit',event=>{event.preventDefault();if(busy)return;notify('');refresh();});
 filter.elements.serviceId.addEventListener('change',()=>{notify('');refresh();});
 result.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-allocation-prepare]');
  if(!form)return;
  event.preventDefault();if(busy)return;
  const reason=form.elements.reason.value.trim();
  if(!reason){notify('Enter a reason for this allocation change.',true);return;}
  setBusy(true);notify('Preparing exact allocation preview…');
  try {
   const response=await api('/api/commands',{command:'proposal.prepare',payload:{kind:'allocation.improve',plan:{serviceId:form.dataset.serviceId,alternativeId:form.dataset.alternativeId},reason}});
   proposals.set(response.result.id,response.result);renderProposals();
   notify('Allocation prepared. Review the exact plan below before approving.');
  }catch(error){notify(error.message,true);}
  finally{setBusy(false);}
 });
 prepared.addEventListener('click',async event=>{
  const button=event.target.closest('[data-allocation-decision]');
  if(!button||busy)return;
  const proposalId=button.dataset.proposalId,decision=button.dataset.allocationDecision;
  setBusy(true);notify(decision==='approve'?'Approving reviewed allocation…':'Declining allocation…');
  try {
   const response=await api('/api/commands',{command:`proposal.${decision}`,payload:{proposalId}});
   proposals.set(proposalId,response.result);errors.delete(proposalId);stale.delete(proposalId);renderProposals();
   notify(decision==='approve'?'Allocation approved and applied.':'Allocation declined.');
   await refresh();
   if(onChange)await onChange(response.result);
  }catch(error){errors.set(proposalId,error.message);if(decision==='approve'&&error.status===409)stale.add(proposalId);renderProposals();notify(error.message,true);}
  finally{setBusy(false);}
 });
 root.setAttribute('aria-busy','false');renderProposals();refresh();
}

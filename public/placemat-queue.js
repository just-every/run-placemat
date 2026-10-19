/* Staff-recorded queue actions. Delivery and reserved capacity are never implied. */
const nextStates={queued:['offered','arrived','declined','abandoned'],offered:['accepted','arrived','declined','expired','abandoned'],accepted:['arrived','declined','expired','abandoned'],arrived:['declined','abandoned']};
const historyDetail=event=>{
 const d=event.details;
 if(!d)return '';
 if(event.action==='priority-changed')return `Priority ${d.before} → ${d.after}`;
 if(Number.isFinite(d.minMinutes)&&Number.isFinite(d.maxMinutes))return `Quoted ${d.minMinutes}–${d.maxMinutes} minutes`;
 if(d.source==='staff-recorded')return 'Staff-recorded offer. Placemat sent no message and reserved no table.';
 if(Number.isFinite(d.actualWaitMinutes))return `Actual queue wait: ${Math.round(d.actualWaitMinutes*10)/10} minutes`;
 return '';
};
export function renderQueue(rows,{esc,who,time,guest,canEdit,form,field,select,seatFields}) {
 const state=row=>row.status==='waiting'?'queued':row.status==='cancelled'?'declined':row.status;
 const hidden=row=>`<input type="hidden" name="waitlistId" value="${esc(row.id)}">`;
 return [...rows].sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.createdAt||'').localeCompare(String(b.createdAt||''))).map(row=>{
  const status=state(row),active=Boolean(nextStates[status]);
  const quote=row.quote?`${row.quote.minMinutes}–${row.quote.maxMinutes} minutes · ${time(row.quote.at)} · ${row.quote.basis}`:'Not quoted';
  const actual=row.actualWaitMinutes==null?'Not recorded':`${Math.round(row.actualWaitMinutes*10)/10} minutes`;
  const tasks=(row.followUps||[]).map(task=>`<div class="card"><p><strong>${esc(task.kind)}</strong> · ${esc(task.status)}<br>${esc(task.reason)}<br>Owner: ${esc(who(task.owner))} · ${esc(time(task.createdAt))}</p>${task.status==='completed'?`<p>${esc(task.outcome)} · ${esc(who(task.completedBy))} · ${esc(time(task.completedAt))}</p>`:canEdit?form('waitlist.followup',hidden(row)+`<input type="hidden" name="followUpId" value="${esc(task.id)}">`+field('Follow-up outcome','outcome','text','','required maxlength="500"'),'Complete follow-up'):''}</div>`).join('');
  const history=(row.history||[]).map(event=>`<p>${esc(event.action)}${event.to?` · ${esc(event.from||'new')} → ${esc(event.to)}`:''}<br>${esc(event.reason)}<br><span class="help">${esc(who(event.actor))} · ${esc(time(event.at))} · Owner: ${esc(who(event.owner))}</span>${historyDetail(event)?`<br><span class="help">${esc(historyDetail(event))}</span>`:''}</p>`).join('')||'<p>Earlier history not recorded.</p>';
  return `<article class="card"><div class="split-heading"><h4>${esc(guest(row.guestId)?.name||'Erased guest')} · ${row.partySize} guests</h4><span class="badge">${esc(status)}</span></div><p class="help">Priority ${row.priority||0} (higher first) · Owner: ${esc(who(row.owner))}<br>Joined: ${row.createdAt?esc(time(row.createdAt)):'Not recorded'}<br>Quoted wait: ${esc(quote)}<br>Actual queue wait: ${esc(actual)}</p>${tasks}${canEdit&&active?`<details><summary>Record queue update</summary><p class="help">Record offers and replies made by staff. Placemat does not send a message or hold a table from this screen. Seating checks current capacity.</p>${form('waitlist.status',hidden(row)+select('Status','status',nextStates[status].map(s=>[s,s]))+field('Reason / contact outcome','reason','text','','required maxlength="500"'),'Record status')}${form('waitlist.quote',hidden(row)+field('Minimum quoted wait (minutes)','quoteMin','number',row.quote?.minMinutes??'','required min="0" max="720"')+field('Maximum quoted wait (minutes)','quoteMax','number',row.quote?.maxMinutes??'','required min="0" max="720"')+field('Basis for estimate','basis','text','','required maxlength="500"'),'Record wait quote')}${form('waitlist.priority',hidden(row)+field('Priority (higher first)','priority','number',row.priority||0,'required min="0" max="1000"')+field('Priority change reason','reason','text','','required maxlength="500"'),'Change priority')}${seatFields?form('waitlist.seat',hidden(row)+seatFields(row),'Seat party'):''}</details>`:''}<details><summary>Queue history</summary>${history}</details></article>`;
 }).join('')||'<p class="empty">The waitlist for this service is empty.</p>';
}
export function queueIntakeFields({field}) {
 return field('No-phone contact arrangement (otherwise assigned for follow-up)','contactReason','text','','maxlength="500"');
}
export function queueCloseForm(service,{esc,form,field,time}) {
 if(service.closedAt)return `<p class="help">Queue closed ${esc(time(service.closedAt))}. Remaining parties have dispositions and assigned follow-up.</p>`;
 return `<details><summary>Close service and queue</summary><p class="help">New booking and queue intake stop. Existing reservations remain. Unanswered offers expire; remaining waiting parties are marked abandoned with assigned follow-up. Seated parties retain their seating history.</p>${form('service.close',`<input type="hidden" name="serviceId" value="${esc(service.id)}">`+field('Close reason / follow-up instructions','reason','text','','required maxlength="500"'),'Close service')}</details>`;
}

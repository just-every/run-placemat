/* Direct human assignment commands and their durable before/after history. */
export function assignmentHistory(booking,state,{esc,time,who,tableNames}) {
 const snapshots=value=>Array.isArray(value)?value:[];
 const rows=state.audit.filter(event=>['booking.move','booking.swap','booking.lock','booking.extend','table.assign','floor.change'].includes(event.action)&&(event.subject===booking.id||snapshots(event.before).some(row=>row.bookingId===booking.id)||snapshots(event.after).some(row=>row.bookingId===booking.id)));
 return `<details class="assignment-history"><summary>Assignment and turn history (${rows.length})</summary>${rows.map(event=>{
  const before=snapshots(event.before).find(row=>row.bookingId===booking.id),after=snapshots(event.after).find(row=>row.bookingId===booking.id);
  const snapshot=row=>`${tableNames(row.tableIds||[])} · ${row.locked?'locked':'unlocked'}${row.setupStartAt?` · setup from ${time(row.setupStartAt)}`:''}${row.combination?` · approved capacity ${row.combination.capacity}`:''}${row.expectedEndAt?` · expected departure ${time(row.expectedEndAt)}`:''}`;
  return `<article class="card"><strong>${esc(event.action.replace('booking.',''))}</strong><p>${esc(who(event.actor))} · ${esc(time(event.at))}${event.reason?`<br>${esc(event.reason)}`:''}</p>${event.action==='booking.extend'?`<p>Expected departure: ${esc(time(event.before.expectedEndAt))} → ${esc(time(event.after.expectedEndAt))}</p>`:''}${before&&after?`<dl class="assignment-diff"><dt>Before</dt><dd>${esc(snapshot(before))}</dd><dt>After</dt><dd>${esc(snapshot(after))}</dd></dl>`:''}</article>`;
 }).join('')||'<p>No direct assignment or turn changes recorded.</p>'}</details>`;
}
export function assignmentEditor(booking,state,version,{esc,guest,time,form,field,select,tableField,who,tableNames,canOperate,canPrepare}) {
 const hidden=`<input type="hidden" name="bookingId" value="${esc(booking.id)}"><input type="hidden" name="version" value="${esc(version)}">`;
 const reason=()=>field('Reason (optional)','reason','text','','maxlength="500"');
 const active=['booked','arrived','seated'].includes(booking.status);
 const choices=state.bookings.filter(row=>row.id!==booking.id&&['booked','arrived','seated'].includes(row.status)).map(row=>[row.id,`${guest(row.guestId)?.name||'Erased guest'} · ${row.partySize} guests · ${tableNames(row.tableIds)} · ${time(row.startAt)}`]);
 return `<article class="card"><h3>${canOperate?'Change assignment':'Assignment details'}</h3><p><strong>${esc(guest(booking.guestId)?.name||'Erased guest')}</strong> · ${booking.partySize} guests · ${esc(time(booking.startAt))}<br>${esc(tableNames(booking.tableIds))} · ${booking.assignmentLocked?'Assignment locked':'Assignment unlocked'}</p>${canOperate&&active?`<p class="help">Each submit applies one change immediately after checking the live floor. A locked party must be unlocked before moving.</p>${!booking.assignmentLocked?form('booking.move',hidden+tableField(booking.tableIds,true)+reason(),'Move party'):''}${!booking.assignmentLocked&&choices.length?`<details><summary>Swap with another party</summary>${form('booking.swap',hidden+select('Other party','otherBookingId',choices)+reason(),'Swap tables')}</details>`:''}${form('booking.lock',hidden+`<input type="hidden" name="locked" value="${!booking.assignmentLocked}">`+reason(),booking.assignmentLocked?'Unlock assignment':'Lock assignment')}`:canPrepare&&active?form('table.assign',hidden+tableField(booking.tableIds,true)+field('Reason','reason','text','','required maxlength="500"'),'Prepare reassignment'):''}${assignmentHistory(booking,state,{esc,time,who,tableNames})}</article>`;
}
export function hostGrant(person,state,{esc,form}) {
 if(person.role!=='member'||person.status!=='active')return '';
 const enabled=!(state.hostIds||[]).includes(person.id);
 return form('team.host',`<input type="hidden" name="operatorId" value="${esc(person.id)}"><input type="hidden" name="enabled" value="${enabled}">`,enabled?'Grant host access':'Remove host access',false,'inline');
}

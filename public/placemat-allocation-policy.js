/* Additional exact manager-reviewed AGENT-004 plans use the existing approval door. */
export function allocationPolicy({esc,field,tableNames,time}) {
 const stamp=at=>esc(time(at));
 const prepare=(kind,serviceId,alternativeId,releaseId)=>`<form data-allocation-prepare data-kind="${kind}" data-service-id="${esc(serviceId)}" data-alternative-id="${esc(alternativeId||'')}" data-release-id="${esc(releaseId||'')}"><div class="form-grid">${field('Reason for this service change','reason','text','','required maxlength="1000"')}<div><button type="submit">Prepare allocation</button></div></div></form>`;
 const explanations=rows=>`<ul>${rows.map(row=>`<li>${esc(row)}</li>`).join('')}</ul>`;
 function preview(kind,plan) {
  if(kind==='inventory.protect'){
   const p=plan.protection;
   return `<h5>${plan.action==='release'?'Release':'Protect'} direct website inventory</h5><p>${esc(tableNames(p.tableIds))} · ${stamp(p.startAt)} to ${stamp(p.endAt)}<br>Fitting party size: ${esc(p.partySize)}</p>${explanations(plan.preview.explanations||[])}<p>No existing booking moves. Website bookings still require a current capacity check.</p>`;
  }
  const p=plan.preview;
  return `<h5>Reviewed shift extension</h5><p>Service end: ${stamp(p.beforeEndAt)} → ${stamp(p.afterEndAt)}</p>${explanations(p.explanations)}<p>Preserved bookings: ${esc((p.unchangedBookingIds||[]).length)}. Every existing arrival, departure, table and access requirement stays unchanged.</p>${(p.waits||[]).map(row=>`<p>Queue ${esc(row.waitlistId)} · ${esc(row.partySize)} covers<br>Before: ${row.before.earliestAt?stamp(row.before.earliestAt):'No feasible slot'}<br>After: ${row.after.earliestAt?stamp(row.after.earliestAt):'No feasible slot'}</p>`).join('')}`;
 }
 function report(data) {
  return `<h4>Protected direct inventory</h4><p class="help">Reserve exact table intervals for website bookings. Walk-in and waitlist seating use other tables until a manager approves release or the interval ends. Projections describe recorded demand; no guest booking is created.</p>${(data.inventory?.protected||[]).map(p=>`<article class="card"><h5>Protected interval</h5><p>${esc(tableNames(p.tableIds))} · ${stamp(p.startAt)} to ${stamp(p.endAt)}</p>${prepare('inventory.protect',data.serviceId,'',p.id)}</article>`).join('')}${(data.inventory?.alternatives||[]).map(a=>`<article class="card">${preview('inventory.protect',{action:'protect',protection:a.protection,preview:a})}${prepare('inventory.protect',data.serviceId,a.id)}</article>`).join('')||'<p>No additional protected interval preserves current queued feasibility.</p>'}<h4>Shift adjustments</h4><p class="help">Extensions retain current staffing, turns, joins and pacing. Conditional queue feasibility is not a guest promise. A manager must confirm that the displayed staffing remains available for the extended shift.</p>${(data.shifts?.alternatives||[]).map(a=>`<article class="card">${preview('service.adjust',a)}${prepare('service.adjust',data.serviceId,a.id)}</article>`).join('')||'<p>No feasible extension improves recorded demand without overlapping another service.</p>'}`;
 }
 return {report,preview};
}

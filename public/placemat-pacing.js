/* Pacing forms and reports render only the supplied venue data. */
export function pacingFields(service,state,{field,esc}) {
 const policy={intervalMinutes:30,arrivalCovers:500,arrivalParties:500,concurrentCovers:500,areaArrivalCaps:{},...service?.pacing};
 const areas=[...new Set(state.tables.map(table=>table.area??'Dining room'))];
 const limits=[['Arrival interval (minutes)','pacingInterval','intervalMinutes',5,120],['Arrival covers per interval','pacingCovers','arrivalCovers',1,500],['Arrival parties per interval','pacingParties','arrivalParties',1,500],['Concurrent dining cover limit','pacingConcurrent','concurrentCovers',1,500]];
 return `<details class="wide"><summary>Service pacing</summary><div class="form-grid">${limits.map(([label,name,key,min,max])=>field(label,name,'number',policy[key],`required min="${min}" max="${max}" step="1"`)).join('')}${areas.map(area=>field(`${area} arrival covers per interval (optional)`,`pacingArea:${esc(area)}`,'number',policy.areaArrivalCaps[area]??'','min="1" max="500" step="1"')).join('')}<p class="help wide">Arrival intervals begin at the service start. Leave an area limit blank to apply only the service limits.</p></div></details>`;
}
export function parsePacing(payload) {
 const policy={areaArrivalCaps:{}};
 for(const [name,key] of [['pacingInterval','intervalMinutes'],['pacingCovers','arrivalCovers'],['pacingParties','arrivalParties'],['pacingConcurrent','concurrentCovers']]) {
  policy[key]=Number(payload[name]);delete payload[name];
 }
 const areas=[];
 for(const name of Object.keys(payload))if(name.startsWith('pacingArea:')) {
  if(String(payload[name]).trim()!=='')areas.push([name.slice('pacingArea:'.length),Number(payload[name])]);
  delete payload[name];
 }
 policy.areaArrivalCaps=Object.fromEntries(areas);
 return policy;
}
function violationList(violations,{esc}) {
 return `<ul>${violations.map(row=>`<li><strong>${esc(row.label)}</strong> <span class="help">(${esc(row.kind)})</span>: limit ${esc(row.limit)} · current ${esc(row.current)} · projected ${esc(row.projected)} · excess ${esc(row.excess)}</li>`).join('')}</ul>`;
}
export function warningLabel(booking,{esc}) {
 return booking.pacingOverride?`<span class="badge" data-status="warning">${esc('Pacing override')}</span>`:'';
}
export function renderPacingWarning(violations,{esc,field}) {
 if(!violations.length)return '';
 return `<div class="card wide"><div role="alert"><h4>Pacing limits exceeded</h4><p>Review every exceeded limit before confirming this override.</p>${violationList(violations,{esc})}</div><div class="form-grid">${field('Pacing override reason','pacingReason','text','','required maxlength="1000"')}<label><input type="checkbox" name="pacingConfirm" value="yes" required> I confirm this pacing override and the exceeded limits above.</label></div></div>`;
}
export function renderPacing(report,state,{esc,time,guest,who}) {
 const parties=ids=>ids.map(id=>state.bookings.find(booking=>booking.id===id)).filter(Boolean);
 const bookingCard=(booking,showOverride=false)=>{
  const override=booking.pacingOverride;
  return `<article class="card"><strong>${esc(guest(booking.guestId)?.name || 'Erased guest')}</strong> ${warningLabel(booking,{esc})}<p>${esc(booking.partySize)} guests · ${esc(time(booking.startAt))} · ${esc(booking.status)}</p>${showOverride&&override?`<p>Override by ${esc(override.actor==='guest'?'Guest booking':who(override.actor))} · ${esc(time(override.at))}<br>${esc(override.reason)}</p>${violationList(override.violations,{esc})}`:''}</article>`;
 };
 const rows=report.intervals.map(interval=>{
  const areas=Object.entries(interval.areas).map(([area,counts])=>`<li>${esc(area)}: ${esc(counts.covers)} / ${esc(counts.limit)} covers${counts.full?' · <strong>Full</strong>':''}</li>`).join('');
  return `<tr><th scope="row">${esc(time(interval.startAt))}<br>to ${esc(time(interval.endAt))}${interval.full?' <span class="badge" data-status="warning">Full</span>':''}</th><td>${esc(interval.covers)} / ${esc(interval.limit)} covers</td><td>${esc(interval.parties)} / ${esc(interval.partyLimit)} parties</td><td>${areas?`<ul>${areas}</ul>`:'No area limits set'}</td><td><details><summary>Bookings (${esc(interval.bookingIds.length)})</summary>${parties(interval.bookingIds).map(booking=>bookingCard(booking)).join('') || '<p>No bookings in this interval.</p>'}</details></td></tr>`;
 }).join('');
 return `<div class="split-heading"><h3>Service pacing</h3><span class="badge">${esc(report.totalCovers)} / ${esc(report.limit)} service covers</span></div><p class="help">As of ${esc(time(report.generatedAt))}. Arrival intervals: ${esc(report.policy.intervalMinutes)} minutes. Concurrent dining cover limit: ${esc(report.policy.concurrentCovers)}.${Object.entries(report.kitchenConcurrentCaps).length?` Kitchen concurrent caps: ${Object.entries(report.kitchenConcurrentCaps).map(([area,cap])=>`${esc(area)} ${esc(cap)}`).join(', ')}.`: ''}</p><div class="table-scroll" tabindex="0" role="region" aria-label="Service pacing by arrival interval; scroll for all columns"><table class="pacing-table"><thead><tr><th>Arrival interval</th><th>Covers / limit</th><th>Parties / limit</th><th>Kitchen areas / limits</th><th>Booking detail</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No arrival intervals in this service.</td></tr>'}</tbody></table></div><details><summary>Pacing overrides (${esc(report.overrideCount)})</summary>${parties(report.overrideBookingIds).map(booking=>bookingCard(booking,true)).join('') || '<p>No pacing overrides recorded.</p>'}</details>`;
}

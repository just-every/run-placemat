import {lateEditor} from './placemat-late.js'
import {requestSummary} from './placemat-requests.js'
/* The timeline renders server-calculated occupancy, observations and collisions. */
export function createTimeline({api,esc,field,select,form,button,time,localTime,canOperate}) {
 let filters=null,lastServiceId='',requestId=0,result,root,currentTimezone;
 const filterSelect=(...args)=>select(...args).replace(' required','');
 const moment=value=>value?esc(time(value)):'Not recorded';
 const pair=(expected,actual)=>`<span>Expected ${moment(expected)}</span><br><span class="muted">Actual ${moment(actual)}</span>`;
 function actions(row) {
  return `${button(canOperate()?'Change assignment':'Assignment history','reassign',row.id)}${canOperate()&&row.status==='seated'?`<details><summary>Extend turn</summary><p class="help">Update the expected departure. Confirmed seating, departure and reset commitments remain in the history.</p>${form('booking.extend',`<input type="hidden" name="bookingId" value="${esc(row.id)}">`+field('Expected departure (venue time)','expectedEndAt','datetime-local',localTime(row.expectedDepartureAt),'required')+field('Reason','reason','text','','required maxlength="1000"'),'Extend expected turn')}</details>`:''}`;
 }
 function party(row) {
  return `<article class="card"><strong>${esc(row.guestName)}</strong> · ${row.partySize} guests · ${esc(row.tableNames.join(', '))}<p>${esc(time(row.startAt))} · ${esc(row.status)}${row.assignmentLocked?' · locked':''}</p><div class="actions">${actions(row)}</div></article>`;
 }
 function header() {
  const h=result.header,average=h.averageActualTurn.minutes;
  return `<div class="timeline-summary" aria-label="Host service summary"><button class="secondary" type="button" data-timeline-drill="seatedCovers"><strong>${h.seatedCovers.covers}</strong> seated covers now</button><button class="secondary" type="button" data-timeline-drill="dueCovers"><strong>${h.dueCovers.covers}</strong> covers due in ${result.nextMinutes} minutes</button><button class="secondary" type="button" data-timeline-drill="averageActualTurn"><strong>${average===null?'No completed turns':`${Math.round(average)} min`}</strong> average actual turn today</button></div><div id="timeline-drilldown" aria-live="polite"></div>`;
 }
 function bars() {
  const start=Date.parse(result.window.startAt),end=Date.parse(result.window.endAt),unit=Number(filters.zoom)*60000,width=Math.max(320,(end-start)/unit*120);
  const ticks=[];
  for(let at=start;at<=end;at+=unit)ticks.push(`<span data-timeline-tick="${(at-start)/unit*120}">${esc(new Intl.DateTimeFormat('en-US',{timeZone:currentTimezone,hour:'numeric',minute:'2-digit'}).format(at))}</span>`);
  const rows=result.rows.map(row=>`<div class="timeline-bar-row"><span class="timeline-bar-name">${esc(row.guestName)} · ${esc(row.tableNames.join(', '))}</span><div class="timeline-track" data-track-width="${width}"><button type="button" class="timeline-turn${row.collisionIds.length?' timeline-collision':''}" data-action="reassign" data-id="${esc(row.id)}" data-bar-start="${Math.max(0,(Date.parse(row.expectedSeatAt)-start)/unit*120)}" data-bar-width="${Math.max(4,(Date.parse(row.expectedDepartureAt)-Date.parse(row.expectedSeatAt))/unit*120)}" title="${esc(`${row.guestName}: ${time(row.expectedSeatAt)} to ${time(row.expectedDepartureAt)}`)}">${row.partySize} guests${row.overdue?' · overdue':''}</button></div></div>`).join('');
  return `<div class="timeline-chart-scroll" tabindex="0" role="region" aria-label="Reservation time bars; scroll horizontally to view all times"><div class="timeline-chart"><div class="timeline-bar-row"><span class="timeline-bar-name">Expected turns</span><div class="timeline-axis" data-track-width="${width}">${ticks.join('')}</div></div>${rows}</div></div>`;
 }
 function render() {
  const areas=result.filters.areas,servers=result.filters.servers;
  root.innerHTML=`<h3>Service timeline</h3><form data-timeline-filter><div class="form-grid">${field('Day (venue date)','date','date',filters.date,'required')}${filterSelect('Service','serviceId',[['','All services'],...root.timelineServices],filters.serviceId)}${field('Search parties or tables','search','search',filters.search,'maxlength="200" placeholder="Name, email, phone suffix, booking ID or table"')}${filterSelect('Booking source','source',[['','All sources'],['online','Online'],['phone','Phone'],['walk-in','Walk-in'],['waitlist','Waitlist']],filters.source)}${filterSelect('Booking status','status',[['','All statuses'],['booked','Booked'],['seated','Seated'],['completed','Completed'],['cancelled','Cancelled'],['no-show','No-show']],filters.status)}${filterSelect('Room','area',[['','All rooms'],...areas.map(area=>[area,area])],filters.area)}${filterSelect('Server','serverId',[['','All servers'],...servers.map(server=>[server,result.filters.serverNames[server] || 'Unnamed server'])],filters.serverId)}${select('Timeline scale','zoom',[[15,'15 minutes per division'],[30,'30 minutes per division'],[60,'1 hour per division'],[120,'2 hours per division'],[240,'4 hours per division']],filters.zoom)}${field('Next arrival window (minutes)','nextMinutes','number',filters.nextMinutes,'required min="0" max="1440"')}<div class="wide"><button type="submit">Apply timeline filters</button></div></div></form>${header()}<p class="help">${result.rows.length} matching reservations. Search includes phone suffixes; all filters combine. As of ${moment(result.now)}. Expected times reflect staff extensions; actual times are recorded observations.</p>${result.rows.length?bars()+`<div class="table-scroll"><table class="timeline-table"><thead><tr><th>Party / assignment</th><th>Arrival</th><th>Seating</th><th>Departure</th><th>Reset</th><th>Attention / actions</th></tr></thead><tbody>${result.rows.map(row=>`<tr data-booking-id="${esc(row.id)}"><td><strong>${esc(row.guestName)}</strong><br>${row.partySize} guests · ${esc(row.tableNames.join(', '))}<br><span class="muted">${esc(row.areas.join(', '))}${row.serverId?` · ${esc(row.serverName || 'Unnamed server')}${row.sectionName?` · ${esc(row.sectionName)}`:''}`:''} · ${esc(row.source)} · ${esc(row.status)}${row.assignmentLocked?' · locked':''}</span>${row.vipLevel!=='none'?`<p class="badge">${esc(row.vipLevel.toUpperCase())}</p>`:''}${row.needLines?.length?`<p>Current declared needs</p>${row.needLines.map(line=>`<p>${esc(line)}</p>`).join('')}<p class="help">Original booking requests</p>`:''}${requestSummary(row.requests,esc)}${row.requiredAccessTags?.length?`<p class="help">Required table access: ${esc(row.requiredAccessTags.join(', '))}</p>`:''}${row.requiredArea?`<p class="help">Required area: ${esc(row.requiredArea)}</p>`:''}</td><td>${pair(row.startAt,row.actualArrivalAt)}</td><td>${pair(row.expectedSeatAt,row.actualSeatAt)}</td><td>${pair(row.expectedDepartureAt,row.actualDepartureAt)}<br><span class="help">Confirmed ${moment(row.endAt)}</span></td><td>${pair(row.expectedResetAt,row.actualResetAt)}</td><td>${(row.paymentRequests||[]).filter(p=>p.state!=='paid').map(p=>`<p class="timeline-alert">Deposit ${esc(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(p.amountCents/100))} · ${esc(p.state)} · Due ${moment(p.dueAt)}</p>`).join('')}${row.pacingOverride?'<p class="timeline-alert">Pacing override</p>':''}${row.late?`<p class="timeline-alert">${Math.round(row.lateMinutes)} min late</p>`:''}${row.overdue?`<p class="timeline-alert">${Math.round(row.overdueMinutes)} min overdue</p>`:''}${row.collisionIds.length?`<p class="timeline-alert">Collision with ${row.collisionIds.map(id=>{const other=result.rows.find(r=>r.id===id);return button(other?`${other.guestName} · ${other.tableNames.join(', ')}`:'Next party','reassign',id)}).join(' ')}</p>`:''}${lateEditor(row,{esc,form,field,select,time,who:id=>id,readOnly:true})}${actions(row)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No reservations match this day and these filters.</p>'}`;
  root.querySelectorAll('[data-track-width]').forEach(el=>el.style.width=`${el.dataset.trackWidth}px`);
  root.querySelectorAll('[data-timeline-tick]').forEach(el=>el.style.left=`${el.dataset.timelineTick}px`);
  root.querySelectorAll('[data-bar-start]').forEach(el=>{el.style.left=`${el.dataset.barStart}px`;el.style.width=`${el.dataset.barWidth}px`;});
 }
 async function load() {
  const current=++requestId,target=root;
  const response=await api('/api/timeline?'+new URLSearchParams(filters));
  if(current!==requestId||!target.isConnected)return;
  result=response;render();
 }
 function listen() {
  root.addEventListener('submit',event=>{
   if(!event.target.matches('[data-timeline-filter]'))return;
   event.preventDefault();filters=Object.fromEntries(new FormData(event.target));
   load().catch(error=>{const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;root.prepend(message);});
  });
  root.addEventListener('click',event=>{
   const el=event.target.closest('[data-timeline-drill]');if(!el)return;
   const names={seatedCovers:'Seated parties now',dueCovers:`Parties due in the next ${result.nextMinutes} minutes`,averageActualTurn:'Completed turns today'};
   const ids=result.header[el.dataset.timelineDrill].bookingIds;
   const parties=ids.map(id=>result.rows.find(row=>row.id===id)).filter(Boolean);
   root.querySelector('#timeline-drilldown').innerHTML=`<h4>${names[el.dataset.timelineDrill]}</h4>${parties.map(party).join('')||'<p>No parties in this total.</p>'}`;
  });
 }
 return {mount:async(target,service,services,timezone)=>{
  root=target;currentTimezone=timezone;
  root.timelineServices=services;
  if(!filters||lastServiceId!==service.id){filters={date:localTime(service.startAt).slice(0,10),serviceId:service.id,search:'',source:'',status:'',area:'',serverId:'',zoom:60,nextMinutes:45};lastServiceId=service.id;}
  root.innerHTML='<h3>Service timeline</h3><p role="status">Loading timeline…</p>';
  listen();
  try{await load();}catch(error){root.innerHTML='<h3>Service timeline</h3><p role="alert"></p>';root.querySelector('p').textContent=error.message;}
 }};
}

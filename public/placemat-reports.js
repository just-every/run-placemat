import {renderPerformance} from './placemat-performance.js';
/* REPORT-001: use the server's rows and definitions for every drilldown and CSV. */
export function renderReports({state,canEdit,api,esc,field,select,empty,polling=false}) {
 const root=document.querySelector('#reports-content');
 if(!canEdit){root.innerHTML=empty('A venue manager can open reservation reports.');return;}
 // Background floor synchronization must not replace a report being read or a saved publication.
 if(polling&&root.querySelector('#reservation-filters'))return;
 const all=rows=>[['','All'],...rows];
 root.innerHTML=`<form id="reservation-filters"><div class="form-grid">${select('Venue','venue',all([[state.venue.name,state.venue.name]]))}${select('Period','period',[['all','All dates'],['past','Past services'],['current','Current services'],['future','Future services']])}${field('Local service date from','dateFrom','date')}${field('Local service date through','dateTo','date')}${select('Shift','serviceId',all(state.services.map(s=>[s.id,s.name])))}${select('Area','area',all([...new Set(state.tables.map(t=>t.area||'Dining room'))].map(a=>[a,a])))}${select('Source','source',all([...new Set(state.bookings.map(b=>b.source))].map(s=>[s,s])))}${select('Status','status',all(['booked','seated','completed','cancelled','no-show'].map(s=>[s,s])))}${field('Smallest party','partyMin','number',1,'min="1" max="20"')}${field('Largest party','partyMax','number',20,'min="1" max="20"')}<div class="wide"><button type="submit">Apply report filters</button></div></div></form><div id="reservation-result" aria-live="polite"></div>`;
 // Report selectors allow the empty "All" choice.
 root.querySelectorAll('select').forEach(el=>el.required=false);
 const form=root.querySelector('form'),result=root.querySelector('#reservation-result');
 const performance=document.createElement('section');performance.id='performance-content';root.append(performance);
 renderPerformance({root:performance,state,api,esc,select,empty});
 async function refresh(){
  const search=new URLSearchParams();for(const [key,value] of new FormData(form))if(value)search.set(key,value);
  result.textContent='Loading reservation report…';
  try{
   const report=await api('/api/reports/reservations?'+search);
   const rows=bookings=>bookings.length?bookings.map(r=>`<article class="card"><h4>${esc(r.service)} · ${r.partySize} guests</h4><p><code>${esc(r.bookingId)}</code></p><p>${esc(new Intl.DateTimeFormat('en-US',{timeZone:report.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(r.startAt)))} · ${esc(r.areas.join(', '))} · ${esc(r.tables.join(', '))}</p><p>${esc(r.source)} · ${esc(r.status)}</p></article>`).join(''):empty('No reservations match these filters.');
   result.innerHTML=`<p class="help">${esc(report.venue)} · ${esc(report.timezone)} · Generated ${esc(report.generatedAt)}. Dates refer to the service start in the venue timezone.</p><p><a class="button-link" href="/api/reports/reservations.csv?${esc(search)}" download>Download matching rows CSV</a></p>${[['booked','Booked'],['attended','Attended'],['cancelled','Cancelled'],['noShow','No-show'],['activeBooked','Still booked'],['pacingOverrides','Pacing overrides']].map(([key,label])=>{const metric=report.summary[key],rate=report.summary.rates[key];return `<details class="card"><summary>${label}: ${metric.covers} covers · ${metric.bookings} reservations${rate?` · ${rate.percentage===null?'No denominator':`${rate.percentage.toFixed(2)}% (${rate.numerator}/${rate.denominator} covers)`}`:''}</summary><p class="help">${esc(metric.definition)}</p>${rows(report.rows.filter(r=>metric.bookingIds.includes(r.bookingId)))}</details>`;}).join('')}<details class="card" open><summary>All matching reservations (${report.rows.length})</summary>${rows(report.rows)}</details>`;
  }catch(error){result.textContent=error.message;result.setAttribute('role','alert');}
 }
 form.addEventListener('submit',event=>{event.preventDefault();refresh();});
 refresh();
}

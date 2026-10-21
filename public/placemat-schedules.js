/* Recurring service editor, using the staff app's existing form components. */
export function scheduleEditor(s, {form,field,select,esc}) {
 const exceptions=s?.exceptions||[];
 return form('schedule.save',`<input type="hidden" name="id" value="${esc(s?.id||'')}">`+
 field('Schedule name','name','text',s?.name||'','required maxlength="120"')+
 select('Shift','shift',['breakfast','lunch','dinner'].map(v=>[v,v]),s?.shift||'dinner')+
 field('Season starts (inclusive)','seasonStart','date',s?.seasonStart||'','required')+
 field('Season ends (inclusive)','seasonEnd','date',s?.seasonEnd||'','required')+
 `<fieldset class="wide"><legend>Weekly days</legend>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((v,i)=>`<label><input type="checkbox" name="weekdays" value="${i}" ${(s?.weekdays||[1,2,3,4,5,6]).includes(i)?'checked':''}> ${v}</label>`).join('')}</fieldset>`+
 field('Starts (venue local time)','startTime','time',s?.startTime||'17:00','required')+
 field('Ends (venue local time)','endTime','time',s?.endTime||'22:00','required')+
 field('Turn duration (minutes)','turnMinutes','number',s?.turnMinutes||90,'required min="15" max="360"')+
 field('Cover limit','coverLimit','number',s?.coverLimit||60,'required min="1" max="500"')+
 field('Start UTC offset, when time repeats (optional)','startOffset','text',s?.startOffset||'','placeholder="-04:00"')+
 field('End UTC offset, when time repeats (optional)','endOffset','text',s?.endOffset||'','placeholder="-05:00"')+
 `<label class="wide">Holiday exceptions: one per line, date closed or date start end [turn minutes] [cover limit] [startOffset=-05:00] [endOffset=-05:00]<textarea name="exceptions" rows="4" placeholder="2027-11-25 14:00 20:00 120 80">${esc(exceptions.map(e=>e.closed?`${e.date} closed`:`${e.date} ${e.startTime} ${e.endTime} ${e.turnMinutes??s.turnMinutes} ${e.coverLimit??s.coverLimit}${e.startOffset?` startOffset=${e.startOffset}`:''}${e.endOffset?` endOffset=${e.endOffset}`:''}`).join('\n'))}</textarea></label>`+
 `<p class="help wide">Dates and shifts use the venue timezone. Holiday exceptions replace that date’s weekly shift, including a day normally closed. End at or before start means the next day. Existing bookings retain their agreed hours and tables after an edit.</p>`,s?'Save schedule changes':'Save recurring schedule');
}
export function parseSchedule(formEl,values){
 if(formEl.dataset.command==='schedule.save'){
  values.weekdays=new FormData(formEl).getAll('weekdays').map(Number);
  values.exceptions=String(values.exceptions||'').trim().split('\n').filter(Boolean).map(line=>{
   const words=line.trim().split(/\s+/),offsets={},numbers=[];
   for(const word of words.slice(3)){const m=/^(startOffset|endOffset)=(.+)$/.exec(word);if(m&&!(m[1] in offsets))offsets[m[1]]=m[2];else numbers.push(word);}
   const [date,startTime,endTime]=words,[turnMinutes,coverLimit,...extra]=numbers;
   if(startTime==='closed'&&!endTime)return {date,closed:true};
   if(!endTime||extra.length)throw new Error('Use holiday lines such as 2027-11-25 14:00 20:00 120 80, 2027-11-07 01:30 04:00 startOffset=-05:00 for a repeated hour, or 2027-11-25 closed.');
   return {date,closed:false,startTime,endTime,...(turnMinutes?{turnMinutes:Number(turnMinutes)}:{}),...(coverLimit?{coverLimit:Number(coverLimit)}:{}),...offsets};
  });
  if(!values.startOffset)delete values.startOffset;if(!values.endOffset)delete values.endOffset;
 }
 if(formEl.dataset.command==='schedule.preview')values.renewServiceIds=new FormData(formEl).getAll('renewServiceIds');
}
export function renderSchedules(state,{canEdit,form,field,select,esc,button}){
 const schedules=state.schedules||[];
 return `<h3>Recurring shifts & seasons</h3><p class="help">Create weekly breakfast, lunch and dinner schedules. Preview each batch before publication; edits require a new review.</p>${schedules.map(s=>`<article class="card"><h4>${esc(s.name)} · ${esc(s.shift)}</h4><p>${esc(s.seasonStart)} through ${esc(s.seasonEnd)} · ${esc(s.startTime)}–${esc(s.endTime)} · version ${s.version}</p>${canEdit?button('Edit schedule','edit-schedule',s.id):''}</article>`).join('')}${canEdit?`<div id="schedule-editor"><details><summary>Create recurring schedule</summary>${scheduleEditor(null,{form,field,select,esc})}</details></div>${schedules.length?form('schedule.preview',field('Preview from (inclusive)','fromDate','date',schedules[0].seasonStart,'required')+field('Preview through (inclusive, up to 31 days per batch)','toDate','date',schedules[0].seasonStart,'required')+field('Review reason','reason','text','','required maxlength="1000"')+`<p class="help wide">Preview all schedules. You can publish successive batches to cover a longer season. Existing services that differ are shown for renewed approval; booked commitments are preserved.</p>`,'Preview generated services'):''}`:''}`;
}
export function schedulePlan(plan,{esc,time,field}){
 return `<p>${esc(plan.fromDate)} through ${esc(plan.toDate)} · ${esc(plan.timezone)}</p>${(plan.candidates||[]).map(c=>`<article class="card"><h4>${esc(c.service?.name||c.localDate)} · ${esc(c.action)}</h4><p>${esc(c.localDate)}${c.service?` · ${esc(time(c.service.startAt))} to ${esc(time(c.service.endAt))}`:''}</p><p>${c.capacity?.seats??0} physical seats · ${c.capacity?.coverLimit??0} service covers</p>${c.preserved?`<p>${plan.requiresRenewedApproval?.find(r=>r.serviceId===c.existingServiceId)?.manualReviewRequired?'Existing bookings preserved. A manager must handle affected bookings separately.':'Existing published settings remain until explicitly renewed.'}</p>`:''}</article>`).join('')}${(plan.conflicts||[]).map(c=>`<p role="alert">Conflict: ${esc(c.message)}</p>`).join('')}${(plan.requiresRenewedApproval||[]).length?`<h4>Services needing renewed approval</h4><form data-command="schedule.preview"><input type="hidden" name="fromDate" value="${esc(plan.fromDate)}"><input type="hidden" name="toDate" value="${esc(plan.toDate)}">${plan.requiresRenewedApproval.map(r=>`<label>${!r.manualReviewRequired?`<input type="checkbox" name="renewServiceIds" value="${esc(r.serviceId)}">`:''}${esc(r.localDate)} · ${esc(r.reason)}${r.manualReviewRequired?' · bookings preserved; separate service-change review required':''}</label>`).join('')}${field('Review reason','reason','text','','required maxlength="1000"')}<button type="submit">Preview selected renewals</button></form>`:''}`;
}

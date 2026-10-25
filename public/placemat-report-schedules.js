/* Report configuration lives beside the existing group grants in Settings. */
export async function mountReportSchedules(root,{api,esc,field,notice}) {
 let data;
 try { data=await api('/api/report-schedules'); } catch { root.remove(); return; }
 const names=id=>data.recipients.find(r=>r.id===id)?.name||'Recipient no longer permitted';
 const venues=ids=>ids.map(id=>data.venues.find(v=>v.id===id)?.name||'Disconnected venue').join(', ');
 root.innerHTML=`<details id="report-schedule-settings"><summary>Weekly report delivery</summary><p>Approve one group manager for each weekly email. A personal owner must first approve the recipient address by creating a schedule; managers can then reuse that approval. Reports contain cover totals only. Links require that person to sign in; access is rechecked for every send and download.</p><form id="report-schedule-create"><div class="form-grid"><label>Approved recipient<select name="recipientId" required>${data.recipients.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>${field('First delivery (UTC)','nextAt','datetime-local','','required step="60"')}<fieldset class="wide"><legend>Compare venues</legend>${data.venues.map(v=>`<label class="inline"><input type="checkbox" name="venueId" value="${esc(v.id)}"> ${esc(v.name)}</label>`).join('')}</fieldset><label class="wide inline"><input type="checkbox" name="acknowledged" required> I approve this recipient and weekly email delivery.</label><div class="wide"><button>Approve weekly report</button></div></div></form><div id="report-schedule-list">${data.schedules.map(s=>`<article class="card"><h4>${esc(names(s.recipient_id))}</h4><p>${esc(venues(s.venues))}</p><p>${s.enabled?'Next email: '+esc(s.next_at)+' · repeats every seven days at this UTC time':'Schedule stopped'}<br>Seven complete service dates before each due date in ${esc(s.timezone)}; each venue uses its own timezone for those dates.</p>${s.enabled?`<button class="secondary" data-stop-report="${esc(s.id)}">Stop weekly report</button>`:''}${data.deliveries.filter(d=>d.schedule_id===s.id).map(d=>`<p>${esc(d.date_from)} through ${esc(d.date_to)} · <strong>${esc(d.state)}</strong>${d.state==='provider accepted'?' · mailbox delivery unconfirmed':''}${d.reason?' · '+esc(d.reason):''}</p>${s.enabled&&d.state==='delivery unconfirmed'?`<form data-resend-report="${esc(s.id)}"><input type="hidden" name="deliveryId" value="${esc(d.id)}"><label class="inline"><input type="checkbox" name="acknowledged" required> The previous email may have arrived. I approve another attempt.</label><button class="secondary">Resend report manually</button></form>`:''}`).join('')}</article>`).join('')||'<p>No weekly reports approved.</p>'}</div><p role="status" aria-live="polite" id="report-schedule-notice"></p></details>`;
 const result=root.querySelector('#report-schedule-notice');
 root.onsubmit=async event=>{
  const form=event.target.closest('form');if(!form)return;event.preventDefault();event.stopPropagation();
  const values=new FormData(form),button=form.querySelector('button');button.disabled=true;
  try {
   if(form.id==='report-schedule-create')await api('/api/report-schedules',{recipientId:values.get('recipientId'),venueIds:values.getAll('venueId'),nextAt:values.get('nextAt')+':00.000Z',acknowledged:values.get('acknowledged')==='on'});
   else await api('/api/report-schedules/resend',{scheduleId:form.dataset.resendReport,deliveryId:values.get('deliveryId'),acknowledged:values.get('acknowledged')==='on'});
   await mountReportSchedules(root,{api,esc,field,notice});root.querySelector('details').open=true;root.querySelector('#report-schedule-notice').textContent='Report schedule saved.';
  } catch(error) { result.textContent=error.message;button.disabled=false; }
 };
 root.querySelectorAll('[data-stop-report]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;
  try {await api('/api/report-schedules/stop',{scheduleId:button.dataset.stopReport});await mountReportSchedules(root,{api,esc,field,notice});root.querySelector('details').open=true;}catch(error){result.textContent=error.message;button.disabled=false;}
 }));
}

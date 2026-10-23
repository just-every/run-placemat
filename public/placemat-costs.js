const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),usd=micros=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(micros/1000000)
async function api(path,body){const r=await fetch('/api/costs'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined),v=await r.json();if(!r.ok)throw Error(v.error||'Request failed.');return v}
function quote(f,key){const value=f.get(key);if(value==='')return null;if(!/^\d+(\.\d{1,6})?$/.test(value))throw Error('Rates need up to six decimal places.');const [whole,fraction='']=value.split('.');return {micros:Number(whole)*1000000+Number(fraction.padEnd(6,'0')),source:f.get(key+'Source'),date:f.get(key+'Date')}}
let loadedMonth;
async function refresh(){
 const v=await api('?month='+$('#month').value)
 if(loadedMonth!==v.month){$('#budget input').value=v.budget?.amountCents??10000;loadedMonth=v.month}
 $('#usage').textContent=`${v.usage.approvedReminders} approved reminders; ${v.usage.exportedReminders} exported; ${v.usage.paidDeposits.count} paid deposits (${usd(v.usage.paidDeposits.grossCents*10000)} gross). ${v.usage.scope}`
 $('#budget-status').textContent=v.budget?`Budget ${usd(v.budget.amountCents*10000)}. Recorded invoices ${usd(v.invoiceCents*10000)}. ${v.alert.invoiceExceeded?'Invoice budget exceeded. ':''}${v.alert.forecastExceeded?'Forecast budget exceeded. ':''}`:'No budget alert set.'
 const latest=v.previews.at(-1)
 $('#forecast').innerHTML=latest?`<h3>Latest saved estimate · ${esc(latest.createdAt)}</h3><p>Known subtotal ${usd(latest.data.totalMicros)} USD: SMS ${usd(latest.data.smsMicros)}, distribution ${usd(latest.data.distributionMicros)}, domestic card processing ${usd(latest.data.processorMicros)}; entered promotion and hosting included.</p><p>Unknown or excluded: ${esc(latest.data.unknown.join('; '))}.</p><p>${esc(latest.data.basis)}</p>`:'<p>No saved forecast yet.</p>'
 const selection=$('[name=previewId]'),selected=selection.value
 selection.innerHTML=v.previews.map(p=>`<option value="${esc(p.id)}">${esc(p.createdAt)} · ${usd(p.data.totalMicros)} known subtotal</option>`).join('');if(v.previews.some(p=>p.id===selected))selection.value=selected
 $('#invoices').innerHTML=v.invoices.map(i=>`<article><h3>${esc(i.reference)} · ${esc(i.data.provider)}</h3><p>${esc(i.data.units)} ${esc(i.data.unitLabel)} · provider costs ${usd(i.data.costCents*10000)}; processor fees ${usd(i.data.processorFeeCents*10000)}; total ${usd(i.data.totalCents*10000)} USD.</p><p>Planned units ${esc(i.data.plannedUnits??'unknown')}; observed units ${esc(i.data.actualUnits??'unknown')}; usage difference ${esc(i.data.usageVariance??'unknown')}. ${esc(i.data.usageBasis)}</p><p>Linked preview variance ${usd(i.data.varianceMicros)}. ${esc(i.data.basis)}</p><p>Evidence: ${esc(i.data.evidence)}</p></article>`).join('')
}
for(const name of ['preview','budget','invoice'])$('#'+name).addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');if(button)button.disabled=true;try{const f=new FormData(form),p={month:$('#month').value};for(const [key,value]of f)p[key]=value
 if(name==='preview'){for(const key of ['reminders','segments','covers','payments','grossCents'])p[key]=Number(p[key]);for(const key of ['carrier','cover','promotion','hosting'])p[key]=quote(f,key)}
 if(name==='budget')p.amountCents=Number(p.amountCents)
 if(name==='invoice'){for(const key of ['units','costCents','processorFeeCents'])p[key]=Number(p[key]);p.acknowledge=f.has('acknowledge')}
 await api('/'+name,p);await refresh();$('#notice').textContent={preview:'Cost preview saved.',budget:'Budget alert saved.',invoice:'Owner-entered reconciliation recorded.'}[name]
 }catch(e){$('#notice').textContent=e.message}finally{if(button)button.disabled=false}})
$('#budget input').addEventListener('change',()=>$('#budget').requestSubmit());
$('#month').addEventListener('change',()=>refresh().catch(e=>$('#notice').textContent=e.message));refresh().catch(e=>$('#notice').textContent=e.message)

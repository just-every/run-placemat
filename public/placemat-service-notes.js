/* Uses the existing operations form and card components. */
export function serviceNotes(state,service,{esc,form,field,select,canEdit,canReadShift,who,time}){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:state.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt))
 const notes=(state.serviceNotes||[]).filter(n=>n.date===date&&(canReadShift||n.kind==='kitchen'))
 const items=service.preorderItems||[]
 return `<article class="card" aria-label="Service notes"><h3>Service notes · ${esc(date)}</h3><a href="/kitchen?serviceId=${encodeURIComponent(service.id)}">Open kitchen view</a>${notes.map(n=>`<h4>${n.kind==='shift'?'Shift note':'Kitchen note'}</h4><p>${esc(n.history.at(-1).text)}</p><details><summary>Author, time and history</summary>${n.history.map(e=>`<p>${esc(e.text)}<br>${esc(who(e.actor))} · ${esc(time(e.at))}</p>`).join('')}</details>`).join('')||'<p>No notes for this date.</p>'}${canEdit?`<details><summary>Add or edit notes</summary>${form('service.note',`<input type="hidden" name="date" value="${date}">`+select('Note type','kind',[['kitchen','Kitchen'],['shift','Shift']])+field('Note text','text','text','','required maxlength="2000"'),'Save service note')}</details><details><summary>Unpaid pre-order dishes</summary><p>Publishing a dish offers an unpaid request at booking. Names stay fixed for historical totals. Manager counts are separate from guest quantities.</p>${form('service.preorder-item',`<input type="hidden" name="serviceId" value="${esc(service.id)}">`+field('Dish name','name','text','','required maxlength="120"'),'Publish dish')}${items.map(i=>`<p>${esc(i.name)} · ${i.active?'Published':'Withdrawn'}</p>${form('service.preorder-active',`<input type="hidden" name="serviceId" value="${esc(service.id)}"><input type="hidden" name="itemId" value="${esc(i.id)}"><input type="hidden" name="active" value="${!i.active}">`,i.active?'Withdraw dish':'Publish dish again')}`).join('')}${items.length?form('service.preorder-count',`<input type="hidden" name="serviceId" value="${esc(service.id)}">`+select('Dish','itemId',items.map(i=>[i.id,i.name]))+field('Manager-entered quantity','quantity','number',0,'required min="0" max="500"'),'Save manager count'):''}</details>`:''}</article>`
}
export function preorderFields(items,{esc,field}){
 const active=(items||[]).filter(i=>i.active)
 return active.length?`<fieldset class="wide"><legend>Unpaid dish pre-orders</legend><p>Guest-supplied requests; no payment or safe preparation is confirmed.</p>${active.map(i=>field(`${i.name} quantity (optional)`,'preorder-'+i.id,'number',0,'min="0" max="50"')).join('')}</fieldset>`:''
}
export function readPreorders(form,items){
 const data=new FormData(form)
 return (items||[]).filter(i=>i.active&&Number(data.get('preorder-'+i.id))>0).map(i=>({itemId:i.id,quantity:Number(data.get('preorder-'+i.id))}))
}
export function preorderSummary(items,esc){return items?.length?`<p>Guest-supplied unpaid pre-orders: ${items.map(i=>`${esc(i.itemName)} × ${i.quantity}`).join(', ')}</p>`:''}

export function delegationSettings(state,people,{esc,field,select,form}){
 const managers=people.filter(p=>p.status==='active'&&p.role==='admin'),readers=people.filter(p=>p.status==='active'&&(p.role==='admin'||(state.leadIds||[]).includes(p.id)));
 return `<details><summary>Manager limits & report scopes</summary><p>Refund limits are integer USD cents per booking, including pending and succeeded refunds submitted by that manager. Without a limit a manager cannot refund; owners are uncapped. Shift leads can review seating exceptions, read only explicitly granted service reports, and cannot export or manage providers.</p>${managers.length?form('team.manager-limit',select('Manager','operatorId',managers.map(p=>[p.id,p.displayName]))+field('Refund authority limit (USD cents)','refundLimitCents','number',10000,'required min="0" max="100000000"'),'Save refund authority limit'):'<p>Invite a manager to record a limit.</p>'}${Object.entries(state.managerRefundLimits||{}).map(([id,cents])=>`<p>${esc(people.find(p=>p.id===id)?.displayName||'Manager')}: $${(cents/100).toFixed(2)} refund authority per booking.</p>`).join('')}${readers.length?form('team.reports',select('Report viewer','operatorId',readers.map(p=>[p.id,p.displayName]))+`<label>Permitted report services<select name="serviceIds" multiple>${state.services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><p>Choose none to deny reports. A scoped viewer must select a permitted shift. Existing managers retain venue-wide reports until explicitly scoped.</p>`,'Save report scope'):'<p>Invite a manager or grant a shift lead for scoped reports.</p>'}</details>`;
}
export function leadGrant(person,state,{esc,form}){
 if(person.role!=='member'||person.status!=='active')return '';
 const enabled=!(state.leadIds||[]).includes(person.id);
 return form('team.lead',`<input type="hidden" name="operatorId" value="${esc(person.id)}"><input type="hidden" name="enabled" value="${enabled}">`,enabled?'Grant seating lead':'Remove seating lead',false,'inline');
}
export function serverGrant(person,state,{esc,form}){
 if(person.role!=='member'||person.status!=='active'||!(state.serverIds||[]).includes(person.id)&&((state.hostIds||[]).includes(person.id)||(state.leadIds||[]).includes(person.id)))return '';
 const enabled=!(state.serverIds||[]).includes(person.id);
 return form('team.server',`<input type="hidden" name="operatorId" value="${esc(person.id)}"><input type="hidden" name="enabled" value="${enabled}">`,enabled?'Grant server access':'Remove server access',false,'inline');
}

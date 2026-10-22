/* Shift staffing, cover totals and rotation share the floor's existing cards and forms. */
export function servingLabel(assignment) {
  return assignment ? [assignment.sectionName,assignment.serverName].filter(Boolean).join(' · ') || 'Unassigned' : 'Unassigned';
}
export function servingHistory(booking,{esc,time,who}) {
  const rows=booking.servingHistory || [];
  return `<details class="serving-history"><summary>Serving history (${rows.length})</summary>${rows.map(row=>`<article class="card"><strong>${esc(servingLabel(row.from))} → ${esc(servingLabel(row.to))}</strong><p>${esc(row.actor==='guest'?'Guest booking':who(row.actor))} · ${esc(time(row.at))}${row.reason?`<br>${esc(row.reason)}`:''}</p><p class="help">${esc(row.action.replaceAll('.',' '))}</p></article>`).join('') || '<p>No serving changes recorded.</p>'}</details>`;
}
export function createStaffing({api,esc,field,select,form,button,guest,time,who,tableNames,canEdit,canOperate,servers:signedInServers=()=>[]}) {
  let root,state,service,result,requestId=0,partySize=2,lastServiceId='';
  const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
  const shiftFields=()=>hidden('serviceId',service.id);
  function serverEditor(server) {
    return `<details${server?' open':''}><summary>${server?'Edit server':'Add server'}</summary>${form('server.save',shiftFields()+hidden('id',server?.id || '')+field('Server name','name','text',server?.name || '','required maxlength="80"')+field('Concurrent cover cap','coverCap','number',server?.coverCap ?? 20,'required min="1" max="500"')+select('Signed-in person','operatorId',[['','Not linked'],...signedInServers().map(person=>[person.id,person.displayName])],server?.operatorId || '',''),'Save server')}</details>`;
  }
  function sectionEditor(section) {
    const tables=state.tables.filter(table=>!table.retiredAt);
    const choices=`<label class="wide">Section tables<span class="help">Choose the tables this server will cover. Use Ctrl or ⌘ to choose several. Each table belongs to one section in this service.</span><select name="tableIds" multiple required>${tables.map(table=>`<option value="${esc(table.id)}"${section?.tableIds.includes(table.id)?' selected':''}>${esc(table.label)} · ${table.seats} seats · ${esc(table.area || 'Dining room')}</option>`).join('')}</select></label>`;
    return `<details${section?' open':''}><summary>${section?'Edit section':'Add section'}</summary>${form('section.save',shiftFields()+hidden('id',section?.id || '')+field('Section name','name','text',section?.name || '','required maxlength="80"')+select('Server','serverId',result.servers.map(server=>[server.id,server.name]),section?.serverId)+choices+'<p class="help wide">Active parties keep their serving assignment. Move or finish those parties before changing the section tables or server.</p>','Save section',!result.servers.length || !tables.length)}</details>`;
  }
  function breakForm(server) {
    return `<details><summary>${server.onBreak?'Return from break':'Record break'}</summary><p class="help">A break removes this server from rotation. Current parties retain their serving assignment.</p>${form('server.break',shiftFields()+hidden('serverId',server.id)+hidden('onBreak',!server.onBreak)+field('Break / return reason','reason','text','','required maxlength="1000"'),server.onBreak?'Return to rotation':'Start break')}</details>`;
  }
  function parties(ids) {
    return ids.map(id=>state.bookings.find(booking=>booking.id===id)).filter(Boolean).map(booking=>`<article class="card"><strong>${esc(guest(booking.guestId)?.name || 'Erased guest')}</strong><p>${booking.partySize} guests · ${esc(tableNames(booking.tableIds))}<br>${esc(time(booking.startAt))} · ${esc(booking.status)}<br>${esc(servingLabel(booking))}</p>${button(canOperate()?'Change assignment':'Assignment details','reassign',booking.id)}${servingHistory(booking,{esc,time,who})}</article>`).join('') || '<p>No parties in this total.</p>';
  }
  function render() {
    const editable=canEdit(),servers=result.servers;
    const sections=result.sections.map(section=>`<article class="card" data-section-id="${esc(section.id)}"><div class="split-heading"><h4>${esc(section.name)}</h4>${editable?button('Edit section','edit-section',section.id):''}</div><p>${esc(servers.find(server=>server.id===section.serverId)?.name || 'Unassigned')} · ${esc(tableNames(section.tableIds))}</p><p>${section.seatedCovers} seated covers · ${section.expectedCovers} expected covers</p></article>`).join('');
    const caps=Object.entries(result.kitchenAreaCaps).map(([area,cap])=>`<li>${esc(area)}: ${cap} concurrent covers</li>`).join('');
    const areas=[...new Set(state.tables.filter(table=>!table.retiredAt).map(table=>table.area || 'Dining room'))];
    root.innerHTML=`<div class="split-heading"><h3>Sections and servers</h3><span class="badge">${esc(service.name)}</span></div><p class="help">As of ${esc(time(result.now))}. Server names belong to this shift. Expected covers include all booked and seated parties in this shift. Seated covers count currently seated parties. Caps apply to overlapping dining covers.</p><form data-staffing-query><div class="form-grid">${field('Next party size','partySize','number',partySize,'required min="1" max="500"')}<div class="wide"><button type="submit" class="secondary">Check rotation</button></div></div></form><div id="staffing-rotation"><h4>Suggested rotation · ${partySize} guests</h4><p class="help">For arrival ${esc(time(result.startAt))}. Eligible servers are ordered by seated covers, then oldest last seating.</p>${result.rotation.length?`<ol>${result.rotation.map(id=>`<li>${esc(servers.find(server=>server.id===id)?.name || 'Unassigned')}</li>`).join('')}</ol>`:'<p>No server can take this party. Review the reasons below.</p>'}</div><div class="staffing-servers">${servers.map(server=>`<article class="card" data-server-id="${esc(server.id)}"><div class="split-heading"><h4>${esc(server.name)}</h4><span class="badge">${server.onBreak?'On break':server.eligible?'In rotation':'Unavailable'}</span></div><div class="staffing-totals"><button type="button" class="secondary" data-staffing-drill="seated" data-server-id="${esc(server.id)}"><strong>${server.seatedCovers}</strong> seated covers</button><button type="button" class="secondary" data-staffing-drill="expected" data-server-id="${esc(server.id)}"><strong>${server.expectedCovers}</strong> expected covers</button></div><p>Concurrent cap: ${server.coverCap}${server.operatorId?`<br>Signed in as ${esc(who(server.operatorId))}`:''}<br>Tables: ${esc(tableNames(server.tableIds)) || 'No section tables'}<br>Last seated: ${server.lastSeatedAt?esc(time(server.lastSeatedAt)):'No seating recorded'}</p>${server.issues.length?`<ul class="help">${server.issues.map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul>`:''}${editable?`${button('Edit server','edit-server',server.id)}${breakForm(server)}`:''}</article>`).join('') || '<p>Add servers and sections for this service to start a rotation.</p>'}</div><div id="staffing-parties" aria-live="polite"></div><h4>Section tables</h4>${sections || '<p>No sections assigned for this service.</p>'}${editable?`<div class="columns"><div id="server-editor">${serverEditor()}</div><div id="section-editor">${sectionEditor()}</div></div>`:''}<details><summary>Kitchen area caps</summary>${caps?`<ul>${caps}</ul>`:'<p>No kitchen area caps set for this service.</p>'}${editable?form('kitchen.save',shiftFields()+select('Kitchen area','area',areas.map(area=>[area,area]))+field('Concurrent kitchen cover cap','coverCap','number','','required min="1" max="500"'),'Save kitchen limit',!areas.length):''}</details>`;
  }
  async function load() {
    const current=++requestId,target=root;
    target.setAttribute('aria-busy','true');
    try {
      const next=await api('/api/sections?'+new URLSearchParams({serviceId:service.id,partySize}));
      if(current!==requestId || !target.isConnected)return;
      result=next;render();
    } catch(error) {
      if(current!==requestId || !target.isConnected)return;
      target.innerHTML='<h3>Sections and servers</h3><p role="alert"></p>';
      target.querySelector('p').textContent=`Staffing could not be loaded. ${error.message} Refresh the venue to retry.`;
    } finally { target.removeAttribute('aria-busy'); }
  }
  function listen() {
    root.addEventListener('submit',event=>{
      if(!event.target.matches('[data-staffing-query]'))return;
      event.preventDefault();partySize=Number(new FormData(event.target).get('partySize'));load();
    });
    root.addEventListener('click',event=>{
      const edit=event.target.closest('[data-action="edit-server"],[data-action="edit-section"]');
      if(edit && canEdit()) {
        event.stopPropagation();
        const server=edit.dataset.action==='edit-server';
        const target=root.querySelector(server?'#server-editor':'#section-editor');
        target.innerHTML=server?serverEditor(result.servers.find(row=>row.id===edit.dataset.id)):sectionEditor(result.sections.find(row=>row.id===edit.dataset.id));
        target.scrollIntoView({block:'center'});return;
      }
      const drill=event.target.closest('[data-staffing-drill]');
      if(!drill)return;
      const server=result.servers.find(row=>row.id===drill.dataset.serverId);
      const ids=drill.dataset.staffingDrill==='seated'?server.seatedBookingIds:server.expectedBookingIds;
      const target=root.querySelector('#staffing-parties');
      target.innerHTML=`<h4>${esc(server.name)} · ${drill.dataset.staffingDrill==='seated'?'Seated':'Expected'} parties</h4>${parties(ids)}`;
      target.scrollIntoView({block:'nearest'});
    });
  }
  return {mount(target,nextState,nextService) {
    root=target;state=nextState;service=nextService;
    if(lastServiceId!==service.id){partySize=2;lastServiceId=service.id;}
    root.innerHTML='<h3>Sections and servers</h3><p role="status">Loading cover totals…</p>';
    listen();return load();
  }};
}

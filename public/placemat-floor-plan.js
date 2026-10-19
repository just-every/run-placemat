/* Physical rooms and reviewed floor changes use the existing manager controls. */
export const activeTables = state => state.tables.filter(table => !table.retiredAt);
export const roomNames = state => [...new Set([...(state.rooms || []).map(room => room.name), ...activeTables(state).map(table => table.area || 'Dining room')])];
const shapes = [['round','Round'],['square','Square'],['rectangle','Rectangle'],['bar','Bar']];
export function roomEditor(room, {esc,field,select,form}) {
  return `<details${room ? ' open' : ''}><summary>${room ? `Edit ${esc(room.name)}` : 'Add room'}</summary>${form('room.save', `<input type="hidden" name="id" value="${esc(room?.id || '')}">` + field('Room name','name','text',room?.name || '', 'required maxlength="80"') + select('Room type','kind',[['indoor','Indoor'],['outdoor','Outdoor'],['bar','Bar']],room?.kind || 'indoor'),'Save room')}</details>`;
}
export function renderRooms(state, editable, helpers) {
  const {esc,button,empty} = helpers;
  return `<section aria-label="Rooms"><h3>Rooms</h3>${(state.rooms || []).map(room => `<article class="card"><div class="split-heading"><h4>${esc(room.name)}</h4><span class="badge">${esc(room.kind)}</span></div>${editable ? button('Edit room','edit-room',room.id) : ''}</article>`).join('') || empty('Add indoor, outdoor and bar rooms for your floor.')}<div id="room-editor">${editable ? roomEditor(undefined,helpers) : ''}</div></section>`;
}
export function tableEditor(table, state, {esc,field,select,form,guest,time}) {
  const reviewed = !!table, rooms = roomNames(state);
  if (table?.area && !rooms.includes(table.area)) rooms.push(table.area);
  const area = rooms.length ? select('Area','area',rooms.map(name => [name,name]),table?.area || rooms[0]) : '<p class="help wide">Add a room before adding its tables.</p>';
  const bookings = table ? state.bookings.filter(booking => booking.tableIds.includes(table.id) && ['booked','seated'].includes(booking.status)) : [];
  const replacements = bookings.map(booking => `<label class="wide">Replacement for ${esc(guest(booking.guestId)?.name || 'Erased guest')} · ${booking.partySize} guests · ${esc(time(booking.startAt))}<span class="help">Leave empty to keep this assignment when the change still fits. Retirement needs a replacement for every active party. Use Ctrl or ⌘ to choose an approved combination.</span><select name="replacement:${esc(booking.id)}" multiple>${activeTables(state).filter(row => row.id !== table.id).map(row => `<option value="${esc(row.id)}">${esc(row.label)} · ${row.seats} seats · ${esc(row.area || 'Dining room')} · ${esc((row.accessTags || []).join(', ') || 'No access tags')}</option>`).join('')}</select></label>`).join('');
  const content = `<input type="hidden" name="${reviewed ? 'tableId' : 'id'}" value="${esc(table?.id || '')}">`
    + field('Table label','label','text',table?.label || '', 'required maxlength="40"')
    + field('Seats','seats','number',table?.seats ?? 2,'required min="1" max="20"') + area
    + select('Shape','shape',shapes,table?.shape || 'square')
    + field('Access tags (comma separated)','accessTags','text',(table?.accessTags || []).join(', '),'maxlength="500"')
    + field('Across the room (%)','x','number',table?.x ?? 20,'required min="0" max="100"')
    + field('Down the room (%)','y','number',table?.y ?? 20,'required min="0" max="100"')
    + (reviewed ? `<label class="wide"><input type="checkbox" name="retire" value="true"> Retire this table from the physical floor</label><p class="help wide">History stays available. Review replacement assignments before approval; active reservations must still fit the floor and their access requirements.</p>${replacements}` + field('Review reason','reason','text','','required maxlength="1000"') : '');
  return `<details${reviewed || !state.tables.length ? ' open' : ''}><summary>${reviewed ? `Review changes to ${esc(table.label)}` : 'Add table'}</summary><p class="help">Position runs from 0% (left / top) to 100% (right / bottom).</p>${form(reviewed ? 'floor.change' : 'table.save',content,reviewed ? 'Prepare floor change' : 'Save table',!rooms.length)}${reviewed ? '<button type="button" class="secondary" data-action="cancel-table-edit">Cancel edit</button>' : ''}</details>`;
}
export function floorChangePayload(form) {
  const values = new FormData(form);
  const changes = Object.fromEntries(['label','area','shape'].map(name => [name,values.get(name)]));
  for (const name of ['seats','x','y']) changes[name] = Number(values.get(name));
  changes.accessTags = String(values.get('accessTags') || '').split(',').map(tag => tag.trim()).filter(Boolean);
  const replacements = [...form.querySelectorAll('select[name^="replacement:"]')].map(select => ({bookingId:select.name.slice(12),tableIds:values.getAll(select.name)})).filter(row => row.tableIds.length);
  const retire = values.has('retire');
  return {kind:'floor.change',plan:{tableId:values.get('tableId'),changes,retire,replacements},reason:values.get('reason')};
}
export function floorPlanPreview(plan, {esc,state,guest,time,tableNames}) {
  const labels={label:'Table label',seats:'Seats',area:'Room',accessTags:'Access tags',x:'Across the room (%)',y:'Down the room (%)',shape:'Shape'};
  const disabled=(plan.disabledCombinationIds || []).map(id=>state.combinations.find(row=>row.id===id)).filter(Boolean);
  const impacts = (plan.impacts || []).map(impact => {
    const booking = state.bookings.find(row => row.id === impact.bookingId);
    return `<article class="card"><strong>${esc(guest(booking?.guestId)?.name || 'Erased guest')}</strong>${booking ? ` · ${booking.partySize} guests · ${esc(time(booking.startAt))}` : ''}<p>${esc(impact.status)}${impact.locked ? ' · Assignment locked' : ''}<br>${esc(tableNames(impact.tableIds))}${impact.replacementTableIds ? ` → ${esc(tableNames(impact.replacementTableIds))}` : ' · Assignment retained'}</p>${(impact.issues || []).map(issue => `<p class="floor-conflict">${esc(issue)}</p>`).join('')}</article>`;
  }).join('');
  return `<div class="floor-change-preview"><h4>${plan.retire ? 'Table retirement' : 'Table change'}</h4><dl class="assignment-diff">${Object.entries(plan.changes || {}).map(([name,value]) => `<dt>${esc(labels[name] || name)}</dt><dd>${esc(Array.isArray(value) ? value.join(', ') || 'None' : value)}</dd>`).join('')}</dl>${plan.conflicts?.length ? `<div class="floor-conflicts" role="status"><h4>Conflicts prevent approval</h4><ul>${plan.conflicts.map(conflict => `<li>${esc(conflict.message)}</li>`).join('')}</ul></div>` : '<p>Ready for manager approval.</p>'}${disabled.length ? `<p>Disabled for future bookings: ${disabled.map(row=>esc(tableNames(row.tableIds))).join('; ')}.</p>` : ''}<h4>Reservation impacts</h4>${impacts || '<p>No reservations affected.</p>'}</div>`;
}

/* A version check never replaces a focused control or a dirty, connected form. */
export function createFloorSync({api,refresh,isBusy}) {
  let version, pending = false, polling = false, stopped = false, lastSync = '', error = '';
  const dirty = new Set();
  function editing() {
    for (const form of dirty) if (!form.isConnected) dirty.delete(form);
    const focused=document.activeElement;
    const openForm=focused?.tagName==='SUMMARY' && focused.parentElement?.open && focused.parentElement.querySelector('form');
    return dirty.size > 0 || !!focused?.matches('input,select,textarea,[contenteditable="true"]') || !!focused?.closest('form') || !!openForm;
  }
  function render() {
    const target = document.querySelector('#floor-sync');
    if (!target) return;
    target.dataset.state = error ? 'error' : pending ? 'stale' : 'synced';
    const message = error || (pending ? `Floor changed. Finish or save your edits to refresh. Last synced ${lastSync || 'before this change'}.` : lastSync ? `Floor synced ${lastSync}. Checking every 3 seconds.` : 'Checking floor updates…');
    if(target.textContent !== message) target.textContent = message;
  }
  for (const event of ['input','change']) document.addEventListener(event, event => {
    const form = event.target.closest('form[data-command]');
    if (form) dirty.add(form);
  });
  async function poll() {
    if (polling || stopped || isBusy() || version === undefined) return;
    polling = true;
    try {
      const current = await api('/api/floor-version');
      if (current.version === undefined) throw new Error('Floor update check returned no version.');
      pending = current.version !== version;
      error = '';
      if (pending && !editing() && !isBusy()) await refresh();
    } catch (failure) {
      stopped = failure.status === 401 || failure.status === 403;
      error = stopped ? 'Floor updates stopped. Sign in again and refresh the page.' : `Floor updates unavailable. Retrying in 3 seconds. ${failure.message}`;
    } finally { polling = false; render(); }
  }
  return {
    render,
    canRefresh:() => !editing() && !isBusy(),
    synced(nextVersion) { version = nextVersion; pending = false; error = ''; lastSync = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}); render(); },
    saved(form) { dirty.delete(form); },
    start() { setInterval(poll,3000); }
  };
}

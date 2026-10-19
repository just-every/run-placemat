import {renderQueue,queueIntakeFields,queueCloseForm} from './placemat-queue.js';
import {turnPolicyFields,parseTurnPolicy} from './placemat-turns.js';
import {bookingRuleFields,parseBookingRules} from './placemat-rules.js';
import { guestProfile,profileSummary } from './placemat-profiles.js';
import { renderReports } from './placemat-reports.js';
/* Live restaurant screens: transport, venue time, rendering, and form actions. */
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options = (rows, selected) => rows.map(([value, text]) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(text)}</option>`).join('');
const empty = text => `<p class="empty">${esc(text)}</p>`;
const emptyRoom = text => `<div class="empty-room"><img src="/brand/empty-room.svg" alt="" width="160" height="90"><p>${esc(text)}</p></div>`;
const badge = value => `<span class="badge" data-status="${esc(String(value).toLowerCase())}">${esc(value)}</span>`;
const searchIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4.5 4.5"/></svg>';
const button = (text, action, id = '', secondary = true) => `<button type="button" ${secondary ? 'class="secondary"' : ''} data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
const field = (label, name, type = 'text', value = '', attributes = '') => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attributes}></label>`;
const select = (label, name, choices, selected = '') => `<label>${esc(label)}<select name="${name}" required>${options(choices, selected)}</select></label>`;
const form = (command, content, submit, disabled = false, className = '') => `<form data-command="${command}"${className ? ` class="${className}"` : ''}><fieldset ${disabled ? 'disabled' : ''}><div class="form-grid">${content}<div class="wide"><button type="submit">${esc(submit)}</button></div></div></fieldset></form>`;
let data, state, actor, serviceId = '', floorTime = '', guestQuery = '', publicData, publicParty = 2, importPlan, importCsv = '';
const transitions = {booked:['seated','cancelled','no-show'],seated:['completed'],completed:[],cancelled:[],'no-show':[]};
const isPublic = document.body.dataset.page === 'public';
const canEdit = () => actor && !actor.agent && ['owner', 'admin'].includes(actor.role);
const isOwner = () => canEdit() && actor.role === 'owner';
const canPrepare = () => canEdit() || actor?.agent;
const guest = id => data.guests.find(g => g.id === id);
const who = id => data.names?.[id] || 'Unknown person';
const service = () => state.services.find(s => s.id === serviceId);
const tableNames = ids => ids.map(id => state.tables.find(t => t.id === id)?.label ?? id).join(', ');
const zone = () => (isPublic ? publicData.venue : state.venue).timezone;
function notice(message, kind = '') {
  const el = $('#notice'); el.textContent = message; el.dataset.kind = kind; el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  if (kind === 'error' && el.getBoundingClientRect().top < 0) el.scrollIntoView({block:'center'});
}
async function api(path, body, method = 'POST') {
  const response = await fetch(path, {credentials:'same-origin', headers:body === undefined ? {} : {'Content-Type':'application/json'}, ...(body === undefined ? {} : {method, body:JSON.stringify(body)})});
  const json = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(json?.error || `Request failed (${response.status}). Please try again.`); error.status = response.status; throw error; }
  if (!json) throw new Error('The server returned an unreadable response. Please refresh.');
  return json;
}
function partsAt(value, timezone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
}
function localTime(value, timezone = zone()) { const p = partsAt(value, timezone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
function time(value) { return new Intl.DateTimeFormat('en-US', {timeZone:zone(),dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
// Obtain actual zone offsets around the date, then roundtrip each candidate.
// A gap has no candidates; a repeated local hour has two and must be rejected.
function toUtc(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a complete local date and time.');
  const wall = Date.parse(`${value}:00Z`), offsets = new Set();
  for (let h = -48; h <= 48; h += 6) {
    const sample = wall + h * 3600000;
    offsets.add(Date.parse(`${localTime(sample)}:00Z`) - sample);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(candidate => localTime(candidate) === value);
  if (candidates.length !== 1) throw new Error(candidates.length ? `That time repeats during a daylight-saving change in ${zone()}. Choose another time.` : `That local time does not exist in ${zone()}. Choose another time.`);
  return new Date(candidates[0]).toISOString();
}
function serviceChoices() { return state.services.map(s => [s.id, `${s.name} · ${time(s.startAt)} · ${s.closedAt?'closed':s.status}`]); }
function serviceField() { return select('Service', 'serviceId', state.services.filter(s => s.status === 'published').map(s => [s.id,`${s.name} · ${time(s.startAt)}`]), serviceId); }
function tableField(selected = [], required = false) { return `<label class="wide">Tables <span class="help">${required ? 'Choose the exact tables for the proposed assignment.' : 'Leave empty for automatic assignment.'} Use Ctrl or ⌘ to select several.</span><select name="tableIds" multiple ${required ? 'required' : ''}>${state.tables.map(t => `<option value="${esc(t.id)}" ${selected.includes(t.id) ? 'selected' : ''}>${esc(t.label)} · ${t.seats} seats</option>`).join('')}</select></label>`; }
function personFields() { return field('Guest name', 'name', 'text', '', 'required maxlength="200" autocomplete="name"') + field('Party size', 'partySize', 'number', 2, 'required min="1" max="500"') + field('Email', 'email', 'email', '', 'autocomplete="email"') + field('Phone', 'phone', 'tel', '', 'autocomplete="tel"'); }
function startField(value = '') { return field(`Arrival (${zone()})`, 'startAt', 'datetime-local', value || floorTime, 'required'); }
async function loadStaff() {
  const editor = actor ? canEdit() : 'editor' in document.body.dataset;
  const [next, people] = await Promise.all([api('/api/state'), editor ? api('/auth/operators').then(rows => ({rows}), error => ({error})) : null]);
  data = next; state = next.state; actor = next.actor;
  if (people?.error && canEdit()) throw people.error;
  data.people = !canEdit() ? [] : people ? people.rows : await api('/auth/operators');
  if (!state.services.some(s => s.id === serviceId)) { serviceId = state.services[0]?.id || ''; floorTime = ''; }
  if (!floorTime && service()) floorTime = floorStart(service());
  $('#venue-name').textContent = state.venue.name; $('#venue-zone').textContent = `${state.venue.timezone} · ${actor.agent ? 'Agent preparation access' : actor.role === 'member' ? 'Read-only access' : 'Live operations'}`;
  renderFloor(); renderServices(); renderWaitlist(); renderGuests(); renderApprovals(); renderSettings(); renderMoveIn(); renderReports({state,canEdit:canEdit(),api,esc,field,select,empty});
}
// During its service the floor opens at the current quarter hour, otherwise at the service's start.
function floorStart(s) { const now = Date.now(); return localTime(now >= Date.parse(s.startAt) && now < Date.parse(s.endAt) ? now - now % 900000 : s.startAt); }
function renderFloor() {
  const s = service();
  $('#floor-content').innerHTML = !s ? emptyRoom('Start by adding tables and creating a service below.') : `<div class="toolbar">${select('Service', 'floor-service', serviceChoices(), serviceId)}${field(`View at (${zone()})`, 'floor-time', 'datetime-local', floorTime)}</div><div id="floor-room"></div><div class="legend"><span>Available</span><span class="booked">Booked</span><span class="seated">Seated</span></div>`;
  $('#bookings').hidden = !s;
  if (!s) { $('#bookings-list').innerHTML = ''; return; }
  renderRoom(); renderBookings();
}
function renderRoom() {
  let at;
  try { at = Date.parse(toUtc(floorTime)); } catch (error) { $('#floor-room').innerHTML = empty(error.message); return; }
  const bookings = state.bookings.filter(b => (['booked','seated'].includes(b.status)||b.status==='completed'&&b.cleanupEndAt>b.endAt) && Date.parse(b.startAt) <= at && Date.parse(b.cleanupEndAt||b.endAt) > at);
  $('#floor-room').innerHTML = state.tables.length ? `<div class="floor-scroll"><div class="floor-map" role="group" aria-label="Floor plan at selected time">${state.tables.map(t => {
    const occupied = bookings.find(b => b.tableIds.includes(t.id)), g = occupied && guest(occupied.guestId);
    return `<div class="floor-table" data-seats="${t.seats > 2 ? 4 : 2}"${t.seats > 2 ? ' data-shape="round"' : ''} data-occupancy="${occupied?.status || 'available'}" data-x="${t.x}" data-y="${t.y}" title="${esc(occupied ? `${g?.name || 'Erased guest'} · ${occupied.partySize} guests · ${time(occupied.startAt)} to ${time(occupied.endAt)}` : 'Available at selected time')}"><span class="top"><strong>${esc(t.label)}</strong><small>${t.seats} seats</small>${occupied ? `<small>${esc(g?.name || 'Erased guest')}</small><small>${esc(at>=Date.parse(occupied.endAt)?'Reset reserved':occupied.status)}</small>` : '<small>Available</small>'}</span></div>`;
  }).join('')}</div></div>` : empty('No tables yet. Add the tables in your room below.');
  $('#floor-room .floor-map')?.style.setProperty('--count', state.tables.length);
  document.querySelectorAll('.floor-table').forEach(el => { el.style.left = `${5 + Number(el.dataset.x) * .9}%`; el.style.top = `${12 + Number(el.dataset.y) * .76}%`; });
}
function renderBookings() {
  const rows = state.bookings.filter(b => b.serviceId === serviceId).sort((a,b) => a.startAt.localeCompare(b.startAt));
  const covers = rows.filter(b => !['cancelled','no-show'].includes(b.status)).reduce((n,b) => n+b.partySize,0);
  const s = service();
  $('#bookings-list').innerHTML = `<div class="split-heading"><h2>Bookings</h2><span class="badge">${covers} / ${s.coverLimit} covers</span></div>${rows.length ? `<div class="table-scroll"><table class="bookings-table"><thead><tr><th>Guest</th><th>Arrival / end</th><th>Party / tables</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(b => `<tr><td><strong>${esc(guest(b.guestId)?.name || 'Erased guest')}</strong><br><span class="muted">${esc(b.source)}</span>${profileSummary(guest(b.guestId),{esc,who,time})}</td><td>${esc(time(b.startAt))}<br><span class="muted">until ${esc(time(b.endAt))}${b.cleanupEndAt>b.endAt?`<br>Reset until ${esc(time(b.cleanupEndAt))}`:''}</span></td><td>${b.partySize} guests<br>${esc(tableNames(b.tableIds))}</td><td>${canEdit() ? `<select class="status-select" data-value="${esc(b.status)}" aria-label="Status for ${esc(guest(b.guestId)?.name || 'booking')}" data-status="${esc(b.id)}">${options([b.status,...transitions[b.status]].map(v => [v,v]), b.status)}</select>` : badge(b.status)}</td><td><div class="actions">${canEdit() ? `<a href="/api/calendar/${encodeURIComponent(b.id)}">Calendar</a>` : ''}${canPrepare() && ['booked','seated'].includes(b.status) ? `<button type="button" class="link-button" data-action="reassign" data-id="${esc(b.id)}">Reassign</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : empty('No bookings for this service yet. Share the guest booking page or add a walk-in.')}<div id="reassignment"></div>${canEdit() && s.status === 'published' && !s.closedAt ? `<details><summary>Add a walk-in</summary>${form('booking.walkin', serviceField() + personFields() + startField() + tableField() + field('Manager rule override reason (only if needed)','overrideReason','text','','maxlength="1000"'), 'Seat walk-in')}</details>` : ''}`;
}
function renderServices() {
  const editable = canEdit();
  $('#services-content').innerHTML = `<div class="columns"><div><h3>Services</h3>${state.services.map(s => `<article class="card"><div class="split-heading"><h4>${esc(s.name)}</h4>${badge(s.closedAt?'closed':s.status)}</div><p>${esc(time(s.startAt))}<br>until ${esc(time(s.endAt))}</p><p class="help">${s.turnMinutes} minute turns · ${s.coverLimit} covers · version ${s.version}</p><div class="actions">${editable && s.status === 'draft' ? button('Edit service','edit-service',s.id) : ''}${canPrepare() && s.status === 'draft' ? button('Prepare publication','publish',s.id) : ''}${editable && s.status === 'published' && !s.closedAt ? button('Review turn rules','edit-turns',s.id) : ''}</div></article>`).join('') || empty('Create your first service with its opening hours and capacity.')}<div id="service-editor">${editable ? serviceEditor() : ''}</div></div><div><h3>Tables</h3>${state.tables.length ? `<div class="table-scroll"><table><thead><tr><th>Table</th><th>Seats</th><th>Position</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${state.tables.map(t => `<tr><td>${esc(t.label)}</td><td>${t.seats}</td><td>${t.x}%, ${t.y}%</td>${editable ? `<td>${state.bookings.some(b => b.tableIds.includes(t.id)) ? '<span class="help">History retained</span>' : button('Edit','edit-table',t.id)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('Add each physical table. Bookings can combine tables when needed.')}<div id="table-editor">${editable ? tableEditor() : ''}</div></div></div>`;
}
function serviceEditor(s) {
  return `<details ${s || !state.services.length ? 'open' : ''}><summary>${s ? `Edit ${esc(s.name)}` : 'Create service'}</summary>${form('service.save', `<input type="hidden" name="id" value="${esc(s?.id || '')}">` + field('Service name','name','text',s?.name || '', 'required maxlength="120"') + field('Turn duration (minutes)','turnMinutes','number',s?.turnMinutes || 90,'required min="15" max="360"') + field(`Starts (${zone()})`,'startAt','datetime-local',s ? localTime(s.startAt) : '', 'required') + field(`Ends (${zone()})`,'endAt','datetime-local',s ? localTime(s.endAt) : '', 'required') + field('Cover limit','coverLimit','number',s?.coverLimit || '', 'required min="1" max="500"') + bookingRuleFields(s,{field}) + turnPolicyFields(s,state,{field,esc,localTime}), 'Save service')}</details>`;
}
function tableEditor(t) {
  return `<details ${t || !state.tables.length ? 'open' : ''}><summary>${t ? `Edit ${esc(t.label)}` : 'Add table'}</summary><p class="help">Position runs from 0% (left / top) to 100% (right / bottom).</p>${form('table.save', `<input type="hidden" name="id" value="${esc(t?.id || '')}">` + field('Table label','label','text',t?.label || '', 'required maxlength="40"') + field('Seats','seats','number',t?.seats || 2,'required min="1" max="20"') + field('Area','area','text',t?.area || 'Dining room','required maxlength="80"') + field('Across the room (%)','x','number',t?.x ?? 20,'required min="0" max="100"') + field('Down the room (%)','y','number',t?.y ?? 20,'required min="0" max="100"'), 'Save table')}</details>`;
}
function renderWaitlist() {
  const rows = state.waitlist.filter(w => w.serviceId === serviceId),s=service();
  $('#waitlist-content').innerHTML = `<p class="help">${esc(s?.name || 'Choose or create a service first.')} · arrival times use ${esc(zone())}</p>${renderQueue(rows,{esc,who,time,guest,canEdit:canEdit(),form,field,select,seatFields:()=>startField()+tableField()+field('Manager rule override reason (only if needed)','overrideReason','text','','maxlength="1000"')})}${canEdit() && s?.status === 'published' && !s.closedAt ? `<details><summary>Add a waiting party</summary>${form('waitlist.add',serviceField()+personFields()+queueIntakeFields({field}),'Add to waitlist')}</details>` : ''}${canEdit()&&s?.status==='published'?queueCloseForm(s,{esc,form,field,time}):''}`;
}

function renderGuests() {
  $('#guests-content').innerHTML = `<label class="search-field"><span class="search-label">${searchIcon}Find a guest</span><input type="search" id="guest-search" value="${esc(guestQuery)}" placeholder="Name, email or phone"></label><div id="guest-results"></div>`;
  renderGuestResults().catch(error=>notice(error.message,'error'));
}
async function renderGuestResults() {
  const query=guestQuery;
  const rows=(await api('/api/guests?search='+encodeURIComponent(query))).guests;
  if(query!==guestQuery)return;
  $('#guest-results').innerHTML = rows.map(g => {
    const visits = [...(g.history || []), ...state.bookings.filter(b => b.guestId === g.id).map(b => ({date:b.startAt, partySize:b.partySize, status:b.status}))].sort((a,b) => b.date.localeCompare(a.date));
    return `<details class="card guest"><summary><span class="guest-name">${esc(g.name)}</span> <span class="muted">${esc([g.email, g.phone].filter(Boolean).join(' · '))}</span></summary><div class="guest-body"><div class="guest-visits"><p>${visits.length} recorded visits</p>${visits.length ? `<ul class="visits">${visits.map(v => `<li><span>${esc(v.date.length === 10 ? v.date : time(v.date))} · ${v.partySize} guests</span>${badge(v.status)}</li>`).join('')}</ul>` : ''}</div><div class="guest-notes">${guestProfile(g,{esc,who,time,canEdit:canEdit(),form,field,select})}</div></div>${isOwner() ? `<details><summary>Erase personal details</summary><p class="help">Erases this guest’s personal details and notes. Booking records remain anonymous.</p>${form('guest.erase', `<input type="hidden" name="guestId" value="${esc(g.id)}">${field('Type ERASE to confirm','confirm','text','','required pattern="ERASE" autocomplete="off"')}`, 'Erase guest')}</details>` : ''}</details>`;
  }).join('') || empty(guestQuery ? 'No guests match your search.' : 'Guests appear here after a booking, walk-in, waitlist entry or import.');
}
function proposalDescription(p) {
  const s = p.plan.service || state.services.find(s => s.id === p.plan.serviceId);
  if (p.kind === 'service.publish') return `Publish ${s?.name || p.plan.serviceId}${s ? ` · ${time(s.startAt)} to ${time(s.endAt)} · ${s.coverLimit} covers` : ''}`;
  if (p.kind === 'service.turns') return `Change future turn rules for ${s?.name || p.plan.serviceId} · ${(p.plan.impacts||[]).filter(i=>i.changed).length} existing reservations keep their original times`;
  if (p.kind === 'reminders') return `Prepare reminders for ${s?.name || p.plan.serviceId}`;
  const b = p.plan.booking || state.bookings.find(b => b.id === p.plan.bookingId);
  return `Move ${guest(b?.guestId)?.name || 'Erased guest'}${b ? ` · ${b.partySize} guests · ${time(b.startAt)}` : ''} to ${tableNames(p.plan.tableIds || [])}`;
}
function renderApprovals() {
  $('#approvals-content').innerHTML = `${canPrepare() && service()?.status === 'published' ? `<div class="toolbar"><p>Prepare reminders for <strong>${esc(service().name)}</strong>.</p>${button('Prepare reminder batch','reminders',serviceId,false)}</div>` : ''}${state.proposals.slice().reverse().map(p => `<article class="card"><div class="split-heading"><h4>${esc(proposalDescription(p))}</h4>${badge(p.status)}</div><p>${esc(p.reason)}</p><p class="help">Prepared by ${esc(who(p.preparedBy))} · ${esc(time(p.preparedAt))}${p.approvedBy ? `<br>${p.status === 'declined' ? 'Declined' : 'Approved'} by ${esc(who(p.approvedBy))} · ${esc(time(p.approvedAt))}` : ''}</p><details><summary>Exact plan</summary><pre class="code-block">${esc(JSON.stringify(p.plan,null,2))}</pre></details>${p.status === 'pending' && canEdit() ? `<div class="actions">${button('Approve plan','approve',p.id,false)}${button('Decline','decline',p.id)}</div>` : ''}</article>`).join('') || empty('No proposals yet. Prepare a service publication, table reassignment or reminder batch.')}<h3>Approved reminders</h3><p>${state.reminders.length} reminders ready or previously exported.</p>${canEdit() ? '<a class="button-link" href="/api/reminders.csv" download>Download reminders CSV</a>' : ''}<details><summary>Reminder messages</summary>${state.reminders.map(r => `<div class="card"><p>${esc(r.message)}</p>${badge(r.status)}<p class="help">Approved by ${esc(who(r.approvedBy))} · ${esc(time(r.approvedAt))}</p></div>`).join('') || '<p>No approved reminders.</p>'}</details>`;
}
function renderSettings() {
  $('#settings-content').innerHTML = `${canEdit() ? form('venue.update', field('Venue name','name','text',state.venue.name,'required maxlength="120"') + field('Venue timezone','timezone','text',state.venue.timezone,'required placeholder="America/New_York"'), 'Save venue') : empty('Venue settings can be changed by an owner or admin.')}${isOwner() ? `<details><summary>Agent preparation keys</summary><p class="help">Keys can read operations and prepare proposals. A signed-in person must approve each plan. Copy a new key immediately; it is shown once.</p>${form('key.create',field('Key name','name','text','','required maxlength="80"'),'Create preparation key')}<div id="key-result"></div>${(data.keys || []).map(k => `<article class="card"><strong>${esc(k.name)}</strong><p class="help">${esc(k.id)}</p>${badge(k.revoked_at ? 'Revoked' : 'Active')}${!k.revoked_at ? button('Revoke key','revoke-key',k.id) : ''}</article>`).join('')}</details><details><summary>Backup & restore</summary><p><a href="/api/backup" download>Download venue backup</a></p><p class="help">Restore requires an empty product destination. Choose a backup archive and type RESTORE. The server validates its integrity and erasure fences.</p><form data-command="backup.restore"><label>Backup archive<input type="file" name="archiveFile" accept=".json,application/json" required></label>${field('Type RESTORE to confirm','confirm','text','','required pattern="RESTORE" autocomplete="off"')}<label>Trusted later backup for erasure journal (optional)<input type="file" name="journalFile" accept=".json,application/json"></label><button type="submit">Restore backup</button></form></details>` : ''}${canEdit() ? `<details><summary>People & invitations</summary><p class="help">Admin manages the floor. Member can read operations. Invitations need your configured production mail; local development suppresses mail.</p>${form('people.invite',field('Person name','displayName','text','','required maxlength="120"')+field('Email','email','email','','required')+select('Role','role',isOwner()?[['member','Read-only staff'],['admin','Manager'],['owner','Owner']]:[['member','Read-only staff']]),'Invite person',false,'inline')}<div>${data.people.map(p=>`<p><strong>${esc(p.displayName)}</strong> · ${esc(p.email)} · ${esc(p.role)} · ${esc(p.status)}</p>`).join('')}</div></details>` : ''}`;
}
function renderMoveIn() {
  $('#move-in-content').innerHTML = isOwner() ? `<p class="help">Tablein guest CSV. Required header: <code>guest_id,name,email,phone,notes,visit_date,party_size,visit_status</code>. Repeated guest IDs combine visit history. Previewing does not change your venue.</p><form data-command="import.preview"><label>CSV file<input type="file" name="csvFile" accept=".csv,text/csv" required></label><button type="submit">Preview import</button></form><div id="import-plan"></div><details><summary>Import journal & undo</summary><p class="help">Undo removes only records written by an import, subject to the server’s integrity checks.</p>${button('Load import journal','import-journal')}<div id="import-journal"></div></details>` : empty('The venue owner can preview, apply and undo a move-in import.');
  if (importPlan && isOwner()) renderImportPlan();
}
function renderImportPlan() {
  const plan = importPlan;
  $('#import-plan').innerHTML = `<article class="card"><h3>Import preview</h3><pre class="code-block">${esc(JSON.stringify(plan.counts,null,2))}</pre>${plan.diagnostics.map(d => `<p>${badge(d.severity)} ${d.location?.row ? `Row ${d.location.row}: ` : ''}${esc(d.message)}</p>`).join('')}<details><summary>Guest preview</summary><pre class="code-block">${esc(JSON.stringify(plan.preview,null,2))}</pre></details><p class="help">Plan fingerprint: ${esc(plan.fingerprint)}</p>${plan.canApply ? `<label><input type="checkbox" id="import-confirm"> I reviewed this plan and want to import these records.</label><div class="actions">${button('Apply reviewed import','import-apply','',false)}</div>` : '<p>Resolve the reported errors and preview the file again before applying.</p>'}</article>`;
}
async function loadJournal() {
  const result = (await api('/api/import/journal')).result;
  $('#import-journal').innerHTML = result.jobs.map(job => `<article class="card"><h4>Import ${esc(job.id)}</h4><p>State: ${esc(job.state)} · ${esc(job.checkpoint)} / ${esc(job.total)}</p><p class="help">Fingerprint: ${esc(job.fingerprint)}</p><div class="actions">${button('View journal','import-job',job.id)}${job.state !== 'undone' ? button('Review undo','import-review-undo',job.id) : ''}</div><div data-job-detail="${esc(job.id)}"></div></article>`).join('') || empty('No imports have been applied.');
}
async function loadPublic(preserve = {}) {
  publicData = await api(`/api/public/services?partySize=${publicParty}`);
  $('#venue-line').textContent = `${publicData.venue.name} · All times in ${publicData.venue.timezone}`;
  const services = publicData.services;
  $('#public-content').innerHTML = `<form data-command="public.book"><div class="form-grid">${field('Party size','partySize','number',publicParty,'required min="1" max="500"')}${select('Service','serviceId',services.map(s => [s.id,`${s.name} · ${time(s.startAt)}`]),preserve.serviceId)}<div class="wide" id="public-times"></div>${field('Your name','name','text',preserve.name || '', 'required maxlength="200" autocomplete="name"')}${field('Email','email','email',preserve.email || '', 'required autocomplete="email"')}${field('Phone (optional)','phone','tel',preserve.phone || '', 'autocomplete="tel"')}<div class="wide"><button type="submit" ${!services.length ? 'disabled' : ''}>Confirm booking</button></div></div></form>${!services.length ? empty(`No services with available times for ${publicParty} guests. Try another party size or contact the venue.`) : ''}`;
  renderPublicTimes(preserve.startAt);
}
function renderPublicTimes(selected) {
  const id = $('#public-content select[name=serviceId]')?.value;
  const selectedService = publicData.services.find(s => s.id === id), slots = selectedService?.slots || [];
  const inquiry = publicParty > (selectedService?.bookingRules?.online?.inquiryAbove ?? 20);
  $('#public-times').innerHTML = slots.length ? select('Available arrival time', 'startAt', slots.map(s => [s.startAt,time(s.startAt)]), selected) : empty(inquiry ? 'This party needs a large-party inquiry. Contact the venue; no booking has been made.' : 'No available times for this service and party size. Please choose another service.');
  $('#public-content button[type=submit]').disabled = !slots.length;
}
function payloadFrom(formEl) {
  const values = Object.fromEntries(new FormData(formEl));
  parseBookingRules(values);
  parseTurnPolicy(values,toUtc);
  for (const name of ['partySize','seats','x','y','turnMinutes','coverLimit']) if (name in values) values[name] = Number(values[name]);
  if ('tags' in values) values.tags=values.tags.split(',').map(s=>s.trim()).filter(Boolean);
  if ('tableIds' in values) values.tableIds = new FormData(formEl).getAll('tableIds');
  if (values.tableIds?.length === 0) delete values.tableIds;
  if (values.id === '') delete values.id;
  return values;
}
async function execute(command, payload) {
  return (await api('/api/commands', {command,payload})).result;
}
async function busy(work, message = 'Saving…') {
  const controls = [...document.querySelectorAll('button:not(:disabled)')];
  controls.forEach(el => el.disabled = true); notice(message);
  try { await work(); }
  catch (error) { notice(error.message, 'error'); }
  finally { controls.forEach(el => { if (el.isConnected) el.disabled = false; }); }
}
async function prepare(kind, plan, reason) {
  await execute('proposal.prepare', {kind,plan,reason}); await loadStaff();
  notice('Plan prepared. Review its exact details under Approvals before approving.', 'success');
  location.hash = 'approvals';
}
async function submitForm(el) {
  const command = el.dataset.command, payload = payloadFrom(el);
  if (command === 'public.book') {
    let result;
    try { result = (await api('/api/public/book',payload)).result; }
    catch (error) { if (error.status === 409) await loadPublic(payload); throw error; }
    $('#public-content').innerHTML = `<article class="booking-confirmation"><h2>Booking confirmed</h2><p>${esc(payload.name)}, your table for ${payload.partySize} guests is booked at ${esc(time(result.startAt))}, until ${esc(time(result.endAt))}.</p><p>Booking reference<br><code>${esc(result.id)}</code></p><p>${esc(result.confirmation)}</p>${button('Make another booking','book-another')}</article>`;
    notice('Your booking is confirmed.', 'success'); return;
  }
  if (command === 'import.preview') {
    importCsv = await payload.csvFile.text();
    importPlan = (await api('/api/import/dry-run',{csv:importCsv})).result;
    renderImportPlan(); notice(importPlan.canApply ? 'Preview ready. Review the plan before applying.' : 'The preview found issues. Review the diagnostics.', importPlan.canApply ? 'success' : 'error'); return;
  }
  if (command === 'import.undo') {
    const result = (await api('/api/import/undo',payload)).result;
    await loadStaff(); await loadJournal(); notice(`Import ${result.job.id}: ${result.job.state}.`, 'success'); return;
  }
  if (command === 'backup.restore') {
    let archive;
    try { archive = JSON.parse(await payload.archiveFile.text()); } catch { throw new Error('Choose a valid JSON backup archive.'); }
    const journal=payload.journalFile?.size?JSON.parse(await payload.journalFile.text()):undefined;
    await api('/api/restore',{archive,confirm:payload.confirm,...(journal?{journal}:{})}); await loadStaff(); notice('Backup restored.', 'success'); return;
  }
  if (command === 'people.invite') {
    await api('/auth/invite',{...payload,returnTo:'/app'});await loadStaff();notice('Invitation recorded. Production sends a sign-in email; local development suppresses mail.','success');return;
  }
  if (command === 'key.create') {
    const result = (await api('/api/agent-keys',payload)).result;
    await loadStaff();
    $('#key-result').innerHTML = '<p>Copy this preparation key now. It will only be shown once.</p><pre class="code-block"></pre>';
    $('#key-result pre').textContent = result.key;
    notice('Preparation key created. Copy it before leaving this page.', 'success'); return;
  }
  if (command === 'service.turns') {
    await prepare('service.turns',{serviceId:payload.serviceId,turnPolicy:payload.turnPolicy},payload.reason);return;
  }
  if (command === 'table.assign') {
    await prepare(command,{bookingId:payload.bookingId,tableIds:payload.tableIds},payload.reason); return;
  }
  for (const name of ['startAt','endAt']) if (payload[name]) payload[name] = toUtc(payload[name]);
  if (command === 'service.save' && Date.parse(payload.endAt) <= Date.parse(payload.startAt)) throw new Error('Service end must be after its start.');
  await execute(command,payload); await loadStaff(); notice('Saved successfully.', 'success');
}
document.addEventListener('submit', event => {
  const el = event.target.closest('form[data-command]'); if (!el) return;
  event.preventDefault(); busy(() => submitForm(el));
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.name === 'floor-service') { serviceId = el.value; floorTime = floorStart(service()); renderFloor(); renderWaitlist(); renderApprovals(); }
  if (el.name === 'floor-time') { floorTime = el.value; renderRoom(); }
  if (el.dataset.status) busy(async () => { try { await execute('booking.status',{bookingId:el.dataset.status,status:el.value}); } finally { await loadStaff(); } notice('Booking status saved.', 'success'); });
  if (isPublic && el.name === 'serviceId') renderPublicTimes();
  if (isPublic && el.name === 'partySize') {
    if (!el.checkValidity()) { el.reportValidity(); return; }
    const preserve = payloadFrom(el.closest('form')); publicParty = Number(el.value);
    busy(async () => { await loadPublic(preserve); notice('Availability updated.'); },'Checking availability…');
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'guest-search') { guestQuery = event.target.value; renderGuestResults().catch(error=>notice(error.message,'error')); }
});
document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action, id = el.dataset.id;
  if (action === 'edit-service') { $('#service-editor').innerHTML = serviceEditor(state.services.find(s => s.id === id)); $('#service-editor').scrollIntoView({block:'center'}); return; }
  if (action === 'edit-turns') {
    const s=state.services.find(s=>s.id===id);
    $('#service-editor').innerHTML=`<article class="card"><h3>Review future turn rules for ${esc(s.name)}</h3>${form('service.turns',`<input type="hidden" name="serviceId" value="${esc(id)}">`+turnPolicyFields(s,state,{field,esc,localTime})+field('Review reason','reason','text','','required maxlength="1000"'),'Prepare turn policy')}</article>`;$('#service-editor').scrollIntoView({block:'center'});return;
  }
  if (action === 'edit-table') { $('#table-editor').innerHTML = tableEditor(state.tables.find(t => t.id === id)); $('#table-editor').scrollIntoView({block:'center'}); return; }
  if (action === 'reassign') {
    const booking = state.bookings.find(b => b.id === id);
    $('#reassignment').innerHTML = `<article class="card"><h3>Prepare table reassignment</h3><p>${esc(guest(booking.guestId)?.name || 'Erased guest')} · ${booking.partySize} guests · ${esc(time(booking.startAt))}</p>${form('table.assign',`<input type="hidden" name="bookingId" value="${esc(id)}">` + tableField(booking.tableIds, true) + field('Reason','reason','text','','required maxlength="500"'), 'Prepare reassignment')}</article>`;
    $('#reassignment').scrollIntoView({block:'center'}); return;
  }
  busy(async () => {
    if (action === 'refresh') { await loadStaff(); notice('Venue refreshed.', 'success'); }
    if (action === 'book-another') { await loadPublic(); notice('Choose your next booking.'); }
    if (action === 'publish') await prepare('service.publish',{serviceId:id},'Publish the reviewed service hours, capacity and table plan.');
    if (action === 'reminders') await prepare('reminders',{serviceId:id},'Prepare a reminder batch for this service for export to the venue’s own sender.');
    if (['approve','decline'].includes(action)) { await execute(`proposal.${action}`,{proposalId:id}); await loadStaff(); notice(action === 'approve' ? 'Plan approved and applied.' : 'Plan declined.', 'success'); }
    if (action === 'revoke-key') { await api(`/api/agent-keys/${encodeURIComponent(id)}`,{},'DELETE'); await loadStaff(); notice('Key revoked.', 'success'); }
    if (action === 'import-apply') {
      if (!$('#import-confirm')?.checked) throw new Error('Confirm that you reviewed the import plan before applying it.');
      const result = (await api('/api/import/apply',{csv:importCsv,confirm:importPlan.fingerprint})).result;
      importPlan = undefined; importCsv = ''; await loadStaff(); await loadJournal(); notice(`Import ${result.job.id}: ${result.job.state}.`, 'success');
    }
    if (action === 'import-journal') { await loadJournal(); notice('Import journal loaded.'); }
    if (['import-job','import-review-undo'].includes(action)) {
      const job = (await api(`/api/import/journal/${encodeURIComponent(id)}`)).result.job;
      const target = [...document.querySelectorAll('[data-job-detail]')].find(node => node.dataset.jobDetail === id);
      target.innerHTML = `<pre class="code-block">${esc(JSON.stringify(job,null,2))}</pre>${action === 'import-review-undo' ? `<form data-command="import.undo"><input type="hidden" name="jobId" value="${esc(id)}"><input type="hidden" name="fingerprint" value="${esc(job.fingerprint)}">${field('Type UNDO to remove this import’s records','confirm','text','','required pattern="UNDO" autocomplete="off"')}<button type="submit" class="danger">Undo import</button></form>` : ''}`;
      notice('Journal details loaded.');
    }
  });
});
// The current section in the staff navigation: the hash, then whichever section is in view.
function markNav(id) {
  document.querySelectorAll('.app-nav a').forEach(a => { if (a.hash === `#${id}`) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
}
if (!isPublic) {
  markNav((location.hash || '#floor').slice(1).replace(/^bookings$/, 'floor'));
  addEventListener('hashchange', () => markNav(location.hash.slice(1)));
  const spy = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) markNav(entry.target.id === 'bookings' ? 'floor' : entry.target.id); }, {rootMargin:'-20% 0px -70% 0px'});
  document.querySelectorAll('.app-main > section').forEach(section => spy.observe(section));
}
busy(async () => { if (isPublic) await loadPublic(); else await loadStaff(); notice(''); },'Loading…');

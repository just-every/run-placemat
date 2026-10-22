import {delegationSettings,leadGrant} from './placemat-delegation.js'
import {deviceSettings} from './placemat-hoststand-settings.js'
import {paymentWork} from './placemat-payments.js'
import {handoverWork} from './placemat-handover.js'
import {toUtc as venueToUtc} from './placemat-local-time.js'
import {restaurantSetup,updatePolicySummary,onboardingPayload,bookingPreview} from './placemat-onboarding.js'
import {serviceNotes,preorderSummary} from './placemat-service-notes.js'
import {createAudit} from './placemat-audit.js'
import {renderServiceChanges} from './placemat-service-changes.js'
import {businessExports} from './placemat-business-export.js'
import {renderInquiries} from './placemat-inquiries.js'
import {requestSummary} from './placemat-requests.js'
import {renderAllocation} from './placemat-allocation.js';
import {pacingFields,parsePacing,renderPacing,renderPacingWarning,warningLabel} from './placemat-pacing.js';
import {floorLegend,stageLabel,statusEditor,shiftHandover} from './placemat-service-status.js';
import {renderSchedules,scheduleEditor,parseSchedule,schedulePlan} from './placemat-schedules.js';
import {renderQueue,queueIntakeFields,queueCloseForm,intakeSettings,queueManagementLink} from './placemat-queue.js';
import {turnPolicyFields,parseTurnPolicy} from './placemat-turns.js';
import {bookingRuleFields,parseBookingRules} from './placemat-rules.js';
import { guestProfile,profileSummary,duplicatePreview,mergePreview,mergeJournal,unmergePreview } from './placemat-profiles.js';
import { renderReports } from './placemat-reports.js';
import {assignmentEditor,hostGrant} from './placemat-assignments.js';
import {createTimeline} from './placemat-timeline.js';
import {createPublicSearch} from './placemat-search.js';
import {reportHeight,widgetSettings,parseOrigins,sourceLabel} from './placemat-widget.js';
import {createAnalyticsConsent} from './placemat-analytics.js';
import {analyticsSettings,analyticsPayload} from './placemat-analytics-settings.js';
import {renderCombinations,combinationEditor,validateCombination} from './placemat-combinations.js';
import {activeTables,roomNames,renderRooms,roomEditor,tableEditor as physicalTableEditor,floorChangePayload,floorPlanPreview,createFloorSync} from './placemat-floor-plan.js';
import {createStaffing,servingLabel} from './placemat-staffing.js';
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
let serviceStatusId='',assignmentId='',floorArea='',floorSection='',floorServer='',busyCount=0;
function reviewingGuest() {
  return [...document.querySelectorAll('#guest-results > details[open]')].some(card=>{
    const bounds=card.getBoundingClientRect();
    return bounds.bottom>0&&bounds.top<innerHeight&&[...card.querySelectorAll('[data-guest-review],[data-merge-journal]')].some(panel=>panel.hasChildNodes());
  });
}
const floorSync=createFloorSync({api,refresh:()=>loadStaff(true),isBusy:()=>busyCount>0||reviewingGuest()});
let onboardingRules;
let openingBookingIds, bookOpenedAt;
const isNewBooking = booking => openingBookingIds && !openingBookingIds.has(booking.id);
const newBookingMarker = booking => isNewBooking(booking) ? '<span class="badge" data-new-booking>New</span>' : '';
let data, state, actor, serviceId = '', floorTime = '', guestQuery = '', importPlan, importCsv = '';
const isPublic = document.body.dataset.page === 'public';
const publicSearch = isPublic ? createPublicSearch({api,esc,field,select,notice,analytics:createAnalyticsConsent({api,esc})}) : null;
const canEdit = () => actor && !actor.agent && ['owner', 'admin'].includes(actor.role);
const canOperateFloor = () => canEdit() || actor && !actor.agent && ['host','lead'].includes(actor.role);
const isOwner = () => canEdit() && actor.role === 'owner';
const canIntake = () => canEdit() || actor && !actor.agent && actor.role === 'host';
const canSeat = () => canEdit() || actor?.role==='lead' || actor?.role === 'host' && state.pacingHostIds?.includes(actor.id);
const pacingReviews = new WeakMap();
const canPrepare = () => canEdit() || actor?.agent;
const timeline=createTimeline({api,esc,field,select,form,button,time,localTime,canOperate:canOperateFloor});
const audit=createAudit({api,esc,field,select,time,isOwner});
const guest = id => data.guests.find(g => g.id === id);
const who = id => data.names?.[id] || 'Unknown person';
const service = () => state.services.find(s => s.id === serviceId);
const tableNames = ids => ids.map(id => state.tables.find(t => t.id === id)?.label ?? id).join(', ');
const zone = () => state.venue.timezone;
const staffing=createStaffing({api,esc,field,select,form,button,guest,time,who,tableNames,canEdit,canOperate:canOperateFloor});
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
function toUtc(value,offset) { return venueToUtc(value,zone(),offset); }
function serviceChoices() { return state.services.map(s => [s.id, `${s.name} · ${time(s.startAt)} · ${s.closedAt?'closed':s.status}`]); }
function serviceField() { return select('Service', 'serviceId', state.services.filter(s => s.status === 'published').map(s => [s.id,`${s.name} · ${time(s.startAt)}`]), serviceId); }
function tableField(selected = [], required = false) { return `<label class="wide">Tables <span class="help">${required ? 'Choose the exact tables for this assignment.' : 'Leave empty for automatic assignment.'} Use Ctrl or ⌘ to select several.</span><select name="tableIds" multiple ${required ? 'required' : ''}>${activeTables(state).map(t => `<option value="${esc(t.id)}" ${selected.includes(t.id) ? 'selected' : ''}>${esc(t.label)} · ${t.seats} seats</option>`).join('')}</select></label>`; }
function personFields() { return field('Guest name', 'name', 'text', '', 'required maxlength="200" autocomplete="name"') + field('Party size', 'partySize', 'number', 2, 'required min="1" max="500"') + field('Email', 'email', 'email', '', 'autocomplete="email"') + field('Phone', 'phone', 'tel', '', 'autocomplete="tel"'); }
function startField(value = '') { return field(`Arrival (${zone()})`, 'startAt', 'datetime-local', value || floorTime, 'required'); }
async function loadStaff(polling = false) {
  const editor = actor ? canEdit() : 'editor' in document.body.dataset;
  const [next, people] = await Promise.all([api('/api/state'), editor ? api('/auth/operators').then(rows => ({rows}), error => ({error})) : null]);
  if (polling && !floorSync.canRefresh()) return;
  if (!openingBookingIds) { openingBookingIds = new Set(next.state.bookings.map(booking => booking.id)); bookOpenedAt = new Date().toISOString(); }
  data = next; state = next.state; actor = next.actor;
  if (people?.error && canEdit()) throw people.error;
  if(actor.role==='owner'&&!onboardingRules)onboardingRules=(await api('/api/onboarding')).defaults;
  data.people = !canEdit() ? [] : people ? people.rows : await api('/auth/operators');
  if (!state.services.some(s => s.id === serviceId)) { serviceId = state.services[0]?.id || ''; floorTime = ''; }
  if (!floorTime && service()) floorTime = floorStart(service());
  $('#venue-name').textContent = state.venue.name; $('#venue-zone').textContent = `${state.venue.timezone} · ${actor.agent ? 'Agent preparation access' : actor.role === 'member' ? 'Read-only access' : 'Live operations'}`;
  const floorReady=renderFloor(); renderServices(); renderWaitlist(); renderInquiries({root:$('#inquiries-content'),state,people:data.people,guest,api,esc,field,select,time,localTime,instant:toUtc,canEdit:canEdit(),onChange:()=>loadStaff()}); const guestsReady=renderGuests(); renderApprovals(polling); renderSettings(); renderMoveIn(); renderReports({state:{...state,services:state.reportScopes?.[actor.id]?state.services.filter(s=>state.reportScopes[actor.id].includes(s.id)):state.services},canEdit:canEdit(),canRead:actor.role==='lead'&&(state.reportScopes?.[actor.id]?.length||0)>0,readOnly:actor.role==='lead',scoped:state.reportScopes?.[actor.id]!==undefined,api,esc,field,select,empty,polling,who:id=>data.names?.[id]||data.people?.find(p=>p.id===id)?.displayName||id});
  await Promise.all([floorReady,guestsReady]);
  floorSync.synced(data.version);
}
// During its service the floor opens at the current quarter hour, otherwise at the service's start.
function floorStart(s) { const now = Date.now(); return localTime(now >= Date.parse(s.startAt) && now < Date.parse(s.endAt) ? now - now % 900000 : s.startAt); }
function renderFloor() {
  const s = service();
  const areas=roomNames(state),sections=s?.staffing?.sections || [],servers=s?.staffing?.servers || [];
  if(!sections.some(section=>section.id===floorSection))floorSection='';
  if(!servers.some(server=>server.id===floorServer))floorServer='';
  if(!areas.includes(floorArea))floorArea='';
  $('#floor-content').innerHTML = '<p id="floor-sync" class="help floor-sync" role="status" aria-live="polite"></p>' + (!s ? emptyRoom('Start by adding tables and creating a service below.') : `<div class="toolbar">${select('Service', 'floor-service', serviceChoices(), serviceId)}${field(`View at (${zone()})`, 'floor-time', 'datetime-local', floorTime)}${select('Room','floor-area',[['','All rooms'],...areas.map(area=>[area,area])],floorArea)}${select('Section','floor-section',[['','All sections'],...sections.map(section=>[section.id,section.name])],floorSection)}${select('Server','floor-server',[['','All servers'],...servers.map(server=>[server.id,server.name])],floorServer)}</div><div id="floor-room"></div>${floorLegend()}<div id="floor-staffing"></div><div id="floor-timeline"></div><div id="shift-handover"></div><div id="service-notes"></div>`);
  floorSync.render();
  $('#bookings').hidden = !s;
  if (!s) { $('#bookings-list').innerHTML = ''; return; }
  renderRoom(); renderBookings();
  $('#service-notes').innerHTML=serviceNotes(state,s,{esc,form,field,select,canEdit:canEdit(),canReadShift:canEdit()||actor?.role==='host',who,time});
  const staffingReady=staffing.mount($('#floor-staffing'),state,s);
  timeline.mount($('#floor-timeline'),s,serviceChoices(),zone());
  $('#shift-handover').innerHTML=handoverWork(state,serviceId,{esc,guest,who,time,form,field,select,actor,people:data.handoverPeople||[],localTime})+paymentWork({state,actor,paymentRequests:data.paymentRequests,refundCharges:data.refundCharges,refunds:data.refunds,people:data.handoverPeople},{esc,form,field,select,time,guest})+shiftHandover(state,serviceId,data.serviceStages,{esc,guest,who,time,tableNames,canEdit:canOperateFloor(),button});
  const pacingServiceId=serviceId,pacingReady=api('/api/pacing?serviceId='+encodeURIComponent(serviceId)).then(report=>{const target=$('#bookings-pacing');if(target&&serviceId===pacingServiceId)target.innerHTML=renderPacing(report,state,{esc,time,guest,who});});
  return Promise.all([staffingReady,pacingReady]);
}
function renderRoom() {
  let at;
  try { at = Date.parse(toUtc(floorTime)); } catch (error) { $('#floor-room').innerHTML = empty(error.message); return; }
  const bookings = state.bookings.filter(b => b.needsBussing || (['booked','seated'].includes(b.status)||b.status==='completed'&&b.cleanupEndAt>b.endAt) && Date.parse(b.setupStartAt || b.startAt) <= at && Date.parse(b.cleanupEndAt||b.endAt) > at);
  const sections=service()?.staffing?.sections || [],servers=service()?.staffing?.servers || [];
  const sectionFor=table=>sections.find(section=>section.tableIds.includes(table.id));
  const sectionLabel=table=>{const section=sectionFor(table);return section?`${section.name} · ${servers.find(server=>server.id===section.serverId)?.name || 'Unassigned'}`:'No section assigned';};
  const tables=activeTables(state).filter(table=>table.inventoryKind!=='pool'&&(!floorArea||(table.area||'Dining room')===floorArea)&&(!floorSection||sectionFor(table)?.id===floorSection)&&(!floorServer||sectionFor(table)?.serverId===floorServer));
  $('#floor-room').innerHTML = tables.length ? `<div class="floor-scroll"><div class="floor-map" role="group" aria-label="Floor plan at selected time">${tables.map(t => {
    const occupied = bookings.find(b => b.tableIds.includes(t.id)), g = occupied && guest(occupied.guestId),ready=state.bookings.findLast(b=>b.tableIds.includes(t.id)&&data.serviceStages?.[b.id]?.status==='ready');
    return `<div class="floor-table" data-seats="${t.seats > 2 ? 4 : 2}" data-shape="${esc(t.shape || 'square')}" data-area="${esc(t.area || 'Dining room')}" data-section="${esc(sectionFor(t)?.id || '')}" data-server="${esc(sectionFor(t)?.serverId || '')}" data-occupancy="${occupied?.status || 'available'}" data-x="${t.x}" data-y="${t.y}" title="${esc(`${sectionLabel(t)}. `)}${esc(occupied ? `${g?.name || 'Erased guest'} · ${occupied.partySize} guests · ${time(occupied.startAt)} to ${time(occupied.endAt)}` : ready?'Staff recorded ready; reserved turns and resets still apply.':'Available at selected time')}"><span class="top"><strong>${esc(t.label)}</strong><small>${t.seats} seats</small><small class="floor-area-label">${esc(t.area || 'Dining room')}</small>${occupied ? `<small>${esc(g?.name || 'Erased guest')}</small>${newBookingMarker(occupied)}${Date.parse(occupied.startAt)>at?'<small>Setup before arrival</small>':''}` : ready?'':'<small>Available</small>'}</span>${occupied||ready?`<span class="floor-stage-caption">${stageLabel(data.serviceStages[(occupied||ready).id],{esc})}</span>`:''}</div>`;
  }).join('')}</div></div><div class="table-scroll"><table aria-label="Floor states and timers"><thead><tr><th>Table</th><th>Floor state / timer</th></tr></thead><tbody>${tables.map(t=>{const b=bookings.find(b=>b.tableIds.includes(t.id))||state.bookings.findLast(b=>b.tableIds.includes(t.id)&&data.serviceStages?.[b.id]?.status==='ready');return `<tr><td>${esc(t.label)}<br><span class="muted">${esc(t.area || 'Dining room')}<br>${esc(sectionLabel(t))}</span></td><td>${b?`${Date.parse(b.startAt)>at&&Date.parse(b.setupStartAt||b.startAt)<=at?`<span>Setup reserved until ${esc(time(b.startAt))}</span><br>`:''}${stageLabel(data.serviceStages?.[b.id],{esc})}`:'Available · no transition recorded'}</td></tr>`}).join('')}</tbody></table></div>` : empty('No tables match these room, section and server filters. Add tables or choose another filter.');
  const inventorySummary=(state.inventories||[]).filter(i=>!floorArea||i.name===floorArea).map(i=>{const units=state.tables.filter(t=>t.inventoryId===i.id),held=new Set(bookings.flatMap(b=>b.tableIds).filter(id=>units.some(t=>t.id===id))).size;return `<p>${esc(i.name)}: ${held} / ${i.capacity} ${i.kind==='pool'?'unassigned covers held (no physical seats)':'counter seats reserved'}</p>`;}).join('');
  if(inventorySummary)$('#floor-room').insertAdjacentHTML('afterbegin',`<section aria-label="Inventory occupancy">${inventorySummary}</section>`);
  $('#floor-room .floor-map')?.style.setProperty('--count', tables.length);
  document.querySelectorAll('.floor-table').forEach(el => { el.style.left = `${5 + Number(el.dataset.x) * .9}%`; el.style.top = `${12 + Number(el.dataset.y) * .76}%`; });
}
function renderBookings() {
  const rows = state.bookings.filter(b => b.serviceId === serviceId).sort((a,b) => a.startAt.localeCompare(b.startAt));
  const covers = rows.filter(b => !['cancelled','no-show'].includes(b.status)).reduce((n,b) => n+b.partySize,0);
  const s = service();
  $('#bookings-list').innerHTML = `<div class="split-heading"><h2>Bookings</h2><span class="badge">${covers} / ${s.coverLimit} covers</span></div><p class="help" data-new-booking-count role="status" aria-live="polite">${rows.filter(isNewBooking).length} new since this view opened · ${esc(time(bookOpenedAt))}. Markers remain until you reopen the page.</p>${rows.length ? `<div class="table-scroll"><table class="bookings-table"><thead><tr><th>Guest</th><th>Arrival / end</th><th>Party / tables</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(b => `<tr><td><strong>${esc(guest(b.guestId)?.name || 'Erased guest')}</strong> ${newBookingMarker(b)}<br><span class="muted">${esc(sourceLabel(b))}</span>${profileSummary(guest(b.guestId),{esc,who,time})}${requestSummary(b.requests,esc)}${preorderSummary(b.preorders,esc)}</td><td>${esc(time(b.startAt))}<br><span class="muted">until ${esc(time(b.endAt))}${b.setupStartAt&&b.setupStartAt<b.startAt?`<br>Setup from ${esc(time(b.setupStartAt))}`:''}${b.cleanupEndAt>b.endAt?`<br>Reset until ${esc(time(b.cleanupEndAt))}`:''}</span></td><td>${b.partySize} guests<br>${esc(tableNames(b.tableIds))}<br><span class="muted">${esc(servingLabel(b))}</span></td><td>${badge((data.serviceStages?.[b.id]?.serviceStatus||b.status).replaceAll('-',' '))}${warningLabel(b,{esc})}</td><td><div class="actions">${canOperateFloor()?button('Update service','service-status',b.id):''}${canEdit() ? `<a href="/api/calendar/${encodeURIComponent(b.id)}">Calendar</a>` : ''}${canOperateFloor() || actor?.agent ? button(canOperateFloor()?'Change assignment':'Prepare reassignment','reassign',b.id):button('Assignment history','reassign',b.id)}${b.assignmentLocked?' <span class="badge">Locked</span>':''}</div></td></tr>`).join('')}</tbody></table></div>` : empty('No bookings for this service yet. Share the guest booking page or add a walk-in.')}<div id="bookings-pacing"></div><div id="reassignment">${assignmentId&&state.bookings.find(b=>b.id===assignmentId)?renderAssignment(assignmentId):''}</div><div id="service-status-editor">${serviceStatusId&&canOperateFloor()&&state.bookings.find(b=>b.id===serviceStatusId)?statusEditor(state.bookings.find(b=>b.id===serviceStatusId),state,data.serviceStages?.[serviceStatusId],{esc,form,select,field,who,time}):''}</div>${canSeat() && s.status === 'published' && !s.closedAt ? `<details><summary>Add a walk-in</summary>${form('booking.walkin', serviceField() + personFields() + startField() + tableField() + field('Required table access tags (comma separated)','requiredAccessTags') + field('Manager rule override reason (only if needed)','overrideReason','text','','maxlength="1000"'), 'Seat walk-in')}</details>` : ''}`;
}
function renderAssignment(id) {return assignmentEditor(state.bookings.find(b=>b.id===id),state,data.version,{esc,guest,time,form,field,select,tableField,who,tableNames,canOperate:canOperateFloor(),canPrepare:canPrepare()});}
function serviceTime(value){const offset=new Intl.DateTimeFormat('en-US',{timeZone:zone(),timeZoneName:'shortOffset'}).formatToParts(new Date(value)).find(p=>p.type==='timeZoneName')?.value;return `${time(value)} (${offset})`;}
function renderServices() {
  const editable = canEdit();
  $('#services-content').innerHTML = `<div class="columns"><div><h3>Services</h3>${state.services.map(s => `<article class="card"><div class="split-heading"><h4>${esc(s.name)}</h4>${badge(s.closedAt?'closed':s.status)}</div><p>${esc(serviceTime(s.startAt))}<br>until ${esc(serviceTime(s.endAt))}</p><p class="help">${s.turnMinutes} minute turns · ${s.coverLimit} covers · version ${s.version}</p><div class="actions">${editable && s.status === 'draft' ? button('Edit service','edit-service',s.id) : ''}${canPrepare() && s.status === 'draft' ? button('Prepare publication','publish',s.id) : ''}${editable && s.status === 'published' && !s.closedAt ? button('Review turn rules','edit-turns',s.id)+button('Edit pacing','edit-pacing',s.id) : ''}</div></article>`).join('') || empty('Create your first service with its opening hours and capacity.')}<div id="service-editor">${editable ? serviceEditor() : ''}</div></div><div><h3>Tables</h3>${state.tables.length ? `<div class="table-scroll"><table><thead><tr><th>Table</th><th>Seats / shape</th><th>Area / position</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${state.tables.map(t => `<tr><td>${esc(t.label)}</td><td>${t.seats} · ${esc(t.shape || 'square')}${t.retiredAt?'<br><span class="badge">Retired</span>':''}</td><td>${esc(t.area || 'Dining room')}<br>${t.x}%, ${t.y}%</td>${editable ? `<td>${t.inventoryId?'<span class="help">Inventory unit</span>':t.retiredAt ? '<span class="help">History retained</span>' : button('Edit','edit-table',t.id)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('Add each physical table. Bookings can combine tables when needed.')}<div id="table-editor">${editable ? tableEditor() : ''}</div>${inventoryEditor()}${renderCombinations(state,editable,{esc,field,select,form,button,empty})}${renderRooms(state,editable,{esc,field,select,form,button,empty})}</div></div>${renderSchedules(state,{canEdit:editable,form,field,select,esc,button})}<div id="service-changes-content"></div>`;
  renderServiceChanges({root:$('#service-changes-content'),state,canEdit:editable,command:execute,refresh:loadStaff,esc,who,guest,time,notice});
}
function inventoryEditor(){
 const summary=(state.inventories||[]).map(i=>`<article class="card"><h4>${esc(i.name)}</h4><p>${i.capacity} ${i.kind==='counter'?'counter seats':'unassigned covers'} · ${i.turnMinutes} minute turns · ${i.arrivalCovers} arrival covers / ${i.intervalMinutes} minutes${i.adjacent?' · adjacent seats required':''}</p></article>`).join('');
 return `<section aria-label="Counters and pools"><h3>Counters & unassigned pools</h3>${summary}${canEdit()?`<details><summary>Define counter or pool</summary><p class="help">Inventory settings stay fixed for booking history. Pools reserve covers without physical seats; move a party to seats or a table before seating.</p>${form('inventory.create',field('Inventory name','name','text','','required maxlength="60"')+select('Inventory kind','kind',[['counter','Counter seats'],['pool','Unassigned cover pool']])+field('Inventory capacity','capacity','number',10,'required min="1" max="40"')+field('Inventory turn minutes','turnMinutes','number',90,'required min="15" max="360"')+field('Inventory arrival covers','arrivalCovers','number',20,'required min="1" max="500"')+field('Inventory interval minutes','intervalMinutes','number',30,'required min="5" max="120"')+select('Adjacent counter seats required','adjacent',[['true','Yes'],['false','No']])+field('Inventory access tags (comma separated)','accessTags'), 'Create inventory')}</details>`:''}</section>`;
}
function serviceEditor(s) {
  return `<details ${s || !state.services.length ? 'open' : ''}><summary>${s ? `Edit ${esc(s.name)}` : 'Create service'}</summary>${form('service.save', `<input type="hidden" name="id" value="${esc(s?.id || '')}">` + field('Service name','name','text',s?.name || '', 'required maxlength="120"') + field('Turn duration (minutes)','turnMinutes','number',s?.turnMinutes || 90,'required min="15" max="360"') + field(`Starts (${zone()})`,'startAt','datetime-local',s ? localTime(s.startAt) : '', 'required') + field('Start UTC offset (required only for repeated time)','startOffset','text','','placeholder="-04:00"') + field(`Ends (${zone()})`,'endAt','datetime-local',s ? localTime(s.endAt) : '', 'required') + field('End UTC offset (required only for repeated time)','endOffset','text','','placeholder="-05:00"') + field('Cover limit','coverLimit','number',s?.coverLimit || '', 'required min="1" max="500"') + pacingFields(s,state,{field,esc}) + bookingRuleFields(s??{bookingRules:state.venue.setup?.bookingDefaults??onboardingRules},{field}) + turnPolicyFields(s,state,{field,esc,localTime}), 'Save service')}<p class="help">Preview uses the entered service and your real tables, without saving a service, guest or booking.</p><button type="button" class="secondary" data-action="onboarding-preview">Preview booking page</button><div data-onboarding-preview></div></details>`;
}
function tableEditor(t) { return physicalTableEditor(t,state,{esc,field,select,form,guest,time}); }

function renderWaitlist() {
  const rows = state.waitlist.filter(w => w.serviceId === serviceId),s=service();
  $('#waitlist-content').innerHTML = `<p class="help">${esc(s?.name || 'Choose or create a service first.')} · arrival times use ${esc(zone())}</p>${renderQueue(rows,{esc,who,time,guest,canEdit:canEdit(),canSeat:canSeat(),canIntake:canIntake(),form,field,select,seatFields:()=>startField()+tableField()+field('Manager rule override reason (only if needed)','overrideReason','text','','maxlength="1000"')})}${canIntake() && s?.status === 'published' && !s.closedAt ? `<details><summary>Add a waiting party</summary>${form('waitlist.add',serviceField()+personFields()+queueIntakeFields({field,timezone:zone()}),'Add to waitlist')}</details>` : ''}<div id="queue-management-link"></div>${canEdit()?intakeSettings(s,{esc,form}):''}${canEdit()&&s?.status==='published'?queueCloseForm(s,{esc,form,field,time}):''}`;
}

function expandedGuests() {return [...document.querySelectorAll('#guest-results > details[open]')].map(card=>card.querySelector('[data-action=guest-review]')?.dataset.id);}
function renderGuests() {
  const expanded=expandedGuests();
  $('#guests-content').innerHTML = `<label class="search-field"><span class="search-label">${searchIcon}Find a guest</span><input type="search" id="guest-search" value="${esc(guestQuery)}" placeholder="Name, email or phone"></label><div id="guest-results"></div>`;
  return renderGuestResults(expanded);
}
async function renderGuestResults(expanded=expandedGuests()) {
  const query=guestQuery;
  const rows=(await api('/api/guests?search='+encodeURIComponent(query))).guests;
  if(query!==guestQuery)return;
  $('#guest-results').innerHTML = rows.map(g => {
    const visits = [...(g.history || []), ...state.bookings.filter(b => b.guestId === g.id).map(b => ({date:b.startAt, partySize:b.partySize, status:b.status}))].sort((a,b) => b.date.localeCompare(a.date));
    return `<details class="card guest"${expanded.includes(g.id)?' open':''}><summary><span class="guest-name">${esc(g.name)}</span> <span class="muted">${esc([g.email, g.phone].filter(Boolean).join(' · '))}</span></summary><div class="guest-body"><div class="guest-visits"><p>${visits.length} recorded visits</p>${visits.length ? `<ul class="visits">${visits.map(v => `<li><span>${esc(v.date.length === 10 ? v.date : time(v.date))} · ${v.partySize} guests</span>${badge(v.status)}</li>`).join('')}</ul>` : ''}</div><div class="guest-notes">${guestProfile(g,{esc,who,time,canEdit:canEdit(),form,field,select})}<button type="button" data-action="guest-review" data-id="${esc(g.id)}" aria-expanded="false">Review possible duplicates</button><div data-guest-review aria-live="polite"></div>${canEdit()?`<button type="button" class="secondary" data-action="guest-merge-journal" data-id="${esc(g.id)}" aria-expanded="false">Review merge journal</button><div data-merge-journal aria-live="polite"></div>`:''}</div></div>${isOwner() ? `<details><summary>Erase personal details</summary><p class="help">Erases this guest’s personal details and notes, including reviewed aliases and unresolved merged identities. Merge snapshots are removed and reversal becomes unavailable. Booking records remain anonymous.</p>${form('guest.erase', `<input type="hidden" name="guestId" value="${esc(g.id)}">${field('Type ERASE to confirm','confirm','text','','required pattern="ERASE" autocomplete="off"')}`, 'Erase guest')}</details>` : ''}</details>`;
  }).join('') || empty(guestQuery ? 'No guests match your search.' : 'Guests appear here after a booking, walk-in, waitlist entry or import.');
}
async function loadGuestReview(button) {
  const target=button.parentElement.querySelector('[data-guest-review]');
  target.textContent='Loading current duplicate review…';button.setAttribute('aria-expanded','true');
  try{const {review}=await api('/api/guests?review='+encodeURIComponent(button.dataset.id));target.innerHTML=duplicatePreview(review,{esc,time,canEdit:canEdit()});}
  catch(error){target.textContent='Duplicate review unavailable. Try again with current guest records.';throw error;}
}
async function loadGuestMergeJournal(button) {
  if(!canEdit())return;
  const target=button.parentElement.querySelector('[data-merge-journal]');
  target.textContent='Loading merge journal…';button.setAttribute('aria-expanded','true');
  try{const {merges}=await api('/api/guests/merges?guestId='+encodeURIComponent(button.dataset.id));target.innerHTML=mergeJournal(merges,{esc,time,who});}
  catch(error){target.textContent='Merge journal unavailable. Try again with current records.';throw error;}
}
function proposalDescription(p) {
  if(p.kind==='inventory.protect')return `${p.plan.action==='release'?'Release':'Protect'} direct website inventory · ${state.services.find(s=>s.id===p.plan.serviceId)?.name||'Service'}`;
  if(p.kind==='service.adjust')return `Extend service end to ${time(p.plan.endAt)} · ${state.services.find(s=>s.id===p.plan.serviceId)?.name||'Service'}`;
  if(p.kind==='allocation.improve')return `Review seating alternatives · ${state.services.find(s=>s.id===p.plan.serviceId)?.name||'Service'}`;
  if(p.kind==='floor.change')return `${p.plan.retire?'Retire':'Change'} table ${state.tables.find(table=>table.id===p.plan.tableId)?.label || p.plan.tableId}`;
  if(p.kind==='schedule.publish')return `Publish recurring services · ${p.plan.fromDate} through ${p.plan.toDate}`;
  const s = p.plan.service || state.services.find(s => s.id === p.plan.serviceId);
  if (p.kind === 'service.publish') return `Publish ${s?.name || p.plan.serviceId}${s ? ` · ${time(s.startAt)} to ${time(s.endAt)} · ${s.coverLimit} covers` : ''}`;
  if (p.kind === 'service.turns') return `Change future turn rules for ${s?.name || p.plan.serviceId} · ${(p.plan.impacts||[]).filter(i=>i.changed).length} existing reservations keep their original times`;
  if (p.kind === 'reminders') return `Prepare reminders for ${s?.name || p.plan.serviceId}`;
  const b = p.plan.booking || state.bookings.find(b => b.id === p.plan.bookingId);
  return `Move ${guest(b?.guestId)?.name || 'Erased guest'}${b ? ` · ${b.partySize} guests · ${time(b.startAt)}` : ''} to ${tableNames(p.plan.tableIds || [])}`;
}
function renderApprovals(polling = false) {
  if(polling && document.querySelector("#allocation-content")) return;
  $('#approvals-content').innerHTML = `${canPrepare() && service()?.status === 'published' ? `<div class="toolbar"><p>Prepare reminders for <strong>${esc(service().name)}</strong>.</p>${button('Prepare reminder batch','reminders',serviceId,false)}</div>` : ''}${state.proposals.filter(p=>!['allocation.improve','inventory.protect','service.adjust'].includes(p.kind)||!canEdit()).slice().reverse().map(p => `<article class="card"><div class="split-heading"><h4>${esc(proposalDescription(p))}</h4>${badge(p.status)}</div><p>${esc(p.reason)}</p><p class="help">Prepared by ${esc(who(p.preparedBy))} · ${esc(time(p.preparedAt))}${p.approvedBy ? `<br>${p.status === 'declined' ? 'Declined' : 'Approved'} by ${esc(who(p.approvedBy))} · ${esc(time(p.approvedAt))}` : ''}</p>${p.kind==='schedule.publish'?schedulePlan(p.plan,{esc,time,field}):p.kind==='floor.change'?floorPlanPreview(p.plan,{esc,state,guest,time,tableNames}):''}<details><summary>Exact plan</summary><pre class="code-block">${esc(JSON.stringify(p.plan,null,2))}</pre></details>${p.status === 'pending' && canEdit() ? `<div class="actions">${p.kind==='floor.change'&&p.plan.approvable===false?'<p class="help">Resolve the conflicts and prepare a new floor plan before approval.</p>':button('Approve plan','approve',p.id,false)}${button('Decline','decline',p.id)}</div>` : ''}</article>`).join('') || empty('No proposals yet. Prepare a service publication, table reassignment or reminder batch.')}<h3>Approved reminders</h3><p>${state.reminders.length} reminders ready or previously exported.</p>${canEdit() ? '<a class="button-link" href="/api/reminders.csv" download>Download reminders CSV</a>' : ''}<details><summary>Reminder messages</summary>${state.reminders.map(r => `<div class="card"><p>${esc(r.message)}</p>${badge(r.status)}<p class="help">Approved by ${esc(who(r.approvedBy))} · ${esc(time(r.approvedAt))}</p></div>`).join('') || '<p>No approved reminders.</p>'}</details>`;
  if(canEdit()){const root=document.createElement('section');root.id='allocation-content';$('#approvals-content').prepend(root);renderAllocation({root,state,api,esc,select,field,empty,tableNames,time,who});}
}
function renderSettings() {
  $('#settings-content').innerHTML = `${deviceSettings(actor,{form,field})}${restaurantSetup(state,onboardingRules,{esc,field,form,isOwner:isOwner(),time,who})}${canEdit() ? form('venue.update', field('Venue name','name','text',state.venue.name,'required maxlength="120"') + field('Venue timezone','timezone','text',state.venue.timezone,'required placeholder="America/New_York"'), 'Save venue') : empty('Venue settings can be changed by an owner or admin.')}${isOwner()?delegationSettings(state,data.people,{esc,field,select,form}):''}${isOwner() ? `<details><summary>Agent preparation keys</summary><p class="help">Keys can read operations and prepare proposals. A signed-in person must approve each plan. Copy a new key immediately; it is shown once.</p>${form('key.create',field('Key name','name','text','','required maxlength="80"'),'Create preparation key')}<div id="key-result"></div>${(data.keys || []).map(k => `<article class="card"><strong>${esc(k.name)}</strong><p class="help">${esc(k.id)}</p>${badge(k.revoked_at ? 'Revoked' : 'Active')}${!k.revoked_at ? button('Revoke key','revoke-key',k.id) : ''}</article>`).join('')}</details>${widgetSettings(state,{esc,form,who,time})}${analyticsSettings(state,data,{esc,form,field,who,time})}${businessExports(data.businessExportKinds||[],esc)}<details><summary>Backup & restore</summary><p><a href="/api/backup" download>Download venue backup</a></p><p class="help">Restore requires an empty product destination. Choose a backup archive and type RESTORE. The server validates its integrity and erasure fences.</p><form data-command="backup.restore"><label>Backup archive<input type="file" name="archiveFile" accept=".json,application/json" required></label>${field('Type RESTORE to confirm','confirm','text','','required pattern="RESTORE" autocomplete="off"')}<label>Trusted later backup for erasure journal (optional)<input type="file" name="journalFile" accept=".json,application/json"></label><button type="submit">Restore backup</button></form></details>` : ''}${canEdit() ? `<details><summary>People & invitations</summary><p class="help">Admin manages the floor. Hosts can change assignments and record service observations. Members can read operations. Invitations need your configured production mail; local development suppresses mail.</p>${form('people.invite',field('Person name','displayName','text','','required maxlength="120"')+field('Email','email','email','','required')+select('Role','role',isOwner()?[['member','Read-only staff'],['admin','Manager'],['owner','Owner']]:[['member','Read-only staff']]),'Invite person',false,'inline')}<div>${data.people.map(p=>`<article class="card"><p><strong>${esc(p.displayName)}</strong> · ${esc(p.email)} · ${esc((state.leadIds||[]).includes(p.id)?'seating lead':(state.hostIds||[]).includes(p.id)?'host':p.role)} · ${esc(p.status)}</p>${isOwner()?hostGrant(p,state,{esc,form})+leadGrant(p,state,{esc,form}):''}</article>`).join('')}</div></details>` : ''}`;
  const history=document.createElement('div');history.id='audit-content';$('#settings-content').append(history);audit.mount(history,state,who);
  if(isOwner())api('/api/hoststand/devices').then(result=>{const target=$('#registered-devices');if(target)target.innerHTML=result.devices.map(d=>`<article class="card"><strong>${esc(d.label)}</strong><p>${d.revoked_at?'Revoked':'Active'} · Expires ${esc(time(d.expires_at))}</p>${d.revoked_at?'':(Date.parse(d.expires_at)||Number(d.expires_at))<=Date.now()+7*86400000?'<p role="status">Lease renewal due: expires within seven days.</p>':''}${d.revoked_at?'':form('hoststand.renew',`<input type="hidden" name="deviceId" value="${esc(d.id)}">`+field('Renew lease (days)','days','number',30,'required min="1" max="30"'),'Renew host stand')+button('Revoke device','device-revoke',d.id)}</article>`).join('')}).catch(error=>notice(error.message,'error'));
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
function payloadFrom(formEl) {
  const values = Object.fromEntries(new FormData(formEl));
  parseSchedule(formEl,values);
  if('amountCents' in values)values.amountCents=Number(values.amountCents);
  if('pacingInterval' in values)values.pacing=parsePacing(values);
  parseBookingRules(values);
  parseTurnPolicy(values,toUtc);
  for (const name of ['partySize','seats','x','y','turnMinutes','coverLimit','capacity','setupMinutes','coverCap','refundLimitCents','arrivalCovers','intervalMinutes']) if (name in values) values[name] = Number(values[name]);
  for(const name of ['tags','accessTags','requiredAccessTags'])if(name in values)values[name]=values[name].split(',').map(s=>s.trim()).filter(Boolean);
  for(const name of ['locked','enabled','onBreak','adjacent'])if(name in values)values[name]=values[name]==='true';
  if(formEl.querySelector('input[type=checkbox][name=adjacent]'))values.adjacent=new FormData(formEl).has('adjacent');
  if('version' in values)values.version=Number(values.version);
  if(formEl.querySelector('[name=contactConsent]'))values.contactConsent=new FormData(formEl).has('contactConsent');
  if('paused' in values)values.paused=values.paused==='true';
  if(formEl.querySelector('[name=serviceIds]'))values.serviceIds=new FormData(formEl).getAll('serviceIds');
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
  busyCount++; controls.forEach(el => el.disabled = true); notice(message);
  try { await work(); }
  catch (error) { notice(error.message, 'error'); }
  finally { busyCount--; controls.forEach(el => { if (el.isConnected) el.disabled = false; }); }
}
async function prepare(kind, plan, reason) {
  await execute('proposal.prepare', {kind,plan,reason}); await loadStaff();
  notice('Plan prepared. Review its exact details under Approvals before approving.', 'success');
  location.hash = 'approvals';
}
async function submitForm(el) {
  const command = el.dataset.command, payload = payloadFrom(el);
  if(['guest.merge','guest.unmerge'].includes(command)) {
    if(!canEdit())throw new Error('A venue manager must review guest merges.');
    const guestId=payload.guestId;
    if(command==='guest.unmerge')delete payload.guestId;
    const result=await execute(command,payload);
    await loadStaff();
    const button=[...document.querySelectorAll('[data-action="guest-merge-journal"]')].find(el=>el.dataset.id===guestId);
    if(button)await loadGuestMergeJournal(button);
    notice(command==='guest.merge'?'Reviewed profiles merged. Marketing permission remains not recorded.':`Unmerge complete. ${result.laterRecords.length} later records need assignment.`,'success');return;
  }
  if(command==='venue.onboard'){await execute(command,await onboardingPayload(el,payload));await loadStaff();notice('Restaurant setup and policy acknowledgment saved.','success');return;}
  if (command === 'floor.change') {
    const proposal=floorChangePayload(el);
    await prepare(proposal.kind,proposal.plan,proposal.reason); return;
  }
  if (command === 'combination.save') validateCombination(payload,state);
  if (command === 'embed.origins') payload.origins = parseOrigins(payload.origins);
  if (command === 'analytics.settings') { await execute(command, analyticsPayload(el)); await loadStaff(); notice('Saved successfully.', 'success'); return; }
  if (command === 'analytics.remove-key') { await execute(command, payload); await loadStaff(); notice('Saved key removed.', 'success'); return; }
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
  if(command==='hoststand.renew'){await api('/api/hoststand/renew',{deviceId:payload.deviceId,days:Number(payload.days)});await loadStaff();notice('Host stand lease renewed.','success');return;}
  if(command==='hoststand.pin'){await api('/api/hoststand/pin',{pin:payload.pin});el.reset();notice('Personal PIN saved. Previous stand sessions are locked.','success');return;}
  if(command==='hoststand.register'){const result=await api('/api/hoststand/devices',payload);$('#device-registration').innerHTML=`<p>Copy this one-use device code now. It expires in ten minutes.</p><pre class="code-block"></pre><button type="button" class="secondary" data-action="device-clear-code">Clear registration code</button>`;$('#device-registration pre').textContent=result.claimCode;notice('Device registered. Copy its code to the dedicated host stand.','success');return;}
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
  if(command==='schedule.preview'){await execute(command,payload);await loadStaff();location.hash='approvals';notice('Generated services ready for review. Approve the exact plan to publish.','success');return;}
  if (command === 'service.turns') {
    await prepare('service.turns',{serviceId:payload.serviceId,turnPolicy:payload.turnPolicy},payload.reason);return;
  }
  if (command === 'table.assign') {
    await prepare(command,{bookingId:payload.bookingId,tableIds:payload.tableIds},payload.reason); return;
  }
  for (const name of ['startAt','endAt','expectedEndAt','preferredAt','dueAt']) if (command!=='service.save'&&payload[name]) payload[name] = toUtc(payload[name],payload[name==='endAt'?'endOffset':'startOffset']);
  if(['booking.walkin','waitlist.seat'].includes(command)){
    const reviewPayload={...payload};delete reviewPayload.pacingReason;delete reviewPayload.pacingConfirm;
    const stamp=JSON.stringify(reviewPayload),previous=pacingReviews.get(el);
    if(previous?.stamp===stamp&&payload.pacingConfirm==='yes'){payload.pacingReview=previous.review;}
    else{
      const preview=await api('/api/pacing/preview',{command,payload:reviewPayload});
      if(preview.violations.length){
        pacingReviews.set(el,{stamp,review:preview.review});
        let target=el.querySelector('[data-pacing-warning]');if(!target){target=document.createElement('div');target.dataset.pacingWarning='';target.className='wide';const grid=el.querySelector('.form-grid');grid.insertBefore(target,grid.lastElementChild);}
        target.innerHTML=renderPacingWarning(preview.violations,{esc,field});target.scrollIntoView({block:'center'});notice('Review the pacing warning, add a reason and confirm before submitting again.');return;
      }
    }
  }
  let saved;
  try{saved=await execute(command,payload);}
  catch(error){pacingReviews.delete(el);el.querySelector('[data-pacing-warning]')?.remove();throw error;}
  await loadStaff(); if(command==='waitlist.add'&&saved.token)$('#queue-management-link').innerHTML=queueManagementLink(saved.token,{esc,origin:location.origin}); notice('Saved successfully.', 'success');
}
document.addEventListener('submit', event => {
  const el = event.target.closest('form[data-command]'); if (!el) return;
  event.preventDefault(); busy(async () => { await submitForm(el); floorSync.saved(el); });
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.name === 'floor-service') { serviceStatusId='';assignmentId='';floorSection='';floorServer='';serviceId = el.value; floorTime = floorStart(service()); renderFloor(); renderWaitlist(); renderApprovals(); }
  if (el.name === 'floor-section') { floorSection=el.value; renderRoom(); }
  if (el.name === 'floor-server') { floorServer=el.value; renderRoom(); }
  if (el.name === 'floor-area') { floorArea=el.value; renderRoom(); }
  if (el.name === 'floor-time') { floorTime = el.value; renderRoom(); }
});
document.addEventListener('input', event => {
  const setup=event.target.closest('form[data-command="venue.onboard"]');if(setup&&event.target.name!=='acknowledge')updatePolicySummary(setup);
  if (event.target.id === 'guest-search') { guestQuery = event.target.value; renderGuestResults().catch(error=>notice(error.message,'error')); }
});
document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action, id = el.dataset.id;
  if(action==='device-clear-code'){$('#device-registration').textContent='';return;}
  if(action==='device-revoke'){busy(async()=>{await api('/api/hoststand/revoke',{deviceId:id});await loadStaff();notice('Host stand revoked.','success')});return;}
  if(action==='guest-review'){
    busy(async()=>{await loadGuestReview(el);notice('Duplicate review loaded. Profiles and permissions are unchanged.','success');},'Loading duplicate review…');return;
  }
  if(action==='guest-merge-journal'){
    if(!canEdit())return;
    busy(async()=>{await loadGuestMergeJournal(el);notice('Merge journal loaded.');},'Loading merge journal…');return;
  }
  if(action==='guest-merge-preview'){
    if(!canEdit())return;
    busy(async()=>{
      const target=el.parentElement.querySelector('[data-merge-preview]');target.innerHTML='';
      const preview=await api('/api/guests/merge-preview?guestId='+encodeURIComponent(id)+'&duplicateId='+encodeURIComponent(el.dataset.duplicateId));
      target.innerHTML=mergePreview(preview,{esc,field,form});target.scrollIntoView({block:'center'});notice('Review conflicts and contact permissions, then type MERGE to confirm.');
    },'Preparing merge preview…');return;
  }
  if(action==='guest-unmerge-preview'){
    if(!canEdit())return;
    busy(async()=>{
      const target=el.parentElement.querySelector('[data-unmerge-preview]');target.innerHTML='';
      const preview=await api('/api/guests/unmerge-preview?mergeId='+encodeURIComponent(id));
      target.innerHTML=unmergePreview(preview,{esc,field,form});target.scrollIntoView({block:'center'});notice('Review unchanged and later records, then type UNMERGE to confirm.');
    },'Preparing unmerge preview…');return;
  }
  if(action==='service-status'){serviceStatusId=id;const b=state.bookings.find(b=>b.id===id);$('#service-status-editor').innerHTML=statusEditor(b,state,data.serviceStages?.[id],{esc,form,select,field,who,time});$('#service-status-editor').scrollIntoView({block:'center'});return;}
  if(action==='edit-schedule'){$('#schedule-editor').innerHTML=scheduleEditor(state.schedules.find(s=>s.id===id),{form,field,select,esc});$('#schedule-editor').scrollIntoView({block:'center'});return;}
  if (action === 'edit-service') { $('#service-editor').innerHTML = serviceEditor(state.services.find(s => s.id === id)); $('#service-editor').scrollIntoView({block:'center'}); return; }
  if(action==='edit-pacing'){
    const s=state.services.find(s=>s.id===id);$('#service-editor').innerHTML=form('service.pacing',`<input type="hidden" name="serviceId" value="${esc(id)}">`+pacingFields(s,state,{field,esc}),'Save pacing');$('#service-editor details').open=true;$('#service-editor').scrollIntoView({block:'center'});return;
  }
  if (action === 'edit-turns') {
    const s=state.services.find(s=>s.id===id);
    $('#service-editor').innerHTML=`<article class="card"><h3>Review future turn rules for ${esc(s.name)}</h3>${form('service.turns',`<input type="hidden" name="serviceId" value="${esc(id)}">`+turnPolicyFields(s,state,{field,esc,localTime})+field('Review reason','reason','text','','required maxlength="1000"'),'Prepare turn policy')}</article>`;$('#service-editor').scrollIntoView({block:'center'});return;
  }
  if (action === 'edit-combination' || action === 'disable-combination') {
    if (!canEdit()) return;
    const combination = state.combinations.find(row => row.id === id);
    if (!combination) { notice('This combination is no longer available. Refresh the venue.', 'error'); return; }
    $('#combination-editor').innerHTML = combinationEditor(action === 'disable-combination' ? {...combination,enabled:false} : combination,state,{esc,field,select,form});
    $('#combination-editor').scrollIntoView({block:'center'}); return;
  }
  if(action==='edit-room' && canEdit()){ $('#room-editor').innerHTML=roomEditor(state.rooms.find(room=>room.id===id),{esc,field,select,form}); $('#room-editor').scrollIntoView({block:'center'}); return; }
  if(action==='cancel-table-edit'){ $('#table-editor').innerHTML=tableEditor(); return; }
  if (action === 'edit-table' && canEdit() && state.tables.some(table=>table.id===id&&!table.retiredAt)) { $('#table-editor').innerHTML = tableEditor(state.tables.find(t => t.id === id)); $('#table-editor').scrollIntoView({block:'center'}); return; }
  if (action === 'reassign') {
    const booking = state.bookings.find(b => b.id === id);
    assignmentId=id; $('#reassignment').innerHTML = renderAssignment(id);
    $('#reassignment').scrollIntoView({block:'center'}); return;
  }
  busy(async () => {
    if(action==='onboarding-preview'){const container=el.closest('details'),form=container.querySelector('form[data-command="service.save"]');if(!form.reportValidity())return;const payload=payloadFrom(form);const preview=await api('/api/onboarding/preview',payload);container.querySelector('[data-onboarding-preview]').innerHTML=bookingPreview(preview,{esc,select});notice('Booking page preview ready. No records were created.','success');return;}
    if (action === 'refresh') { await loadStaff(); notice('Venue refreshed.', 'success'); }
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
if (isPublic) publicSearch.load();
if (document.body.dataset.embedOrigin) reportHeight(document.body.dataset.embedOrigin);
else if(!isPublic) busy(async () => { await loadStaff(); floorSync.start(); notice(''); },'Loading…');

// Keep course timers advancing without replacing a host's open form.
if(!isPublic)setInterval(()=>document.querySelectorAll('[data-stage-since]').forEach(el=>{el.textContent=`${Math.max(0,Math.floor((Date.now()-Date.parse(el.dataset.stageSince))/60000))}m`;}),30000);

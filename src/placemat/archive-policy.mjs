import {portableServiceChanges,validateServiceDecisions} from './service-change-archive.mjs'
import {validatePaymentOperations} from './payment-operations-archive.mjs'
import {validateMoneyLedger} from './money-ledger-archive.mjs'
import {validateMerchantCollections} from './stripe-merchant-archive.mjs'
import {validateCosts} from './costs-archive.mjs'
import {validatePrivacy} from './privacy/archive.mjs'
import {validateFees} from './fee-archive.mjs'
import {validateGuestMerges} from './guest-merge-archive.mjs'
import {validateServiceNotes} from './service-notes-archive.mjs'
import {validateOnboarding} from './onboarding-archive.mjs'
import {validatePayments} from './payment-archive.mjs'
function validatePacing(s){
 for(const service of s.services){
  const p=service.pacing;if(p===undefined)continue
  if(!p||!Number.isInteger(p.intervalMinutes)||p.intervalMinutes<5||p.intervalMinutes>120||['arrivalCovers','arrivalParties','concurrentCovers'].some(k=>!Number.isInteger(p[k])||p[k]<1||p[k]>500)||!p.areaArrivalCaps||typeof p.areaArrivalCaps!=='object'||Array.isArray(p.areaArrivalCaps)||Object.entries(p.areaArrivalCaps).some(([area,n])=>!area.trim()||!Number.isInteger(n)||n<1||n>500))throw Error('Invalid service pacing')
 }
 for(const key of ['hostIds','pacingHostIds','leadIds','serverIds','financeIds'])if(s[key]!==undefined&&(!Array.isArray(s[key])||s[key].some(id=>typeof id!=='string')||new Set(s[key]).size!==s[key].length))throw Error('Invalid host grant')
 for(const b of s.bookings){const p=b.pacingOverride;if(p===undefined)continue
  if(!p||typeof p.actor!=='string'||!Number.isFinite(Date.parse(p.at))||typeof p.reason!=='string'||!Array.isArray(p.violations)||!p.violations.length||p.violations.some(v=>!v||typeof v.kind!=='string'||typeof v.label!=='string'||['limit','current','projected','excess'].some(k=>!Number.isInteger(v[k])||v[k]<0)||v.projected-v.limit!==v.excess||v.excess<1))throw Error('Invalid pacing override')
 }
}
function validServing(value){return value===null||value&&['serverId','sectionId','serverName','sectionName'].every(key=>typeof value[key]==='string'&&value[key].trim())}
function validateStaffing(s,tables){
 for(const service of s.services){
  const policy=service.staffing;if(policy===undefined)continue
  if(!policy||!Array.isArray(policy.servers)||!Array.isArray(policy.sections)||!policy.kitchenAreaCaps||typeof policy.kitchenAreaCaps!=='object'||Array.isArray(policy.kitchenAreaCaps))throw Error('Invalid shift staffing')
  const servers=new Set(),sections=new Set(),assigned=new Set(),linked=new Set()
  for(const server of policy.servers){
   if(server?.operatorId!==undefined&&(typeof server.operatorId!=='string'||!s.serverIds?.includes(server.operatorId)||linked.has(server.operatorId)))throw Error('Invalid server link')
   if(server?.operatorId!==undefined)linked.add(server.operatorId)
   if(!server||typeof server.id!=='string'||!server.id||servers.has(server.id)||typeof server.name!=='string'||!server.name.trim()||typeof server.onBreak!=='boolean'||!Number.isInteger(server.coverCap)||server.coverCap<1||server.coverCap>500)throw Error('Invalid shift server')
   servers.add(server.id)
  }
  for(const section of policy.sections){
   if(!section||typeof section.id!=='string'||!section.id||sections.has(section.id)||typeof section.name!=='string'||!section.name.trim()||!servers.has(section.serverId)||!Array.isArray(section.tableIds)||section.tableIds.some(id=>!tables.has(id)||assigned.has(id)||typeof id!=='string')||new Set(section.tableIds).size!==section.tableIds.length)throw Error('Invalid shift section')
   sections.add(section.id);for(const id of section.tableIds)assigned.add(id)
  }
  if(Object.entries(policy.kitchenAreaCaps).some(([area,cap])=>!area.trim()||!Number.isInteger(cap)||cap<1||cap>500))throw Error('Invalid kitchen cover cap')
  for(const b of s.bookings.filter(b=>b.serviceId===service.id)){
   if(b.serverId!==undefined&&(!servers.has(b.serverId)||!sections.has(b.sectionId)))throw Error('Broken serving relationship')
   if(policy.sections.length&&['booked','seated'].includes(b.status)&&!policy.sections.some(section=>section.id===b.sectionId&&section.serverId===b.serverId&&b.tableIds.every(id=>section.tableIds.includes(id))))throw Error('Broken active section assignment')
  }
 }
 for(const b of s.bookings)if(b.servingHistory!==undefined&&(!Array.isArray(b.servingHistory)||b.servingHistory.some(e=>!e||typeof e.id!=='string'||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||typeof e.actor!=='string'||typeof e.action!=='string'||!validServing(e.from)||!validServing(e.to)||e.reason!==undefined&&typeof e.reason!=='string')))throw Error('Invalid serving history')
}
// Both native rer export/import and the owner HTTP backup use this policy.
export default {
 product:'hospitality/placemat',
 // BOOK-002/DATA-003: analytics keys are write-only secrets and never leave the installation; a restore needs them entered again.
 excludeTables:['pm_payment_operation_custody','pm_report_schedules','pm_report_deliveries','pm_stripe_merchant','pm_stripe_collection_custody','pm_reservation_requests','pm_integration_keys','pm_integration_limits','pm_integration_audit','pm_integration_events','pm_integration_subscriptions','pm_integration_deliveries','pm_booking_holds','pm_fee_credentials','pm_booking_management','pm_group_invites','pm_group_links','pm_group_admins','pm_group_tokens','pm_group_home','pm_host_pins','pm_host_devices','pm_host_security_events','pm_agent_keys','pm_public_limits','pm_assertions','pm_analytics_keys','pm_analytics_results'],
 exportRow(table,row){
  if(table==='pm_state'){const state=JSON.parse(row.data);if(state.serviceChanges)state.serviceChanges=portableServiceChanges(state.serviceChanges);for(const p of state.proposals??[])if(p.plan?.snapshot?.serviceChanges)p.plan.snapshot.serviceChanges=portableServiceChanges(p.plan.snapshot.serviceChanges);return {...row,data:JSON.stringify(state)}}
  if(table==='pm_fee_assessments')return {...row,processing_until:0}
  if(table==='pm_refund_webhooks')return {...row,claim:''}
  if(table==='pm_payment_requests')return {...row,provider_url:null}
  return table==='pm_refunds'?{...row,processing_until:0}:row
 },
 requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
 async validateStaged({read}) {
  const rows=await read('pm_state'),guests=await read('pm_guests'),reports=await read('pm_performance_reports')
  await validateMoneyLedger(read,rows)
  await validatePaymentOperations(read,rows,guests)
  await validateMerchantCollections(read,guests,rows)
  await validatePrivacy(read,guests)
  await validateCosts(read)
  if(rows.length>1)throw Error('Invalid floor state')
  const ids=new Set(guests.map(row=>row.id))
  const bookingContacts=await read('pm_booking_contacts')
  for(const row of guests){const g=JSON.parse(row.data);if(g.id!==row.id||typeof g.name!=='string'||typeof g.email!=='string'||typeof g.notes!=='string')throw Error('Invalid guest')}
  if(!rows.length){if(reports.length||(await read('pm_guest_merges')).length)throw Error('Business journals need their venue state');await validatePayments({bookings:[]},read);await validateFees({bookings:[]},read);return}
  const s=JSON.parse(rows[0].data)
  validateGuestMerges(guests,await read('pm_guest_merges'),s)
  if(!s.venue||!['tables','services','bookings','waitlist','proposals','reminders','audit'].every(k=>Array.isArray(s[k])))throw Error('Invalid floor state')
  validateOnboarding(s)
  if(s.leadIds?.some(id=>s.hostIds?.includes(id))||s.serverIds?.some(id=>s.hostIds?.includes(id)||s.leadIds?.includes(id))||s.financeIds?.some(id=>s.hostIds?.includes(id)||s.leadIds?.includes(id)||s.serverIds?.includes(id)))throw Error('Conflicting staff grants')
  if(s.reportScopes!==undefined&&(!s.reportScopes||typeof s.reportScopes!=='object'||Array.isArray(s.reportScopes)||Object.entries(s.reportScopes).some(([id,ids])=>!id||!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!s.services.some(service=>service.id===id)))))throw Error('Invalid report scope')
  if(s.managerRefundLimits!==undefined&&(!s.managerRefundLimits||typeof s.managerRefundLimits!=='object'||Array.isArray(s.managerRefundLimits)||Object.entries(s.managerRefundLimits).some(([id,cents])=>!id||!Number.isInteger(cents)||cents<0||cents>100000000)))throw Error('Invalid refund authority limit')
  const inventoryIds=new Set()
  for(const i of s.inventories??[]){
   if(!i||typeof i.id!=='string'||inventoryIds.has(i.id)||typeof i.name!=='string'||!i.name.trim()||!['counter','pool'].includes(i.kind)||!Number.isInteger(i.capacity)||i.capacity<1||i.capacity>40||!Number.isInteger(i.turnMinutes)||i.turnMinutes<15||i.turnMinutes>360||!Number.isInteger(i.arrivalCovers)||i.arrivalCovers<1||i.arrivalCovers>500||!Number.isInteger(i.intervalMinutes)||i.intervalMinutes<5||i.intervalMinutes>120||typeof i.adjacent!=='boolean')throw Error('Invalid seat inventory')
   inventoryIds.add(i.id)
   const units=s.tables.filter(t=>t.inventoryId===i.id)
   if(units.length!==i.capacity||new Set(units.map(t=>t.ordinal)).size!==i.capacity||units.some(t=>t.inventoryKind!==i.kind||t.inventoryTurnMinutes!==i.turnMinutes||t.seats!==1||!Number.isInteger(t.ordinal)||t.ordinal<1||t.ordinal>i.capacity||t.area!==i.name||t.retiredAt))throw Error('Invalid inventory units')
  }
  if(s.tables.some(t=>(t.inventoryId!==undefined||t.inventoryKind!==undefined)&&!inventoryIds.has(t.inventoryId)))throw Error('Unknown seat inventory')
  if(s.bookings.some(b=>b.staffIntake!==undefined&&(!b.staffIntake||!['phone','concierge','offline'].includes(b.staffIntake.source)||!['email','sms','none'].includes(b.staffIntake.contactPreference)||typeof b.staffIntake.confirmationConsent!=='boolean'||b.source!=='phone')))throw Error('Invalid staff reservation intake')
  for(const b of s.bookings){
   const units=b.tableIds.map(id=>s.tables.find(t=>t.id===id))
   if(!units.some(t=>t?.inventoryId))continue
   const inventory=(s.inventories??[]).find(i=>i.id===units[0]?.inventoryId)
   if(!inventory||units.some(t=>t?.inventoryId!==inventory.id)||units.length!==b.partySize||new Set(b.tableIds).size!==b.tableIds.length||inventory.kind==='pool'&&b.status==='seated')throw Error('Invalid inventory booking')
   const ordinals=units.map(t=>t.ordinal).sort((a,b)=>a-b)
   if(inventory.adjacent&&ordinals.some((n,index)=>n!==ordinals[0]+index))throw Error('Invalid adjacent seats')
  }
  if(s.rooms!==undefined&&(!Array.isArray(s.rooms)||s.rooms.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||!r.name.trim()||!['indoor','outdoor','bar'].includes(r.kind))||new Set(s.rooms.map(r=>r.id)).size!==s.rooms.length||new Set(s.rooms.map(r=>r.name.toLowerCase())).size!==s.rooms.length))throw Error('Invalid rooms')
  if(s.tables.some(t=>!t||t.shape!==undefined&&!['round','square','rectangle','bar'].includes(t.shape)||t.retiredAt!==undefined&&(typeof t.retiredAt!=='string'||!Number.isFinite(Date.parse(t.retiredAt)))))throw Error('Invalid table shape or retirement')
  const tables=new Set(s.tables.map(t=>t.id)),services=new Set(s.services.map(t=>t.id))
  for(const row of reports){
   const report=JSON.parse(row.data)
   if(!services.has(row.service_id)||report.serviceId!==row.service_id||typeof row.id!=='string'||!Number.isFinite(Date.parse(row.published_at))||typeof row.published_by!=='string'||!Number.isInteger(row.floor_version)||!Array.isArray(report.rows)||!Array.isArray(report.queue?.rows)||!report.distributions||!Number.isFinite(Date.parse(report.generatedAt)))throw Error('Invalid published performance report')
   if(report.closure&&(!Number.isFinite(Date.parse(report.closure.at))||report.closure.at!==row.published_at||report.closure.actor!==row.published_by||report.closure.coverReport?.filters?.serviceId!==row.service_id||!Array.isArray(report.closure.coverReport?.rows)||report.closure.coverReport.rows.some(b=>!s.bookings.some(v=>v.id===b.bookingId&&v.serviceId===row.service_id))))throw Error('Invalid service closing report')
  }
  if(s.bookings.some(b=>!ids.has(b.guestId)||!services.has(b.serviceId)||!b.tableIds.every(id=>tables.has(id))))throw Error('Broken booking relationships')
  for(const service of s.services)if(service.directInventory!==undefined&&(!Array.isArray(service.directInventory)||new Set(service.directInventory.map(p=>p.id)).size!==service.directInventory.length||service.directInventory.some(p=>!p||typeof p.id!=='string'||!p.id||!Array.isArray(p.tableIds)||!p.tableIds.length||new Set(p.tableIds).size!==p.tableIds.length||p.tableIds.some(id=>!tables.has(id))||!Number.isInteger(p.partySize)||p.partySize<1||!Number.isFinite(Date.parse(p.startAt))||!Number.isFinite(Date.parse(p.endAt))||p.startAt<service.startAt||p.endAt>service.endAt||p.startAt>=p.endAt||p.releaseAt!==undefined&&(typeof p.releaseAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(p.releaseAt)||!Number.isFinite(Date.parse(p.releaseAt))||p.releaseAt>p.endAt))))throw Error('Invalid direct inventory')
  const requestShape=r=>r&&['occasion','dietaryNotes','allergyNotes','seatingPreference','requestedArea'].every(k=>typeof r[k]==='string')&&['stroller','highchair','wheelchair'].every(k=>typeof r[k]==='boolean')
  if(s.waitlist.some(w=>w.entryKind!==undefined&&!['walk-in','reservation-request'].includes(w.entryKind)||w.quote?.guestVisible!==undefined&&typeof w.quote.guestVisible!=='boolean'))throw Error('Invalid queue quote visibility or type')
  if(s.bookings.some(b=>b.requests!==undefined&&!requestShape(b.requests)))throw Error('Invalid booking requests')
  if(s.inquiries!==undefined&&(!Array.isArray(s.inquiries)||new Set(s.inquiries.map(i=>i.id)).size!==s.inquiries.length||s.inquiries.some(i=>!i||typeof i.id!=='string'||!ids.has(i.guestId)||typeof i.ownerId!=='string'||!['open','offered','accepted','converted','closed'].includes(i.status)||!Number.isInteger(i.partySize)||i.partySize<1||!requestShape(i.requests)||!Array.isArray(i.requiredAccessTags)||i.requiredAccessTags.some(t=>typeof t!=='string')||!Number.isFinite(Date.parse(i.replyDueAt))||!Array.isArray(i.messages)||i.messages.some(m=>!m||!['guest','venue'].includes(m.author)||typeof m.message!=='string'||!Number.isFinite(Date.parse(m.at)))||i.tokenHash!==undefined&&!/^[a-f0-9]{64}$/.test(i.tokenHash)||['converted','closed'].includes(i.status)&&i.tokenHash!==undefined||i.bookingId!==undefined&&!s.bookings.some(b=>b.id===i.bookingId&&b.guestId===i.guestId)||i.offer&&(!services.has(i.offer.serviceId)||i.offer.partySize!==i.partySize||!Number.isInteger(i.offer.version)||!Number.isFinite(Date.parse(i.offer.startAt))||!Number.isFinite(Date.parse(i.offer.endAt))||!Array.isArray(i.offer.requiredAccessTags)||!Array.isArray(i.offer.guarantees)))))throw Error('Invalid inquiries')
  if(s.serviceChanges!==undefined&&(!Array.isArray(s.serviceChanges)||new Set(s.serviceChanges.map(c=>c.id)).size!==s.serviceChanges.length||s.serviceChanges.some(c=>!c||typeof c.id!=='string'||!services.has(c.serviceId)||!['service','room','arrival','private'].includes(c.scope)||!Array.isArray(c.tableIds)||!c.tableIds.length||new Set(c.tableIds).size!==c.tableIds.length||c.tableIds.some(id=>!tables.has(id))||!Number.isFinite(Date.parse(c.startAt))||!Number.isFinite(Date.parse(c.endAt))||c.startAt>=c.endAt||typeof c.reason!=='string'||typeof c.approvedBy!=='string'||!Number.isFinite(Date.parse(c.approvedAt))||!Array.isArray(c.tasks)||c.tasks.some(t=>!t||typeof t.id!=='string'||!s.bookings.some(b=>b.id===t.bookingId)||!['open','failed-contact'].includes(t.status)||typeof t.ownerId!=='string'||typeof t.reason!=='string'||typeof t.updatedBy!=='string'||!Number.isFinite(Date.parse(t.updatedAt))||t.outcome!==undefined&&typeof t.outcome!=='string'))))throw Error('Invalid service changes')
  for(const b of s.bookings)if(b.handover!==undefined&&(!Array.isArray(b.handover)||b.handover.length>40||new Set(b.handover.map(t=>t.id)).size!==b.handover.length||b.handover.some(t=>!t||typeof t.id!=='string'||!['request','callback'].includes(t.kind)||typeof t.text!=='string'||typeof t.ownerId!=='string'||!Number.isFinite(Date.parse(t.dueAt))||!Array.isArray(t.history)||!t.history.length||t.history[0].action!=='assigned'||t.history.filter(e=>e.action==='completed').length>1||t.history.some(e=>!e||typeof e.actor!=='string'||!Number.isFinite(Date.parse(e.at))||!['assigned','completed'].includes(e.action)||e.action==='completed'&&typeof e.outcome!=='string'))))throw Error('Invalid handover task')
  validateServiceDecisions(s)
  validateServiceNotes(s)
  validateStaffing(s,tables)
  validatePacing(s)
  if(s.riskDecisions!==undefined&&(!Array.isArray(s.riskDecisions)||s.riskDecisions.some(d=>!s.bookings.some(b=>b.id===d.bookingId)||!['contact','policy-review'].includes(d.kind)||!['accepted','declined'].includes(d.decision)||typeof d.id!=='string'||typeof d.actor!=='string'||typeof d.reason!=='string'||!Number.isFinite(Date.parse(d.at))||!d.snapshot||!Array.isArray(d.snapshot.flags)||d.snapshot.flags.some(f=>typeof f!=='string')||typeof d.snapshot.status!=='string'||d.decision==='accepted'&&!Number.isFinite(Date.parse(d.dueAt))||d.completedAt!==undefined&&(!Number.isFinite(Date.parse(d.completedAt))||typeof d.completedBy!=='string'||typeof d.outcome!=='string'))))throw Error('Invalid no-show review work')
  const bookingIds=new Set(s.bookings.map(b=>b.id))
  for(const row of bookingContacts){const b=s.bookings.find(b=>b.id===row.booking_id),g=guests.find(g=>g.id===row.guest_id),contact=JSON.parse(row.data);if(!b||b.guestId!==row.guest_id||!g||JSON.parse(g.data).erased||!contact||['name','email','phone'].some(k=>typeof contact[k]!=='string')||!Number.isFinite(Date.parse(row.updated_at)))throw Error('Invalid reservation contact')}
  await validatePayments(s,read,new Set(guests.filter(row=>JSON.parse(row.data).erased===true).map(row=>row.id)))
  await validateFees(s,read,new Set(guests.filter(row=>JSON.parse(row.data).erased===true).map(row=>row.id)))
  if(s.serviceEvents!==undefined&&(!Array.isArray(s.serviceEvents)||s.serviceEvents.some(e=>!bookingIds.has(e.bookingId))))throw Error('Broken service observation relationships')
  if(s.waitlist.some(w=>!ids.has(w.guestId)||!services.has(w.serviceId)))throw Error('Broken waitlist relationships')
 },
}

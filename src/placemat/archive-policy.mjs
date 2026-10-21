import {validateGuestMerges} from './guest-merge-archive.mjs'
import {validateServiceNotes} from './service-notes-archive.mjs'
import {validateOnboarding} from './onboarding-archive.mjs'
function validatePacing(s){
 for(const service of s.services){
  const p=service.pacing;if(p===undefined)continue
  if(!p||!Number.isInteger(p.intervalMinutes)||p.intervalMinutes<5||p.intervalMinutes>120||['arrivalCovers','arrivalParties','concurrentCovers'].some(k=>!Number.isInteger(p[k])||p[k]<1||p[k]>500)||!p.areaArrivalCaps||typeof p.areaArrivalCaps!=='object'||Array.isArray(p.areaArrivalCaps)||Object.entries(p.areaArrivalCaps).some(([area,n])=>!area.trim()||!Number.isInteger(n)||n<1||n>500))throw Error('Invalid service pacing')
 }
 for(const key of ['hostIds','pacingHostIds'])if(s[key]!==undefined&&(!Array.isArray(s[key])||s[key].some(id=>typeof id!=='string')||new Set(s[key]).size!==s[key].length))throw Error('Invalid host grant')
 for(const b of s.bookings){const p=b.pacingOverride;if(p===undefined)continue
  if(!p||typeof p.actor!=='string'||!Number.isFinite(Date.parse(p.at))||typeof p.reason!=='string'||!Array.isArray(p.violations)||!p.violations.length||p.violations.some(v=>!v||typeof v.kind!=='string'||typeof v.label!=='string'||['limit','current','projected','excess'].some(k=>!Number.isInteger(v[k])||v[k]<0)||v.projected-v.limit!==v.excess||v.excess<1))throw Error('Invalid pacing override')
 }
}
function validServing(value){return value===null||value&&['serverId','sectionId','serverName','sectionName'].every(key=>typeof value[key]==='string'&&value[key].trim())}
function validateStaffing(s,tables){
 for(const service of s.services){
  const policy=service.staffing;if(policy===undefined)continue
  if(!policy||!Array.isArray(policy.servers)||!Array.isArray(policy.sections)||!policy.kitchenAreaCaps||typeof policy.kitchenAreaCaps!=='object'||Array.isArray(policy.kitchenAreaCaps))throw Error('Invalid shift staffing')
  const servers=new Set(),sections=new Set(),assigned=new Set()
  for(const server of policy.servers){
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
 excludeTables:['pm_agent_keys','pm_public_limits','pm_assertions','pm_analytics_keys','pm_analytics_results'],
 requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
 async validateStaged({read}) {
  const rows=await read('pm_state'),guests=await read('pm_guests'),reports=await read('pm_performance_reports')
  if(rows.length>1)throw Error('Invalid floor state')
  const ids=new Set(guests.map(row=>row.id))
  for(const row of guests){const g=JSON.parse(row.data);if(g.id!==row.id||typeof g.name!=='string'||typeof g.email!=='string'||typeof g.notes!=='string')throw Error('Invalid guest')}
  if(!rows.length){if(reports.length||(await read('pm_guest_merges')).length)throw Error('Business journals need their venue state');return}
  const s=JSON.parse(rows[0].data)
  validateGuestMerges(guests,await read('pm_guest_merges'),s)
  if(!s.venue||!['tables','services','bookings','waitlist','proposals','reminders','audit'].every(k=>Array.isArray(s[k])))throw Error('Invalid floor state')
  validateOnboarding(s)
  if(s.rooms!==undefined&&(!Array.isArray(s.rooms)||s.rooms.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||!r.name.trim()||!['indoor','outdoor','bar'].includes(r.kind))||new Set(s.rooms.map(r=>r.id)).size!==s.rooms.length||new Set(s.rooms.map(r=>r.name.toLowerCase())).size!==s.rooms.length))throw Error('Invalid rooms')
  if(s.tables.some(t=>!t||t.shape!==undefined&&!['round','square','rectangle','bar'].includes(t.shape)||t.retiredAt!==undefined&&(typeof t.retiredAt!=='string'||!Number.isFinite(Date.parse(t.retiredAt)))))throw Error('Invalid table shape or retirement')
  const tables=new Set(s.tables.map(t=>t.id)),services=new Set(s.services.map(t=>t.id))
  for(const row of reports){
   const report=JSON.parse(row.data)
   if(!services.has(row.service_id)||report.serviceId!==row.service_id||typeof row.id!=='string'||!Number.isFinite(Date.parse(row.published_at))||typeof row.published_by!=='string'||!Number.isInteger(row.floor_version)||!Array.isArray(report.rows)||!Array.isArray(report.queue?.rows)||!report.distributions||!Number.isFinite(Date.parse(report.generatedAt)))throw Error('Invalid published performance report')
   if(report.closure&&(!Number.isFinite(Date.parse(report.closure.at))||report.closure.at!==row.published_at||report.closure.actor!==row.published_by||report.closure.coverReport?.filters?.serviceId!==row.service_id||!Array.isArray(report.closure.coverReport?.rows)||report.closure.coverReport.rows.some(b=>!s.bookings.some(v=>v.id===b.bookingId&&v.serviceId===row.service_id))))throw Error('Invalid service closing report')
  }
  if(s.bookings.some(b=>!ids.has(b.guestId)||!services.has(b.serviceId)||!b.tableIds.every(id=>tables.has(id))))throw Error('Broken booking relationships')
  for(const service of s.services)if(service.directInventory!==undefined&&(!Array.isArray(service.directInventory)||new Set(service.directInventory.map(p=>p.id)).size!==service.directInventory.length||service.directInventory.some(p=>!p||typeof p.id!=='string'||!p.id||!Array.isArray(p.tableIds)||!p.tableIds.length||new Set(p.tableIds).size!==p.tableIds.length||p.tableIds.some(id=>!tables.has(id))||!Number.isInteger(p.partySize)||p.partySize<1||!Number.isFinite(Date.parse(p.startAt))||!Number.isFinite(Date.parse(p.endAt))||p.startAt<service.startAt||p.endAt>service.endAt||p.startAt>=p.endAt)))throw Error('Invalid direct inventory')
  const requestShape=r=>r&&['occasion','dietaryNotes','allergyNotes','seatingPreference','requestedArea'].every(k=>typeof r[k]==='string')&&['stroller','highchair','wheelchair'].every(k=>typeof r[k]==='boolean')
  if(s.bookings.some(b=>b.requests!==undefined&&!requestShape(b.requests)))throw Error('Invalid booking requests')
  if(s.inquiries!==undefined&&(!Array.isArray(s.inquiries)||new Set(s.inquiries.map(i=>i.id)).size!==s.inquiries.length||s.inquiries.some(i=>!i||typeof i.id!=='string'||!ids.has(i.guestId)||typeof i.ownerId!=='string'||!['open','offered','accepted','converted','closed'].includes(i.status)||!Number.isInteger(i.partySize)||i.partySize<1||!requestShape(i.requests)||!Array.isArray(i.requiredAccessTags)||i.requiredAccessTags.some(t=>typeof t!=='string')||!Number.isFinite(Date.parse(i.replyDueAt))||!Array.isArray(i.messages)||i.messages.some(m=>!m||!['guest','venue'].includes(m.author)||typeof m.message!=='string'||!Number.isFinite(Date.parse(m.at)))||i.tokenHash!==undefined&&!/^[a-f0-9]{64}$/.test(i.tokenHash)||['converted','closed'].includes(i.status)&&i.tokenHash!==undefined||i.bookingId!==undefined&&!s.bookings.some(b=>b.id===i.bookingId&&b.guestId===i.guestId)||i.offer&&(!services.has(i.offer.serviceId)||i.offer.partySize!==i.partySize||!Number.isInteger(i.offer.version)||!Number.isFinite(Date.parse(i.offer.startAt))||!Number.isFinite(Date.parse(i.offer.endAt))||!Array.isArray(i.offer.requiredAccessTags)||!Array.isArray(i.offer.guarantees)))))throw Error('Invalid inquiries')
  if(s.serviceChanges!==undefined&&(!Array.isArray(s.serviceChanges)||new Set(s.serviceChanges.map(c=>c.id)).size!==s.serviceChanges.length||s.serviceChanges.some(c=>!c||typeof c.id!=='string'||!services.has(c.serviceId)||!['service','room','arrival','private'].includes(c.scope)||!Array.isArray(c.tableIds)||!c.tableIds.length||new Set(c.tableIds).size!==c.tableIds.length||c.tableIds.some(id=>!tables.has(id))||!Number.isFinite(Date.parse(c.startAt))||!Number.isFinite(Date.parse(c.endAt))||c.startAt>=c.endAt||typeof c.reason!=='string'||typeof c.approvedBy!=='string'||!Number.isFinite(Date.parse(c.approvedAt))||!Array.isArray(c.tasks)||c.tasks.some(t=>!t||typeof t.id!=='string'||!s.bookings.some(b=>b.id===t.bookingId)||!['open','failed-contact'].includes(t.status)||typeof t.ownerId!=='string'||typeof t.reason!=='string'||typeof t.updatedBy!=='string'||!Number.isFinite(Date.parse(t.updatedAt))||t.outcome!==undefined&&typeof t.outcome!=='string'))))throw Error('Invalid service changes')
  validateServiceNotes(s)
  validateStaffing(s,tables)
  validatePacing(s)
  if(s.riskDecisions!==undefined&&(!Array.isArray(s.riskDecisions)||s.riskDecisions.some(d=>!s.bookings.some(b=>b.id===d.bookingId)||!['contact','policy-review'].includes(d.kind)||!['accepted','declined'].includes(d.decision)||typeof d.id!=='string'||typeof d.actor!=='string'||typeof d.reason!=='string'||!Number.isFinite(Date.parse(d.at))||!d.snapshot||!Array.isArray(d.snapshot.flags)||d.snapshot.flags.some(f=>typeof f!=='string')||typeof d.snapshot.status!=='string'||d.decision==='accepted'&&!Number.isFinite(Date.parse(d.dueAt))||d.completedAt!==undefined&&(!Number.isFinite(Date.parse(d.completedAt))||typeof d.completedBy!=='string'||typeof d.outcome!=='string'))))throw Error('Invalid no-show review work')
  const bookingIds=new Set(s.bookings.map(b=>b.id))
  if(s.serviceEvents!==undefined&&(!Array.isArray(s.serviceEvents)||s.serviceEvents.some(e=>!bookingIds.has(e.bookingId))))throw Error('Broken service observation relationships')
  if(s.waitlist.some(w=>!ids.has(w.guestId)||!services.has(w.serviceId)))throw Error('Broken waitlist relationships')
 },
}

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
 excludeTables:['pm_agent_keys','pm_public_limits','pm_assertions'],
 requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
 async validateStaged({read}) {
  const rows=await read('pm_state'),guests=await read('pm_guests')
  if(rows.length>1)throw Error('Invalid floor state')
  const ids=new Set(guests.map(row=>row.id))
  for(const row of guests){const g=JSON.parse(row.data);if(g.id!==row.id||typeof g.name!=='string'||typeof g.email!=='string'||typeof g.notes!=='string')throw Error('Invalid guest')}
  if(!rows.length)return
  const s=JSON.parse(rows[0].data)
  if(!s.venue||!['tables','services','bookings','waitlist','proposals','reminders','audit'].every(k=>Array.isArray(s[k])))throw Error('Invalid floor state')
  if(s.rooms!==undefined&&(!Array.isArray(s.rooms)||s.rooms.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||!r.name.trim()||!['indoor','outdoor','bar'].includes(r.kind))||new Set(s.rooms.map(r=>r.id)).size!==s.rooms.length||new Set(s.rooms.map(r=>r.name.toLowerCase())).size!==s.rooms.length))throw Error('Invalid rooms')
  if(s.tables.some(t=>!t||t.shape!==undefined&&!['round','square','rectangle','bar'].includes(t.shape)||t.retiredAt!==undefined&&(typeof t.retiredAt!=='string'||!Number.isFinite(Date.parse(t.retiredAt)))))throw Error('Invalid table shape or retirement')
  const tables=new Set(s.tables.map(t=>t.id)),services=new Set(s.services.map(t=>t.id))
  if(s.bookings.some(b=>!ids.has(b.guestId)||!services.has(b.serviceId)||!b.tableIds.every(id=>tables.has(id))))throw Error('Broken booking relationships')
  validateStaffing(s,tables)
  const bookingIds=new Set(s.bookings.map(b=>b.id))
  if(s.serviceEvents!==undefined&&(!Array.isArray(s.serviceEvents)||s.serviceEvents.some(e=>!bookingIds.has(e.bookingId))))throw Error('Broken service observation relationships')
  if(s.waitlist.some(w=>!ids.has(w.guestId)||!services.has(w.serviceId)))throw Error('Broken waitlist relationships')
 },
}

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
  const tables=new Set(s.tables.map(t=>t.id)),services=new Set(s.services.map(t=>t.id))
  if(s.bookings.some(b=>!ids.has(b.guestId)||!services.has(b.serviceId)||!b.tableIds.every(id=>tables.has(id))))throw Error('Broken booking relationships')
  const bookingIds=new Set(s.bookings.map(b=>b.id))
  if(s.serviceEvents!==undefined&&(!Array.isArray(s.serviceEvents)||s.serviceEvents.some(e=>!bookingIds.has(e.bookingId))))throw Error('Broken service observation relationships')
  if(s.waitlist.some(w=>!ids.has(w.guestId)||!services.has(w.serviceId)))throw Error('Broken waitlist relationships')
 },
}

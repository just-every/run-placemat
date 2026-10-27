const invalid=message=>Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})
/** Account data is portable; verification codes and sessions never travel. */
export async function validateDiners(read,rows,guests){
 const accounts=await read('pm_diner_accounts'),links=await read('pm_diner_bookings')
 const state=rows[0]?JSON.parse(rows[0].data):{bookings:[]}
 const people=new Map(guests.map(g=>[g.id,JSON.parse(g.data)])),ids=new Set(),emails=new Set(),pairs=new Set()
 for(const a of accounts){
  if(typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.email!=='string'||a.email!==a.email.trim().toLowerCase()||a.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)||emails.has(a.email)||![0,1].includes(a.favorite)||typeof a.preferences!=='string'||a.preferences.length>500||!Number.isFinite(Date.parse(a.created_at))||!Number.isFinite(Date.parse(a.updated_at)))throw invalid('Invalid diner account')
  ids.add(a.id);emails.add(a.email)
 }
 for(const link of links){
  const key=JSON.stringify([link.account_id,link.booking_id]),g=people.get(link.guest_id)
  if(!ids.has(link.account_id)||!g||g.erased||!state.bookings.some(b=>b.id===link.booking_id&&b.guestId===link.guest_id)||pairs.has(key)||!Number.isFinite(Date.parse(link.verified_at)))throw invalid('Invalid verified diner booking')
  pairs.add(key)
 }
}

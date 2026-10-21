const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const guest=value=>value&&typeof value.id==='string'&&['name','email','phone','notes'].every(key=>typeof value[key]==='string')
const kinds=['bookings','waitlist','reminders','inquiries']
/** Reject broken identity and reversal relationships before restoring any product row. */
export function validateGuestMerges(people,rows,state){
 const guests=new Map(people.map(row=>[row.id,JSON.parse(row.data)])),ids=new Set()
 for(const [id,g] of guests){
  if(g.mergedInto!==undefined){const target=guests.get(g.mergedInto);if(!target||target.erased||target.mergedInto||g.erased||g.mergedInto===id)throw Error('Invalid merged guest alias')}
  if(g.contacts!==undefined&&(!Array.isArray(g.contacts)||g.contacts.some(c=>!c||!['email','phone'].includes(c.kind)||typeof c.value!=='string'||!c.value||!guests.has(c.sourceGuestId))))throw Error('Invalid guest contact provenance')
 }
 for(const row of rows){
  const j=JSON.parse(row.data)
  if(!j||j.id!==row.id||ids.has(j.id)||!guests.has(j.guestId)||!guests.has(j.duplicateId)||j.guestId===j.duplicateId||!['merged','unmerged','erased'].includes(j.status)||!instant(j.createdAt)||typeof j.createdBy!=='string')throw Error('Invalid guest merge journal')
  ids.add(j.id)
  if(j.status==='erased'){
   if(!instant(j.purgedAt)||Object.keys(j).some(key=>!['id','guestId','duplicateId','status','createdAt','createdBy','purgedAt'].includes(key)))throw Error('Erased merge retains snapshots')
   continue
  }
  if(guests.get(j.guestId).erased||guests.get(j.duplicateId).erased)throw Error('Erased guest retains merge snapshots')
  const snapshots=j.snapshots
  if(!snapshots||!snapshots.guests||!Array.isArray(snapshots.records))throw Error('Missing guest merge snapshots')
  for(const [key,id] of [['survivor',j.guestId],['duplicate',j.duplicateId]]){
   const entry=snapshots.guests[key]
   if(!entry||!guest(entry.before)||!guest(entry.after)||entry.before.id!==id||entry.after.id!==id||!Number.isInteger(entry.afterVersion)||entry.afterVersion<1||entry.before.erased||entry.after.erased)throw Error('Invalid guest merge profile snapshot')
  }
  if(snapshots.guests.duplicate.after.mergedInto!==j.guestId)throw Error('Invalid merge snapshot alias')
  const records=new Set()
  for(const record of snapshots.records){
   const key=record.kind+':'+record.id
   if(!record||!kinds.includes(record.kind)||records.has(key)||!record.before||!record.after||record.before.id!==record.id||record.after.id!==record.id||![j.guestId,j.duplicateId].includes(record.before.guestId)||record.after.guestId!==j.guestId)throw Error('Invalid guest merge record snapshot')
   records.add(key)
   if(!(state[record.kind]??[]).some(row=>row.id===record.id))throw Error('Broken guest merge record relationship')
  }
  if(j.status==='merged'&&guests.get(j.duplicateId).mergedInto!==j.guestId)throw Error('Broken active merge alias')
  if(j.status==='unmerged'&&(!instant(j.unmergedAt)||typeof j.unmergedBy!=='string'||!Array.isArray(j.pendingAssignment)))throw Error('Invalid unmerge history')
  if(j.pendingAssignment!==undefined&&(!Array.isArray(j.pendingAssignment)||j.pendingAssignment.some(r=>!r||![...kinds,'guests'].includes(r.kind)||typeof r.id!=='string'||!['edited','created','missing'].includes(r.reason))))throw Error('Invalid unmerge assignment list')
 }
 for(const [id,g] of guests)if(g.mergedInto&&!rows.some(row=>{const j=JSON.parse(row.data);return j.status==='merged'&&j.duplicateId===id&&j.guestId===g.mergedInto}))throw Error('Merged alias lacks its journal')
}

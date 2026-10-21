const invalid=message=>{throw Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})}
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const guest=value=>value&&typeof value.id==='string'&&['name','email','phone','notes'].every(key=>typeof value[key]==='string')
const kinds=['bookings','waitlist','reminders','inquiries']
/** Reject broken identity and reversal relationships before restoring any product row. */
export function validateGuestMerges(people,rows,state){
 const guests=new Map(people.map(row=>[row.id,JSON.parse(row.data)])),ids=new Set()
 for(const [id,g] of guests){
  if(g.mergedInto!==undefined){const target=guests.get(g.mergedInto);if(!target||target.erased||target.mergedInto||g.erased||g.mergedInto===id)invalid('Invalid merged guest alias')}
  if(g.contacts!==undefined&&(!Array.isArray(g.contacts)||g.contacts.some(c=>!c||!['email','phone'].includes(c.kind)||typeof c.value!=='string'||!c.value||!guests.has(c.sourceGuestId))))invalid('Invalid guest contact provenance')
 }
 for(const row of rows){
  const j=JSON.parse(row.data)
  if(!j||j.id!==row.id||ids.has(j.id)||!guests.has(j.guestId)||!guests.has(j.duplicateId)||j.guestId===j.duplicateId||!['merged','unmerged','erased'].includes(j.status)||!instant(j.createdAt)||typeof j.createdBy!=='string')invalid('Invalid guest merge journal')
  ids.add(j.id)
  if(j.status==='erased'){
   if(!instant(j.purgedAt)||Object.keys(j).some(key=>!['id','guestId','duplicateId','status','createdAt','createdBy','purgedAt'].includes(key)))invalid('Erased merge retains snapshots')
   continue
  }
  if(guests.get(j.guestId).erased||guests.get(j.duplicateId).erased)invalid('Erased guest retains merge snapshots')
  const snapshots=j.snapshots
  if(!snapshots||!snapshots.guests||!Array.isArray(snapshots.records)||!Array.isArray(snapshots.auditIds)||snapshots.auditIds.some(id=>typeof id!=='string'))invalid('Missing guest merge snapshots')
  for(const [key,id] of [['survivor',j.guestId],['duplicate',j.duplicateId]]){
   const entry=snapshots.guests[key]
   if(!entry||!guest(entry.before)||!guest(entry.after)||entry.before.id!==id||entry.after.id!==id||!Number.isInteger(entry.afterVersion)||entry.afterVersion<1||entry.before.erased||entry.after.erased)invalid('Invalid guest merge profile snapshot')
  }
  if(snapshots.guests.duplicate.after.mergedInto!==j.guestId)invalid('Invalid merge snapshot alias')
  const records=new Set()
  for(const record of snapshots.records){
   const key=record.kind+':'+record.id
   if(!record||!kinds.includes(record.kind)||records.has(key)||!record.before||!record.after||record.before.id!==record.id||record.after.id!==record.id||![j.guestId,j.duplicateId].includes(record.before.guestId)||record.after.guestId!==j.guestId)invalid('Invalid guest merge record snapshot')
   records.add(key)
   if(!(state[record.kind]??[]).some(row=>row.id===record.id))invalid('Broken guest merge record relationship')
  }
  if(j.status==='merged'&&guests.get(j.duplicateId).mergedInto!==j.guestId)invalid('Broken active merge alias')
  if(j.status==='unmerged'&&(!instant(j.unmergedAt)||typeof j.unmergedBy!=='string'||!Array.isArray(j.pendingAssignment)))invalid('Invalid unmerge history')
  if(j.pendingAssignment!==undefined&&(!Array.isArray(j.pendingAssignment)||j.pendingAssignment.some(r=>!r||![...kinds,'guests'].includes(r.kind)||typeof r.id!=='string'||!['edited','created','missing'].includes(r.reason))))invalid('Invalid unmerge assignment list')
 }
 for(const [id,g] of guests)if(g.mergedInto&&!rows.some(row=>{const j=JSON.parse(row.data);return j.status==='merged'&&j.duplicateId===id&&j.guestId===g.mergedInto}))invalid('Merged alias lacks its journal')
}

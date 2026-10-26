const invalid=message=>{throw Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const label=(value,max=200)=>typeof value==='string'&&value.trim().length>0&&value.length<=max
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value
function image(value){
 if(value==='')return true
 if(typeof value!=='string'||value.length>280000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false
 try{
  const bytes=atob(value.slice(value.indexOf(',')+1))
  if(bytes.length>200000)return false
  return value.startsWith('data:image/png;')?bytes.startsWith('\x89PNG\r\n\x1a\n'):value.startsWith('data:image/jpeg;')?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'
 }catch{return false}
}
function distinct(values,max){return Array.isArray(values)&&values.length>0&&values.length<=max&&values.every(value=>label(value))&&new Set(values).size===values.length}

/** Catalog business records, including drafts and uploaded image bytes, restore together. */
export function validateExperiences(s){
 if(s.experiences===undefined)return
 if(!Array.isArray(s.experiences))invalid('Invalid experience catalog')
 const ids=new Set()
 for(const entry of s.experiences){
  if(!record(entry)||!label(entry.id,100)||ids.has(entry.id)||!integer(entry.version,1,Number.MAX_SAFE_INTEGER)||!['draft','published'].includes(entry.status)||!label(entry.name,120)||!image(entry.image)||!label(entry.menu,8000)||!label(entry.cancellationRules,4000))invalid('Invalid experience catalog entry')
  ids.add(entry.id)
  if(!['free','deposit','prepaid'].includes(entry.kind)||entry.currency!=='USD'||!integer(entry.amountCents,entry.kind==='free'?0:1,100000000)||entry.kind==='free'&&entry.amountCents!==0)invalid('Invalid experience pricing or publication')
  if(!instant(entry.createdAt)||!instant(entry.updatedAt)||entry.createdAt>entry.updatedAt||!label(entry.createdBy)||!label(entry.updatedBy))invalid('Invalid experience attribution')
  if(entry.status==='published'&&(!instant(entry.publishedAt)||!label(entry.publishedBy)||entry.publishedAt<entry.createdAt||entry.publishedAt>entry.updatedAt)||entry.status==='draft'&&(entry.publishedAt!==undefined||entry.publishedBy!==undefined))invalid('Invalid experience publication history')
  if(!distinct(entry.serviceIds,31)||!distinct(entry.areas,30)||!integer(entry.turnMinutes,15,360)||!integer(entry.cleanupMinutes,0,120)||!record(entry.lastSeatingAt)||Object.keys(entry.lastSeatingAt).length!==entry.serviceIds.length||Object.keys(entry.lastSeatingAt).some(id=>!entry.serviceIds.includes(id)))invalid('Invalid experience dates or turn policy')
  for(const area of entry.areas)if(!s.tables.some(table=>!table.inventoryId&&(table.area??'Dining room')===area))invalid('Broken experience seating area relationship')
  for(const serviceId of entry.serviceIds){
   const service=s.services.find(row=>row.id===serviceId),cutoff=entry.lastSeatingAt[serviceId]
   if(!service||service.status!=='published'||!instant(cutoff)||cutoff<service.startAt||cutoff>service.endAt||service.turnPolicy?.lastSeatingAt&&cutoff>service.turnPolicy.lastSeatingAt||Date.parse(cutoff)+(entry.turnMinutes+entry.cleanupMinutes)*60000>Date.parse(service.endAt))invalid('Broken experience service relationship or turn fit')
  }
  if(!Array.isArray(entry.ticketClasses)||!entry.ticketClasses.length||entry.ticketClasses.length>20)invalid('Invalid experience ticket classes')
  const classes=new Set(),names=new Set()
  for(const ticket of entry.ticketClasses){
   if(!record(ticket)||!label(ticket.id,100)||classes.has(ticket.id)||!label(ticket.name,120)||names.has(ticket.name.toLowerCase())||!integer(ticket.quantityLimit,1,500))invalid('Invalid experience ticket quantity')
   classes.add(ticket.id);names.add(ticket.name.toLowerCase())
  }
 }
}

/** Frozen experience terms on reservations retain their historical catalog version. */
export function validateExperienceBookings(s){
 for(const b of s.bookings){
  const e=b.experience;if(e===undefined)continue
  const entry=s.experiences?.find(row=>row.id===e.id)
  if(!record(e)||!entry||!integer(e.version,1,entry.version)||!label(e.classId,100)||!label(e.className,120)||!integer(e.quantityLimit,1,500)||!label(e.name,120)||!label(e.menu,8000)||!label(e.cancellationRules,4000)||e.kind!=='free'||e.amountCents!==0||e.currency!=='USD'||!distinct(e.serviceIds,31)||!e.serviceIds.includes(b.serviceId)||!distinct(e.areas,30)||!integer(e.turnMinutes,15,360)||!integer(e.cleanupMinutes,0,120)||!record(e.lastSeatingAt)||e.serviceIds.some(id=>!s.services.some(row=>row.id===id)||!instant(e.lastSeatingAt[id])))invalid('Invalid frozen experience commitment')
  if(b.tableIds.some(id=>!e.areas.includes(s.tables.find(t=>t.id===id)?.area??'Dining room'))||b.startAt>e.lastSeatingAt[b.serviceId]||Date.parse(b.endAt)-Date.parse(b.startAt)<e.turnMinutes*60000||Date.parse(b.cleanupEndAt??b.endAt)-Date.parse(b.endAt)<e.cleanupMinutes*60000)invalid('Broken experience reservation fit')
  const used=s.bookings.filter(row=>row.serviceId===b.serviceId&&row.experience?.id===e.id&&row.experience.classId===e.classId&&['booked','seated','completed'].includes(row.status)).reduce((n,row)=>n+row.partySize,0)
  if(used>e.quantityLimit)invalid('Oversold experience ticket inventory')
 }
}

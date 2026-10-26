import {fail,type State,type Service,type Booking} from './model'
import type {Experience} from './experiences'
import {tableTurn} from './turn-policy'
export type ExperienceCommitment=Pick<Experience,'id'|'version'|'name'|'menu'|'kind'|'amountCents'|'currency'|'serviceIds'|'areas'|'turnMinutes'|'cleanupMinutes'|'lastSeatingAt'|'cancellationRules'|'addOns'|'dietaryChoices'>&{classId:string;className:string;quantityLimit:number}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
export function experienceService(service:Service,entry:Pick<Experience,'turnMinutes'|'cleanupMinutes'|'lastSeatingAt'>):Service{
 const policy=service.turnPolicy,minimum=entry.turnMinutes
 const at=entry.lastSeatingAt[service.id]
 if(!at)fail(409,'This experience does not include the selected service date.')
 const lastSeatingAt=policy?.lastSeatingAt&&policy.lastSeatingAt<at?policy.lastSeatingAt:at
 return {...service,turnMinutes:minimum,turnPolicy:{cleanupMinutes:Math.max(entry.cleanupMinutes,policy?.cleanupMinutes??0),lastSeatingAt,partyTurns:(policy?.partyTurns??[]).map(r=>({...r,minutes:Math.max(minimum,r.minutes)})),tableTurns:Object.fromEntries(Object.entries(policy?.tableTurns??{}).map(([id,n])=>[id,Math.max(minimum,n)])),areaTurns:Object.fromEntries(Object.entries(policy?.areaTurns??{}).map(([area,n])=>[area,Math.max(minimum,n)]))}}
}
export function validateExperiencePublication(s:State,entry:Experience){
 for(const serviceId of entry.serviceIds){
  const service=s.services.find(row=>row.id===serviceId)??fail(409,'The experience service is no longer available.')
  const effective=experienceService(service,entry)
  for(const ticket of entry.ticketClasses){
   const reserved=s.bookings.filter(b=>b.serviceId===service.id&&b.experience?.id===entry.id&&b.experience.classId===ticket.id&&['booked','seated','completed'].includes(b.status)).reduce((n,b)=>n+b.partySize,0)
   if(reserved>ticket.quantityLimit)fail(409,'The ticket quantity cannot exclude existing experience reservations.')
  }
  for(const area of entry.areas){
   const tables=s.tables.filter(t=>!t.retiredAt&&!t.inventoryId&&(t.area??'Dining room')===area)
   if(!tables.length)fail(409,'Every published experience area must retain active physical tables.')
   for(const table of tables){
    const partyRules=effective.turnPolicy!.partyTurns
    const longest=Math.max(tableTurn(effective,table,1),...partyRules.map(r=>tableTurn(effective,table,r.minSize)))
    if(Date.parse(effective.turnPolicy!.lastSeatingAt!)+(longest+effective.turnPolicy!.cleanupMinutes)*60000>Date.parse(service.endAt))fail(409,'Experience last seating must fit the longest applicable table, area and party turn plus cleanup. Review its dates before publication.')
   }
  }
 }
}
export function experienceContext(s:State,service:Service,p:any,partySize:number,existing?:ExperienceCommitment){
 if(!existing&&!p.experienceId){
  if(p.ticketClassId||p.experienceVersion!==undefined)fail(400,'Choose an experience before selecting its ticket class.')
  return {state:s,service,experience:undefined}
 }
 let experience:ExperienceCommitment
 if(existing)experience=existing
 else{
  const entry=s.experiences?.find(e=>e.id===p.experienceId)??fail(409,'This experience is unavailable. Refresh availability and choose again.')
  if(entry.status!=='published'||entry.kind!=='free')fail(409,'This experience is not open for online booking. Contact the venue; no money or reservation was taken.')
  if(p.experienceVersion!==entry.version)fail(409,'Experience terms changed. Refresh availability and explicitly choose a new time.')
  const ticket=entry.ticketClasses.find(t=>t.id===p.ticketClassId)??fail(409,'Choose a current experience ticket class.')
  const {id,version,name,menu,kind,amountCents,currency,serviceIds,areas,turnMinutes,cleanupMinutes,lastSeatingAt,cancellationRules}=entry
  experience=structuredClone({id,version,name,menu,kind,amountCents,currency,serviceIds,areas,turnMinutes,cleanupMinutes,lastSeatingAt,cancellationRules,addOns:entry.addOns??[],dietaryChoices:entry.dietaryChoices??[],classId:ticket.id,className:ticket.name,quantityLimit:ticket.quantityLimit})
 }
 if(!experience.serviceIds.includes(service.id))fail(409,'Choose a published seating date for this experience.')
 const used=s.bookings.filter(b=>b.serviceId===service.id&&['booked','seated','completed'].includes(b.status)&&b.experience?.id===experience.id&&b.experience.classId===experience.classId).reduce((n,b)=>n+b.partySize,0)
 const held=(s.holds??[]).filter(h=>h.serviceId===service.id&&h.expiresAt>new Date().toISOString()&&h.experience?.id===experience.id&&h.experience.classId===experience.classId).reduce((n,h)=>n+h.partySize,0)
 const currentClass=s.experiences?.find(e=>e.id===experience.id)?.ticketClasses.find(t=>t.id===experience.classId)
 const limit=currentClass?currentClass.quantityLimit:experience.quantityLimit
 if(used+held+partySize>limit)fail(409,'This experience ticket class is sold out for that date. Choose another class or date.')
 return {state:{...s,tables:s.tables.filter(t=>!t.inventoryId&&experience.areas.includes(t.area??'Dining room'))},service:experienceService(service,experience),experience}
}
/** Current door changes cannot discard a saved experience promise or exceed its ticket inventory. */
export function assertExperienceCommitments(previous:State,next:State){
 for(const entry of next.experiences??[])if(entry.status==='published')validateExperiencePublication(next,entry)
 for(const b of next.bookings){
  const before=previous.bookings.find(row=>row.id===b.id)
  if(before?.experience&&!same(before.experience,b.experience))fail(409,'Preserve the original experience and ticket terms on this reservation.')
  if(!b.experience||!['booked','seated','completed'].includes(b.status))continue
  const e=b.experience,service=next.services.find(s=>s.id===b.serviceId)
  if(!service||!e.serviceIds.includes(service.id)||b.tableIds.some(id=>{const t=next.tables.find(t=>t.id===id);return !t||!e.areas.includes(t.area??'Dining room')}))fail(409,'This reservation must keep its experience dates and seating areas.')
  if(b.startAt>e.lastSeatingAt[service!.id]||Date.parse(b.endAt)-Date.parse(b.startAt)<e.turnMinutes*60000||Date.parse(b.cleanupEndAt??b.endAt)-Date.parse(b.endAt)<e.cleanupMinutes*60000)fail(409,'Preserve the experience dining duration, cleanup and last seating.')
  const changed=!before||['serviceId','partySize','startAt','status'].some(key=>!same(before[key as keyof Booking],b[key as keyof Booking]))
  if(changed)experienceContext({...next,bookings:next.bookings.filter(row=>row.id!==b.id)},service!,{},b.partySize,e)
 }
}

import {demandRows,evaluateDemand,serviceFor} from './allocation-advisor'
import {candidateSets} from './combinations'
import {occupiedEndAt} from './capacity'
import {Problem,fail,id,type Actor,type DirectInventory,type Proposal,type State} from './model'
import {fitAt} from './turn-fit'
import {ruleFor} from './booking-rules'

const inputsFor=(s:State)=>structuredClone({venue:s.venue,services:s.services,bookings:s.bookings,tables:s.tables,combinations:s.combinations??[],waitlist:s.waitlist,serviceEvents:s.serviceEvents??[]})
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
export function adviseInventory(s:State,serviceId:string,now:string){
 const service=serviceFor(s,serviceId,now),rows=demandRows(s,serviceId),before=evaluateDemand(s,service,rows,now),alternatives:any[]=[]
 const step=ruleFor(service,'online').slotMinutes*60000,origin=Date.parse(service.startAt)
 const startAt=new Date(origin+Math.ceil((Math.max(origin,Date.parse(now)+ruleFor(service,'online').leadMinutes*60000)-origin)/step)*step).toISOString()
 for(const tableIds of candidateSets(s)){
  if(alternatives.length===2)break
  const capacity=tableIds.length===1?s.tables.find(t=>t.id===tableIds[0])!.seats:s.combinations!.find(c=>same([...c.tableIds].sort(),[...tableIds].sort()))!.capacity
  try{
   const rule=ruleFor(service,'online'),partySize=Math.min(capacity,rule.maxParty,rule.inquiryAbove)
   if(partySize<rule.minParty||rule.blockedStarts.includes(startAt))continue
   const fit=fitAt(s,service,partySize,startAt,tableIds)
   const protection={id:'candidate',tableIds,startAt:fit.setupStartAt,endAt:fit.cleanupEndAt,partySize}
   if((service.directInventory??[]).some(p=>p.startAt<protection.endAt&&p.endAt>protection.startAt&&p.tableIds.some(id=>tableIds.includes(id))))continue
   // No committed party can be displaced by a future channel restriction.
   if(s.bookings.some(b=>b.source!=='online'&&b.tableIds.some(id=>tableIds.includes(id))&&['booked','seated'].includes(b.status)&&(b.setupStartAt??b.startAt)<protection.endAt&&occupiedEndAt(b,now)>protection.startAt))continue
   const next={...service,directInventory:[...service.directInventory??[],protection]},staged={...s,services:s.services.map(v=>v.id===serviceId?next:v)}
   const after=evaluateDemand(staged,next,rows,now)
   if(after.feasibleQueuedCovers<before.feasibleQueuedCovers||after.requestedSlotCovers<before.requestedSlotCovers)continue
   const key=JSON.stringify([tableIds,startAt,fit.cleanupEndAt,partySize])
   alternatives.push({id:'inventory:'+encodeURIComponent(key),serviceId,protection,before,after,explanations:[`Protect ${capacity} physical seats for direct website bookings from ${protection.startAt} through ${protection.endAt}; a fitting online party may use them.`,`${before.requestedSlotCovers} queued covers fit their requested slots before; ${after.requestedSlotCovers} after. No current booking moves.`, 'This is reserved channel inventory, not a guest reservation, guaranteed demand or a delivery. Walk-in and waitlist seating must use other inventory until explicit release or the interval ends.']})
  }catch(error){if(error instanceof Problem&&[400,404,409].includes(error.status))continue;throw error}
 }
 return {serviceId,generatedAt:now,before,alternatives,protected:service.directInventory??[]}
}
export function prepareInventory(s:State,p:any,now:string){
 const report=adviseInventory(s,p.serviceId,now)
 if(p.releaseId){
  const protection=report.protected.find(v=>v.id===p.releaseId)??fail(409,'This protected interval no longer exists.')
  return {serviceId:p.serviceId,action:'release',protection:structuredClone(protection),inputs:inputsFor(s),preview:{explanations:['Release this exact interval to all current booking channels. No booking changes.']}}
 }
 const alternative=report.alternatives.find(v=>v.id===p.alternativeId)??fail(409,'Refresh direct inventory advice and select a current alternative.')
 return {serviceId:p.serviceId,action:'protect',protection:{...structuredClone(alternative.protection),id:id()},inputs:inputsFor(s),preview:structuredClone(alternative)}
}
export function approveInventory(s:State,actor:Actor,proposal:Proposal,now:string){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must approve protected inventory.')
 const plan=proposal.plan,service=serviceFor(s,plan.serviceId,now)
 if(!same(plan.inputs,inputsFor(s)))fail(409,'Inventory inputs changed. Prepare and review fresh advice.')
 const before=structuredClone(service.directInventory??[])
 if(plan.action==='release'){
  if(!before.some(v=>same(v,plan.protection)))fail(409,'This protection changed. Review its release again.')
  service.directInventory=before.filter(v=>v.id!==plan.protection.id)
 }else{
  const report=adviseInventory(s,service.id,now)
  if(!report.alternatives.some(v=>same({...v.protection,id:plan.protection.id},plan.protection)))fail(409,'This interval is no longer feasible. Prepare fresh advice.')
  service.directInventory=[...before,structuredClone(plan.protection) as DirectInventory]
 }
 service.version++
 s.audit.push({id:id(),actor:actor.id,at:now,action:'inventory.protect',subject:service.id,reason:proposal.reason})
 return service
}

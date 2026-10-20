import {demandRows,evaluateDemand,type AllocationDemand,type AllocationWait} from './allocation-advisor'
import {fail,id,type Actor,type Booking,type Proposal,type Service,type State} from './model'

export type ShiftAdjustmentPreview={
 beforeEndAt:string;afterEndAt:string;unchangedBookingIds:string[];unchangedBookings:Booking[];
 waits:Array<{waitlistId:string;partySize:number;requestedAt:string;requestedSlotAt:string;before:Pick<AllocationWait,'earliestAt'|'waitMinutes'|'delayMinutes'>;after:Pick<AllocationWait,'earliestAt'|'waitMinutes'|'delayMinutes'>}>;
 explanations:string[]
}
export type ShiftAdjustmentAlternative={
 id:string;key:string;serviceId:string;extensionMinutes:number;endAt:string;
 before:AllocationDemand;after:AllocationDemand;preview:ShiftAdjustmentPreview
}
const inputsFor=(s:State)=>structuredClone({venue:s.venue,services:s.services,bookings:s.bookings,tables:s.tables,allocationTables:s.allocationTables??null,combinations:s.combinations??[],serviceEvents:s.serviceEvents??[],waitlist:s.waitlist})
export type ShiftAdjustmentSelection={serviceId:string;alternativeId:string}
export type ShiftAdjustmentPlan={serviceId:string;alternativeId:string;extensionMinutes:number;endAt:string;generatedAt:string;preview:ShiftAdjustmentPreview;inputs:ReturnType<typeof inputsFor>}
const basis='Conditional feasibility for recorded eligible waiting parties in queue priority order, using published channel rules and approved table combinations with full setup, turn, cleanup, access, area, physical occupancy, staffing, kitchen and pacing checks. Extending hours does not reserve capacity, promise a wait or change any booking commitment. Existing staffing and policies must remain available throughout the extension.'

function serviceFor(s:State,serviceId:string,now:string){
 if(!Number.isFinite(Date.parse(now)))fail(400,'A valid shift advice time is required.')
 const service=s.services.find(v=>v.id===serviceId)??fail(404,'Service not found.')
 if(service.status!=='published'||service.closedAt||Date.parse(service.endAt)<=Date.parse(now))fail(409,'Choose an open, published service with remaining seating time.')
 return service
}
function extendedService(s:State,service:Service,minutes:number,now:string):Service|null{
 if(![30,60,90].includes(minutes))return null
 const end=Date.parse(service.endAt)+minutes*60000,start=Date.parse(service.startAt)
 if(!Number.isFinite(end)||!Number.isFinite(start)||end-start>1440*60000)return null
 // Refuse overlapping service hours even when the other service uses different tables.
 if(s.services.some(v=>v.id!==service.id&&v.status==='published'&&!v.closedAt&&Date.parse(v.endAt)>Date.parse(now)&&Date.parse(v.startAt)<end&&Date.parse(v.endAt)>start))return null
 return {...service,endAt:new Date(end).toISOString(),version:service.version+1}
}
function improves(before:AllocationDemand,after:AllocationDemand){
 return after.feasibleQueuedCovers>before.feasibleQueuedCovers||after.feasibleQueuedCovers>=before.feasibleQueuedCovers&&before.waits.some(old=>{
  const next=after.waits.find(w=>w.waitlistId===old.waitlistId)
  return old.earliestAt!==null&&next?.earliestAt!=null&&Date.parse(next.earliestAt)<Date.parse(old.earliestAt)
 })
}
function preview(s:State,service:Service,next:Service,before:AllocationDemand,after:AllocationDemand):ShiftAdjustmentPreview{
 const unchangedBookings=structuredClone(s.bookings.filter(b=>b.serviceId===service.id))
 const terms=(wait:AllocationWait)=>({earliestAt:wait.earliestAt,waitMinutes:wait.waitMinutes,delayMinutes:wait.delayMinutes})
 return {beforeEndAt:service.endAt,afterEndAt:next.endAt,unchangedBookingIds:unchangedBookings.map(b=>b.id),unchangedBookings,
  waits:before.waits.map(old=>({waitlistId:old.waitlistId,partySize:old.partySize,requestedAt:old.requestedAt,requestedSlotAt:old.requestedSlotAt,before:terms(old),after:terms(after.waits.find(w=>w.waitlistId===old.waitlistId)!)})),
  explanations:[`Extend the published end from ${service.endAt} to ${next.endAt}; retain the service start, policies, tables and staffing.`,`${before.feasibleQueuedCovers} recorded queued covers fit before; ${after.feasibleQueuedCovers} after (${after.feasibleQueuedCovers-before.feasibleQueuedCovers} additional feasible covers).`,`${unchangedBookings.length} existing booking commitments remain unchanged, including arrival, departure, table assignment, access, setup and cleanup.`,'Waiting-party slots and minutes are conditional estimates checked in queue priority order, not reservations or quoted waits. No unrecorded demand is assumed.','Confirm the existing shift team and kitchen can operate through the extended end before approving; no roster availability beyond the recorded staffing is inferred.']}
}

/** Advice stages service hours only; demand consumes capacity solely in a private ledger. */
export function adviseShiftAdjustments(s:State,serviceId:string,now:string){
 const service=serviceFor(s,serviceId,now),rows=demandRows(s,serviceId),before=evaluateDemand(s,service,rows,now),alternatives:ShiftAdjustmentAlternative[]=[]
 if(!rows.length)return {serviceId,generatedAt:now,before,alternatives,basis}
 for(const extensionMinutes of [30,60,90]){
  const next=extendedService(s,service,extensionMinutes,now)
  if(!next)continue
  const staged={...s,services:s.services.map(v=>v.id===service.id?next:v)},after=evaluateDemand(staged,next,rows,now)
  if(!improves(before,after))continue
  const key=`${extensionMinutes}:${next.endAt}`,alternativeId=`shift:${encodeURIComponent(serviceId)}:${key}`
  alternatives.push({id:alternativeId,key,serviceId,extensionMinutes,endAt:next.endAt,before,after,preview:preview(s,service,next,before,after)})
 }
 return {serviceId,generatedAt:now,before,alternatives,basis}
}
export function prepareShiftAdjustment(s:State,selection:ShiftAdjustmentSelection,now:string):ShiftAdjustmentPlan{
 const advice=adviseShiftAdjustments(s,selection.serviceId,now)
 const alternative=advice.alternatives.find(a=>a.id===selection.alternativeId)??fail(409,'This shift alternative is unavailable. Refresh advice and choose an exact alternative.')
 return {serviceId:selection.serviceId,alternativeId:alternative.id,extensionMinutes:alternative.extensionMinutes,endAt:alternative.endAt,generatedAt:now,preview:structuredClone(alternative.preview),inputs:inputsFor(s)}
}
export function approveShiftAdjustment(s:State,actor:Actor,proposal:Proposal,now:string){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must approve shift adjustments.')
 if(proposal.kind!=='service.adjust'||proposal.status!=='pending')fail(409,'Choose a pending shift adjustment proposal.')
 const plan=proposal.plan as ShiftAdjustmentPlan
 if(!plan||JSON.stringify(plan.inputs)!==JSON.stringify(inputsFor(s)))fail(409,'Shift inputs changed. Prepare and review fresh advice.')
 if(!Number.isFinite(Date.parse(plan.generatedAt))||!Number.isFinite(Date.parse(now))||Date.parse(now)<Date.parse(plan.generatedAt))fail(409,'The shift review time is stale. Prepare fresh advice.')
 // Recompute at approval time: an unchanged snapshot alone cannot preserve expired slots.
 const advice=adviseShiftAdjustments(s,plan.serviceId,now)
 const alternative=advice.alternatives.find(a=>a.id===plan.alternativeId&&a.endAt===plan.endAt&&a.extensionMinutes===plan.extensionMinutes)??fail(409,'This extension no longer improves recorded queue feasibility. Prepare fresh advice.')
 const service=serviceFor(s,plan.serviceId,now),before={endAt:service.endAt,version:service.version},after={endAt:alternative.endAt,version:service.version+1}
 const audit={id:id(),actor:actor.id,at:now,action:'service.adjust',subject:service.id,before,after,reason:proposal.reason}
 service.endAt=after.endAt;service.version=after.version;s.audit.push(audit)
 return {serviceId:service.id,extensionMinutes:alternative.extensionMinutes,preview:alternative.preview,before,after,audit}
}

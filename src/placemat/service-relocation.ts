import {bookingFit,serviceBy,instant} from './availability'
import {checkBookingRules} from './booking-rules'
import {searchTables} from './reservation-search'
import {checkStaffing,recordServing,servingFor} from './staffing-capacity'
import {fail,id,text,type Actor,type Booking,type State} from './model'
import {person} from './access'
export type Relocation={id:string;before:Booking;after:Booking;reason:string;reviewedBy:string;reviewedAt:string;expiresAt:string;tokenHash?:string;acceptedAt?:string;declinedAt?:string}
export function affected(s:State,p:any){
 const change=s.serviceChanges?.find(c=>c.id===p.changeId)??fail(404,'Service change not found.')
 const task=change.tasks.find(t=>t.id===p.taskId)??fail(404,'Affected booking task not found.')
 const booking=s.bookings.find(b=>b.id===task.bookingId)??fail(404,'Reservation not found.')
 return {change,task,booking}
}
export function personal(actor:Actor){person(actor);if(actor.deviceId)fail(403,'Use a personal manager session.')}
export function relocationFit(s:State,b:Booking,p:any){
 if(b.status!=='booked'||b.assignmentLocked||Date.parse(b.startAt)<=Date.now())fail(409,'Choose a future unlocked reservation.')
 const service=serviceBy(s,p.serviceId??b.serviceId),startAt=instant(p.startAt??b.startAt,'Arrival')
 if(service.status!=='published'||service.closedAt)fail(409,'Choose an open published service.')
 checkBookingRules(s,service,b.partySize,startAt,'online')
 // Required access remains binding. A guest reviews an explicit change of dining area.
 const area=p.area===undefined?b.requiredArea:p.area
 const ledger={...s,bookings:s.bookings.filter(row=>row.id!==b.id)}
 const {state:eligible,requiredArea}=searchTables(ledger,area,b.requiredAccessTags)
 const {tables,...slot}=bookingFit(eligible,service,b.partySize,startAt,'online',p.tableIds)
 const next={...b,...slot,serviceId:service.id,tableIds:tables.map(t=>t.id),requiredArea}
 if(!slot.combination)delete next.combination
 delete next.expectedEndAt;delete next.ruleOverride;delete next.pacingOverride
 checkStaffing(s,[next],new Date().toISOString(),new Set([b.id]))
 if(JSON.stringify(next)===JSON.stringify(b))fail(400,'Choose a different assignment or arrival.')
 return next
}
export function reviewRelocation(s:State,actor:Actor,p:any,now:string){
 personal(actor)
 const {task,booking}=affected(s,p)
 if(task.cancellation||task.relocation?.acceptedAt)fail(409,'This impact already has a completed decision.')
 const after=relocationFit(s,booking,p)
 const expiresAt=new Date(Math.min(Date.parse(now)+86400000,Date.parse(booking.startAt),Date.parse(after.startAt))).toISOString()
 task.relocation={id:id(),before:structuredClone(booking),after,reason:text(p.reason,'Relocation reason',500),reviewedBy:actor.id,reviewedAt:now,expiresAt}
 delete task.outreach
 task.updatedAt=now;task.updatedBy=actor.id;task.ownerId=actor.id
 return task
}
export async function cancelAffected(db:D1Database,s:State,actor:Actor,p:any,now:string){
 personal(actor)
 const {task,booking}=affected(s,p),reason=text(p.reason,'Cancellation and refund decision reason',500)
 if(booking.status!=='booked'||task.relocation?.acceptedAt)fail(409,'Choose an active affected reservation.')
 if(p.acknowledged!==true)fail(400,'Confirm cancellation and its refund decision.')
 let amountCents=0,refundId:string|undefined
 const charges=await db.prepare('SELECT COALESCE(SUM(amount_cents-imported_refunded_cents),0) AS cents FROM pm_refund_charges WHERE booking_id=?').bind(booking.id).first<{cents:number}>()
 if(p.refundId){
  const refund=await db.prepare("SELECT id,amount_cents FROM pm_refunds WHERE id=? AND booking_id=? AND status='succeeded' AND processor_id IS NOT NULL").bind(text(p.refundId,'Confirmed refund'),booking.id).first<{id:string;amount_cents:number}>()
  if(!refund||p.amountCents!==refund.amount_cents)fail(409,'Review a provider-confirmed succeeded refund for this reservation with its exact integer cents.')
  amountCents=refund!.amount_cents;refundId=refund!.id
 }else if(charges?.cents||p.amountCents!==0)fail(409,'Review the captured charge and confirm its refund through Payments before cancellation.')
 booking.status='cancelled';task.status='resolved'
 task.cancellation={at:now,actor:actor.id,reason,amountCents,...refundId?{refundId}:{}}
 if(task.relocation)delete task.relocation.tokenHash
 task.updatedAt=now;task.updatedBy=actor.id;task.ownerId=actor.id
 s.audit.push({id:id(),actor:actor.id,at:now,action:'service.cancel',subject:booking.id,reason})
 return task
}
export function acceptRelocation(s:State,task:import('./service-changes').ChangeTask,now:string){
 const offer=task.relocation!,b=s.bookings.find(b=>b.id===task.bookingId)??fail(404,'Reservation not found.')
 if(JSON.stringify(b)!==JSON.stringify(offer.before))fail(409,'Your reservation changed. Ask the venue for a renewed offer; the original reservation is preserved.')
 const checked=relocationFit(s,b,{serviceId:offer.after.serviceId,startAt:offer.after.startAt,tableIds:offer.after.tableIds,area:offer.after.requiredArea??''})
 for(const key of ['startAt','endAt','cleanupEndAt','setupStartAt','serviceId','tableIds','requiredArea'] as const)if(JSON.stringify(checked[key])!==JSON.stringify(offer.after[key]))fail(409,'The offered assignment changed. Ask the venue for a renewed offer.')
 Object.assign(b,checked);recordServing(b,servingFor(s,b.serviceId,b.tableIds),'guest',now,'service.relocation.accepted')
 task.status='resolved';offer.acceptedAt=now;delete offer.tokenHash
 task.updatedAt=now;task.updatedBy='guest'
 s.audit.push({id:id(),actor:'guest',source:'guest-supplied',at:now,action:'service.relocation.accepted',subject:b.id})
 return b
}

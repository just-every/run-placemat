import type {State} from './model'
import type {D1Database,D1Sql} from './import/kit'

/** Guest-linked operational free text follows the existing DATA-002 erasure. */
export async function guestStateErasure(db:D1Database,guestId:string):Promise<D1Sql[]>{
 const row=await db.prepare('SELECT version,data FROM pm_state WHERE id=1').first()
 if(!row)return []
 const state=JSON.parse(row.data) as State
 const bookings=[...state.bookings,...state.proposals.flatMap(p=>[...(p.plan?.bookings??[]),...(p.plan?.snapshot?.bookings??[]),...(p.plan?.booking?[p.plan.booking]:[])])]
 for(const b of bookings)if(b.guestId===guestId){if(b.ruleOverride)b.ruleOverride.reason='';if(b.requiredAccessTags)b.requiredAccessTags=[]}
 const bookingIds=new Set(state.bookings.filter(b=>b.guestId===guestId).map(b=>b.id))
 for(const event of state.serviceEvents??[])if(bookingIds.has(event.bookingId))event.reason=''
 for(const event of state.audit)if(bookingIds.has(event.subject)||[event.before,event.after].some(rows=>Array.isArray(rows)&&rows.some(row=>bookingIds.has(row.bookingId))))event.reason=''
 const relatedServices=new Set(state.waitlist.filter(w=>w.guestId===guestId).map(w=>w.serviceId))
 const closeReasons=new Set(state.services.filter(s=>relatedServices.has(s.id)).map(s=>s.closeReason).filter(Boolean))
 for(const service of state.services)if(relatedServices.has(service.id))service.closeReason=''
 for(const proposal of state.proposals){
  if(relatedServices.has(proposal.plan?.service?.id))proposal.plan.service.closeReason=''
  for(const service of [...(proposal.plan?.snapshot?.services??[]),...(proposal.plan?.candidates??[]).map((c:any)=>c.service)])if(relatedServices.has(service?.id))service.closeReason=''
 }
 for(const row of state.waitlist){
  if(row.guestId===guestId){
   if(row.quote)row.quote.basis=''
   for(const event of row.history??[]){event.reason='';if(event.details&&typeof event.details==='object'&&'basis' in event.details)(event.details as {basis:string}).basis='';const quote=(event.details as any)?.quote;if(quote&&typeof quote==='object')quote.basis=''}
   for(const task of row.followUps??[]){task.reason='';if(task.outcome)task.outcome=''}
  }
  // Service-close instructions are copied onto unresolved entries; erase every copy.
  if(relatedServices.has(row.serviceId)){
   for(const event of row.history??[])if(event.action==='service-closed')event.reason=''
   for(const task of row.followUps??[])if(task.kind==='service-close'||closeReasons.has(task.reason))task.reason=''
  }
 }

 return [
  {sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END',params:[row.version]},
  {sql:'UPDATE pm_state SET data=?,version=version+1 WHERE id=1 AND version=?',params:[JSON.stringify(state),row.version]},
 ]
}

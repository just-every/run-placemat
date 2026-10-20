import type {State} from './model'
import type {D1Database,D1Sql} from './import/kit'

const proposalBookings=(plan:any)=>[...(plan?.bookings??[]),...(plan?.snapshot?.bookings??[]),...(plan?.assignmentInputs?.bookings??[]),...(plan?.booking?[plan.booking]:[])]

/** Guest-linked operational free text follows the existing DATA-002 erasure. */
export async function guestStateErasure(db:D1Database,guestId:string):Promise<D1Sql[]>{
 const row=await db.prepare('SELECT version,data FROM pm_state WHERE id=1').first()
 if(!row)return []
 const state=JSON.parse(row.data) as State
 const bookings=[...state.bookings,...state.proposals.flatMap(p=>proposalBookings(p.plan))]
 for(const b of bookings)if(b.guestId===guestId){if(b.ruleOverride)b.ruleOverride.reason='';if(b.pacingOverride)b.pacingOverride.reason='';if(b.requiredAccessTags)b.requiredAccessTags=[];delete b.requiredArea;for(const event of b.servingHistory??[])event.reason=''}
 const bookingIds=new Set(state.bookings.filter(b=>b.guestId===guestId).map(b=>b.id))
 for(const event of state.serviceEvents??[])if(bookingIds.has(event.bookingId))event.reason=''
 for(const event of state.audit)if(bookingIds.has(event.subject)||[event.before,event.after].some(rows=>Array.isArray(rows)&&rows.some(row=>bookingIds.has(row.bookingId)))){event.reason='';if(event.pacing)event.pacing.reason=''}
 for(const task of state.riskDecisions??[])if(bookingIds.has(task.bookingId)){task.reason='';if(task.outcome)task.outcome=''}
 const relatedServices=new Set(state.waitlist.filter(w=>w.guestId===guestId).map(w=>w.serviceId))
 const closeReasons=new Set(state.services.filter(s=>relatedServices.has(s.id)).map(s=>s.closeReason).filter(Boolean))
 for(const service of state.services)if(relatedServices.has(service.id))service.closeReason=''
 for(const proposal of state.proposals){
  if(proposalBookings(proposal.plan).some(b=>b.guestId===guestId)||bookingIds.has(proposal.plan?.bookingId))proposal.reason=''
  for(const event of [...(proposal.plan?.snapshot?.serviceEvents??[]),...(proposal.plan?.assignmentInputs?.serviceEvents??[])])if(bookingIds.has(event.bookingId))event.reason=''
  if(relatedServices.has(proposal.plan?.service?.id))proposal.plan.service.closeReason=''
  for(const service of [...(proposal.plan?.snapshot?.services??[]),...(proposal.plan?.assignmentInputs?.services??[]),...(proposal.plan?.candidates??[]).map((c:any)=>c.service)])if(relatedServices.has(service?.id))service.closeReason=''
 }
 for(const row of state.waitlist){
  if(row.guestId===guestId){
   delete row.managementTokenHash;row.requiredAccessTags=[];row.contactConsent=false;delete row.preferredArea;delete row.preferredAt
   for(const event of row.history??[])if(event.action==='party-updated'||event.action==='joined')event.details=undefined
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

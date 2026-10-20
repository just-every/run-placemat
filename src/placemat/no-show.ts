import {fail,id,text,type Actor,type Booking,type Guest,type State} from './model'
import {serviceSnapshot} from './service-status'

export type RiskDecision={id:string;bookingId:string;kind:'contact'|'policy-review';decision:'accepted'|'declined';actor:string;at:string;reason:string;dueAt?:string;snapshot:{flags:string[];status:string};completedAt?:string;completedBy?:string;outcome?:string}
const attended=(status:string)=>['seated','completed'].includes(status)

/** Explain recorded venue facts, never a probability or an inferred personal trait. */
function bookingFacts(state:State,guest:Guest,booking:Booking){
 const previous=state.bookings.filter(b=>b.guestId===guest.id&&b.id!==booking.id&&b.startAt<booking.startAt)
 const attendance=[...previous.map(b=>({bookingId:b.id,status:b.status,startAt:b.startAt,source:'booking-record' as const})),
  ...(guest.history??[]).filter(v=>v.date<booking.startAt.slice(0,10)).map((v,i)=>({bookingId:`imported-history:${guest.id}:${i}`,status:v.status,startAt:v.date,source:'imported-history' as const}))]
 const bookingIds=new Set([booking.id,...previous.map(b=>b.id)])
 const reconfirmations=(state.serviceEvents??[]).filter(e=>bookingIds.has(e.bookingId)&&e.after.status==='reconfirmed'&&!state.serviceEvents?.some(c=>c.correctsEventId===e.id)).map(e=>({eventId:e.id,bookingId:e.bookingId,at:e.at,outcome:state.bookings.find(b=>b.id===e.bookingId)!.status}))
 const reconfirmed=reconfirmations.some(e=>e.bookingId===booking.id)
 const lead=(Date.parse(booking.startAt)-Date.parse(booking.createdAt))/60000
 const flags=[]
 if(attendance.some(a=>a.status==='no-show'))flags.push('A prior no-show is recorded at this venue')
 if(!reconfirmed&&booking.status==='booked')flags.push('No reconfirmation is recorded for this booking')
 const caveats=['Review flags are uncertain prompts for a person, not a predicted probability. Lead time is context, not proof of nonattendance.','Only this venue’s recorded facts are used. No protected traits, notes or external profiles are assessed.']
 if(!attendance.some(a=>attended(a.status)||a.status==='no-show'))caveats.push('No observed attendance outcome is available; missing history is unknown, not a no-show.')
 if(!reconfirmations.length)caveats.push('No reconfirmation outcomes are recorded; a missing record does not establish that the guest failed to reply.')
 if(attendance.some(a=>a.source==='imported-history'))caveats.push('Imported dated history has no linked native booking or reconfirmation event; its source remains imported.')
 if(!Number.isFinite(lead)||lead<0)caveats.push('Booking lead time is unavailable or inconsistent.')
 return {bookingId:booking.id,guestName:guest.name,startAt:booking.startAt,status:booking.status,flagged:flags.length>0,flags,facts:{leadMinutes:Number.isFinite(lead)&&lead>=0?lead:null,attendance,reconfirmations,reconfirmed},caveats}
}
export function noShowReport(state:State,guests:Guest[],serviceId:string,now=new Date().toISOString()){
 if(!state.services.some(s=>s.id===serviceId))fail(404,'Service not found.')
 const decisions=(state.riskDecisions??[]).filter(d=>state.bookings.some(b=>b.id===d.bookingId&&b.serviceId===serviceId)&&guests.some(g=>!g.erased&&state.bookings.some(b=>b.id===d.bookingId&&b.guestId===g.id)))
 const rows=state.bookings.filter(b=>b.serviceId===serviceId).flatMap(b=>{const g=guests.find(g=>g.id===b.guestId&&!g.erased);return g?[bookingFacts(state,g,b)]:[]})
 const flaggedIds=new Set(decisions.filter(d=>d.snapshot.flags.length).map(d=>d.bookingId))
 const observed=rows.filter(r=>flaggedIds.has(r.bookingId))
 return {serviceId,generatedAt:now,rows,decisions,monitoring:{flagged:observed.length,attended:observed.filter(r=>attended(r.status)).length,noShow:observed.filter(r=>r.status==='no-show').length,pending:observed.filter(r=>!attended(r.status)&&r.status!=='no-show').length},definitions:{monitoring:'Distinct bookings with a manager-recorded flagged review; attended rows are potential false positives, not proof that contact caused attendance. Pending includes cancellations without an observed attendance outcome.'}}
}
export function decideRisk(state:State,guests:Guest[],actor:Actor,command:string,p:any,now:string){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must decide follow-up work.')
 if(command==='risk.complete'){
  const task=state.riskDecisions?.find(d=>d.id===p.decisionId)??fail(404,'Follow-up decision not found.')
  const booking=state.bookings.find(b=>b.id===task.bookingId)??fail(404,'Booking not found.')
  if(!guests.some(g=>g.id===booking.guestId&&!g.erased))fail(409,'This guest was erased; follow-up is unavailable.')
  if(task.decision!=='accepted'||task.completedAt)fail(409,'Only an open accepted task can be completed.')
  task.outcome=text(p.outcome,'Staff-recorded outcome',1000);task.completedAt=now;task.completedBy=actor.id
  return task
 }
 const booking=state.bookings.find(b=>b.id===p.bookingId)??fail(404,'Booking not found.')
 const guest=guests.find(g=>g.id===booking.guestId&&!g.erased)??fail(409,'An erased guest cannot receive follow-up work.')
 if(booking.status!=='booked')fail(409,'Review an active booked reservation; existing task history remains available.')
 if(!['contact','policy-review'].includes(p.kind)||!['accepted','declined'].includes(p.decision))fail(400,'Choose a contact or policy review and accept or decline it.')
 const reason=text(p.reason,'Decision reason',1000)
 let dueAt:string|undefined
 if(p.decision==='accepted'){
  if(typeof p.dueAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(p.dueAt)||!Number.isFinite(Date.parse(p.dueAt))||Date.parse(p.dueAt)<Date.parse(now))fail(400,'An accepted task needs a future due time with an explicit UTC offset.')
  dueAt=new Date(p.dueAt).toISOString()
  if(state.riskDecisions?.some(d=>d.bookingId===booking.id&&d.kind===p.kind&&d.decision==='accepted'&&!d.completedAt))fail(409,'Complete the existing task before accepting another of this kind.')
 }
 const facts=bookingFacts(state,guest,booking)
 const decision:RiskDecision={id:id(),bookingId:booking.id,kind:p.kind,decision:p.decision,actor:actor.id,at:now,reason,...dueAt?{dueAt}:{},snapshot:{flags:facts.flags,status:serviceSnapshot(state,booking).status}}
 ;(state.riskDecisions??=[]).push(decision)
 // This command creates only attributed review work. It never edits a booking,
 // policy, fee, table, consent or provider queue and never claims a delivery.
 return decision
}

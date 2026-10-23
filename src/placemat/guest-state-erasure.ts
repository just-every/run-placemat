import {localServiceDate} from './service-notes'
import {eraseAudit} from './audit'
import {normalizeBookingRequests} from './booking-requests'
import type {State} from './model'
import type {D1Database,D1Sql} from './import/kit'

const proposalBookings=(plan:any)=>[...(plan?.preview?.unchangedBookings??[]),...(plan?.bookings??[]),...(plan?.snapshot?.bookings??[]),...(plan?.assignmentInputs?.bookings??[]),...(plan?.inputs?.bookings??[]),...(plan?.booking?[plan.booking]:[])]

/** Guest-linked operational free text follows the existing DATA-002 erasure. */
export async function guestStateErasure(db:D1Database,guestIds:string|string[]):Promise<D1Sql[]>{
 const row=await db.prepare('SELECT version,data FROM pm_state WHERE id=1').first()
 if(!row)return []
 const state=JSON.parse(row.data) as State
 for(const guestId of typeof guestIds==='string'?[guestIds]:guestIds){
 const noteDates=new Set(state.services.filter(s=>state.bookings.some(b=>b.guestId===guestId&&b.serviceId===s.id)).map(s=>localServiceDate(s.startAt,state.venue.timezone)))
 const noteIds=new Set((state.serviceNotes??[]).filter(n=>noteDates.has(n.date)).map(n=>n.id))
 for(const note of state.serviceNotes??[])if(noteIds.has(note.id))for(const entry of note.history)entry.text=''
 for(const event of state.audit)for(const change of event.changes??[])if(change.kind==='serviceNotes'&&noteIds.has(change.id)){change.before=change.before===null?null:{redacted:true};change.after=change.after===null?null:{redacted:true}}
 eraseAudit(state,guestId)
 for(const reminder of state.reminders)if(reminder.guestId===guestId){delete reminder.contactName;delete reminder.contactEmail;delete reminder.contactPhone}
 const bookings=[...state.bookings,...state.proposals.flatMap(p=>proposalBookings(p.plan))]
 for(const b of bookings)if(b.guestId===guestId){if(b.lateOperations)for(const e of b.lateOperations.history){e.reason='';if(e.outcome)e.outcome=''}if(b.needHistory)b.needHistory=[];if(b.handover)b.handover=[];b.preorders=[];if(b.requests)b.requests=normalizeBookingRequests({});if(b.ruleOverride)b.ruleOverride.reason='';if(b.pacingOverride)b.pacingOverride.reason='';if(b.requiredAccessTags)b.requiredAccessTags=[];delete b.requiredArea;for(const event of b.servingHistory??[])event.reason=''}
 for(const inquiry of state.inquiries??[])if(inquiry.guestId===guestId){
  delete inquiry.tokenHash;delete inquiry.requiredArea;inquiry.requiredAccessTags=[];inquiry.requests=normalizeBookingRequests({});inquiry.messages=[]
  if(inquiry.offer){delete inquiry.offer.requiredArea;inquiry.offer.requiredAccessTags=[];inquiry.offer.guarantees=[]}
  if(inquiry.status!=='converted')inquiry.status='closed'
 }
 for(const event of state.audit)for(const change of event.changes??[])if(change.kind==='bookingContacts'&&state.bookings.some(b=>b.id===change.id&&b.guestId===guestId)){change.before=change.before===null?null:{redacted:true};change.after=change.after===null?null:{redacted:true}}
 const bookingIds=new Set(state.bookings.filter(b=>b.guestId===guestId).map(b=>b.id))
 for(const event of state.serviceEvents??[])if(bookingIds.has(event.bookingId))event.reason=''
 for(const event of state.audit)if(bookingIds.has(event.subject)||[event.before,event.after].some(rows=>Array.isArray(rows)&&rows.some(row=>bookingIds.has(row.bookingId)))){event.reason='';if(event.pacing)event.pacing.reason=''}
 for(const task of state.riskDecisions??[])if(bookingIds.has(task.bookingId)){task.reason='';if(task.outcome)task.outcome=''}
 const changes=[...(state.serviceChanges??[]),...state.proposals.flatMap(p=>p.plan?.snapshot?.serviceChanges??[])]
 for(const change of changes)if(change.tasks.some((t:{bookingId:string})=>bookingIds.has(t.bookingId))){change.reason='';for(const task of change.tasks){task.reason='';delete task.outcome}}
 for(const proposal of state.proposals)if(proposal.kind==='service.closure'&&(proposal.plan.bookingIds??[]).some((id:string)=>bookingIds.has(id)))proposal.reason=''
 const relatedServices=new Set(state.waitlist.filter(w=>w.guestId===guestId).map(w=>w.serviceId))
 const closeReasons=new Set(state.services.filter(s=>relatedServices.has(s.id)).map(s=>s.closeReason).filter(Boolean))
 for(const service of state.services)if(relatedServices.has(service.id))service.closeReason=''
 for(const proposal of state.proposals){
  if(proposalBookings(proposal.plan).some(b=>b.guestId===guestId)||bookingIds.has(proposal.plan?.bookingId))proposal.reason=''
  for(const event of [...(proposal.plan?.snapshot?.serviceEvents??[]),...(proposal.plan?.assignmentInputs?.serviceEvents??[]),...(proposal.plan?.inputs?.serviceEvents??[])])if(bookingIds.has(event.bookingId))event.reason=''
  if(relatedServices.has(proposal.plan?.service?.id))proposal.plan.service.closeReason=''
  for(const service of [...(proposal.plan?.snapshot?.services??[]),...(proposal.plan?.assignmentInputs?.services??[]),...(proposal.plan?.inputs?.services??[]),...(proposal.plan?.candidates??[]).map((c:any)=>c.service)])if(relatedServices.has(service?.id))service.closeReason=''
 }
 for(const proposal of state.proposals){
  for(const row of proposal.plan?.preview?.affectedBookings??[])if(row.guestId===guestId){row.original.requiredAccessTags=[];delete row.original.requiredArea}
 }
 const queues=[...state.waitlist,...state.proposals.flatMap(p=>p.plan?.inputs?.waitlist??[])]
 for(const row of queues){
  if(row.guestId===guestId){
   delete row.managementTokenHash;delete row.contactPhone;row.requiredAccessTags=[];row.contactConsent=false;delete row.preferredArea;delete row.preferredAt
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

 }
 const erasedIds=JSON.stringify(state.bookings.filter(b=>(typeof guestIds==='string'?[guestIds]:guestIds).includes(b.guestId)).map(b=>b.id))
 return [
  {sql:'DELETE FROM pm_booking_holds WHERE booking_id IN (SELECT value FROM json_each(?))',params:[erasedIds]},
  {sql:'DELETE FROM pm_fee_credentials WHERE consent_id IN (SELECT id FROM pm_fee_consents WHERE booking_id IN (SELECT value FROM json_each(?)))',params:[erasedIds]},
  {sql:"UPDATE pm_fee_consents SET evidence='' WHERE booking_id IN (SELECT value FROM json_each(?))",params:[erasedIds]},
  {sql:"UPDATE pm_fee_assessments SET reason='',evidence='' WHERE booking_id IN (SELECT value FROM json_each(?))",params:[erasedIds]},
  {sql:"UPDATE pm_fee_disputes SET reason='',evidence='' WHERE assessment_id IN (SELECT id FROM pm_fee_assessments WHERE booking_id IN (SELECT value FROM json_each(?)))",params:[erasedIds]},
  {sql:"UPDATE pm_fee_events SET before_data=CASE WHEN before_data IS NULL THEN NULL ELSE json_remove(before_data,'$.reason','$.evidence','$.before.reason','$.before.evidence','$.after.reason','$.after.evidence') END,after_data=json_remove(after_data,'$.reason','$.evidence','$.before.reason','$.before.evidence','$.after.reason','$.after.evidence') WHERE booking_id IN (SELECT value FROM json_each(?))",params:[erasedIds]},
  {sql:'DELETE FROM pm_booking_management WHERE booking_id IN (SELECT value FROM json_each(?))',params:[erasedIds]},
  {sql:'DELETE FROM pm_booking_contacts WHERE booking_id IN (SELECT value FROM json_each(?))',params:[erasedIds]},
  {sql:"UPDATE pm_payment_requests SET reason='',provider_url=NULL WHERE booking_id IN (SELECT value FROM json_each(?))",params:[erasedIds]},
  {sql:"UPDATE pm_refunds SET reason='' WHERE booking_id IN (SELECT value FROM json_each(?))",params:[erasedIds]},
  {sql:"UPDATE pm_refund_events SET before_data=CASE WHEN before_data IS NULL THEN NULL ELSE json_set(before_data,'$.reason','') END,after_data=json_set(after_data,'$.reason','') WHERE refund_id IN (SELECT id FROM pm_refunds WHERE booking_id IN (SELECT value FROM json_each(?)))",params:[erasedIds]},
  {sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END',params:[row.version]},
  {sql:'UPDATE pm_state SET data=?,version=version+1 WHERE id=1 AND version=?',params:[JSON.stringify(state),row.version]},
 ]
}

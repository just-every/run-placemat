import {id,type Actor} from '../model'
import {load} from '../store'
import {needFacts,needsRevision} from '../needs'
import {event,guestRow,ownerFence,policy} from './store'
/** A subject export is assembled on demand; no downloadable copy remains in custody. */
export async function accessExport(db:D1Database,actor:Actor,guestId:unknown){
 const row=await guestRow(db,guestId),{state}=await load(db),bookings=state.bookings.filter(b=>b.guestId===row.id),ids=JSON.stringify(bookings.map(b=>b.id)),requestId=id(),at=new Date().toISOString()
 const query=async(sql:string)=>(await db.prepare(sql).bind(ids).all()).results
 const [contacts,payments,refunds,consents,feedbackVisits,feedbackMessages]=await Promise.all([
  query('SELECT booking_id,data FROM pm_booking_contacts WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,amount_cents,currency,state,created_at,paid_at FROM pm_payment_requests WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,charge_id,amount_cents,status,processor_id,created_at FROM pm_refunds WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,policy_id,accepted_at,review_text FROM pm_fee_consents WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,visit_date,rating,comment,submitted_at,withdrawn_at,case_state,due_at,outcome,closed_at FROM pm_feedback_visits WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT m.id,m.visit_id,m.author,m.message,m.at,m.state FROM pm_feedback_messages m JOIN pm_feedback_visits v ON v.id=m.visit_id WHERE v.booking_id IN (SELECT value FROM json_each(?))')])
 await db.batch([ownerFence(db,actor),db.prepare('INSERT INTO pm_privacy_requests(id,guest_id,kind,state,actor_id,created_at,completed_at) VALUES(?,?,?, ?,?,?,?)').bind(requestId,row.id,'access','completed',actor.id,at,at),event(db,actor,requestId,'access.exported'),db.prepare('DELETE FROM pm_assertions')])
 const subjectQuery=async(sql:string)=>(await db.prepare(sql).bind(row.id).all()).results
 const [retentionFacts,retentionConsents,retentionDeliveries,retentionAttributions,retentionWorkflows,retentionLinks]=await Promise.all([
  subjectQuery('SELECT created_at,birthday,anniversary,provenance,updated_at FROM pm_retention_facts WHERE guest_id=?'),
  subjectQuery('SELECT purpose,venue_scope,confirmed_at FROM pm_retention_consents WHERE guest_id=?'),
  subjectQuery('SELECT id,workflow_id,occurrence,offer_data,state,created_at,accepted_at,cap_until,provider_id FROM pm_retention_deliveries WHERE guest_id=? ORDER BY created_at,id'),
  subjectQuery('SELECT booking_id,delivery_id,created_at FROM pm_retention_attributions WHERE guest_id=? ORDER BY created_at,booking_id'),
  subjectQuery("SELECT id,data,status FROM pm_retention_workflows w WHERE EXISTS(SELECT 1 FROM pm_retention_deliveries d WHERE d.workflow_id=w.id AND d.guest_id=?1) OR EXISTS(SELECT 1 FROM json_each(w.preview_data,'$.recipients') r WHERE json_extract(r.value,'$.guestId')=?1)"),
  subjectQuery('SELECT kind,created_at,expires_at FROM pm_retention_tokens WHERE guest_id=? ORDER BY created_at'),
 ])
 const retention={links:retentionLinks,facts:retentionFacts.map((f:any)=>({...f,provenance:Object.fromEntries(Object.entries(JSON.parse(f.provenance)).map(([field,p]:[string,any])=>[field,{source:p.source,at:p.at}]))})),consents:retentionConsents,deliveries:retentionDeliveries.map((d:any)=>({...d,offer_data:JSON.parse(d.offer_data)})),attributions:retentionAttributions,workflows:retentionWorkflows.map((w:any)=>{const c=JSON.parse(w.data);return {id:w.id,name:c.name,trigger:c.trigger,offer:c.offer,status:w.status}})}
 const dinerAccounts=(await db.prepare('SELECT DISTINCT a.id,a.email,a.created_at,a.updated_at,a.favorite,a.preferences FROM pm_diner_accounts a JOIN pm_diner_bookings b ON b.account_id=a.id WHERE b.guest_id=?').bind(row.id).all()).results
 return {retention,feedback:{visits:feedbackVisits,messages:feedbackMessages},dinerAccounts,requestId,exportedAt:at,guest:row.guest,bookings:bookings.map(b=>({id:b.id,serviceId:b.serviceId,startAt:b.startAt,endAt:b.endAt,partySize:b.partySize,status:b.status,feedbackEmailConsent:b.feedbackEmailConsent,requests:b.requests,needs:needFacts(b),revision:needsRevision(b)})),contacts:contacts.map((r:any)=>({bookingId:r.booking_id,...JSON.parse(r.data)})),inquiries:(state.inquiries??[]).filter(i=>i.guestId===row.id).map(i=>({id:i.id,status:i.status,requests:i.requests,messages:i.messages})),waitlist:state.waitlist.filter(w=>w.guestId===row.id).map(w=>({id:w.id,status:w.status,partySize:w.partySize,contactConsent:w.contactConsent,history:w.history})),financial:{payments,refunds,consents,retention:await policy(db)},scope:'This venue only. No provider credentials, other guests or staff-only service notes are included.'}
}

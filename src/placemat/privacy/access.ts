import {id,type Actor} from '../model'
import {load} from '../store'
import {needFacts,needsRevision} from '../needs'
import {event,guestRow,ownerFence,policy} from './store'
/** A subject export is assembled on demand; no downloadable copy remains in custody. */
export async function accessExport(db:D1Database,actor:Actor,guestId:unknown){
 const row=await guestRow(db,guestId),{state}=await load(db),bookings=state.bookings.filter(b=>b.guestId===row.id),ids=JSON.stringify(bookings.map(b=>b.id)),requestId=id(),at=new Date().toISOString()
 const query=async(sql:string)=>(await db.prepare(sql).bind(ids).all()).results
 const [contacts,payments,refunds,consents]=await Promise.all([
  query('SELECT booking_id,data FROM pm_booking_contacts WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,amount_cents,currency,state,created_at,paid_at FROM pm_payment_requests WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,charge_id,amount_cents,status,processor_id,created_at FROM pm_refunds WHERE booking_id IN (SELECT value FROM json_each(?))'),
  query('SELECT id,booking_id,policy_id,accepted_at,review_text FROM pm_fee_consents WHERE booking_id IN (SELECT value FROM json_each(?))')])
 await db.batch([ownerFence(db,actor),db.prepare('INSERT INTO pm_privacy_requests(id,guest_id,kind,state,actor_id,created_at,completed_at) VALUES(?,?,?, ?,?,?,?)').bind(requestId,row.id,'access','completed',actor.id,at,at),event(db,actor,requestId,'access.exported'),db.prepare('DELETE FROM pm_assertions')])
 return {requestId,exportedAt:at,guest:row.guest,bookings:bookings.map(b=>({id:b.id,serviceId:b.serviceId,startAt:b.startAt,endAt:b.endAt,partySize:b.partySize,status:b.status,requests:b.requests,needs:needFacts(b),revision:needsRevision(b)})),contacts:contacts.map((r:any)=>({bookingId:r.booking_id,...JSON.parse(r.data)})),inquiries:(state.inquiries??[]).filter(i=>i.guestId===row.id).map(i=>({id:i.id,status:i.status,requests:i.requests,messages:i.messages})),waitlist:state.waitlist.filter(w=>w.guestId===row.id).map(w=>({id:w.id,status:w.status,partySize:w.partySize,contactConsent:w.contactConsent,history:w.history})),financial:{payments,refunds,consents,retention:await policy(db)},scope:'This venue only. No provider credentials, other guests or staff-only service notes are included.'}
}

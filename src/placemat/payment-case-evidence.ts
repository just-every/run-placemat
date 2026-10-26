import {fail,type Booking,type State} from './model'
export async function caseEvidence(db:D1Database,state:State,booking:Booking){
 const guest=await db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'Erased guests cannot have new payment evidence assembled.')
 const [consents,guarantees,assessments,notices,refunds]=await db.batch<Record<string,unknown>>([
  db.prepare('SELECT id,policy_id,accepted_at,recorded_at,evidence,booking_snapshot,review_text,expires_at FROM pm_fee_consents WHERE booking_id=? ORDER BY recorded_at,id').bind(booking.id),
  db.prepare('SELECT id,policy_id,accepted_at,booking_snapshot,review_text,expires_at FROM pm_card_guarantees WHERE booking_id=? AND accepted_at IS NOT NULL ORDER BY created_at,id').bind(booking.id),
  db.prepare('SELECT id,policy_id,kind,action,status,amount_cents,reason,evidence,charge_id FROM pm_fee_assessments WHERE booking_id=? ORDER BY created_at,id').bind(booking.id),
  db.prepare('SELECT n.id,n.outcome,n.amount_cents,n.state,n.provider_id,n.requested_at FROM pm_refund_notices n JOIN pm_refunds r ON r.id=n.refund_id WHERE r.booking_id=? ORDER BY n.requested_at,n.id').bind(booking.id),
  db.prepare('SELECT id,amount_cents,status,processor_id FROM pm_refunds WHERE booking_id=? ORDER BY created_at,id').bind(booking.id),
 ])
 const policyIds=[...new Set([...consents.results,...guarantees.results,...assessments.results].map(r=>String(r.policy_id)))]
 const policies=[]
 for(const policyId of policyIds){const row=await db.prepare('SELECT id,version,data FROM pm_fee_policies WHERE id=?').bind(policyId).first<{id:string;version:number;data:string}>();if(row)policies.push({id:row.id,version:row.version,terms:JSON.parse(row.data).reviewText})}
 return {
  booking:{id:booking.id,serviceId:booking.serviceId,startAt:booking.startAt,endAt:booking.endAt,partySize:booking.partySize,status:booking.status,source:booking.source},
  attendance:(state.serviceEvents??[]).filter(r=>r.bookingId===booking.id).map(({id,at,actor,source,reason,after})=>({id,at,actor,source,reason,status:after.status})),
  policies,consents:consents.results,guestAgreements:guarantees.results,fees:assessments.results,refunds:refunds.results,
  messages:{inquiries:(state.inquiries??[]).filter(q=>q.bookingId===booking.id).map(q=>({id:q.id,messages:q.messages})),reminders:state.reminders.filter(r=>r.bookingId===booking.id).map(({id,message,status,approvedAt,approvedBy})=>({id,message,status,approvedAt,approvedBy})),refundNotices:notices.results},
  limitations:['Recorded attendance is staff history, not independent proof.','An approved or exported message is not proof of delivery.','Absent guest agreement is not inferred from a saved card.'],
 }
}

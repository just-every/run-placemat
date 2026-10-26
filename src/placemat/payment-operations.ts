import type {Bindings} from '../auth.server'
import {fail,id,text,type Actor,type Booking,type State} from './model'
import {load,save,hash} from './store'
import {feeAuthority,feeCommit,feeEvent} from './fee-policy'
import {observeDispute} from './payment-case-provider'
import {caseEvidence} from './payment-case-evidence'

export type PaymentCase={id:string;booking_id:string;charge_id:string;amount_cents:number;currency:string;reason:string;status:string;due_at:string;ledger:string;opened_by:string;opened_at:string}
export type PaymentReview={id:string;case_id:string;evidence:string;digest:string;response:string;created_by:string;created_at:string;approved_by:string|null;approved_at:string|null}
export type AccountingExport={id:string;case_id:string;review_id:string;actor_id:string;created_at:string;journal:string;ledger:string;state:string;provider_id:string|null;code:string;trace_id:string|null;updated_at:string}
export const ownerFence=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(actor.id)
export function bookingFor(state:State,bookingId:string){return state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')}
export function ownedTask(booking:Booking,actor:Actor,taskId:string,dueAt:string,message:string){
 booking.handover??=[]
 if(booking.handover.some(t=>t.id===taskId))return
 if(booking.handover.length>=40)fail(409,'Complete existing reservation follow-ups before adding payment work.')
 booking.handover.push({id:taskId,kind:'callback',ownerId:actor.id,dueAt,text:message,history:[{actor:actor.id,at:new Date().toISOString(),action:'assigned',ownerId:actor.id,dueAt}]})
}
export async function operationCase(db:D1Database,caseId:string){return await db.prepare('SELECT * FROM pm_payment_cases WHERE id=?').bind(caseId).first<PaymentCase>()??fail(404,'Payment dispute not found.')}
export async function readPaymentOperations(db:D1Database,actor:Actor){
 await feeAuthority(db,actor)
 const [cases,reviews,exports]=await db.batch<PaymentCase|PaymentReview|AccountingExport>([
  db.prepare('SELECT * FROM pm_payment_cases ORDER BY opened_at,id'),db.prepare('SELECT * FROM pm_payment_reviews ORDER BY created_at,id'),db.prepare('SELECT * FROM pm_accounting_exports ORDER BY created_at,id')])
 const {state}=await load(db)
 const people=(await db.prepare('SELECT id,display_name FROM oa_operators').all<{id:string;display_name:string}>()).results
 return {cases:cases.results as PaymentCase[],reviews:reviews.results as PaymentReview[],exports:exports.results as AccountingExport[],names:Object.fromEntries(people.map(p=>[p.id,p.display_name])),tasks:state.bookings.flatMap(b=>(b.handover??[]).filter(t=>t.id.startsWith('payment-case-')||t.id.startsWith('accounting-')).map(t=>({...t,bookingId:b.id})))}
}
export async function openPaymentCase(env:Bindings,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 const disputeId=text(p.disputeId,'Stripe dispute reference',255),bookingId=text(p.bookingId,'Booking',100)
 const prior=await env.DB.prepare('SELECT * FROM pm_payment_cases WHERE id=?').bind(disputeId).first<PaymentCase>()
 if(prior){if(prior.booking_id!==bookingId)fail(409,'This dispute already belongs to another reservation.');return prior}
 const observed=await observeDispute(env.STRIPE_SECRET_KEY,disputeId,bookingId),{state,version}=await load(env.DB),booking=bookingFor(state,bookingId)
 await caseEvidence(env.DB,state,booking)
 ownedTask(booking,actor,'payment-case-'+disputeId,observed.dueAt,'Review Stripe dispute '+disputeId+', assemble booking, policy and message evidence, and approve the exact response. Submit separately at Stripe before the provider deadline. No response has been sent.')
 const now=new Date().toISOString()
 state.audit.push({id:id(),at:now,actor:actor.id,action:'payment.dispute-open',subject:bookingId})
 await save(env.DB,state,version,[ownerFence(env.DB,actor),env.DB.prepare('INSERT INTO pm_payment_cases(id,booking_id,charge_id,amount_cents,currency,reason,status,due_at,ledger,opened_by,opened_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(disputeId,bookingId,observed.chargeId,observed.amountCents,'usd',observed.reason,observed.status,observed.dueAt,JSON.stringify(observed.ledger),actor.id,now)])
 return operationCase(env.DB,disputeId)
}
export async function assemblePaymentCase(db:D1Database,actor:Actor,p:any){
 await feeAuthority(db,actor)
 const row=await operationCase(db,text(p.caseId,'Dispute',255)),{state,version}=await load(db),booking=bookingFor(state,row.booking_id)
 const evidence=JSON.stringify(await caseEvidence(db,state,booking)),reviewId=id(),digest=await hash(evidence),now=new Date().toISOString()
 await feeCommit(db,actor,version,[db.prepare('INSERT INTO pm_payment_reviews(id,case_id,evidence,digest,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(reviewId,row.id,evidence,digest,actor.id,now),feeEvent(db,actor,'payment.dispute-assemble',reviewId,{caseId:row.id,digest},booking.id)])
 return db.prepare('SELECT * FROM pm_payment_reviews WHERE id=?').bind(reviewId).first<PaymentReview>()
}
export async function approvePaymentCase(db:D1Database,actor:Actor,p:any){
 await feeAuthority(db,actor)
 if(p.acknowledged!==true)fail(400,'Explicitly approve this exact response and evidence. This does not send it.')
 const reviewId=text(p.reviewId,'Evidence review',100),response=text(p.response,'Reviewed response',8000),row=await db.prepare('SELECT * FROM pm_payment_reviews WHERE id=?').bind(reviewId).first<PaymentReview>()??fail(404,'Evidence review not found.')
 if(p.digest!==row.digest||await hash(row.evidence)!==row.digest)fail(409,'Evidence changed. Assemble and review it again.')
 if(row.approved_at){if(row.response!==response||row.approved_by!==actor.id)fail(409,'An approved response cannot be changed. Assemble a new review.');return row}
 const c=await operationCase(db,row.case_id),{state,version}=await load(db)
 await caseEvidence(db,state,bookingFor(state,c.booking_id))
 if(c.due_at<=new Date().toISOString())fail(409,'The provider response deadline passed. Review the dispute at Stripe.')
 const now=new Date().toISOString()
 await feeCommit(db,actor,version,[db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_payment_reviews WHERE id=? AND approved_at IS NULL AND digest=?) THEN 1 ELSE 0 END').bind(row.id,row.digest),db.prepare('UPDATE pm_payment_reviews SET response=?,approved_by=?,approved_at=? WHERE id=? AND approved_at IS NULL').bind(response,actor.id,now,row.id),db.prepare('INSERT INTO pm_payment_operation_custody(review_id) VALUES(?)').bind(row.id),feeEvent(db,actor,'payment.dispute-approve',row.id,{caseId:c.id,digest:row.digest},c.booking_id)])
 return db.prepare('SELECT * FROM pm_payment_reviews WHERE id=?').bind(row.id).first<PaymentReview>()
}

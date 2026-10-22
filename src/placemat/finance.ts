import {fail,type Actor} from './model'
import {readBusinessCsv} from './business-export-store'

/** The finance identity reads only these owner CSV kinds; none of their columns carries guest notes or requests. */
export const financeKinds=['payment-requests','refund-charges','refunds','refund-events'] as const
type Row=Record<string,any>
const reconciled=(charge:Row,refunds:Row[]):Row=>{
 const mine=refunds.filter(r=>r.chargeId===charge.chargeId),sum=(status:string)=>mine.filter(r=>r.status===status).reduce((n,r)=>n+r.amountCents,0)
 const pendingCents=sum('pending'),succeededCents=charge.importedRefundedCents+sum('succeeded')
 return {...charge,pendingCents,succeededCents,remainingCents:charge.amountCents-succeededCents-pendingCents}
}
/** Charges, refunds and deposit requests with per-charge reconciliation, in integer USD cents. */
export async function financeSummary(db:D1Database){
 const [requests,charges,refunds]=await db.batch<Row>([
  db.prepare('SELECT id,booking_id AS bookingId,amount_cents AS amountCents,currency,due_at AS dueAt,state,paid_at AS paidAt FROM pm_payment_requests ORDER BY created_at,id'),
  db.prepare('SELECT charge_id AS chargeId,booking_id AS bookingId,amount_cents AS amountCents,imported_refunded_cents AS importedRefundedCents FROM pm_refund_charges ORDER BY synced_at,charge_id'),
  db.prepare('SELECT id,request_id AS requestId,actor_id AS actorId,booking_id AS bookingId,charge_id AS chargeId,amount_cents AS amountCents,reason,status,processor_id AS processorId,created_at AS createdAt FROM pm_refunds ORDER BY created_at,id')])
 return {requests:requests.results,charges:charges.results.map(c=>reconciled(c,refunds.results)),refunds:refunds.results}
}
export async function financeExport(db:D1Database,kind:string){
 if(!financeKinds.includes(kind as any))return fail(404,'Unknown finance export.')
 return readBusinessCsv(db,kind)
}
export const isFinance=(actor:Actor)=>actor.role==='finance'&&!actor.agent

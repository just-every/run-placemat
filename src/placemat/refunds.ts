import {fail,id,text,type Actor} from './model'

/** Narrow refund execution foundation; guest notices and merchant onboarding belong to PAY-005/PAY-001. */
type Refund = {id:string;request_id:string;actor_id:string;booking_id:string;charge_id:string;amount_cents:number;reason:string;status:'pending'|'succeeded'|'failed'|'canceled';processor_id:string|null;created_at:string;updated_at:string;processing_until:number}
type Charge = {charge_id:string;booking_id:string;amount_cents:number;imported_refunded_cents:number;currency:string;synced_by:string;synced_at:string}
const receipt=(r:Refund)=>({id:r.id,requestId:r.request_id,actorId:r.actor_id,bookingId:r.booking_id,chargeId:r.charge_id,amountCents:r.amount_cents,currency:'usd',reason:r.reason,status:r.status,processorId:r.processor_id,createdAt:r.created_at,updatedAt:r.updated_at})
const cents=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=99999999?v:fail(400,'Refund amount must be positive integer USD cents.')

async function authority(db:D1Database,actor:Actor,ownerOnly=false){
 if(actor.agent||actor.deviceId||!(ownerOnly?['owner']:['owner','admin']).includes(actor.role))fail(403,ownerOnly?'The owner must synchronize payment charges.':'Refunds require a full owner or manager session.')
 const row=await db.prepare(`SELECT o.role,(SELECT l.value FROM pm_state s,json_each(s.data,'$.managerRefundLimits') l WHERE s.id=1 AND l.key=o.id AND l.type='integer') AS limit_cents FROM oa_operators o WHERE o.id=? AND o.status='active' AND o.role=?`).bind(actor.id,actor.role).first<{role:string;limit_cents:number|null}>()
 if(!row||!ownerOnly&&row.role!=='owner'&&(row.limit_cents===null||!Number.isSafeInteger(row.limit_cents)||row.limit_cents<0))fail(403,'No active refund authority is recorded for this person.')
 return row!
}
function stripeKey(secret?:string){if(!secret)fail(503,'Stripe refund processing is not configured.');return secret!}
async function stripe(secret:string,path:string,body?:URLSearchParams,key?:string){
 let response:Response
 try{response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,...(body?{'content-type':'application/x-www-form-urlencoded','idempotency-key':key!}:{})},...(body?{body:body.toString()}:{}),signal:AbortSignal.timeout(20000)})}catch{fail(502,'Stripe did not confirm the result. Retry the same refund request to reconcile it.')}
 // Never surface provider errors: they may contain request details or credentials.
 if(!response!.ok)fail(502,'Stripe did not confirm the result. Retry the same request; its reservation remains held.')
 try{return await response!.json() as any}catch{return fail(502,'Stripe returned an unreadable response. The refund reservation remains held.')}
}

/** Owner imports a real charge, with the booking association verified on Stripe, never supplied as a charge fact by the client. */
export async function synchronizeRefundCharge(db:D1Database,actor:Actor,p:any,secret?:string){
 await authority(db,actor,true)
 const bookingId=text(p.bookingId,'Booking'),chargeId=text(p.chargeId,'Stripe charge',200)
 const booking=await db.prepare("SELECT 1 AS found FROM pm_state s,json_each(s.data,'$.bookings') b WHERE s.id=1 AND json_extract(b.value,'$.id')=?").bind(bookingId).first()
 if(!booking)fail(404,'Booking not found.')
 const charge=await stripe(stripeKey(secret),'charges/'+encodeURIComponent(chargeId))
 if(charge.object!=='charge'||charge.id!==chargeId||charge.currency!=='usd'||charge.paid!==true||charge.captured!==true||charge.metadata?.placemat_booking_id!==bookingId||!Number.isSafeInteger(charge.amount_captured)||charge.amount_captured<=0||charge.amount_captured>99999999||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0||charge.amount_refunded>charge.amount_captured)fail(409,'Stripe must confirm a captured USD charge with matching Placemat booking metadata.')
 // Snapshots are immutable: resynchronizing must not double-count our later refunds.
 await db.prepare(`INSERT INTO pm_refund_charges(charge_id,booking_id,amount_cents,imported_refunded_cents,currency,synced_by,synced_at)
 SELECT ?,?,?,?,'usd',?,? WHERE EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')
 AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.bookings') b WHERE s.id=1 AND json_extract(b.value,'$.id')=?) ON CONFLICT(charge_id) DO NOTHING`).bind(chargeId,bookingId,charge.amount_captured,charge.amount_refunded,actor.id,new Date().toISOString(),actor.id,bookingId).run()
 const stored=await db.prepare('SELECT * FROM pm_refund_charges WHERE charge_id=?').bind(chargeId).first<Charge>()
 if(!stored||stored.booking_id!==bookingId||stored.amount_cents!==charge.amount_captured)fail(409,'Charge synchronization changed. Refresh before trying again.')
 return {chargeId:stored!.charge_id,bookingId:stored!.booking_id,amountCents:stored!.amount_cents,importedRefundedCents:stored!.imported_refunded_cents,currency:'usd'}
}

/** Atomic reservation counts every pending/succeeded refund by this person across all of this booking's charges. */
export async function executeRefund(db:D1Database,actor:Actor,p:any,secret?:string){
 await authority(db,actor)
 const bookingId=text(p.bookingId,'Booking'),chargeId=text(p.chargeId,'Stripe charge',200),amountCents=cents(p.amountCents),requestId=text(p.requestId,'Stable refund request ID',120),reason=text(p.reason,'Refund reason',500)
 const now=new Date().toISOString(),refundId=id()
 // This single statement is the serialization point: authority and both cumulative balances are read in the reservation write.
 await db.prepare(`INSERT INTO pm_refunds(id,request_id,actor_id,booking_id,charge_id,amount_cents,reason,status,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,'pending',?,? FROM pm_refund_charges c JOIN oa_operators o ON o.id=? JOIN pm_state s ON s.id=1
 WHERE c.charge_id=? AND c.booking_id=? AND o.status='active' AND o.role=?
 AND EXISTS(SELECT 1 FROM json_each(s.data,'$.bookings') b WHERE json_extract(b.value,'$.id')=c.booking_id)
 AND (o.role='owner' OR (o.role='admin' AND EXISTS(SELECT 1 FROM json_each(s.data,'$.managerRefundLimits') l WHERE l.key=o.id AND l.type='integer' AND l.value>=?+COALESCE((SELECT SUM(r.amount_cents) FROM pm_refunds r WHERE r.actor_id=o.id AND r.booking_id=c.booking_id AND r.status IN ('pending','succeeded')),0))))
 AND c.amount_cents-c.imported_refunded_cents>=?+COALESCE((SELECT SUM(r.amount_cents) FROM pm_refunds r WHERE r.charge_id=c.charge_id AND r.status IN ('pending','succeeded')),0)
 ON CONFLICT(actor_id,request_id) DO NOTHING`).bind(refundId,requestId,actor.id,bookingId,chargeId,amountCents,reason,now,now,actor.id,chargeId,bookingId,actor.role,amountCents,amountCents).run()
 let refund=await db.prepare('SELECT * FROM pm_refunds WHERE actor_id=? AND request_id=?').bind(actor.id,requestId).first<Refund>()
 if(!refund)fail(409,'Refund refused: confirm a synchronized booking charge, available charge balance and cumulative refund authority.')
 if(refund!.booking_id!==bookingId||refund!.charge_id!==chargeId||refund!.amount_cents!==amountCents||refund!.reason!==reason)fail(409,'This refund request ID already belongs to different refund details.')
 if(refund!.status!=='pending')return receipt(refund!)
 const key=stripeKey(secret)
 // Stripe can prune idempotency keys after 24 hours. Never create a second refund after that guarantee expires.
 if(!refund!.processor_id&&Date.now()-Date.parse(refund!.created_at)>23*60*60*1000)fail(409,'This unconfirmed refund needs processor reconciliation; its balance reservation remains held.')
 const acquired=await db.prepare("UPDATE pm_refunds SET processing_until=? WHERE id=? AND status='pending' AND processing_until<=? RETURNING *").bind(Date.now()+60000,refund!.id,Date.now()).first<Refund>()
 if(!acquired)return receipt(refund!)
 refund=acquired
 try{
  const form=new URLSearchParams({charge:chargeId,amount:String(amountCents),'metadata[placemat_refund_id]':refund!.id,'metadata[placemat_booking_id]':bookingId})
  const result=refund!.processor_id?await stripe(key,'refunds/'+encodeURIComponent(refund!.processor_id)):await stripe(key,'refunds',form,'placemat-refund-'+refund!.id)
  if(result.object!=='refund'||typeof result.id!=='string'||!result.id||result.charge!==chargeId||result.amount!==amountCents||result.currency!=='usd'||result.metadata?.placemat_refund_id!==refund!.id||result.metadata?.placemat_booking_id!==bookingId||!['pending','requires_action','succeeded','failed','canceled'].includes(result.status))fail(502,'Stripe refund confirmation did not match the reserved refund. Its reservation remains held.')
  const status=result.status==='requires_action'?'pending':result.status
  await db.prepare("UPDATE pm_refunds SET status=?,processor_id=?,updated_at=? WHERE id=? AND status='pending'").bind(status,result.id,new Date().toISOString(),refund!.id).run()
 }finally{
  await db.prepare('UPDATE pm_refunds SET processing_until=0 WHERE id=?').bind(refund!.id).run()
 }
 return receipt((await db.prepare('SELECT * FROM pm_refunds WHERE id=?').bind(refund!.id).first<Refund>())!)
}

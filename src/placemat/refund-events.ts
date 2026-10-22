export type RefundWebhookBindings={DB:D1Database;STRIPE_WEBHOOK_SECRET?:string;STRIPE_SECRET_KEY?:string}
type RefundStatus='pending'|'succeeded'|'failed'|'canceled'
type RefundRow={id:string;processor_id:string|null;booking_id:string;charge_id:string;amount_cents:number;currency:string;status:RefundStatus;updated_at:string;processing_until:number;sequence:number}
type StripeRefund={object:'refund';id:string;charge:string;amount:number;currency:string;metadata:{placemat_refund_id:string;placemat_booking_id:string};status:RefundStatus|'requires_action'}
const eventTypes=new Set(['refund.created','refund.updated','refund.failed'])
const statuses=new Set(['pending','requires_action','succeeded','failed','canceled'])
const reply=(status:number,result:Record<string,unknown>)=>Response.json(result,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
const identifier=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=255

/** Verify bytes before parsing. Stripe signs timestamp + '.' + the unmodified request body. */
async function signed(request:Request,secret:string):Promise<Uint8Array|null>{
 const parts=(request.headers.get('stripe-signature')??'').split(',').map(p=>p.trim().split('='))
 const timestamps=parts.filter(([key])=>key==='t'),timestamp=timestamps[0]?.[1]
 if(timestamps.length!==1||!timestamp||!/^\d+$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||Math.abs(Date.now()/1000-Number(timestamp))>300)return null
 const signatures=parts.filter(([key,value])=>key==='v1'&&/^[a-fA-F0-9]{64}$/.test(value??'')).map(([,value])=>Uint8Array.from(value.match(/../g)!,byte=>parseInt(byte,16)))
 if(!signatures.length)return null
 const raw=new Uint8Array(await request.arrayBuffer()),prefix=new TextEncoder().encode(timestamp+'.'),payload=new Uint8Array(prefix.length+raw.length)
 payload.set(prefix);payload.set(raw,prefix.length)
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 // WebCrypto performs the MAC comparison; v0 and unknown schemes never authenticate a request.
 for(const signature of signatures)if(await crypto.subtle.verify('HMAC',key,signature,payload))return raw
 return null
}
function isRefund(value:any):value is StripeRefund{
 return value?.object==='refund'&&identifier(value.id)&&identifier(value.charge)&&Number.isSafeInteger(value.amount)&&value.amount>0&&typeof value.currency==='string'&&identifier(value.metadata?.placemat_refund_id)&&identifier(value.metadata?.placemat_booking_id)&&statuses.has(value.status)
}
function matches(value:StripeRefund,row:RefundRow){
 return value.id===row.processor_id&&value.metadata.placemat_refund_id===row.id&&value.metadata.placemat_booking_id===row.booking_id&&value.charge===row.charge_id&&value.amount===row.amount_cents&&value.currency===row.currency
}
async function currentRefund(secret:string,processorId:string):Promise<unknown>{
 const response=await fetch('https://api.stripe.com/v1/refunds/'+encodeURIComponent(processorId),{method:'GET',headers:{authorization:'Bearer '+secret},redirect:'manual',signal:AbortSignal.timeout(10000)})
 if(!response.ok)throw Error('Unconfirmed refund')
 return response.json()
}

/** Snapshot events are notifications, never a clock: even same-second or older events read current Stripe state.
 * Missing API credentials leave the event unacknowledged for Stripe redelivery. No processor POST or mail occurs.
 * Route this before cookie auth/origin checks and pass the original, unread Request.
 */
export async function refundWebhook(env:RefundWebhookBindings,request:Request):Promise<Response>{
 if(request.method!=='POST')return reply(405,{error:'Method not allowed.'})
 if(!env.STRIPE_WEBHOOK_SECRET)return reply(503,{error:'Refund event verification is not configured.'})
 let raw:Uint8Array|null
 try{raw=await signed(request,env.STRIPE_WEBHOOK_SECRET)}catch{return reply(400,{error:'Invalid refund event signature.'})}
 if(!raw)return reply(400,{error:'Invalid refund event signature.'})
 let event:any
 try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{return reply(400,{error:'Invalid refund event.'})}
 if(!identifier(event?.id)||typeof event.type!=='string')return reply(400,{error:'Invalid refund event.'})
 if(!eventTypes.has(event.type))return reply(200,{received:true,ignored:true})
 if(!isRefund(event.data?.object))return reply(400,{error:'Invalid refund event.'})
 const snapshot=event.data.object as StripeRefund,db=env.DB
 try{
  if(await db.prepare('SELECT 1 FROM pm_refund_webhooks WHERE event_id=?').bind(event.id).first())return reply(200,{received:true,duplicate:true})
  const row=await db.prepare(`SELECT r.*,c.currency,(SELECT COALESCE(MAX(w.id),0) FROM pm_refund_webhooks w WHERE w.refund_id=r.id) AS sequence
   FROM pm_refunds r JOIN pm_refund_charges c ON c.charge_id=r.charge_id AND c.booking_id=r.booking_id WHERE r.id=?`).bind(snapshot.metadata.placemat_refund_id).first<RefundRow>()
  if(!row)return reply(409,{error:'No matching refund reservation.'})
  // An event can race the original refund POST. Wait for its processor reference and lease release.
  if(!row.processor_id||row.processing_until!==0)return reply(503,{error:'Refund confirmation is still in progress.'})
  if(!matches(snapshot,row))return reply(409,{error:'Refund event does not match its reservation.'})
  if(!env.STRIPE_SECRET_KEY)return reply(503,{error:'Refund reconciliation is not configured.'})
  let current:unknown
  try{current=await currentRefund(env.STRIPE_SECRET_KEY,row.processor_id)}catch{return reply(502,{error:'Stripe did not confirm the current refund.'})}
  if(!isRefund(current)||!matches(current,row))return reply(409,{error:'Stripe refund does not match its reservation.'})
  const status:RefundStatus=current.status==='requires_action'?'pending':current.status
  // Failed/canceled refunds are finished. A succeeded bank transfer can legitimately require
  // action again, so only an authoritative GET (never the event snapshot) may restore processing.
  if(['failed','canceled'].includes(row.status)&&status==='pending')return reply(503,{error:'Stripe refund state needs reconciliation.'})
  const claim=crypto.randomUUID(),now=new Date().toISOString()
  // Receipt insertion is the serialization point. The observation fence rejects a concurrent GET
  // based on an earlier local snapshot, including equal timestamps and unchanged pending states.
  await db.batch([
   db.prepare(`INSERT INTO pm_refund_webhooks(event_id,refund_id,event_type,processor_status,received_at,claim)
    SELECT ?,r.id,?,?,?,? FROM pm_refunds r WHERE r.id=? AND r.processor_id=? AND r.status=? AND r.updated_at=? AND r.processing_until=0
    AND (SELECT COALESCE(MAX(w.id),0) FROM pm_refund_webhooks w WHERE w.refund_id=r.id)=?
    ON CONFLICT(event_id) DO NOTHING`).bind(event.id,event.type,current.status,now,claim,row.id,row.processor_id,row.status,row.updated_at,row.sequence),
   db.prepare(`UPDATE pm_refunds SET status=?,updated_at=? WHERE id=?
    AND EXISTS(SELECT 1 FROM pm_refund_webhooks WHERE event_id=? AND claim=?)`).bind(status,now,row.id,event.id,claim),
  ])
  const receipt=await db.prepare('SELECT claim FROM pm_refund_webhooks WHERE event_id=?').bind(event.id).first<{claim:string}>()
  if(!receipt)return reply(503,{error:'Refund changed during reconciliation. Redeliver this event.'})
  return reply(200,{received:true,...receipt.claim!==claim?{duplicate:true}:{}})
 }catch{
  // Never expose SQL errors, request headers, secrets, provider bodies or event payloads.
  return reply(503,{error:'Refund reconciliation could not be saved. Redeliver this event.'})
 }
}

/** Internal projection. The caller must authorize a full owner/manager session as for refund history. */
export async function refundFollowups(db:D1Database){
 const rows=await db.prepare(`SELECT f.*,r.booking_id,r.charge_id,r.amount_cents,r.status AS refund_status,r.reason,c.currency
  FROM pm_refund_followups f JOIN pm_refunds r ON r.id=f.refund_id JOIN pm_refund_charges c ON c.charge_id=r.charge_id ORDER BY f.created_at,f.refund_id`).all<{refund_id:string;owner_id:string;actor_id:string;request_id:string;state:'open'|'resolved';failure_status:'failed'|'canceled';created_at:string;updated_at:string;resolved_at:string|null;booking_id:string;charge_id:string;amount_cents:number;refund_status:RefundStatus;reason:string;currency:string}>()
 return rows.results.map(r=>({refundId:r.refund_id,bookingId:r.booking_id,chargeId:r.charge_id,requestId:r.request_id,actorId:r.actor_id,ownerId:r.owner_id,state:r.state,failureStatus:r.failure_status,refundStatus:r.refund_status,amountCents:r.amount_cents,currency:r.currency,reason:r.reason,createdAt:r.created_at,updatedAt:r.updated_at,resolvedAt:r.resolved_at}))
}

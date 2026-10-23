import {fail,id,text,type Actor,type State} from './model'
import {load,save} from './store'

export type PaymentBindings={DB:D1Database;AUTH_ORIGIN:string;STRIPE_SECRET_KEY?:string}
export type PaymentAlert={requestId:string;bookingId:string;amountCents:number;dueAt:string;state:'unpaid'|'paid'|'expired'|'exception';followupOwnerId:string;providerUrl?:string}
type PaymentRow={id:string;booking_id:string;amount_cents:number;currency:'usd';due_at:string;followup_owner_id:string;created_by:string;created_at:string;reason:string;state:PaymentAlert['state'];provider_attempt_at:string|null;provider_return_url:string|null;provider_session_id:string|null;provider_url:string|null;verified_at:string|null;paid_at:string|null}
type PaymentInput={bookingId?:unknown;amountCents?:unknown;dueAt?:unknown;followupOwnerId?:unknown;reason?:unknown}
type Checkout={id:string;object:string;mode:string;client_reference_id:string;metadata:Record<string,string>;amount_total:number;currency:string;expires_at:number;payment_status:string;status:string;url:string|null}

// Expiry shown by the local deadline or a POST replay cannot release a reservation.
// Only an immutable terminal Checkout state observed by authenticated GET is safe.
const releaseSafe="((provider_attempt_at IS NULL AND provider_session_id IS NULL AND state!='paid') OR (provider_session_id IS NOT NULL AND verified_at IS NOT NULL AND ((state='expired' AND paid_at IS NULL) OR (state='paid' AND paid_at IS NOT NULL))))"
const releaseMessage='Keep this reservation: Checkout collection is open, processing or unconfirmed. A personal owner or manager must recover any unconfirmed saved link, then close Checkout and verify its final payment status before releasing the slot.'

/** Append to the same transaction that releases active reservation capacity. */
export function paymentReleaseFence(db:D1Database,bookingIds:string[]){
 return db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_payment_requests WHERE booking_id IN (SELECT value FROM json_each(?)) AND NOT ${releaseSafe}) THEN 1 ELSE 0 END`).bind(JSON.stringify(bookingIds))
}
/** Friendly preflight plus the transaction fence; the caller must append the returned statement. */
export async function assertPaymentReleaseAllowed(db:D1Database,bookingIds:string[]){
 const blocked=await db.prepare(`SELECT 1 FROM pm_payment_requests WHERE booking_id IN (SELECT value FROM json_each(?)) AND NOT ${releaseSafe} LIMIT 1`).bind(JSON.stringify(bookingIds)).first()
 if(blocked)fail(409,releaseMessage)
 return paymentReleaseFence(db,bookingIds)
}

function alert(row:PaymentRow,now=Date.now()):PaymentAlert{
 const state=row.state==='unpaid'&&Date.parse(row.due_at)<=now?'exception':row.state
 return {requestId:row.id,bookingId:row.booking_id,amountCents:row.amount_cents,dueAt:row.due_at,state,followupOwnerId:row.followup_owner_id,...state==='unpaid'&&row.provider_url?{providerUrl:row.provider_url}:{}}
}
function permitted(actor:Actor,manager=false){
 if(actor.agent||!(manager?['owner','admin']:['owner','admin','host']).includes(actor.role)||manager&&actor.deviceId)fail(403,manager?'A venue manager must create a deposit request.':'An active host or manager is required.')
}
/** Authority is checked again in the transaction, including PIN generation and idle expiry. */
async function authority(db:D1Database,actor:Actor){
 permitted(actor)
 if(actor.deviceId){
  if(actor.role!=='host')fail(403,'Use a personal manager session.')
  const {deviceFence}=await import('./shared-device')
  return deviceFence(db,actor,Date.now())
 }
 return db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.status='active' AND (o.role=? AND o.role IN ('owner','admin') OR o.role='member' AND ?='host' AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.hostIds') h WHERE s.id=1 AND h.value=o.id))) THEN 1 ELSE 0 END").bind(actor.id,actor.role,actor.role)
}
async function live(db:D1Database,actor:Actor){
 try{await db.batch([await authority(db,actor),db.prepare('DELETE FROM pm_assertions')])}
 catch(error){if(error instanceof Error&&error.message.includes('pm_assertions'))fail(403,'Payment-link authority changed. Unlock or sign in again.');throw error}
}
async function commit(db:D1Database,actor:Actor,s:State,version:number,action:string,subject:string,statements:D1PreparedStatement[],change?:{id:string;before:unknown;after:unknown}){
 s.audit.push({id:id(),actor:actor.id,at:new Date().toISOString(),action,subject,source:'person',...change?{changes:[{kind:'paymentRequests',...change,before:change.before&&typeof change.before==='object'?Object.fromEntries(Object.entries(change.before).filter(([key])=>key!=='providerUrl')):change.before}]}:{},...actor.deviceId?{deviceId:actor.deviceId}:{}})
 const stateFence=db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END').bind(version)
 await save(db,s,version,[await authority(db,actor),stateFence,...statements])
}
async function requestRow(db:D1Database,requestId:unknown){
 return await db.prepare('SELECT * FROM pm_payment_requests WHERE id=?').bind(text(requestId,'Payment request',100)).first<PaymentRow>()??fail(404,'Payment request not found.')
}
function checkBooking(s:State,bookingId:string){
 const booking=s.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')
 if(!['booked','seated'].includes(booking.status))fail(409,'Deposit links require an active reservation.')
 return booking
}

/** Manager-specified money and deadline are immutable; hosts issue the resulting request only. */
export async function createPaymentRequest(db:D1Database,actor:Actor,p:PaymentInput){
 permitted(actor,true);await live(db,actor)
 const {state:s,version}=await load(db),bookingId=text(p.bookingId,'Reservation',100)
 checkBooking(s,bookingId)
 if(typeof p.amountCents!=='number'||!Number.isSafeInteger(p.amountCents)||p.amountCents<50||p.amountCents>99999999)fail(400,'Deposit amount must be integer USD cents from 50 to 99999999.')
 if(typeof p.dueAt!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(p.dueAt)||!Number.isFinite(Date.parse(p.dueAt))||Date.parse(p.dueAt)<=Date.now())fail(400,'Choose a future deposit deadline with a timezone.')
 const dueAt=new Date(Math.floor(Date.parse(p.dueAt as string)/1000)*1000).toISOString(),followupOwnerId=text(p.followupOwnerId,'Follow-up owner',100),reason=text(p.reason,'Deposit reason',500)
 if(Date.parse(dueAt)<=Date.now())fail(400,'Choose a future deposit deadline.')
 const owner=await db.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND (role IN ('owner','admin') OR role='member' AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.hostIds') h WHERE s.id=1 AND h.value=oa_operators.id))").bind(followupOwnerId).first()
 if(!owner)fail(400,'Choose an active host or manager to own the deposit follow-up.')
 if(await db.prepare('SELECT id FROM pm_payment_requests WHERE booking_id=?').bind(bookingId).first())fail(409,'This reservation already has a deposit request.')
 const requestId=id(),now=new Date().toISOString()
 await commit(db,actor,s,version,'payment.request',bookingId,[db.prepare('INSERT INTO pm_payment_requests(id,booking_id,amount_cents,due_at,followup_owner_id,created_by,created_at,reason) VALUES(?,?,?,?,?,?,?,?)').bind(requestId,bookingId,p.amountCents,dueAt,followupOwnerId,actor.id,now,reason)],{id:requestId,before:null,after:{requestId,bookingId,amountCents:p.amountCents,dueAt,followupOwnerId,state:'unpaid',reason}})
 return alert(await requestRow(db,requestId))
}

/** Internal floor projection; callers must already hold a live authorized session. No provider fetch. */
export async function paymentAlerts(db:D1Database,bookingIds?:string[]):Promise<PaymentAlert[]>{
 if(bookingIds?.length===0)return []
 const rows=(await db.prepare('SELECT * FROM pm_payment_requests ORDER BY due_at,id').all<PaymentRow>()).results
 const selected=bookingIds?new Set(bookingIds):null
 return rows.filter(r=>!selected||selected.has(r.booking_id)).map(r=>alert(r))
}
export async function readPaymentRequests(db:D1Database,actor:Actor,bookingId?:string){
 await live(db,actor)
 return paymentAlerts(db,bookingId?[text(bookingId,'Reservation',100)]:undefined)
}

function stripeKey(env:PaymentBindings){return env.STRIPE_SECRET_KEY||fail(409,'The owner must configure Stripe before issuing deposit links.')}
async function stripe(env:PaymentBindings,path:string,body?:URLSearchParams,key?:string):Promise<Checkout>{
 const secret=stripeKey(env)
 let response:Response
 try{response=await fetch('https://api.stripe.com/v1/checkout/sessions'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded','idempotency-key':key!}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(15000)})}
 catch{return fail(502,'Stripe could not be reached. The request is saved; no delivery is recorded.')}
 // Provider bodies and request headers can contain private data and are never surfaced or logged.
 if(!response.ok)fail(502,'Stripe did not confirm this payment request. Review the saved request before trying again.')
 try{return await response.json() as Checkout}catch{return fail(502,'Stripe returned an unreadable payment response.')}
}
function providerUrl(value:unknown):string|null{
 if(typeof value!=='string')return null
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password&&!url.port?value:null}catch{return null}
}
function verified(session:Checkout,row:PaymentRow){
 return session?.object==='checkout.session'&&typeof session.id==='string'&&session.id.length>0&&session.id.length<=255&&session.mode==='payment'&&session.client_reference_id===row.id&&session.metadata?.request_id===row.id&&session.metadata?.booking_id===row.booking_id&&session.amount_total===row.amount_cents&&session.currency==='usd'&&session.expires_at===Date.parse(row.due_at)/1000&&(!row.provider_session_id||session.id===row.provider_session_id)
}
function checkoutState(session:Checkout):PaymentAlert['state']{
 if(session.payment_status==='paid'&&session.status==='complete')return 'paid'
 if(session.payment_status==='unpaid'&&session.status==='expired')return 'expired'
 if(session.payment_status==='unpaid'&&['open','complete'].includes(session.status))return 'unpaid'
 return 'exception'
}
async function recordSession(env:PaymentBindings,actor:Actor,row:PaymentRow,session:Checkout,fromGet:boolean,action=fromGet?'payment.sync':'payment.link'){
 const {state:s,version}=await load(env.DB),current=await requestRow(env.DB,row.id)
 if(!fromGet)checkBooking(s,row.booking_id)
 const valid=verified(session,current),state=valid?checkoutState(session):'exception'
 // A POST replay is not a fresh observation of payment. Only authenticated GET may establish paid.
 const preserved=!fromGet&&current.verified_at&&['paid','expired'].includes(current.state)
 let next=current.state==='paid'?'paid':preserved?current.state:state==='paid'&&!fromGet?'exception':state
 const url=valid&&next==='unpaid'&&session.status==='open'?providerUrl(session.url):null
 if(next==='unpaid'&&session.status==='open'&&!url)next='exception'
 const now=new Date().toISOString()
 await commit(env.DB,actor,s,version,action,row.booking_id,[env.DB.prepare('UPDATE pm_payment_requests SET state=?,provider_session_id=COALESCE(provider_session_id,?),provider_url=?,verified_at=?,paid_at=CASE WHEN ?=\'paid\' THEN COALESCE(paid_at,?) ELSE paid_at END WHERE id=?').bind(next,valid?session.id:null,url,preserved?current.verified_at:fromGet&&valid?now:null,next,now,row.id)],{id:row.id,before:alert(current),after:{requestId:row.id,bookingId:row.booking_id,amountCents:row.amount_cents,dueAt:row.due_at,followupOwnerId:row.followup_owner_id,state:next,processorReference:valid?session.id:null}})
 if(!valid||next==='exception'||next==='unpaid'&&session.status==='open'&&!url)fail(502,'Stripe payment details could not be verified. A manager must review the request.')
 return alert(await requestRow(env.DB,row.id))
}

/** Explicit create only: returns a hosted URL for a person to copy/send; never sends a message. */
export async function issuePaymentLink(env:PaymentBindings,actor:Actor,requestId:unknown){
 await live(env.DB,actor);stripeKey(env)
 let row=await requestRow(env.DB,requestId)
 const {state:s,version}=await load(env.DB);checkBooking(s,row.booking_id)
 const recovering=Boolean(row.provider_attempt_at&&!row.provider_session_id)
 if(row.state!=='unpaid'&&!(recovering&&row.state==='exception')||!recovering&&Date.parse(row.due_at)<=Date.now())fail(409,'This deposit request needs manager review before a link can be issued.')
 if(row.provider_session_id){if(!row.provider_url)fail(409,'Check payment status to recover the current Stripe link before sharing it.');await live(env.DB,actor);return {...alert(row),delivery:'copy-required' as const}}
 const remaining=Date.parse(row.due_at)-Date.now()
 // Stripe requires a custom Checkout expiry 30 minutes to 24 hours ahead. Do not shorten the obligation.
 if(!recovering&&(remaining<31*60000||remaining>24*3600000))fail(409,'Issue this link when its deadline is between 31 minutes and 24 hours away.')
 if(row.provider_attempt_at&&Date.now()-Date.parse(row.provider_attempt_at)>=23*3600000)fail(409,'A manager must reconcile the earlier Stripe attempt before another link can be created.')
 if(!row.provider_attempt_at){
  let origin:URL
  try{origin=new URL(env.AUTH_ORIGIN)}catch{return fail(409,'The venue origin must be configured before issuing links.')}
  if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password)fail(409,'The venue origin must be configured before issuing links.')
  await commit(env.DB,actor,s,version,'payment.link.prepare',row.booking_id,[env.DB.prepare('UPDATE pm_payment_requests SET provider_attempt_at=?,provider_return_url=? WHERE id=? AND provider_attempt_at IS NULL').bind(new Date().toISOString(),origin.origin+'/',row.id)],{id:row.id,before:{requestId:row.id,state:row.state},after:{requestId:row.id,state:row.state,attemptAt:new Date().toISOString()}})
  row=await requestRow(env.DB,row.id)
 }
 const body=new URLSearchParams({mode:'payment',success_url:row.provider_return_url!,cancel_url:row.provider_return_url!,client_reference_id:row.id,'metadata[request_id]':row.id,'metadata[booking_id]':row.booking_id,'payment_intent_data[metadata][request_id]':row.id,'payment_intent_data[metadata][placemat_booking_id]':row.booking_id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(row.amount_cents),'line_items[0][price_data][product_data][name]':'Reservation deposit','payment_method_types[0]':'card',expires_at:String(Date.parse(row.due_at)/1000)})
 await live(env.DB,actor)
 const session=await stripe(env,'',body,'placemat-deposit-'+row.id)
 return {...await recordSession(env,actor,row,session,false),delivery:'copy-required' as const}
}

/** Only server-to-server retrieval establishes payment, never a browser redirect or client status. */
export async function syncPaymentRequest(env:PaymentBindings,actor:Actor,requestId:unknown){
 await live(env.DB,actor)
 const row=await requestRow(env.DB,requestId)
 if(!row.provider_session_id)fail(409,'No Stripe session is recorded. Review or issue this saved request first.')
 const session=await stripe(env,'/'+encodeURIComponent(row.provider_session_id!))
 return recordSession(env,actor,row,session,true)
}

/** Explicit manager action closes collection only; cancellation remains a separate decision. */
export async function closePaymentRequest(env:PaymentBindings,actor:Actor,requestId:unknown){
 permitted(actor,true);await live(env.DB,actor)
 let row=await requestRow(env.DB,requestId)
 if(!row.provider_session_id){
  if(row.provider_attempt_at)fail(409,'Keep this reservation. A personal owner or manager must recover this saved payment link using the same request, then close Checkout before releasing the slot.')
  return {...alert(row),releaseAllowed:true,closeState:'no-attempt' as const}
 }
 let session:Checkout
 try{session=await stripe(env,'/'+encodeURIComponent(row.provider_session_id))}
 catch{return fail(502,'Keep this reservation. A personal owner or manager must check Stripe payment status; Checkout closure is unconfirmed.')}
 await recordSession(env,actor,row,session,true,'payment.close.review')
 row=await requestRow(env.DB,row.id)
 if(row.state==='paid')return {...alert(row),releaseAllowed:true,closeState:'paid' as const}
 if(row.state==='expired')return {...alert(row),releaseAllowed:true,closeState:'expired-unpaid' as const}
 if(session.status!=='open'||session.payment_status!=='unpaid')fail(409,'Keep this reservation. Checkout payment is processing or unconfirmed. A personal owner or manager must check its final payment status before releasing the slot.')
 // One explicit expiry attempt. Its response is never proof; a fresh GET below is authoritative.
 try{await stripe(env,'/'+encodeURIComponent(row.provider_session_id!)+'/expire',new URLSearchParams(),'placemat-deposit-close-'+row.id)}catch{/* A concurrent payment or lost expiry response still requires the authoritative GET. */}
 try{session=await stripe(env,'/'+encodeURIComponent(row.provider_session_id!))}
 catch{return fail(502,'Keep this reservation. A personal owner or manager must check Stripe payment status; Checkout closure is unconfirmed.')}
 await recordSession(env,actor,row,session,true,'payment.close')
 row=await requestRow(env.DB,row.id)
 if(row.state!=='expired'&&row.state!=='paid')fail(409,'Keep this reservation. A personal owner or manager must close the still-open Checkout or resolve its processing payment in Stripe, then check payment status before releasing the slot.')
 return {...alert(row),releaseAllowed:true,closeState:row.state==='paid'?'paid' as const:'expired-unpaid' as const}
}

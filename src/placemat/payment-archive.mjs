const bad=message=>Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})
const string=value=>typeof value==='string'&&value.trim().length>0
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const nullable=(value,predicate)=>value===null||value===undefined||predicate(value)
const money=(value,min=1)=>Number.isSafeInteger(value)&&value>=min&&value<=99999999
const statuses=['pending','succeeded','failed','canceled']
function unique(rows,key,label){
 const values=new Set()
 for(const row of rows){if(!row||!string(row[key])||values.has(row[key]))throw bad('Invalid '+label+' identity');values.add(row[key])}
 return new Map(rows.map(row=>[row[key],row]))
}
function returnUrl(value){
 try{const url=new URL(value);return typeof value==='string'&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash}catch{return false}
}
function snapshot(value,refund){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.bookingId!==refund.booking_id||value.chargeId!==refund.charge_id||value.amountCents!==refund.amount_cents||typeof value.reason!=='string'||!statuses.includes(value.status)||!nullable(value.processorId,string))throw bad('Invalid refund event snapshot')
 return value
}
const same=(a,b)=>['bookingId','chargeId','amountCents','reason','status','processorId'].every(key=>a[key]===b[key])

/** Validates retained facts and references only; restoration never calls a payment provider. */
export async function validatePayments(state,read,erasedGuestIds=new Set()){
 const [payments,charges,refunds,events,notices,webhooks,followups]=await Promise.all(['pm_payment_requests','pm_refund_charges','pm_refunds','pm_refund_events','pm_refund_notices','pm_refund_webhooks','pm_refund_followups'].map(read))
 const bookings=new Map(state.bookings.map(row=>[row.id,row]))
 const erased=bookingId=>erasedGuestIds.has(bookings.get(bookingId)?.guestId)
 unique(payments,'id','payment request')
 const paymentBookings=new Set(),sessions=new Set()
 for(const row of payments){
  if(!bookings.has(row.booking_id)||paymentBookings.has(row.booking_id)||!money(row.amount_cents,50)||row.currency!=='usd'||!instant(row.due_at)||!instant(row.created_at)||Date.parse(row.due_at)<=Date.parse(row.created_at)||!string(row.created_by)||!string(row.followup_owner_id)||typeof row.reason!=='string'||!['unpaid','paid','expired','exception'].includes(row.state)||!nullable(row.provider_attempt_at,instant)||!nullable(row.provider_session_id,string)||!nullable(row.verified_at,instant)||!nullable(row.paid_at,instant))throw bad('Invalid payment request')
  // Hosted Checkout URLs grant payment access and must be absent from portable archives.
  if(row.provider_url!==null&&row.provider_url!==undefined)throw bad('Nonportable payment link')
  if(row.provider_attempt_at?!returnUrl(row.provider_return_url):row.provider_return_url!=null||row.provider_session_id!=null)throw bad('Invalid payment attempt')
  if(row.state==='paid'&&(!instant(row.paid_at)||!string(row.provider_session_id))||row.state!=='paid'&&row.paid_at!=null)throw bad('Invalid paid payment request')
  if(row.state==='expired'&&!string(row.provider_session_id)||row.verified_at&&!string(row.provider_session_id)||erased(row.booking_id)&&row.reason!=='')throw bad('Invalid payment observation or erased reason')
  if(row.provider_session_id){if(sessions.has(row.provider_session_id))throw bad('Duplicate payment provider reference');sessions.add(row.provider_session_id)}
  paymentBookings.add(row.booking_id)
 }
 const chargeMap=unique(charges,'charge_id','refund charge')
 for(const row of charges)if(!bookings.has(row.booking_id)||!money(row.amount_cents)||!money(row.imported_refunded_cents,0)||row.imported_refunded_cents>row.amount_cents||row.currency!=='usd'||!string(row.synced_by)||!instant(row.synced_at))throw bad('Invalid refund charge')
 const refundMap=unique(refunds,'id','refund'),requests=new Set(),processors=new Set(),reserved=new Map()
 for(const row of refunds){
  const charge=chargeMap.get(row.charge_id),request=JSON.stringify([row.actor_id,row.request_id])
  if(!charge||charge.booking_id!==row.booking_id||!money(row.amount_cents)||row.amount_cents>charge.amount_cents||!string(row.request_id)||!string(row.actor_id)||requests.has(request)||typeof row.reason!=='string'||erased(row.booking_id)&&row.reason!==''||!statuses.includes(row.status)||!nullable(row.processor_id,string)||!instant(row.created_at)||!instant(row.updated_at)||Date.parse(row.updated_at)<Date.parse(row.created_at)||!Number.isSafeInteger(row.processing_until)||row.processing_until<0)throw bad('Invalid refund')
  if(row.processor_id){if(processors.has(row.processor_id))throw bad('Duplicate refund provider reference');processors.add(row.processor_id)}
  requests.add(request)
  if(['pending','succeeded'].includes(row.status))reserved.set(row.charge_id,(reserved.get(row.charge_id)??0)+row.amount_cents)
 }
 for(const [chargeId,cents] of reserved){const charge=chargeMap.get(chargeId);if(!Number.isSafeInteger(cents)||cents+charge.imported_refunded_cents>charge.amount_cents)throw bad('Refunds exceed the recorded charge')}
 const webhookIds=new Set(),providerEventIds=new Set()
 for(const row of webhooks){if(!Number.isSafeInteger(row.id)||row.id<1||webhookIds.has(row.id)||!string(row.event_id)||providerEventIds.has(row.event_id)||!refundMap.has(row.refund_id)||!['refund.created','refund.updated','refund.failed'].includes(row.event_type)||!['pending','requires_action','succeeded','failed','canceled'].includes(row.processor_status)||!instant(row.received_at)||row.claim!=='')throw bad('Invalid signed refund receipt');webhookIds.add(row.id);providerEventIds.add(row.event_id)}
 unique(followups,'refund_id','refund follow-up')
 for(const row of followups){const refund=refundMap.get(row.refund_id);if(!refund||row.owner_id!==refund.actor_id||row.actor_id!==refund.actor_id||row.request_id!==refund.request_id||!['open','resolved'].includes(row.state)||!['failed','canceled'].includes(row.failure_status)||!instant(row.created_at)||!instant(row.updated_at)||!nullable(row.resolved_at,instant)||row.state==='resolved'&&!instant(row.resolved_at)||row.state==='open'&&row.resolved_at!=null)throw bad('Invalid refund follow-up')}
 unique(notices,'id','refund notice')
 const outcomes=new Set()
 for(const row of notices){const refund=refundMap.get(row.refund_id),key=JSON.stringify([row.refund_id,row.outcome]);if(!refund||!statuses.includes(row.outcome)||outcomes.has(key)||row.amount_cents!==refund.amount_cents||!money(row.remaining_cents,0)||!string(row.requested_by)||!instant(row.requested_at)||!['sending','accepted','unconfirmed'].includes(row.state)||!nullable(row.provider_id,string)||!nullable(row.accepted_at,instant)||row.state==='accepted'&&!instant(row.accepted_at)||row.state!=='accepted'&&row.accepted_at!=null)throw bad('Invalid refund notice');outcomes.add(key)}
 const eventIds=new Set(),previous=new Map()
 for(const row of [...events].sort((a,b)=>a.id-b.id)){
  const refund=refundMap.get(row.refund_id)
  if(!refund||!Number.isSafeInteger(row.id)||row.id<1||eventIds.has(row.id)||row.actor_id!==refund.actor_id||!instant(row.at)||typeof row.after_data!=='string'||!nullable(row.before_data,v=>typeof v==='string'))throw bad('Invalid refund event')
  const before=row.before_data==null?null:snapshot(JSON.parse(row.before_data),refund),after=snapshot(JSON.parse(row.after_data),refund),prior=previous.get(row.refund_id)
  if(erased(refund.booking_id)&&(after.reason!==''||before&&before.reason!==''))throw bad('Erased refund reason remains in history')
  if(prior?!before||!same(prior,before):before!==null)throw bad('Broken refund event history')
  eventIds.add(row.id);previous.set(row.refund_id,after)
 }
 for(const row of refunds){const last=previous.get(row.id);if(!last||last.status!==row.status||last.processorId!==row.processor_id)throw bad('Refund history does not match its current record')}
}

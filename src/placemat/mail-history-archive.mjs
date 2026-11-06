import {validateBookingMail} from './booking-management-mail-archive.mjs'

const bad=()=>{throw Error('Invalid refund delivery history. Nothing was restored.')}
const str=(v,max=1024)=>typeof v==='string'&&!!v.length&&v.length<=max&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v)
const namespace='placemat-refund-notices'
const key=r=>JSON.stringify([r.provider,r.tenant_id,r.event_namespace,r.event_id])
const refund=r=>r.provider==='sendgrid'&&r.event_namespace===namespace

/** The shared transport tables contain facts from two independently owned mail flows.
 * Neither an archived receipt nor its projected state grants callback authority. */
export async function validateMailHistory(read,rows,guests){
 const [receipts,states,notices,observations,refunds]=await Promise.all(['rer_mail_event_receipts','rer_mail_event_states','pm_refund_notices','pm_refund_mail_events','pm_refunds'].map(read))
 if([...receipts,...states].some(r=>r.provider!=='resend'&&!refund(r)))bad()
 // Keep every booking-specific assertion, applied only to booking-owned records.
 await validateBookingMail(table=>table==='rer_mail_event_receipts'?receipts.filter(r=>r.provider==='resend'):table==='rer_mail_event_states'?states.filter(r=>r.provider==='resend'):read(table),rows,guests)
 const bookings=rows[0]?JSON.parse(rows[0].data).bookings:[],events=new Map(),scopes=new Map()
 for(const r of receipts.filter(refund)){
  const e=JSON.parse(r.event_json),n=notices.find(n=>n.id===e.deliveryId),payment=refunds.find(p=>p.id===n?.refund_id)
  const b=bookings.find(b=>b.id===payment?.booking_id),g=guests.find(g=>g.id===b?.guestId)
  const observation=observations.find(o=>o.notice_id===n?.id&&o.event_id===r.event_id)
  if(!n||!g||JSON.parse(g.data).erased||!str(n.provider_id)||!str(r.tenant_id,256)||!str(r.event_id)||r.conflict!==0||!str(r.fingerprint)||!str(e.providerMessageId)||!str(e.product,512)||!e.product.startsWith(namespace+':')||!str(e.product.slice(namespace.length+1),256)||!Array.isArray(e.recipients)||e.recipients.length!==1||!str(e.recipients[0],254)||e.eventId!==r.event_id||e.provider!==r.provider||e.tenantId!==r.tenant_id||e.eventNamespace!==r.event_namespace||e.fingerprint!==r.fingerprint||!Number.isSafeInteger(e.occurredAt))bad()
  if(e.providerMessageId!==n.provider_id&&!e.providerMessageId.startsWith(n.provider_id+'.'))bad()
  // The minimized business observation must describe this exact transport receipt.
  if(!observation||observation.provider_message_id!==e.providerMessageId||observation.event_type!==e.type||observation.status!==e.status||observation.occurred_at!==e.occurredAt)bad()
  const scope=JSON.stringify([r.tenant_id,e.product,e.recipients[0]])
  if(scopes.has(n.id)&&scopes.get(n.id)!==scope||events.has(key(r)))bad()
  scopes.set(n.id,scope);events.set(key(r),e)
 }
 for(const s of states.filter(refund)){
  const e=events.get(key(s))
  if(!e||e.providerMessageId!==s.provider_message_id||e.recipients[0]!==s.recipient||e.status!==s.status||e.occurredAt!==s.occurred_at||!['accepted','deferred','delivered','bounced','rejected','complained'].includes(s.status)||s.terminal!==(['accepted','deferred'].includes(s.status)?0:1))bad()
 }
}

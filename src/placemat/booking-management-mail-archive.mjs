const bad=()=>{throw Error('Invalid booking delivery history. Nothing was restored.')}
const str=(v,max=1024)=>typeof v==='string'&&!!v.length&&v.length<=max&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v)
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const statuses=new Set(['accepted','deferred','delivered','bounced','failed','rejected','complained'])
/** Restored facts are visible history, never a provider authorization binding. */
export async function validateBookingMail(read,rows,guests){
 const [mail,receipts,states]=await Promise.all(['pm_booking_mail','rer_mail_event_receipts','rer_mail_event_states'].map(read))
 const bookings=rows[0]?JSON.parse(rows[0].data).bookings:[],ids=new Set(),messages=new Map(),events=new Map()
 const tuple=r=>JSON.stringify([r.provider,r.tenant_id,r.event_namespace,r.provider_message_id])
 for(const m of mail){
  const b=bookings.find(b=>b.id===m.booking_id),g=guests.find(g=>g.id===m.guest_id)
  if(!str(m.delivery_id)||ids.has(m.delivery_id)||!b||b.guestId!==m.guest_id||!g||JSON.parse(g.data).erased||m.provider!=='resend'||!str(m.tenant_id,256)||!str(m.event_namespace,256)||!str(m.recipient,254)||!str(m.actor_id)||m.historical!==1)bad()
  if(m.provider_message_id===null?m.accepted_at!==null:!str(m.provider_message_id)||!time(m.accepted_at))bad()
  ids.add(m.delivery_id)
  if(m.provider_message_id!==null){const k=tuple(m);if(messages.has(k))bad();messages.set(k,m)}
 }
 for(const r of receipts){
  const e=JSON.parse(r.event_json),m=messages.get(tuple({...r,provider_message_id:e.providerMessageId}))
  if(!m||!str(r.event_id)||r.conflict!==0||!str(r.fingerprint)||!Array.isArray(e.recipients)||e.recipients.length!==1||e.recipients[0]!==m.recipient||e.eventId!==r.event_id||e.provider!==r.provider||e.tenantId!==r.tenant_id||e.eventNamespace!==r.event_namespace||e.fingerprint!==r.fingerprint||!Number.isSafeInteger(e.occurredAt)||e.status!==null&&!statuses.has(e.status))bad()
  const key=JSON.stringify([r.provider,r.tenant_id,r.event_namespace,r.event_id]);if(events.has(key))bad();events.set(key,e)
 }
 for(const s of states){
  const m=messages.get(tuple(s)),e=events.get(JSON.stringify([s.provider,s.tenant_id,s.event_namespace,s.event_id]))
  if(!m||s.recipient!==m.recipient||!e||e.providerMessageId!==s.provider_message_id||s.status!==e.status||s.occurred_at!==e.occurredAt||!statuses.has(s.status)||s.terminal!==(['accepted','deferred'].includes(s.status)?0:1))bad()
 }
}

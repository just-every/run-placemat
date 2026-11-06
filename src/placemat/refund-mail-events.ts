import type {Bindings} from '../auth.server'
import {createDeliveryEventIntake,createD1EventStore} from '../mail.server.mjs'

export const refundMailNamespace='placemat-refund-notices'
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'}
const identity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256&&value.trim()===value&&!/[\x00-\x1f\x7f]/.test(value)
export function refundMailConfiguration(env:Bindings){
 if(env.MAIL_PROVIDER!=='sendgrid'||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1'||!identity(env.RER_INSTALLATION_ID)||!identity(env.SENDGRID_EVENT_TENANT_ID)||!env.SENDGRID_EVENT_PUBLIC_KEY)return null
 return {installationId:env.RER_INSTALLATION_ID,tenantId:env.SENDGRID_EVENT_TENANT_ID,key:env.SENDGRID_EVENT_PUBLIC_KEY,product:refundMailNamespace+':'+env.RER_INSTALLATION_ID}
}

/** Stream cap applies before allocation and before the unchanged signed-event intake. */
async function body(request:Request){
 const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0
 if(!reader)throw Error('body')
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024)throw Error('size');chunks.push(value)}}
 catch(error){await reader.cancel().catch(()=>{});throw error}
 const result=new Uint8Array(length);let offset=0
 for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}
 return result
}

/** Only native, explicitly sent SendGrid notices can acquire observations. No business action runs here. */
export async function refundMailWebhook(env:Bindings,request:Request){
 const answer=(status:number,code:string)=>Response.json({code},{status,headers})
 if(request.method!=='POST')return answer(405,'method_not_allowed')
 const config=refundMailConfiguration(env)
 if(!config)return answer(503,'refund_mail_events_unconfigured')
 try{
  const intake=createDeliveryEventIntake({provider:'sendgrid',tenantId:config.tenantId,eventNamespace:refundMailNamespace,key:config.key,store:createD1EventStore({db:env.DB}),
   authorize:async(event)=>{
    if(event.product!==config.product||event.recipients.length!==1)return false
    const custody=await env.DB.prepare(`SELECT c.recipient,n.provider_id FROM pm_refund_mail_custody c
     JOIN pm_refund_notices n ON n.id=c.notice_id JOIN pm_guests g ON g.id=c.guest_id
     JOIN pm_refunds r ON r.id=n.refund_id JOIN pm_state s ON s.id=1,json_each(s.data,'$.bookings') b
     WHERE c.notice_id=? AND c.installation_id=? AND c.tenant_id=? AND json_extract(b.value,'$.id')=r.booking_id
     AND json_extract(b.value,'$.guestId')=c.guest_id AND COALESCE(json_extract(g.data,'$.erased'),0)=0`).bind(event.deliveryId,config.installationId,config.tenantId).first<{recipient:string;provider_id:string|null}>()
    return !!custody?.provider_id&&event.recipients.every((recipient:string)=>recipient===custody.recipient)&&
     (event.providerMessageId===custody.provider_id||event.providerMessageId.startsWith(custody.provider_id+'.'))
   }})
  const results=await intake.ingestWebhook({rawBody:await body(request),headers:request.headers})
  // The public provider door never returns recipient addresses or local records.
  return Response.json({received:results.length,stored:results.filter(r=>r.outcome==='stored').length},{headers})
 }catch(error){
  const code=(error as {code?:string}).code
  if(code==='event_identity_conflict')return answer(409,code)
  if(code==='event_storage_failed')return answer(409,'refund_mail_binding_changed')
  return answer(403,'refund_mail_event_refused')
 }
}

export type RefundMailObservation={id:number;notice_id:string;event_id:string;provider_message_id:string;event_type:string;status:string|null;occurred_at:number;received_at:string}
export async function refundMailObservations(db:D1Database){return (await db.prepare('SELECT * FROM pm_refund_mail_events ORDER BY occurred_at,id').all<RefundMailObservation>()).results}
const terminal=new Set(['delivered','bounced','failed','rejected','complained'])
export function refundMailDelivery(rows:RefundMailObservation[]){
 // Equal-time observations use event identity as a stable tie break, never arrival order.
 const current=rows.filter(e=>e.status!==null).sort((a,b)=>Number(terminal.has(b.status!))-Number(terminal.has(a.status!))||b.occurred_at-a.occurred_at||b.event_id.localeCompare(a.event_id))[0]
 return {mailboxDelivery:current?.status??'unconfirmed',deliveryObservedAt:current?new Date(current.occurred_at).toISOString():null,deliveryEventId:current?.event_id??null,deliveryObservationCount:rows.length}
}
export function refundMailAudit(rows:RefundMailObservation[],notices:{id:string;refund_id:string}[],refunds:{id:string;booking_id:string}[]){
 return rows.map(e=>({id:'refund-mail-'+e.id,at:e.received_at,actor:'sendgrid',source:'provider' as const,action:'payment.refund-mail-observed',subject:refunds.find(r=>r.id===notices.find(n=>n.id===e.notice_id)?.refund_id)?.booking_id??e.notice_id,
  changes:[{kind:'refundMailEvents',id:e.event_id,before:null,after:{noticeId:e.notice_id,providerMessageId:e.provider_message_id,type:e.event_type,status:e.status,occurredAt:new Date(e.occurred_at).toISOString()}}]}))
}

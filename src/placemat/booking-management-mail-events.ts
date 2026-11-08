import type {Bindings} from '../auth.server'
import {createDeliveryEventIntake,createD1EventStore} from '../modules/mail/index.mjs'
import {bookingMailScope} from './booking-management-mail-store'

const headers={'cache-control':'no-store'}
/** Provider authentication is separate from ownership of the original recipient. */
export async function bookingMailEvents(request:Request,env:Bindings){
 if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405,headers})
 const scope=bookingMailScope(env)
 if(!scope||!env.RESEND_WEBHOOK_SECRET||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1')return Response.json({error:'Booking delivery observations are not configured.'},{status:503,headers})
 const reader=request.body?.getReader(),parts:Uint8Array[]=[];let size=0
 if(!reader)return Response.json({error:'A signed provider event is required.'},{status:400,headers})
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();return Response.json({error:'Event is too large.'},{status:413,headers})}parts.push(value)}
  const rawBody=new Uint8Array(size);let offset=0;for(const part of parts){rawBody.set(part,offset);offset+=part.length}
  const intake=createDeliveryEventIntake({provider:'resend',...scope,key:env.RESEND_WEBHOOK_SECRET,store:createD1EventStore({db:env.DB}),
   authorize:async(event:any)=>{
    if(event.recipients.length!==1)return false
    return !!await env.DB.prepare(`SELECT m.delivery_id FROM pm_booking_mail m JOIN pm_guests g ON g.id=m.guest_id
     WHERE m.provider=? AND m.tenant_id=? AND m.event_namespace=? AND m.provider_message_id=? AND m.recipient=?
     AND m.historical=0 AND m.accepted_at IS NOT NULL AND coalesce(json_extract(g.data,'$.erased'),0)=0
     AND json_extract(g.data,'$.mergedInto') IS NULL`)
     .bind(event.provider,event.tenantId,event.eventNamespace,event.providerMessageId,event.recipients[0]).first()
   }})
  const results=await intake.ingestWebhook({rawBody,headers:request.headers})
  return Response.json({results:results.map((r:any)=>({eventId:r.eventId,outcome:r.outcome}))},{headers})
 }catch(error){
  const code=typeof (error as any)?.code==='string'?(error as any).code:'event_refused'
  const status=code==='event_signature_invalid'?401:code==='event_unauthorized'?403:code==='event_identity_conflict'?409:code==='event_storage_failed'?409:400
  return Response.json({error:'Delivery event refused.',code},{status,headers})
 }finally{reader.releaseLock()}
}

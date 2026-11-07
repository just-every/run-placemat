import type {Bindings} from '../auth.server'
import {person} from './access'
import {fail,type Actor} from './model'
import {hash} from './store'

const identity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256&&value.trim()===value&&!/[\x00-\x1f\x7f]/.test(value)
/** Stable server-selected routing; request fields never supply these identities. */
export function bookingMailScope(env:Bindings){
 return env.MAIL_PROVIDER==='resend'&&identity(env.RER_INSTALLATION_ID)&&identity(env.MAIL_EVENT_NAMESPACE)
  ?{tenantId:env.RER_INSTALLATION_ID,eventNamespace:env.MAIL_EVENT_NAMESPACE}:null
}
export async function reserveBookingMail(env:Bindings,actor:Actor,bookingId:string,token:string,deliveryId:string,recipient:string){
 const scope=bookingMailScope(env)
 if(!scope)return false
 const result=await env.DB.prepare(`INSERT INTO pm_booking_mail
 (delivery_id,booking_id,guest_id,provider,tenant_id,event_namespace,recipient,actor_id)
 SELECT ?,m.booking_id,m.guest_id,'resend',?,?,?,? FROM pm_booking_management m
 JOIN pm_guests g ON g.id=m.guest_id
 WHERE m.booking_id=? AND m.token_hash=? AND coalesce(json_extract(g.data,'$.erased'),0)=0
 AND json_extract(g.data,'$.mergedInto') IS NULL
 AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin'))`)
 .bind(deliveryId,scope.tenantId,scope.eventNamespace,recipient,actor.id,bookingId,await hash(token),actor.id).run()
 if(result.meta.changes!==1)fail(409,'Reservation or personal authority changed before sending.')
 return true
}
export async function acceptBookingMail(db:D1Database,deliveryId:string,providerMessageId:string|null){
 if(typeof providerMessageId!=='string'||!providerMessageId||providerMessageId.length>1024||providerMessageId.trim()!==providerMessageId||/[\x00-\x1f\x7f]/.test(providerMessageId))return
 // A provider response arriving after erasure cannot recreate its binding.
 await db.prepare(`UPDATE pm_booking_mail SET provider_message_id=?,accepted_at=? WHERE delivery_id=? AND historical=0
 AND EXISTS(SELECT 1 FROM pm_guests g WHERE g.id=pm_booking_mail.guest_id
 AND coalesce(json_extract(g.data,'$.erased'),0)=0 AND json_extract(g.data,'$.mergedInto') IS NULL)`)
 .bind(providerMessageId,new Date().toISOString(),deliveryId).run()
}
export async function readBookingMail(db:D1Database,actor:Actor){
 person(actor)
 if(actor.deviceId)fail(403,'Use your personal manager session.')
 const [permission,mail,events]=await db.batch<any>([
  db.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(actor.id),
  db.prepare(`SELECT m.*,s.status,s.occurred_at,s.event_id FROM pm_booking_mail m
   JOIN pm_guests g ON g.id=m.guest_id
   LEFT JOIN rer_mail_event_states s ON s.provider=m.provider AND s.tenant_id=m.tenant_id
    AND s.event_namespace=m.event_namespace AND s.provider_message_id=m.provider_message_id AND s.recipient=m.recipient
   WHERE m.accepted_at IS NOT NULL AND coalesce(json_extract(g.data,'$.erased'),0)=0
    AND json_extract(g.data,'$.mergedInto') IS NULL ORDER BY m.accepted_at,m.delivery_id`),
  db.prepare(`SELECT m.delivery_id,r.event_id,json_extract(r.event_json,'$.type') AS type,
   json_extract(r.event_json,'$.status') AS status,json_extract(r.event_json,'$.occurredAt') AS occurred_at
   FROM rer_mail_event_receipts r JOIN pm_booking_mail m ON m.provider=r.provider AND m.tenant_id=r.tenant_id
    AND m.event_namespace=r.event_namespace AND m.provider_message_id=json_extract(r.event_json,'$.providerMessageId')
   JOIN pm_guests g ON g.id=m.guest_id WHERE coalesce(json_extract(g.data,'$.erased'),0)=0
    AND json_extract(g.data,'$.mergedInto') IS NULL ORDER BY occurred_at,r.event_id`),
 ])
 if(!permission.results.length)fail(403,'Current personal manager authority is required.')
 return mail.results.map(m=>({deliveryId:m.delivery_id,bookingId:m.booking_id,recipient:m.recipient,
  provider:m.provider,providerMessageId:m.provider_message_id,acceptedAt:m.accepted_at,
  status:m.status??'accepted',occurredAt:m.occurred_at??Date.parse(m.accepted_at),historical:m.historical===1,
  facts:events.results.filter(e=>e.delivery_id===m.delivery_id).map(({delivery_id,...fact}:any)=>fact)}))
}

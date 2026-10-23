import {fail,id,type State,type Actor} from '../model'
import type {Bindings} from '../../auth.server'
import {checkedEvent,schemaReport,type StoredEvent} from './event-schema'

const encode=new TextEncoder()
export async function sign(secret:string,value:string){
 const key=await crypto.subtle.importKey('raw',encode.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encode.encode(value))),n=>n.toString(16).padStart(2,'0')).join('')
}
const project=(b:State['bookings'][number])=>({id:b.id,serviceId:b.serviceId,partySize:b.partySize,startAt:b.startAt,endAt:b.endAt,status:b.status,source:b.source})
/** Anonymous event snapshots commit in the same transaction as the reservation. */
export function reservationEvents(db:D1Database,before:State,after:State){
 const statements:D1PreparedStatement[]=[]
 for(const booking of after.bookings){
  const previous=before.bookings.find(b=>b.id===booking.id),next=project(booking)
  if(previous&&JSON.stringify(project(previous))===JSON.stringify(next))continue
  const type=!previous?'reservation.created':booking.status==='cancelled'&&previous.status!=='cancelled'?'reservation.cancelled':'reservation.changed',eventId=id(),at=new Date().toISOString()
  const payload={id:eventId,type,schemaVersion:1,createdAt:at,reservation:next}
  statements.push(db.prepare('INSERT INTO pm_integration_events(id,type,schema_version,payload,created_at) VALUES(?,?,1,?,?)').bind(eventId,type,JSON.stringify(payload),at))
 }
 return statements
}
const ownerFence=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(actor.id)
const liveKey="SELECT k.id FROM pm_integration_keys k JOIN oa_operators o ON o.id=k.created_by WHERE k.id=? AND k.revoked_at IS NULL AND k.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND o.role='owner' AND o.status='active' AND EXISTS(SELECT 1 FROM json_each(k.scopes) WHERE value='events:read')"
const keyFence=(db:D1Database,keyId:string)=>db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS('+liveKey+') THEN 1 ELSE 0 END').bind(keyId)
function destination(value:unknown){
 let url:URL
 try{url=new URL(String(value))}catch{return fail(400,'Choose the subscriber HTTPS endpoint.')}
 const host=url.hostname.toLowerCase()
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||! /^[a-z][a-z0-9.-]*\.[a-z]{2,}$/.test(host)||host.split('.').some(part=>!part||part.startsWith('-')||part.endsWith('-'))||/(^|\.)(localhost|local|internal|home|lan|onion)$/.test(host)||host==='metadata.google.internal')fail(400,'Use a public HTTPS hostname on port 443, without credentials or a fragment.')
 return url.href
}
async function sealingKey(secret:string){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encode.encode('placemat integration subscription '+secret)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function seal(secret:string,value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await sealingKey(secret),encode.encode(value))
 return JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(data))})
}
async function open(secret:string,value:string){
 const data=JSON.parse(value)
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(data.iv)},await sealingKey(secret),new Uint8Array(data.data)))
}
const types=['reservation.created','reservation.changed','reservation.cancelled']
type Subscription={id:string;key_id:string;url:string;types:string;sealed_secret:string;revoked_at:string|null}
export async function subscriptions(env:Bindings,actor:Actor,path:string,method:string,p:any){
 const db=env.DB
 if(method==='GET'){
  if(path==='/api/integration-subscriptions/schema')return schemaReport(db)
  if(path!=='/api/integration-subscriptions')fail(404,'Subscription route not found.')
  return {subscriptions:(await db.prepare('SELECT id,key_id AS keyId,url,types,created_at AS createdAt,revoked_at AS revokedAt FROM pm_integration_subscriptions ORDER BY created_at,id').all()).results.map(row=>({...row,types:JSON.parse(row.types as string)})),attempts:(await db.prepare('SELECT id,subscription_id AS subscriptionId,event_id AS eventId,status,http_status AS httpStatus,created_at AS createdAt,finished_at AS finishedAt FROM pm_integration_deliveries ORDER BY created_at,id').all()).results}
 }
 if(p.acknowledged!==true)fail(400,'Explicitly acknowledge this subscription action.')
 if(path==='/api/integration-subscriptions'){
  if(typeof p.keyId!=='string'||!await db.prepare(liveKey).bind(p.keyId).first())fail(403,'Choose an active integration key with the events read scope.')
  if(!Array.isArray(p.types)||!p.types.length||p.types.length>3||new Set(p.types).size!==p.types.length||p.types.some((t:unknown)=>!types.includes(String(t))))fail(400,'Choose the documented reservation event types.')
  const url=destination(p.url),subscriptionId=id(),now=new Date().toISOString(),secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
  await db.batch([ownerFence(db,actor),keyFence(db,p.keyId),db.prepare('INSERT INTO pm_integration_subscriptions(id,key_id,url,types,sealed_secret,created_at,created_by) VALUES(?,?,?,?,?,?,?)').bind(subscriptionId,p.keyId,url,JSON.stringify(p.types),await seal(env.SESSION_SECRET,secret),now,actor.id),db.prepare('INSERT INTO pm_integration_audit(id,key_id,actor_id,action,at) VALUES(?,?,?,?,?)').bind(id(),p.keyId,actor.id,'subscription.created:'+subscriptionId,now),db.prepare('DELETE FROM pm_assertions')])
  return {id:subscriptionId,keyId:p.keyId,url,types:p.types,signingSecret:secret,notice:'Save this signing secret now. Delivery requires a separate explicit owner action.'}
 }
 const match=path.match(/^\/api\/integration-subscriptions\/([^/]+)\/(revoke|deliver)$/)
 if(!match)fail(404,'Subscription route not found.')
 const subscription=await db.prepare('SELECT * FROM pm_integration_subscriptions WHERE id=?').bind(match![1]).first<Subscription>()??fail(404,'Subscription not found.')
 if(match![2]==='revoke'){
  const now=new Date().toISOString()
  await db.batch([ownerFence(db,actor),db.prepare("INSERT INTO pm_integration_audit(id,key_id,actor_id,action,at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM pm_integration_subscriptions WHERE id=? AND revoked_at IS NULL)").bind(id(),subscription.key_id,actor.id,'subscription.revoked:'+subscription.id,now,subscription.id),db.prepare('UPDATE pm_integration_subscriptions SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(now,subscription.id),db.prepare('DELETE FROM pm_assertions')])
  return {id:subscription.id,revoked:true}
 }
 if(subscription.revoked_at||!await db.prepare(liveKey).bind(subscription.key_id).first())fail(403,'This subscription or its scoped key is revoked or expired.')
 if(typeof p.requestId!=='string'||! /^[a-zA-Z0-9-]{16,128}$/.test(p.requestId)||typeof p.eventId!=='string')fail(400,'Send an event ID and a stable request ID of 16 to 128 letters, digits or hyphens.')
 const old=await db.prepare('SELECT event_id,status,http_status FROM pm_integration_deliveries WHERE id=? AND subscription_id=?').bind(p.requestId,subscription.id).first<{event_id:string;status:string;http_status:number|null}>()
 if(old){if(old.event_id!==p.eventId)fail(409,'This request ID already names another event.');return {requestId:p.requestId,eventId:old.event_id,status:old.status,httpStatus:old.http_status,replayed:true}}
 const event=await db.prepare('SELECT id,type,schema_version,payload,created_at FROM pm_integration_events WHERE id=?').bind(p.eventId).first<StoredEvent>()??fail(404,'Event not found.')
 checkedEvent(event)
 if(!JSON.parse(subscription.types).includes(event.type))fail(403,'This event type is outside the subscription.')
 const now=new Date().toISOString(),pending=db.prepare("INSERT INTO pm_integration_deliveries(id,subscription_id,event_id,status,created_at,created_by) VALUES(?,?,?,'pending',?,?)").bind(p.requestId,subscription.id,p.eventId,now,actor.id)
 try{await db.batch([ownerFence(db,actor),keyFence(db,subscription.key_id),db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_integration_subscriptions WHERE id=? AND revoked_at IS NULL) THEN 1 ELSE 0 END').bind(subscription.id),pending,db.prepare('DELETE FROM pm_assertions')])}catch(error){
  if(/UNIQUE|CHECK constraint|pm_assertions/.test(String(error)))fail(409,'Delivery authority or request changed. Inspect the saved attempt before retrying.')
  throw error
 }
 const secret=await open(env.SESSION_SECRET,subscription.sealed_secret),timestamp=String(Math.floor(Date.now()/1000)),mac=await sign(secret,timestamp+'.'+event.payload)
 let status='uncertain',httpStatus:number|null=null
 try{
  const response=await fetch(subscription.url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json','x-placemat-event-id':p.eventId,'x-placemat-schema-version':'1','x-placemat-signature':`t=${timestamp},v1=${mac}`},body:event.payload})
  httpStatus=response.status;status=response.ok?'succeeded':'failed';await response.body?.cancel()
 }catch{status='uncertain'}
 await db.prepare('UPDATE pm_integration_deliveries SET status=?,http_status=?,finished_at=? WHERE id=? AND subscription_id=?').bind(status,httpStatus,new Date().toISOString(),p.requestId,subscription.id).run()
 return {requestId:p.requestId,eventId:p.eventId,status,httpStatus,replayed:false}
}

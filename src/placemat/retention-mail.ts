import type {Bindings} from '../auth.server'
import {fail,id,Problem,text} from './model'
import {hash,load} from './store'
import {capped,eligible,quietNow} from './retention-eligibility'
import {retentionSender} from './retention-consent'
import {activeGrant,assertion,atomic,consentRow,contact,escape,guestFence,ownerFence,randomToken,tokenContext,tokenFence,unavailable,workflowRow,type Config,type Preview,type Recipient,type Workflow} from './retention-store'
type Approval={workflow_id:string;owner_id:string;grant_revision:string;preview_hash:string;expires_at:string}
async function sendContext(db:D1Database,workflowId:string,snapshot:Recipient,now:Date,deliveryId=''){
 const [grant,w,{state,version}]=await Promise.all([activeGrant(db),workflowRow(db,workflowId),load(db)]),at=now.toISOString()
 if(!grant||!w||w.status!=='approved'||!w.preview_hash||!w.preview_data)return null
 const approval=await db.prepare('SELECT * FROM pm_retention_approvals WHERE workflow_id=?').bind(workflowId).first<Approval>()
 if(!approval||approval.owner_id!==grant.owner_id||approval.grant_revision!==grant.revision||approval.preview_hash!==w.preview_hash||approval.expires_at<=at)return null
 const preview:Preview=JSON.parse(w.preview_data),config:Config=JSON.parse(w.data)
 if(await hash(w.preview_data)!==approval.preview_hash||JSON.stringify(config)!==JSON.stringify(preview.config)||config.expiresAt<=at||quietNow(config,state,now))return null
 if(!preview.recipients.some(r=>JSON.stringify(r)===JSON.stringify(snapshot)))return null
 const r=await eligible(db,config,snapshot.guestId,state,now)
 if(!r||r.emailHash!==snapshot.emailHash||r.identityData!==snapshot.identityData||r.consentId!==snapshot.consentId||r.factsRevision!==snapshot.factsRevision||await capped(db,r,config,now,deliveryId))return null
 const c=await contact(db,r.guestId)
 if(!c||c.emailHash!==r.emailHash||c.identityData!==r.identityData)return null
 return {grant,w,approval,preview,config,state,version,r,c,at}
}
type SendContext=NonNullable<Awaited<ReturnType<typeof sendContext>>>
function fences(db:D1Database,c:SendContext){return [ownerFence(db,c.grant.owner_id),guestFence(db,c.c),
 assertion(db,'EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)',c.version),
 assertion(db,"EXISTS(SELECT 1 FROM pm_retention_settings WHERE id=1 AND enabled=1 AND owner_id=? AND revision=?) AND EXISTS(SELECT 1 FROM pm_retention_approvals WHERE workflow_id=? AND owner_id=? AND grant_revision=? AND preview_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM pm_retention_workflows WHERE id=? AND status='approved' AND data=? AND preview_hash=?)",c.grant.owner_id,c.grant.revision,c.w.id,c.grant.owner_id,c.grant.revision,c.w.preview_hash,c.at,c.w.id,c.w.data,c.w.preview_hash),
 assertion(db,'EXISTS(SELECT 1 FROM pm_retention_consents WHERE guest_id=? AND id=? AND email_hash=? AND identity_data=? AND purpose=? AND venue_scope=?)',c.r.guestId,c.r.consentId,c.r.emailHash,c.r.identityData,'venue-email-marketing',c.state.venue.name),
 c.r.factsRevision?assertion(db,'EXISTS(SELECT 1 FROM pm_retention_facts WHERE guest_id=? AND updated_at=?)',c.r.guestId,c.r.factsRevision):assertion(db,'NOT EXISTS(SELECT 1 FROM pm_retention_facts WHERE guest_id=?)',c.r.guestId)
]}
/** Claims precede the provider call; an uncertain attempt is never retried automatically. */
export async function runRetentionWorkflows(env:Bindings,now:Date|string|number=new Date()){
 const db=env.DB,date=new Date(now),at=date.toISOString(),summary={accepted:0,unconfirmed:0,suppressed:0},sender=retentionSender(env)
 if(!sender||!await activeGrant(db))return summary
 const rows=(await db.prepare("SELECT * FROM pm_retention_workflows WHERE status='approved' ORDER BY created_at,id").all<Workflow>()).results
 for(const w of rows){
  if(!w.preview_data)continue
  const preview:Preview=JSON.parse(w.preview_data)
  for(const snapshot of preview.recipients){
   const c=await sendContext(db,w.id,snapshot,date)
   if(!c){summary.suppressed++;continue}
   if(await db.prepare('SELECT id FROM pm_retention_deliveries WHERE workflow_id=? AND guest_id=? AND occurrence=?').bind(w.id,c.r.guestId,c.r.occurrence).first())continue
   const messageId=id(),token=randomToken(),tokenHash=await hash(token),unsubscribeToken=randomToken(),unsubscribeHash=await hash(unsubscribeToken),capUntil=new Date(date.getTime()+c.config.capDays*86400000).toISOString()
   try{
    await atomic(db,[...fences(db,c),assertion(db,"NOT EXISTS(SELECT 1 FROM pm_retention_deliveries WHERE (guest_id=? OR email_hash=?) AND state IN('claimed','accepted','unconfirmed') AND (cap_until>? OR created_at>?))",c.r.guestId,c.r.emailHash,at,new Date(date.getTime()-c.config.capDays*86400000).toISOString()),db.prepare("INSERT INTO pm_retention_deliveries(id,workflow_id,guest_id,occurrence,offer_data,email_hash,state,created_at,cap_until) VALUES(?,?,?,?,?,?,'claimed',?,?)").bind(messageId,w.id,c.r.guestId,c.r.occurrence,JSON.stringify(c.config),c.r.emailHash,at,capUntil),db.prepare("INSERT INTO pm_retention_tokens(token_hash,kind,guest_id,email_hash,identity_data,consent_id,message_id,venue_scope,created_at,expires_at) VALUES(?,'offer',?,?,?,?,?,?,?,?)").bind(tokenHash,c.r.guestId,c.r.emailHash,c.r.identityData,c.r.consentId,messageId,c.state.venue.name,at,c.config.expiresAt),db.prepare("INSERT INTO pm_retention_tokens(token_hash,kind,guest_id,email_hash,identity_data,consent_id,message_id,venue_scope,created_at,expires_at) VALUES(?,'unsubscribe',?,?,?,?,?,?,?,?)").bind(unsubscribeHash,c.r.guestId,c.r.emailHash,c.r.identityData,c.r.consentId,messageId,c.state.venue.name,at,'9999-12-31T23:59:59.999Z')])
   }catch(e){if(e instanceof Problem&&e.status===409)continue;throw e}
   let started=false,accepted=false,providerId:string|null=null
   try{
    const live=await sendContext(db,w.id,snapshot,date,messageId)
    if(!live||live.r.occurrence!==c.r.occurrence)throw new Error('Eligibility changed before send')
    await atomic(db,[...fences(db,live),assertion(db,"EXISTS(SELECT 1 FROM pm_retention_deliveries WHERE id=? AND state='claimed') AND EXISTS(SELECT 1 FROM pm_retention_tokens WHERE token_hash=? AND consent_id=?)",messageId,tokenHash,live.r.consentId)])
    const link=new URL('/retention',env.AUTH_ORIGIN);link.hash=token
    const unsubscribe=new URL('/retention',env.AUTH_ORIGIN);unsubscribe.hash=unsubscribeToken
    started=true
    const result=await sender.send({deliveryId:messageId,from:env.MAIL_FROM!,to:[live.r.email],subject:`${live.config.name} · ${live.state.venue.name}`,headers:{'Auto-Submitted':'auto-generated'},text:`${live.config.offer}\n\nView this offer and book: ${link.href}\n\nYou chose email marketing from ${live.state.venue.name}. Unsubscribe from marketing: ${unsubscribe.href}\nOffer expires ${live.config.expiresAt}.`,html:`<p>${escape(live.config.offer).replaceAll('\n','<br>')}</p><p><a href="${escape(link.href)}">View this offer and book</a></p><p>You chose email marketing from ${escape(live.state.venue.name)}. <a href="${escape(unsubscribe.href)}">Unsubscribe on the private offer page</a>.</p><p>Offer expires ${escape(live.config.expiresAt)}.</p>`})
    accepted=result.status==='accepted';providerId=result.providerMessageId??null
   }catch{}
   const deliveryState=accepted?'accepted':started?'unconfirmed':'cancelled'
   await db.batch([db.prepare('UPDATE pm_retention_deliveries SET state=?,accepted_at=?,provider_id=? WHERE id=?').bind(deliveryState,accepted?at:null,providerId,messageId),...accepted?[]:[db.prepare('DELETE FROM pm_retention_tokens WHERE message_id=?').bind(messageId)]])
   summary[accepted?'accepted':started?'unconfirmed':'suppressed']++
  }
 }
 return summary
}
/** Attribution proves the accepted message and matches the live guest identity. */
export async function captureRetentionAttribution(db:D1Database,token:string,bookingId:string){
 const context=await tokenContext(db,{token},'offer'),c=context.contact,t=context.token,{state,version}=await load(db),consent=await consentRow(db,c.guest.id)
 if(!consent||consent.id!==t.consent_id||consent.email_hash!==c.emailHash)unavailable()
 const delivery=await db.prepare("SELECT id,guest_id,accepted_at,offer_data FROM pm_retention_deliveries WHERE id=? AND guest_id=? AND email_hash=? AND state='accepted'").bind(t.message_id,c.guest.id,c.emailHash).first<{id:string;guest_id:string;accepted_at:string;offer_data:string}>()
 const booking=state.bookings.find(b=>b.id===text(bookingId,'Booking',100)&&b.guestId===c.guest.id)
 if(!delivery||!booking||Date.parse(booking.createdAt)<Date.parse(delivery.accepted_at)||JSON.parse(delivery.offer_data).expiresAt<=new Date().toISOString())fail(409,'This booking cannot be attributed to that marketing message.')
 const prior=await db.prepare('SELECT delivery_id FROM pm_retention_attributions WHERE booking_id=?').bind(bookingId).first<{delivery_id:string}>()
 if(prior){if(prior.delivery_id!==delivery!.id)fail(409,'This booking already belongs to another campaign message.');return {attributed:true}}
 await atomic(db,[guestFence(db,c),tokenFence(db,t,new Date().toISOString()),assertion(db,'EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) AND EXISTS(SELECT 1 FROM pm_retention_consents WHERE guest_id=? AND id=?)',version,c.guest.id,consent!.id),assertion(db,"EXISTS(SELECT 1 FROM pm_retention_deliveries WHERE id=? AND state='accepted' AND guest_id=?)",delivery!.id,c.guest.id),db.prepare('INSERT INTO pm_retention_attributions(booking_id,delivery_id,guest_id,created_at) VALUES(?,?,?,?)').bind(bookingId,delivery!.id,c.guest.id,new Date().toISOString())])
 return {attributed:true}
}

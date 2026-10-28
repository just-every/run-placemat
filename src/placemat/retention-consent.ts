import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {fail,id} from './model'
import {hash,load} from './store'
import {activeGrant,assertion,atomic,consentRow,contact,escape,factsRow,guestFence,purpose,randomToken,tokenContext,tokenFence,unavailable,type GuestRow} from './retention-store'
export const retentionSender=(env:Bindings)=>env.AUTH_LOCAL==='true'||env.RER_DEMO==='1'||!env.MAIL_FROM?undefined:operatorMail(env)
/** A guest requests proof of address; it never grants marketing permission by itself. */
export async function requestRetentionConsent(env:Bindings,p:any){
 if(typeof p.email!=='string'||p.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()))fail(400,'Enter your email address.')
 const email=p.email.trim().toLowerCase(),emailHash=await hash(email),at=new Date().toISOString(),db=env.DB
 const prior=await db.prepare('SELECT requested_at FROM pm_retention_requests WHERE email_hash=?').bind(emailHash).first<{requested_at:string}>()
 // The same neutral response covers unknown addresses, a recent request and unavailable delivery.
 if(prior&&Date.parse(prior.requested_at)>Date.now()-86400000)return {requested:true}
 const rows=(await db.prepare("SELECT id,version,data FROM pm_guests WHERE lower(trim(COALESCE(json_extract(data,'$.email'),'')))=? AND COALESCE(json_extract(data,'$.erased'),0)=0 AND json_extract(data,'$.mergedInto') IS NULL").bind(email).all<GuestRow>()).results
 await atomic(db,[assertion(db,'NOT EXISTS(SELECT 1 FROM pm_retention_requests WHERE email_hash=? AND requested_at>?)',emailHash,new Date(Date.now()-86400000).toISOString()),db.prepare('INSERT INTO pm_retention_requests(email_hash,requested_at) VALUES(?,?) ON CONFLICT(email_hash) DO UPDATE SET requested_at=excluded.requested_at').bind(emailHash,at)])
 const sender=retentionSender(env)
 if(rows.length!==1||!sender)return {requested:true}
 const c=await contact(db,rows[0].id)
 if(!c)return {requested:true}
 const {state}=await load(db),token=randomToken(),tokenHash=await hash(token),expiresAt=new Date(Date.now()+3600000).toISOString()
 await atomic(db,[guestFence(db,c),db.prepare("DELETE FROM pm_retention_tokens WHERE email_hash=? AND kind='confirm'").bind(emailHash),db.prepare("INSERT INTO pm_retention_tokens(token_hash,kind,guest_id,email_hash,identity_data,venue_scope,created_at,expires_at) VALUES(?,'confirm',?,?,?,?,?,?)").bind(tokenHash,c.guest.id,emailHash,c.identityData,state.venue.name,at,expiresAt)])
 const link=new URL('/retention',env.AUTH_ORIGIN);link.hash=token
 try{
  const result=await sender.send({deliveryId:`retention-consent-${id()}`,from:env.MAIL_FROM!,to:[email],subject:`Confirm email marketing permission · ${state.venue.name}`,headers:{'Auto-Submitted':'auto-generated'},text:`You requested email marketing from ${state.venue.name}. Confirm your address and choose permission on this private page: ${link.href}\n\nThis message only verifies your request. No marketing permission is active until you explicitly confirm. The link expires in one hour. Ignore this email if you did not make the request.`,html:`<p>You requested email marketing from ${escape(state.venue.name)}.</p><p><a href="${escape(link.href)}">Verify your address and choose marketing permission</a></p><p>No marketing permission is active until you explicitly confirm. The link expires in one hour. Ignore this message if you did not request it.</p>`})
  if(result.status!=='accepted')await db.prepare('DELETE FROM pm_retention_tokens WHERE token_hash=?').bind(tokenHash).run()
 }catch{await db.prepare('DELETE FROM pm_retention_tokens WHERE token_hash=?').bind(tokenHash).run()}
 return {requested:true}
}
export async function confirmRetentionConsent(env:Bindings,p:any){
 if(p.confirm!==true)fail(400,'Explicitly choose email marketing permission before confirming.')
 const db=env.DB,{token,contact:c}=await tokenContext(db,p,'confirm'),{state}=await load(db),at=new Date().toISOString(),consentId=id(),facts=await factsRow(db,c.guest.id)
 if(token.venue_scope!==state.venue.name)unavailable()
 const unsubscribe=randomToken(),unsubscribeHash=await hash(unsubscribe)
 await atomic(db,[guestFence(db,c),tokenFence(db,token,at),db.prepare('INSERT INTO pm_retention_consents(guest_id,id,email_hash,identity_data,purpose,venue_scope,confirmed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(guest_id) DO UPDATE SET id=excluded.id,email_hash=excluded.email_hash,identity_data=excluded.identity_data,purpose=excluded.purpose,venue_scope=excluded.venue_scope,confirmed_at=excluded.confirmed_at').bind(c.guest.id,consentId,c.emailHash,c.identityData,purpose,token.venue_scope,at),db.prepare('INSERT OR IGNORE INTO pm_retention_facts(guest_id,created_at,provenance,updated_at) VALUES(?,?,?,?)').bind(c.guest.id,facts?.created_at??at,'{}',at),db.prepare('DELETE FROM pm_retention_tokens WHERE guest_id=?').bind(c.guest.id),db.prepare("INSERT INTO pm_retention_tokens(token_hash,kind,guest_id,email_hash,identity_data,consent_id,venue_scope,created_at,expires_at) VALUES(?,'unsubscribe',?,?,?,?,?,?,?)").bind(unsubscribeHash,c.guest.id,c.emailHash,c.identityData,consentId,token.venue_scope,at,'9999-12-31T23:59:59.999Z')])
 return {confirmed:true,purpose,venueName:state.venue.name,unsubscribeToken:unsubscribe}
}
export async function publicRetentionConsent(env:Bindings,p:any){return p.token!==undefined?confirmRetentionConsent(env,p):requestRetentionConsent(env,p)}
export async function publicRetentionStatus(env:Bindings,p:any){
 const db=env.DB,{token,contact:c}=await tokenContext(db,p),{state}=await load(db)
 const [local,domain]=c.email.split('@'),maskedEmail=`${local.slice(0,1)}…@${domain}`
 if(token.kind==='confirm'){if(token.venue_scope!==state.venue.name)unavailable();return {kind:'confirm',venueName:token.venue_scope,maskedEmail,purpose,requiresExplicitConfirmation:true,expiresAt:token.expires_at}}
 const consent=await consentRow(db,c.guest.id)
 if(!consent||consent.id!==token.consent_id||consent.email_hash!==c.emailHash)unavailable()
 if(token.kind==='unsubscribe')return {kind:'unsubscribe',venueName:token.venue_scope,maskedEmail,subscribed:true}
 if(!await activeGrant(db))unavailable()
 const message=await db.prepare("SELECT d.id,d.workflow_id,d.offer_data AS data FROM pm_retention_deliveries d WHERE d.id=? AND d.guest_id=? AND d.state='accepted'").bind(token.message_id,c.guest.id).first<{id:string;workflow_id:string;data:string}>()
 if(!message)unavailable()
 const config=JSON.parse(message!.data)
 if(config.expiresAt<=new Date().toISOString())unavailable()
 const booking=new URL('/book',env.AUTH_ORIGIN);booking.hash=`campaign=${p.token}`
 if(config.experienceId)booking.searchParams.set('experience',config.experienceId)
 return {kind:'offer',venueName:token.venue_scope,offer:config.offer,campaignId:message!.workflow_id,bookingUrl:booking.href,expiresAt:config.expiresAt,canUnsubscribe:true}
}
export async function publicRetentionUnsubscribe(env:Bindings,p:any){
 const db=env.DB,{token,contact:c}=await tokenContext(db,p)
 if(!['offer','unsubscribe'].includes(token.kind))unavailable()
 await atomic(db,[guestFence(db,c),tokenFence(db,token,new Date().toISOString()),db.prepare('DELETE FROM pm_retention_consents WHERE email_hash=?').bind(c.emailHash),db.prepare('DELETE FROM pm_retention_tokens WHERE email_hash=?').bind(c.emailHash),db.prepare("UPDATE pm_retention_deliveries SET state='cancelled' WHERE email_hash=? AND state='claimed'").bind(c.emailHash)])
 return {unsubscribed:true}
}

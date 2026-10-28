import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {fail,id,text,Problem,type Actor} from './model'
import {hash,load} from './store'
import {readFeedback} from './feedback'
import {atomic,bookingContact,liveFences,liveVisit,managerAuthority,managerFence,ownerFence,settingsRow,assigneeFence,type FeedbackVisit} from './feedback-store'

const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
const senderFor=(env:Bindings)=>env.AUTH_LOCAL==='true'||env.RER_DEMO==='1'||!env.MAIL_FROM?undefined:operatorMail(env)
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
/** Each unique visit is claimed once before the network edge. Unconfirmed attempts never retry automatically. */
export async function runFeedbackSurveys(env:Bindings,now:Date|string|number=new Date()){
 const at=new Date(now).toISOString(),settings=await settingsRow(env.DB),summary={accepted:0,unconfirmed:0,suppressed:0}
 if(!settings?.enabled||!settings.public_review_url||!await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND role='owner'").bind(settings.owner_id).first())return summary
 const {state}=await load(env.DB)
 for(const booking of state.bookings.filter(b=>b.status==='completed'&&b.feedbackEmailConsent)){
  if(await env.DB.prepare('SELECT id FROM pm_feedback_visits WHERE booking_id=?').bind(booking.id).first())continue
  // Reload every candidate: completion, erasure and consent can change while an earlier send is in flight.
  const {state:current,version}=await load(env.DB),b=current.bookings.find(row=>row.id===booking.id&&row.status==='completed'),consent=b?.feedbackEmailConsent
  if(!b||!consent||consent.source!=='guest-supplied'||consent.historical===true||!Number.isFinite(Date.parse(consent.at)))continue
  const contact=await bookingContact(env.DB,b)
  if(!contact||contact.emailHash!==consent.emailHash)continue
  const visitId=id(),token=randomToken(),tokenHash=await hash(token),sender=senderFor(env)
  const statements=[ownerFence(env.DB,settings.owner_id),env.DB.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) AND EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) AND EXISTS(SELECT 1 FROM pm_feedback_settings WHERE id=1 AND enabled=1 AND owner_id=? AND updated_at=?) THEN 1 ELSE 0 END').bind(version,b.guestId,contact.guestRow.version,contact.guestRow.data,settings.owner_id,settings.updated_at),contact.contactRow?env.DB.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=? AND guest_id=? AND data=?) THEN 1 ELSE 0 END').bind(b.id,b.guestId,contact.contactRow.data):env.DB.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=?) THEN 1 ELSE 0 END').bind(b.id),env.DB.prepare('INSERT INTO pm_feedback_visits(id,booking_id,guest_id,visit_date,invite_state,created_at) VALUES(?,?,?,?,?,?)').bind(visitId,b.id,b.guestId,new Intl.DateTimeFormat('en-CA',{timeZone:current.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.startAt)),sender?'claimed':'suppressed',at)]
  if(sender)statements.push(env.DB.prepare('INSERT INTO pm_feedback_credentials(visit_id,token_hash,owner_id,email_hash,consent_at,expires_at,contact_data) VALUES(?,?,?,?,?,?,?)').bind(visitId,tokenHash,settings.owner_id,contact.emailHash,consent.at,new Date(Date.parse(at)+30*86400000).toISOString(),contact.contactData))
  try{await atomic(env.DB,statements)}catch(error){if(error instanceof Problem&&error.status===409)continue;throw error}
  if(!sender){summary.suppressed++;continue}
  let accepted=false,providerId:string|null=null
  try{
   const live=await liveVisit(env.DB,visitId)
   await atomic(env.DB,liveFences(env.DB,live))
   const link=new URL('/feedback',env.AUTH_ORIGIN);link.hash=token
   const review=live.settings.public_review_url
   const result=await sender.send({deliveryId:visitId,from:env.MAIL_FROM!,to:[live.email],subject:`How was your visit? · ${live.state.venue.name}`,headers:{'Auto-Submitted':'auto-generated'},text:`Thank you for visiting ${live.state.venue.name}. Share service feedback about this visit: ${link.href}\n\nYou can also leave a public review here, whatever your experience: ${review}\n\nThe private feedback link expires in 30 days. Your consent covers service feedback, this public review invitation, and recovery email replies. You may withdraw email consent using the private page.`,html:`<p>Thank you for visiting ${escape(live.state.venue.name)}.</p><p><a href="${escape(link.href)}">Share service feedback about this visit</a></p><p><a href="${escape(review)}">Leave a public review, whatever your experience</a></p><p>The private link expires in 30 days. Your consent covers service feedback, this public review invitation, and recovery email replies. Withdraw email consent on the private page.</p>`})
   accepted=result.status==='accepted';providerId=result.providerMessageId??null
  }catch{}
  await env.DB.batch([env.DB.prepare('UPDATE pm_feedback_visits SET invite_state=?,provider_id=? WHERE id=?').bind(accepted?'accepted':'unconfirmed',providerId,visitId),...accepted?[]:[env.DB.prepare('DELETE FROM pm_feedback_credentials WHERE visit_id=?').bind(visitId)]])
  summary[accepted?'accepted':'unconfirmed']++
 }
 return summary
}
/** A request id is permanently consumed before sending, including an uncertain provider result. */
export async function replyFeedback(env:Bindings,actor:Actor,p:any){
 await managerAuthority(env.DB,actor)
 const visitId=text(p.visitId,'Visit',100),message=text(p.message,'Recovery reply',4000),requestId=text(p.requestId,'Reply request',100)
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))fail(400,'Use a unique reply request identifier.')
 const prior=await env.DB.prepare('SELECT visit_id,message,actor_id FROM pm_feedback_messages WHERE request_id=?').bind(requestId).first<{visit_id:string;message:string;actor_id:string}>()
 if(prior){if(prior.visit_id!==visitId||prior.message!==message||prior.actor_id!==actor.id)fail(409,'This request identifier already belongs to another reply.');return readFeedback(env.DB,actor)}
 const c=await liveVisit(env.DB,visitId)
 if(c.visit.case_state!=='open'||!c.visit.assignee_id)fail(409,'Choose an open recovery case with a current assignee.')
 const sender=senderFor(env)
 if(!sender)fail(409,'Configure a production mail sender before sending recovery replies.')
 const messageId=id(),at=new Date().toISOString()
 await atomic(env.DB,[...liveFences(env.DB,c),managerFence(env.DB,actor),assigneeFence(env.DB,c.visit.assignee_id!),env.DB.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_feedback_visits WHERE id=? AND case_state='open' AND assignee_id=?) THEN 1 ELSE 0 END").bind(visitId,c.visit.assignee_id),env.DB.prepare("INSERT INTO pm_feedback_messages(id,visit_id,author,actor_id,message,at,state,request_id) VALUES(?,?,'manager',?,?,?,'pending',?)").bind(messageId,visitId,actor.id,message,at,requestId)])
 let accepted=false,providerId:string|null=null
 try{
  const live=await liveVisit(env.DB,visitId)
  await atomic(env.DB,[...liveFences(env.DB,live),managerFence(env.DB,actor),assigneeFence(env.DB,live.visit.assignee_id!),env.DB.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_feedback_visits WHERE id=? AND case_state='open' AND assignee_id=?) THEN 1 ELSE 0 END").bind(visitId,live.visit.assignee_id)])
  const result=await sender!.send({deliveryId:messageId,from:env.MAIL_FROM!,to:[live.email],subject:`A reply about your visit · ${live.state.venue.name}`,headers:{'Auto-Submitted':'auto-generated'},text:`${message}\n\nThis reply concerns your service feedback for ${live.visit.visit_date}. Use your original private feedback link to view the conversation or withdraw email consent.`,html:`<p>${escape(message).replaceAll('\n','<br>')}</p><p>Use your original private feedback link to view the conversation or withdraw email consent.</p>`})
  accepted=result.status==='accepted';providerId=result.providerMessageId??null
 }catch{}
 await env.DB.prepare('UPDATE pm_feedback_messages SET state=?,provider_id=? WHERE id=?').bind(accepted?'accepted':'unconfirmed',providerId,messageId).run()
 return readFeedback(env.DB,actor)
}

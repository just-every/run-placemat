import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {person} from './access'
import {fail,id,type Actor} from './model'
import {load,save} from './store'
import {issueManagement,revokeManagement} from './booking-management'

/** Owner-requested transactional delivery. A provider acceptance is never called delivery. */
export async function sendManagement(env:Bindings,actor:Actor,p:any){
 person(actor,true)
 if(p.acknowledged!==true)fail(400,'Confirm sending a private management link to the reservation contact.')
 const sender=operatorMail(env)
 if(!sender||!env.MAIL_FROM||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1')fail(409,'Configure a production mail sender before sending private booking links.')
 const issued=await issueManagement(env.DB,actor,p),deliveryId=id()
 const url=new URL('/manage-booking',env.AUTH_ORIGIN);url.hash=new URLSearchParams({token:issued.token}).toString()
 let accepted=false,providerMessageId:string|null=null,validationCode=''
 try{
  const result=await sender!.send({deliveryId,from:env.MAIL_FROM!,to:[issued.recipient.email],subject:`Manage your reservation · ${p.bookingId}`,headers:{'Auto-Submitted':'auto-generated'},html:`<p>Your private reservation management link:</p><p><a href="${url.href.replaceAll('&','&amp;')}">Manage your reservation</a></p><p>Expires ${issued.expiresAt}. Anyone holding this link can manage this one reservation. Do not forward it.</p>`,text:`Hello ${issued.recipient.name},\n\nThe venue has sent your private reservation management link:\n${url.href}\n\nIt expires ${issued.expiresAt}. Anyone holding this link can manage this one reservation. Do not forward it. Changes require a review and confirmation. Contact the venue if you did not request it.`})
  accepted=result.status==='accepted';providerMessageId=result.providerMessageId;validationCode=result.code??''
 }catch(error){if(error instanceof Error&&error.name==='MailValidationError'&&'code' in error&&typeof error.code==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(error.code))validationCode=error.code}
 if(!accepted){await revokeManagement(env.DB,issued.token);fail(502,'The mail provider did not confirm acceptance. This link has been revoked; check the sender before explicitly sending a new link.'+(validationCode?' Mail diagnostic code: '+validationCode:''))}
 const {state,version}=await load(env.DB)
 state.audit.push({id:id(),at:new Date().toISOString(),actor:actor.id,action:'booking.management.mail-accepted',subject:p.bookingId,reason:'Transactional private-link email accepted by the configured provider; mailbox delivery is not confirmed.'})
 await save(env.DB,state,version)
 return {deliveryId,status:'accepted',providerMessageId,expiresAt:issued.expiresAt}
}

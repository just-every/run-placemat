import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {load,save,hash} from './store'
import {affected,personal,acceptRelocation} from './service-relocation'
import {fail,id,type Actor,type Guest} from './model'
const authority=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(actor.id)
const unavailable=()=>fail(404,'Relocation link is unavailable. Contact the venue; your reservation has not been changed.')
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
export async function sendServiceOutreach(env:Bindings,actor:Actor,p:any){
 personal(actor)
 if(p.acknowledged!==true||Object.keys(p).some(k=>!['changeId','taskId','acknowledged'].includes(k)))fail(400,'Confirm sending this booking offer to its recorded email only.')
 const sender=operatorMail(env)
 if(!sender||!env.MAIL_FROM||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1')fail(409,'Configure a production mail sender before outreach.')
 const {state:s,version}=await load(env.DB),{task,booking}=affected(s,p),offer=task.relocation!
 if(!offer||offer.acceptedAt||offer.declinedAt||Date.parse(offer.expiresAt)<=Date.now()||JSON.stringify(booking)!==JSON.stringify(offer.before))fail(409,'Review a current relocation offer first.')
 if(task.outreach)fail(409,'This offer already has a delivery attempt. Review a new offer to explicitly send again.')
 const row=await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()??fail(404,'Guest not found.')
 const guest:Guest=JSON.parse(row.data)
 if(guest.erased||guest.mergedInto)fail(409,'Guest contact is unavailable.')
 const contact=await env.DB.prepare('SELECT data FROM pm_booking_contacts WHERE booking_id=? AND guest_id=?').bind(booking.id,booking.guestId).first<{data:string}>()
 const email=(contact?JSON.parse(contact.data).email:guest.email)
 if(typeof email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(409,'A recorded reservation email is required.')
 if(booking.closureEmailConsent?.emailHash!==await hash(email.toLowerCase())&&!(booking.staffIntake?.confirmationConsent&&booking.staffIntake.contactPreference==='email'))fail(409,'No recorded email contact permission for this booking contact. No message was sent.')
 const now=new Date().toISOString()
 if(s.audit.filter(e=>e.action==='service.outreach.attempt'&&e.subject===booking.id&&Date.parse(e.at)>Date.now()-86400000).length>=5)fail(429,'Five outreach attempts were already recorded in the last 24 hours.')
 const token=randomToken(),deliveryId=id();offer.tokenHash=await hash(token)
 task.outreach={id:deliveryId,state:'sending',at:now,actor:actor.id}
 s.audit.push({id:id(),actor:actor.id,at:now,action:'service.outreach.attempt',subject:booking.id})
 const guestFence=env.DB.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND data=?) THEN 1 ELSE 0 END').bind(booking.guestId,row.data)
 await save(env.DB,s,version,[authority(env.DB,actor),guestFence])
 const url=new URL('/relocation',env.AUTH_ORIGIN);url.hash=new URLSearchParams({token}).toString()
 let accepted=false,providerId:string|null=null
 try{
  const result=await sender!.send({deliveryId,from:env.MAIL_FROM!,to:[email],subject:`Reservation relocation offer · ${booking.id}`,text:`A closure affects your reservation ${booking.id}. Your original reservation is unchanged. Review the proposed relocation and explicitly accept or decline using your private link:\n${url.href}\nExpires ${offer.expiresAt}. This link covers this reservation only. No fee or refund is performed by accepting. Contact the venue for help.`,html:`<p>A closure affects your reservation. Your original reservation is unchanged.</p><p><a href="${url.href.replaceAll('&','&amp;')}">Review your relocation offer</a></p><p>Accept or decline explicitly. This private link covers only your reservation.</p>`,headers:{'Auto-Submitted':'auto-generated'}})
  accepted=result.status==='accepted';providerId=result.providerMessageId
 }catch{/* The owned attempt stays unconfirmed; never retry automatically. */}
 const current=await load(env.DB),latest=affected(current.state,p).task
 if(latest.outreach?.id===deliveryId){
  if(latest.outreach.state==='sending')latest.outreach.state=accepted?'accepted':'unconfirmed'
  latest.outreach.providerId=providerId
  if(!accepted&&latest.relocation?.id===offer.id)delete latest.relocation.tokenHash
  current.state.audit.push({id:id(),actor:actor.id,at:new Date().toISOString(),action:'service.outreach.'+(accepted?'accepted':'unconfirmed'),subject:booking.id})
  await save(env.DB,current.state,current.version)
 }
 return {deliveryId,state:accepted?'accepted':'unconfirmed',mailboxDelivery:'unconfirmed',expiresAt:offer.expiresAt}
}
export async function guestRelocation(db:D1Database,p:any,action:string){
 if(typeof p.token!=='string'||!/^[a-f0-9]{64}$/.test(p.token)||Object.keys(p).some(k=>!['token','acknowledged'].includes(k)))unavailable()
 const digest=await hash(p.token),{state:s,version}=await load(db)
 const task=s.serviceChanges?.flatMap(c=>c.tasks).find(t=>t.relocation?.tokenHash===digest)??unavailable(),offer=task.relocation!
 if(Date.parse(offer.expiresAt)<=Date.now()||offer.acceptedAt||offer.declinedAt||task.cancellation)unavailable()
 const b=s.bookings.find(b=>b.id===task.bookingId)??unavailable()
 const row=await db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(b.guestId).first<{data:string}>()??unavailable()
 if(JSON.parse(row.data).erased)unavailable()
 const now=new Date().toISOString()
 if(action!=='status'&&p.acknowledged!==true)fail(400,'Explicitly confirm your decision.')
 let result=b
 if(action==='accept')result=acceptRelocation(s,task,now)
 else if(action==='decline'){offer.declinedAt=now;delete offer.tokenHash;s.audit.push({id:id(),actor:'guest',at:now,action:'service.relocation.declined',subject:b.id})}
 else if(action!=='status')fail(404,'Not found.')
 if(task.outreach)task.outreach.state='guest-opened'
 if(action==='status')s.audit.push({id:id(),actor:'guest',at:now,action:'service.outreach.guest-opened',subject:b.id})
 await save(db,s,version,[db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND data=?) THEN 1 ELSE 0 END').bind(b.guestId,row.data)])
 const project=(booking:typeof b)=>({id:booking.id,startAt:booking.startAt,endAt:booking.endAt,partySize:booking.partySize,area:booking.requiredArea??null,tables:booking.tableIds.map(id=>s.tables.find(t=>t.id===id)?.label??'Retained table'),status:booking.status})
 return {booking:project(result),offered:project(offer.after),expiresAt:offer.expiresAt,decision:action==='status'?'awaiting response':action==='accept'?'accepted':'declined',venue:s.venue.name,timezone:s.venue.timezone}
}

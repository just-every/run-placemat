import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {originCheck,jsonBody} from './access'
import {fail,id,Problem,type Guest} from './model'
import {load,save,hash} from './store'
import {erasureCheckpoint} from './backup'
import {publicVenue} from './onboarding'

const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
const unavailable=():never=>fail(404,'Diner access not found. Request a new verification code.')
const email=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():''
const bearer=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)?v:unavailable()
type Account={id:string;email:string;created_at:string;updated_at:string;favorite:number;preferences:string}
type Challenge={digest:string;booking_id:string;guest_id:string;email:string;contact_digest:string;expires_at:number}

async function bookingContact(db:D1Database,bookingId:string){
 const {state,version}=await load(db),booking=state.bookings.find(b=>b.id===bookingId)
 if(!booking)return null
 const row=await db.prepare('SELECT data,version FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string;version:number}>()
 if(!row)return null
 const guest:Guest=JSON.parse(row.data)
 if(guest.erased||guest.mergedInto)return null
 const override=await db.prepare('SELECT data,guest_id FROM pm_booking_contacts WHERE booking_id=?').bind(bookingId).first<{data:string;guest_id:string}>()
 if(override&&override.guest_id!==guest.id)return null
 const contact=override?JSON.parse(override.data):{name:guest.name,email:guest.email,phone:guest.phone}
 return {state,version,booking,guest,row,contact,override,digest:await hash(JSON.stringify([guest.id,row.data,override?.data??null]))}
}
function contactFence(db:D1Database,c:NonNullable<Awaited<ReturnType<typeof bookingContact>>>){
 return [
  db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END').bind(c.guest.id,c.row.version,c.row.data),
  c.override?db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=? AND guest_id=? AND data=?) THEN 1 ELSE 0 END').bind(c.booking.id,c.guest.id,c.override.data):
   db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=?) THEN 1 ELSE 0 END').bind(c.booking.id),
 ]
}
async function requestCode(env:Bindings,p:any){
 if(p.acknowledged!==true)fail(400,'Explicitly request a private code for this booking.')
 const result={message:'If these details match a booking, a private verification code has been requested. Provider acceptance does not confirm mailbox delivery.'}
 const bookingId=typeof p.bookingId==='string'?p.bookingId.slice(0,100):'',address=email(p.email)
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)return result
 const c=await bookingContact(env.DB,bookingId)
 if(!c||email(c.contact.email)!==address)return result
 const sender=operatorMail(env)
 // Development never exposes codes or sends outbound mail.
 if(!sender||!env.MAIL_FROM||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1')return result
 const day=new Date().toISOString().slice(0,10)
 const count=await env.DB.prepare('INSERT INTO pm_diner_mail_limits(booking_id,day,count) VALUES(?,?,1) ON CONFLICT(booking_id,day) DO UPDATE SET count=count+1 RETURNING count').bind(bookingId,day).first<{count:number}>()
 if((count?.count??0)>5)return result
 const token=random(),digest=await hash(token),expires=Date.now()+15*60000
 c.state.audit.push({id:id(),at:new Date().toISOString(),actor:'guest',action:'diner.verification.requested',subject:c.booking.id,source:'guest-supplied'})
 await save(env.DB,c.state,c.version,[...contactFence(env.DB,c),
  env.DB.prepare('DELETE FROM pm_diner_challenges WHERE booking_id=? OR expires_at<=?').bind(bookingId,Date.now()),
  env.DB.prepare('INSERT INTO pm_diner_challenges(digest,booking_id,guest_id,email,contact_digest,expires_at) VALUES(?,?,?,?,?,?)').bind(digest,bookingId,c.guest.id,address,c.digest,expires)])
 try{
  const sent=await sender.send({deliveryId:id(),from:env.MAIL_FROM,to:[address],subject:'Verify your diner account',headers:{'Auto-Submitted':'auto-generated'},text:`Your private diner verification code:\n${token}\n\nSubmit this code to the diner verification door within 15 minutes. This attaches only the booking you selected. Do not forward it. Ignore this message if you did not request it.`,html:`<p>Your private diner verification code:</p><p>${token}</p><p>Expires in 15 minutes. It attaches only your selected booking. Do not forward it.</p>`})
  if(sent.status!=='accepted')await env.DB.prepare('DELETE FROM pm_diner_challenges WHERE digest=?').bind(digest).run()
 }catch{await env.DB.prepare('DELETE FROM pm_diner_challenges WHERE digest=?').bind(digest).run()}
 return result
}
async function verify(db:D1Database,p:any){
 if(p.acknowledged!==true)fail(400,'Confirm attaching this one verified booking to your diner account.')
 const digest=await hash(bearer(p.code)),challenge=await db.prepare('SELECT * FROM pm_diner_challenges WHERE digest=? AND expires_at>?').bind(digest,Date.now()).first<Challenge>()
 if(!challenge)unavailable()
 const proof=challenge!,c=await bookingContact(db,proof.booking_id)
 if(!c||c.guest.id!==proof.guest_id||c.digest!==proof.contact_digest||email(c.contact.email)!==proof.email)unavailable()
 const current=c!
 const existing=await db.prepare('SELECT * FROM pm_diner_accounts WHERE email=?').bind(proof.email).first<Account>()
 const accountId=existing?.id??id(),token=random(),sessionDigest=await hash(token),at=new Date().toISOString(),expires=Date.now()+86400000
 current.state.audit.push({id:id(),at,actor:'guest',action:'diner.booking.verified',subject:current.booking.id,source:'guest-supplied'})
 await save(db,current.state,current.version,[...contactFence(db,current),
  db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_diner_challenges WHERE digest=? AND expires_at>? AND contact_digest=?) THEN 1 ELSE 0 END').bind(digest,Date.now(),proof.contact_digest),
  db.prepare('INSERT OR IGNORE INTO pm_diner_accounts(id,email,created_at,updated_at) VALUES(?,?,?,?)').bind(accountId,proof.email,at,at),
  db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_diner_accounts WHERE id=? AND email=?) THEN 1 ELSE 0 END').bind(accountId,proof.email),
  db.prepare('INSERT INTO pm_diner_bookings(account_id,booking_id,guest_id,verified_at) VALUES(?,?,?,?) ON CONFLICT(account_id,booking_id) DO UPDATE SET guest_id=excluded.guest_id,verified_at=excluded.verified_at').bind(accountId,proof.booking_id,proof.guest_id,at),
  db.prepare('DELETE FROM pm_diner_challenges WHERE digest=?').bind(digest),
  db.prepare('DELETE FROM pm_diner_sessions WHERE expires_at<=?').bind(Date.now()),
  db.prepare('INSERT INTO pm_diner_sessions(digest,account_id,expires_at) VALUES(?,?,?)').bind(sessionDigest,accountId,expires)])
 return {token,expiresAt:new Date(expires).toISOString(),bookingId:proof.booking_id}
}
async function session(db:D1Database,p:any){
 const digest=await hash(bearer(p.token))
 const a=await db.prepare('SELECT a.* FROM pm_diner_accounts a JOIN pm_diner_sessions s ON s.account_id=a.id WHERE s.digest=? AND s.expires_at>?').bind(digest,Date.now()).first<Account>()
 if(!a)unavailable()
 const links=(await db.prepare('SELECT booking_id,guest_id FROM pm_diner_bookings WHERE account_id=?').bind(a!.id).all<{booking_id:string;guest_id:string}>()).results
 const bookings=[]
 for(const link of links){
  const c=await bookingContact(db,link.booking_id)
  if(c&&c.guest.id===link.guest_id&&email(c.contact.email)===a!.email)bookings.push({id:c.booking.id,startAt:c.booking.startAt,partySize:c.booking.partySize,status:c.booking.status,serviceId:c.booking.serviceId})
 }
 // Restored links are records only: absent sessions cannot open them.
 if(!bookings.length)unavailable()
 return {account:a!,digest,bookings}
}
export async function dinerResponse(request:Request,env:Bindings):Promise<Response|null>{
 const path=new URL(request.url).pathname
 if(!path.startsWith('/api/public/diner/'))return null
 const json=(data:unknown,status=200)=>Response.json(data,{status,headers})
 try{
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  originCheck(request,env)
  const bucket='diner:'+await hash((request.headers.get('CF-Connecting-IP')??'local')+':'+Math.floor(Date.now()/60000))
  const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
  if((count?.count??0)>30)fail(429,'Too many diner requests. Please wait a minute.')
  const p=await jsonBody(request)
  if(path==='/api/public/diner/request')return json(await requestCode(env,p),202)
  if(path==='/api/public/diner/verify')return json(await verify(env.DB,p))
  if(!['/api/public/diner/account','/api/public/diner/preferences','/api/public/diner/logout','/api/public/diner/forget'].includes(path))return json({error:'Not found'},404)
  const s=await session(env.DB,p),{state,version}=await load(env.DB)
  if(path==='/api/public/diner/account')return json({email:s.account.email,venue:publicVenue(state.venue),favorite:!!s.account.favorite,preferences:s.account.preferences,bookings:s.bookings,rebookUrl:'/book'})
  if(path==='/api/public/diner/logout'){await env.DB.prepare('DELETE FROM pm_diner_sessions WHERE digest=?').bind(s.digest).run();return json({signedOut:true})}
  if(p.acknowledged!==true)fail(400,'Confirm the diner account change.')
  const fence=env.DB.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_diner_sessions WHERE digest=? AND account_id=? AND expires_at>?) THEN 1 ELSE 0 END').bind(s.digest,s.account.id,Date.now())
  if(path==='/api/public/diner/forget'){
   await erasureCheckpoint(env.DB)
   state.audit.push({id:id(),at:new Date().toISOString(),actor:'guest',action:'diner.account.forgotten',subject:'venue',source:'guest-supplied'})
   await save(env.DB,state,version,[fence,
    env.DB.prepare('DELETE FROM pm_diner_challenges WHERE email=?').bind(s.account.email),
    env.DB.prepare('DELETE FROM pm_diner_sessions WHERE account_id=?').bind(s.account.id),
    env.DB.prepare('DELETE FROM pm_diner_bookings WHERE account_id=?').bind(s.account.id),
    env.DB.prepare('DELETE FROM pm_diner_accounts WHERE id=?').bind(s.account.id)])
   await erasureCheckpoint(env.DB)
   return json({forgotten:true,bookingsUnchanged:true})
  }
  if(typeof p.favorite!=='boolean'||typeof p.preferences!=='string'||p.preferences.length>500)fail(400,'Choose a favorite and preferences of at most 500 characters.')
  await erasureCheckpoint(env.DB)
  state.audit.push({id:id(),at:new Date().toISOString(),actor:'guest',action:p.preferences?'diner.preferences.saved':'diner.preferences.revoked',subject:'venue',source:'guest-supplied'})
  await save(env.DB,state,version,[fence,env.DB.prepare('UPDATE pm_diner_accounts SET favorite=?,preferences=?,updated_at=? WHERE id=?').bind(p.favorite?1:0,p.preferences.trim(),new Date().toISOString(),s.account.id)])
  await erasureCheckpoint(env.DB)
  return json({favorite:p.favorite,preferences:p.preferences.trim()})
 }catch(error){if(error instanceof Problem)return json({error:error.message},error.status);throw error}
}

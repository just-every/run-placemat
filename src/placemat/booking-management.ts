import {bookingFit,instant} from './availability'
import {checkBookingRules} from './booking-rules'
import {searchTables} from './reservation-search'
import {assertClosureAssignment} from './service-blocks'
import {checkStaffing,recordServing} from './staffing-capacity'
import {serviceSnapshot,type ServiceSnapshot} from './service-status'
import {publicVenue} from './onboarding'
import {hash,load,save} from './store'
import {fail,id,number,text,type Actor,type Booking,type Guest,type Service,type State} from './model'

type Contact=Pick<Guest,'name'|'email'|'phone'>
type Link={booking_id:string;guest_id:string;token_hash:string;fingerprint:string;expires_at:string;created_at:string;created_by:string;preview_id:string|null;preview_data:string|null}
type GuestRow={version:number;data:string}
type ContactRow={guest_id:string;data:string;updated_at:string}
type Action='change'|'reconfirm'|'cancel'
type Change={action:Action;startAt?:string;partySize?:number;contact?:Contact}
type Plan={booking:Booking;contact:Contact;stage:ServiceSnapshot}
type Preview={input:Change;tableIds:string[];planHash:string}
type Context={s:State;version:number;b:Booking;service:Service;guest:Guest;guestRow:GuestRow;contact:Contact;contactRow:ContactRow|null;fingerprint:string;link:Link}
const unavailable=():never=>fail(404,'Management link not found.')
const moneyMessage='Contact the venue manager to review fees and refunds before changing this reservation.'
const consequences=()=>({currency:'USD' as const,feeCents:0,refundCents:0,message:'No fee will be charged and no refund is due. No payment will be taken.'})
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
const expiry=(service:Service)=>new Date(Math.min(Date.now()+86400000,Date.parse(service.startAt))).toISOString()

function bearer(p:any):string {
 if(!p||typeof p.token!=='string'||! /^[a-f0-9]{64}$/.test(p.token)||p.bookingId!==undefined||p.guestId!==undefined||p.serviceId!==undefined)unavailable()
 return p.token
}
function owner(actor:Actor){if(actor.agent||actor.deviceId||actor.role!=='owner')fail(403,'The owner must explicitly issue a management link from a personal session.')}
const authority=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role='owner') THEN 1 ELSE 0 END").bind(actor.id)
const stateFence=(db:D1Database,version:number)=>db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END').bind(version)
function guestFence(db:D1Database,c:Context){return db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END').bind(c.guest.id,c.guestRow.version,c.guestRow.data)}
function tokenFence(db:D1Database,c:Context,previewId?:string){
 return db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_booking_management WHERE booking_id=? AND guest_id=? AND token_hash=? AND fingerprint=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')${previewId?' AND preview_id=?':''}) THEN 1 ELSE 0 END`).bind(c.b.id,c.guest.id,c.link.token_hash,c.fingerprint,...previewId?[previewId]:[])
}
function contactFence(db:D1Database,c:Context){
 return c.contactRow?db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=? AND guest_id=? AND data=? AND updated_at=?) THEN 1 ELSE 0 END').bind(c.b.id,c.guest.id,c.contactRow.data,c.contactRow.updated_at):db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=?) THEN 1 ELSE 0 END').bind(c.b.id)
}
// Any recorded obligation or captured charge needs a manager until a fee policy exists.
// The captured-charge ledger is pm_refund_charges; there is no pm_payment_charges table.
function moneyFence(db:D1Database,bookingId:string){return db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_payment_requests WHERE booking_id=?) AND NOT EXISTS(SELECT 1 FROM pm_refund_charges WHERE booking_id=?) AND NOT EXISTS(SELECT 1 FROM pm_refunds WHERE booking_id=?) THEN 1 ELSE 0 END').bind(bookingId,bookingId,bookingId)}
async function noMoney(db:D1Database,bookingId:string){
 const row=await db.prepare('SELECT (EXISTS(SELECT 1 FROM pm_payment_requests WHERE booking_id=?) OR EXISTS(SELECT 1 FROM pm_refund_charges WHERE booking_id=?) OR EXISTS(SELECT 1 FROM pm_refunds WHERE booking_id=?)) AS implicated').bind(bookingId,bookingId,bookingId).first<{implicated:number}>()
 if(row?.implicated)fail(409,moneyMessage)
}
function normalizeContact(value:any,current:Contact):Contact {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['name','email','phone'].includes(k)))fail(400,'Supply reservation name, email and phone contact fields only.')
 const name=value.name===undefined?current.name:text(value.name,'Guest name',200)
 const email=value.email===undefined?current.email:text(value.email,'Email',254).toLowerCase()
 const phone=value.phone===undefined?current.phone:typeof value.phone==='string'&&value.phone.trim().length<=40?value.phone.trim():fail(400,'Phone must be at most 40 characters.')
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.')
 return {name,email,phone}
}
async function reservation(db:D1Database,s:State,version:number,bookingId:string){
 const b=s.bookings.find(b=>b.id===bookingId)??unavailable(),service=s.services.find(v=>v.id===b.serviceId)??unavailable()
 const guestRow=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(b.guestId).first<GuestRow>()??unavailable()
 const guest:Guest=JSON.parse(guestRow.data)
 if(guest.erased||guest.mergedInto||guest.id!==b.guestId)unavailable()
 const contactRow=await db.prepare('SELECT guest_id,data,updated_at FROM pm_booking_contacts WHERE booking_id=?').bind(b.id).first<ContactRow>()
 if(contactRow&&contactRow.guest_id!==guest.id)unavailable()
 const contact:Contact=contactRow?JSON.parse(contactRow.data):{name:guest.name,email:guest.email,phone:guest.phone}
 const fingerprint=await hash(JSON.stringify({booking:b,service,venue:s.venue,guestId:guest.id,guestVersion:guestRow.version,guestData:guestRow.data,contact,stage:serviceSnapshot(s,b)}))
 return {s,version,b,service,guest,guestRow,contact,contactRow,fingerprint}
}
async function context(db:D1Database,p:any):Promise<Context>{
 const tokenHash=await hash(bearer(p)),link=await db.prepare('SELECT * FROM pm_booking_management WHERE token_hash=?').bind(tokenHash).first<Link>()??unavailable()
 if(Date.parse(link.expires_at)<=Date.now()||!Number.isFinite(Date.parse(link.expires_at)))unavailable()
 const {state:s,version}=await load(db),c=await reservation(db,s,version,link.booking_id)
 if(c.guest.id!==link.guest_id||c.fingerprint!==link.fingerprint||Date.parse(c.service.startAt)<=Date.now())unavailable()
 return {...c,link}
}
function projection(c:Context,plan?:Plan){
 const b=plan?.booking??c.b,guest=plan?.contact??c.contact,stage=plan?.stage??serviceSnapshot(c.s,c.b)
 return {booking:{id:b.id,startAt:b.startAt,endAt:b.endAt,partySize:b.partySize,status:b.status,serviceStatus:stage.status,area:b.requiredArea??null,requiredAccessTags:b.requiredAccessTags??[]},guest:{name:guest.name,email:guest.email,phone:guest.phone},venue:publicVenue(c.s.venue),service:{id:c.service.id,name:c.service.name,startAt:c.service.startAt,endAt:c.service.endAt},expiresAt:c.link.expires_at}
}
function input(p:any,c:Context):Change {
 if(!['change','reconfirm','cancel'].includes(p.action))fail(400,'Choose change, reconfirm or cancel.')
 if(p.action!=='change'&&['startAt','partySize','contact'].some(k=>p[k]!==undefined))fail(400,'Contact, time and size edits require the change action.')
 if(p.action!=='change')return {action:p.action}
 if(p.startAt===undefined&&p.partySize===undefined&&p.contact===undefined)fail(400,'Choose a reservation detail to change.')
 return {action:'change',...p.startAt!==undefined?{startAt:instant(p.startAt,'Start')}:{},...p.partySize!==undefined?{partySize:number(p.partySize,'Party size',1,500)}:{},...p.contact!==undefined?{contact:normalizeContact(p.contact,c.contact)}:{}}
}
function planFor(c:Context,change:Change,tableIds?:string[]):Plan {
 const {s,b,service}=c,stage=serviceSnapshot(s,b)
 if(b.status!=='booked'||!['confirmed','reconfirmed','late'].includes(stage.status)||b.needsBussing||Date.parse(b.startAt)<=Date.now())fail(409,'Contact the venue manager to change this reservation.')
 if(service.status!=='published'||service.closedAt)fail(409,'Contact the venue manager about this service.')
 const next=structuredClone(b),contact=change.contact??c.contact
 if(change.action==='cancel')return {booking:{...next,status:'cancelled'},contact,stage:{...stage,status:'cancelled',bookingStatus:'cancelled',floorStatus:'ready',needsBussing:false}}
 if(change.action==='reconfirm'){
  if(stage.status==='reconfirmed')fail(409,'This reservation is already reconfirmed.')
  return {booking:next,contact,stage:{...stage,status:'reconfirmed'}}
 }
 const partySize=change.partySize??b.partySize,startAt=change.startAt??b.startAt
 if(partySize!==b.partySize||startAt!==b.startAt){
  if(b.assignmentLocked)fail(409,'Contact the venue manager to change this locked reservation.')
  checkBookingRules(s,service,partySize,startAt,'online')
  const ledger={...s,bookings:s.bookings.filter(row=>row.id!==b.id)}
  const {state:eligible}=searchTables(ledger,b.requiredArea,b.requiredAccessTags)
  const {tables,...slot}=bookingFit(eligible,service,partySize,startAt,'online',tableIds)
  Object.assign(next,slot,{partySize,tableIds:tables.map(t=>t.id)})
  if(!slot.combination)delete next.combination
  delete next.expectedEndAt;delete next.ruleOverride;delete next.pacingOverride
  assertClosureAssignment(s,b,next.tableIds)
  if(s.bookings.some(other=>other.id!==b.id&&other.guestId===b.guestId&&other.startAt===startAt&&!['cancelled','no-show'].includes(other.status)))fail(409,'Another reservation already exists at that time. Contact the venue manager.')
  checkStaffing(s,[next],new Date().toISOString(),new Set([b.id]))
 }
 if(JSON.stringify(next)===JSON.stringify(b)&&JSON.stringify(contact)===JSON.stringify(c.contact))fail(400,'Choose a reservation detail to change.')
 return {booking:next,contact,stage}
}
async function atomic<T>(work:()=>Promise<T>,message:string):Promise<T>{
 try{return await work()}catch(error){if(error instanceof Error&&/CHECK constraint failed|pm_assertions/.test(error.message))fail(409,message);throw error}
}

/** Server-only result: the email helper consumes this token; never serialize it in an owner HTTP response. */
export async function issueManagement(db:D1Database,actor:Actor,p:{bookingId?:unknown}){
 owner(actor)
 // Check the live owner before reading a guest, then fence it again in the save.
 await atomic(()=>db.batch([authority(db,actor),db.prepare('DELETE FROM pm_assertions')]),'Owner authority changed. Sign in again.')
 const {state:s,version}=await load(db),base=await reservation(db,s,version,text(p.bookingId,'Reservation',100))
 if(base.b.status!=='booked'||base.service.status!=='published'||base.service.closedAt||Date.parse(base.service.startAt)<=Date.now()||Date.parse(base.b.startAt)<=Date.now())fail(409,'Only future active reservations can receive a management link.')
 const email=base.contact.email.trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(409,'The existing booking guest needs a valid email before a management link can be sent.')
 const token=randomToken(),tokenHash=await hash(token),expiresAt=expiry(base.service),now=new Date().toISOString()
 const c={...base,link:{booking_id:base.b.id,guest_id:base.guest.id,token_hash:tokenHash,fingerprint:base.fingerprint,expires_at:expiresAt,created_at:now,created_by:actor.id,preview_id:null,preview_data:null}}
 s.audit.push({id:id(),actor:actor.id,at:now,action:'booking.management.issue',subject:base.b.id,source:'person'})
 await atomic(()=>save(db,s,version,[authority(db,actor),stateFence(db,version),guestFence(db,c),contactFence(db,c),db.prepare('INSERT INTO pm_booking_management(booking_id,guest_id,token_hash,fingerprint,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET guest_id=excluded.guest_id,token_hash=excluded.token_hash,fingerprint=excluded.fingerprint,expires_at=excluded.expires_at,created_at=excluded.created_at,created_by=excluded.created_by,preview_id=NULL,preview_data=NULL').bind(base.b.id,base.guest.id,tokenHash,base.fingerprint,expiresAt,now,actor.id)]),'The reservation changed. Review it before issuing another link.')
 return {token,expiresAt,recipient:{name:base.contact.name,email}}
}

/** Failed delivery invalidates exactly the issued bearer, never a later replacement. */
export async function revokeManagement(db:D1Database,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return
 await db.prepare('DELETE FROM pm_booking_management WHERE token_hash=?').bind(await hash(token)).run()
}
export async function readManagement(db:D1Database,p:{token?:unknown}){return projection(await context(db,p))}

/** A preview saves consent data only; it never changes a booking or consumes inventory. */
export async function previewManagement(db:D1Database,p:any){
 const c=await context(db,p);await noMoney(db,c.b.id)
 const change=input(p,c),plan=planFor(c,change),previewId=randomToken()
 const data:Preview={input:change,tableIds:plan.booking.tableIds,planHash:await hash(JSON.stringify(plan))}
 await atomic(()=>db.batch([stateFence(db,c.version),guestFence(db,c),contactFence(db,c),tokenFence(db,c),moneyFence(db,c.b.id),db.prepare('UPDATE pm_booking_management SET preview_id=?,preview_data=? WHERE token_hash=?').bind(previewId,JSON.stringify(data),c.link.token_hash),db.prepare('DELETE FROM pm_assertions')]),'The reservation or payment details changed. Review a new preview or contact the venue manager.')
 return {...projection(c,plan),previewId,action:change.action,consequences:consequences()}
}

/** Consent commits the exact preview; inventory, contact and token rotation share one D1 transaction. */
export async function commitManagement(db:D1Database,p:any){
 const c=await context(db,p)
 if(typeof p.previewId!=='string'||p.previewId!==c.link.preview_id||!c.link.preview_data)unavailable()
 if(p.acknowledged!==true)fail(400,'Acknowledge the shown fee and refund consequences before confirming.')
 if(['action','startAt','partySize','contact'].some(k=>p[k]!==undefined))fail(400,'Confirm the saved preview without replacement edits.')
 await noMoney(db,c.b.id)
 const preview:Preview=JSON.parse(c.link.preview_data!),plan=planFor(c,preview.input,preview.tableIds)
 if(await hash(JSON.stringify(plan))!==preview.planHash)fail(409,'Availability changed. Review a new preview before confirming.')
 const now=new Date().toISOString(),before=serviceSnapshot(c.s,c.b)
 if(preview.input.action==='change'&&(plan.booking.startAt!==c.b.startAt||plan.booking.partySize!==c.b.partySize))recordServing(plan.booking,checkStaffing(c.s,[plan.booking],now,new Set([c.b.id]))[0],'guest',now,'booking.management.change',undefined,true)
 c.s.bookings[c.s.bookings.findIndex(b=>b.id===c.b.id)]=plan.booking
 c.b=plan.booking
 if(preview.input.action!=='change'){
  ;(c.s.serviceEvents??=[]).push({id:id(),bookingId:c.b.id,at:now,actor:'guest',source:'guest-supplied',reason:'Guest confirmed the management preview.',before,after:plan.stage})
 }
 const token=randomToken(),tokenHash=await hash(token),expiresAt=c.link.expires_at
 const contactChanged=JSON.stringify(plan.contact)!==JSON.stringify(c.contact)
 const fingerprint=await hash(JSON.stringify({booking:c.b,service:c.service,venue:c.s.venue,guestId:c.guest.id,guestVersion:c.guestRow.version,guestData:c.guestRow.data,contact:plan.contact,stage:serviceSnapshot(c.s,c.b)}))
 const statements=[stateFence(db,c.version),guestFence(db,c),contactFence(db,c),tokenFence(db,c,p.previewId),moneyFence(db,c.b.id)]
 if(contactChanged)statements.push(db.prepare('INSERT INTO pm_booking_contacts(booking_id,guest_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET guest_id=excluded.guest_id,data=excluded.data,updated_at=excluded.updated_at').bind(c.b.id,c.guest.id,JSON.stringify(plan.contact),now))
 statements.push(db.prepare('UPDATE pm_booking_management SET token_hash=?,fingerprint=?,expires_at=?,preview_id=NULL,preview_data=NULL WHERE token_hash=?').bind(tokenHash,fingerprint,expiresAt,c.link.token_hash))
 c.s.audit.push({id:id(),actor:'guest',at:now,action:'booking.management.rotate',subject:c.b.id,source:'guest-supplied'})
 c.s.audit.push({id:id(),actor:'guest',at:now,action:'booking.management.'+preview.input.action,subject:c.b.id,source:'guest-supplied',changes:[{kind:'managementConsent',id:c.b.id,before:null,after:{action:preview.input.action,acknowledged:true,consequences:consequences()}},...contactChanged?[{kind:'bookingContacts',id:c.b.id,before:c.contact,after:plan.contact}]:[]]})
 await atomic(()=>save(db,c.s,c.version,statements),'The reservation, link or payment details changed. Review a new link or contact the venue manager.')
 c.contact=plan.contact;c.link.expires_at=expiresAt
 return {...projection(c,plan),token,consequences:consequences()}
}

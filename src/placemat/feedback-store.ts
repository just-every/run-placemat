import {person} from './access'
import {fail,Problem,type Actor,type Booking,type Guest} from './model'
import {hash,load} from './store'

export type FeedbackSettings={id:number;enabled:number;owner_id:string;public_review_url:string;recovery_assignee_id:string;updated_at:string}
export type FeedbackVisit={id:string;booking_id:string;guest_id:string;visit_date:string;invite_state:string;created_at:string;rating:number|null;comment:string;submitted_at:string|null;withdrawn_at:string|null;assignee_id:string|null;due_at:string|null;case_state:string|null;outcome:string;closed_at:string|null}
export type FeedbackCredential={visit_id:string;token_hash:string;owner_id:string;email_hash:string;consent_at:string;expires_at:string;contact_data:string}
export type FeedbackContext=Awaited<ReturnType<typeof liveVisit>>
export const unavailable=():never=>fail(404,'Feedback link not found or no longer available.')
export const settingsRow=(db:D1Database)=>db.prepare('SELECT * FROM pm_feedback_settings WHERE id=1').first<FeedbackSettings>()
export const ownerFence=(db:D1Database,ownerId:string)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role='owner') THEN 1 ELSE 0 END").bind(ownerId)
export async function managerAuthority(db:D1Database,actor:Actor){person(actor);if(actor.deviceId||!await activeAssignee(db,actor.id))fail(403,'A current venue manager must do this.')}
export const managerFence=(db:D1Database,actor:Actor)=>assigneeFence(db,actor.id)
export async function ownerAuthority(db:D1Database,actor:Actor){person(actor,true);if(actor.deviceId||!await db.prepare("SELECT id FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(actor.id).first())fail(403,'The current venue owner must do this.')}
export async function atomic(db:D1Database,statements:D1PreparedStatement[]){try{await db.batch([...statements,db.prepare('DELETE FROM pm_assertions')])}catch(error){if(error instanceof Problem)throw error;if(/CHECK constraint|UNIQUE constraint|pm_assertions/.test(String(error)))fail(409,'Feedback or authority changed. Refresh before continuing.');throw error}}
export async function bookingContact(db:D1Database,booking:Booking){
 const guestRow=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{version:number;data:string}>()
 if(!guestRow)return null
 const guest:Guest=JSON.parse(guestRow.data)
 if(guest.erased||guest.mergedInto)return null
 const contactRow=await db.prepare('SELECT guest_id,data FROM pm_booking_contacts WHERE booking_id=?').bind(booking.id).first<{guest_id:string;data:string}>()
 if(contactRow&&contactRow.guest_id!==booking.guestId)return null
 const contact=contactRow?JSON.parse(contactRow.data):{name:guest.name,email:guest.email,phone:guest.phone}
 if(typeof contact.email!=='string')return null
 const email=contact.email.trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return null
 return {guestRow,guest,contactRow,contact,email,emailHash:await hash(email),contactData:JSON.stringify(contact)}
}
export async function liveVisit(db:D1Database,visitId:string,now=Date.now()){
 const [visit,credential,settings,{state,version}]=await Promise.all([db.prepare('SELECT * FROM pm_feedback_visits WHERE id=?').bind(visitId).first<FeedbackVisit>(),db.prepare('SELECT * FROM pm_feedback_credentials WHERE visit_id=?').bind(visitId).first<FeedbackCredential>(),settingsRow(db),load(db)])
 if(!visit||!credential||!settings||!settings.enabled||visit.withdrawn_at||Date.parse(credential.expires_at)<=now||!Number.isFinite(Date.parse(credential.expires_at))||settings.owner_id!==credential.owner_id)unavailable()
 if(!await db.prepare("SELECT id FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(credential!.owner_id).first())unavailable()
 const booking=state.bookings.find(b=>b.id===visit!.booking_id&&b.guestId===visit!.guest_id&&b.status==='completed')
 if(!booking)unavailable()
 const contact=await bookingContact(db,booking!),consent=booking!.feedbackEmailConsent
 if(!contact||!consent||consent.source!=='guest-supplied'||consent.historical===true||consent.at!==credential!.consent_at||consent.emailHash!==credential!.email_hash||contact.emailHash!==credential!.email_hash||contact.contactData!==credential!.contact_data)unavailable()
 return {visit:visit!,credential:credential!,settings:settings!,state,version,booking:booking!,...contact!}
}
export function liveFences(db:D1Database,c:FeedbackContext){return [
 ownerFence(db,c.credential.owner_id),
 db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) AND EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END').bind(c.version,c.guest.id,c.guestRow.version,c.guestRow.data),
 db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_feedback_settings WHERE id=1 AND enabled=1 AND owner_id=? AND updated_at=?) AND EXISTS(SELECT 1 FROM pm_feedback_credentials WHERE visit_id=? AND token_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM pm_feedback_visits WHERE id=? AND withdrawn_at IS NULL) THEN 1 ELSE 0 END').bind(c.settings.owner_id,c.settings.updated_at,c.visit.id,c.credential.token_hash,new Date().toISOString(),c.visit.id),
 c.contactRow?db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=? AND guest_id=? AND data=?) THEN 1 ELSE 0 END').bind(c.booking.id,c.guest.id,c.contactRow.data):db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_booking_contacts WHERE booking_id=?) THEN 1 ELSE 0 END').bind(c.booking.id)
]}
export async function tokenContext(db:D1Database,p:any){
 if(typeof p.token!=='string'||!/^[a-f0-9]{64}$/.test(p.token)||Object.keys(p).some(k=>['bookingId','guestId','visitId'].includes(k)))unavailable()
 const row=await db.prepare('SELECT visit_id FROM pm_feedback_credentials WHERE token_hash=?').bind(await hash(p.token)).first<{visit_id:string}>()
 if(!row)unavailable()
 return liveVisit(db,row!.visit_id)
}
export async function activeAssignee(db:D1Database,id:string){return db.prepare("SELECT id,display_name AS name,role FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(id).first<{id:string;name:string;role:string}>()}
export const assigneeFence=(db:D1Database,id:string)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(id)
export async function messages(db:D1Database,visitId:string){return (await db.prepare('SELECT id,author,message,at,state FROM pm_feedback_messages WHERE visit_id=? ORDER BY at,id').bind(visitId).all<{id:string;author:string;message:string;at:string;state:string}>()).results}
export async function caseView(db:D1Database,v:FeedbackVisit){if(!v.case_state)return null;const who=v.assignee_id?await activeAssignee(db,v.assignee_id):null;return {assigneeId:v.assignee_id,assigneeName:who?.name??'Assignment needs attention',dueAt:v.due_at,state:v.case_state,outcome:v.outcome,overdue:v.case_state==='open'&&!!v.due_at&&Date.parse(v.due_at)<Date.now()}}
export async function publicView(db:D1Database,c:FeedbackContext){return {venueName:c.state.venue.name,bookingId:c.booking.id,visitDate:c.visit.visit_date,rating:c.visit.rating,comment:c.visit.comment,messages:await messages(db,c.visit.id),case:await caseView(db,c.visit),publicReviewUrl:c.settings.public_review_url,withdrawn:false}}

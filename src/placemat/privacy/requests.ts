import {fail,id,text,type Actor} from '../model'
import {load,save} from '../store'
import {executeNeeds} from '../needs'
import {eraseImportedGuest} from '../import/erase'
import {erasureCheckpoint} from '../backup'
import type {D1Sql} from '../import/kit'
import {event,guestRow,ownerFence,policy,reviewRetention} from './store'
export async function correctNeed(db:D1Database,actor:Actor,p:any){
 const row=await guestRow(db,p.guestId);if(row.guest.erased)fail(409,'An erased guest cannot be corrected.')
 const {state,version}=await load(db),booking=state.bookings.find(b=>b.id===p.bookingId&&b.guestId===row.id)??fail(404,'This booking does not belong to the guest.')
 if(!['allergy','dietary','access'].includes(p.field))fail(400,'Choose a declared need.')
 const at=new Date().toISOString(),requestId=id()
 executeNeeds(state,actor,{...p,action:'correct'},at)
 await save(db,state,version,[ownerFence(db,actor),db.prepare('INSERT INTO pm_privacy_requests(id,guest_id,kind,state,actor_id,created_at,completed_at) VALUES(?,?,?, ?,?,?,?)').bind(requestId,row.id,'correction','completed',actor.id,at,at),event(db,actor,requestId,'need.corrected',{bookingId:booking.id,field:p.field})])
 return {requestId,bookingId:booking.id,completed:true}
}
async function processorRefs(db:D1Database,guestId:string){
 const {state}=await load(db),bookings=JSON.stringify(state.bookings.filter(b=>b.guestId===guestId).map(b=>b.id))
 const rows=(await db.prepare("SELECT 'Stripe' AS provider,provider_session_id AS reference FROM pm_payment_requests WHERE booking_id IN (SELECT value FROM json_each(?)) AND provider_session_id IS NOT NULL UNION SELECT 'Stripe',charge_id FROM pm_refund_charges WHERE booking_id IN (SELECT value FROM json_each(?)) UNION SELECT 'Email provider',n.provider_id FROM pm_refund_notices n JOIN pm_refunds r ON r.id=n.refund_id WHERE r.booking_id IN (SELECT value FROM json_each(?)) AND n.provider_id IS NOT NULL").bind(bookings,bookings,bookings).all<{provider:string;reference:string}>()).results
 return rows
}
export async function eraseRequest(db:D1Database,actor:Actor,p:any,kind='deletion'){
 if(p.confirm!=='ERASE')fail(400,'Confirm erasure with ERASE.')
 const row=await guestRow(db,p.guestId),current=await policy(db)
 if(!current)fail(409,'Record retention grounds before completing privacy erasure.')
 if(row.guest.erased)return {completed:true,alreadyErased:true}
 const requestId=id(),at=new Date().toISOString(),refs=await processorRefs(db,row.id)
 const statements:D1Sql[]=[...(p.retentionReview?[{sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) AND EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=?) AND EXISTS(SELECT 1 FROM pm_privacy_policy WHERE id=1 AND version=?) THEN 1 ELSE 0 END',params:[p.retentionReview.floorVersion,row.id,p.retentionReview.guestVersion,p.retentionReview.policyVersion]}]:[]),{sql:'INSERT INTO pm_privacy_requests(id,guest_id,kind,state,actor_id,created_at,completed_at,policy_version) VALUES(?,?,?,?,?,?,?,?)',params:[requestId,row.id,kind,'completed',actor.id,at,at,current.version]},
  {sql:'INSERT INTO pm_privacy_events(id,request_id,actor_id,action,at,details) VALUES(?,?,?,?,?,?)',params:[id(),requestId,actor.id,'guest.erased',at,JSON.stringify({policyVersion:current.version,financialGround:current.rules.financialEvidence.ground,financialDays:current.rules.financialEvidence.days})]},
  ...refs.map(ref=>({sql:'INSERT INTO pm_privacy_processors(id,request_id,provider,reference,state,actor_id,updated_at) VALUES(?,?,?,?,?,?,?)',params:[id(),requestId,ref.provider,ref.reference,'open',actor.id,at]}))]
 await erasureCheckpoint(db)
 await eraseImportedGuest(db,row.id,actor,statements)
 await erasureCheckpoint(db)
 return {requestId,completed:true,processorTasks:refs.length,financialReferences:'Retained under the recorded ground; no provider deletion was sent.'}
}
export async function runRetention(db:D1Database,actor:Actor,p:any){
 if(p.confirm!=='ERASE'||!Array.isArray(p.guestIds)||!p.guestIds.length||p.guestIds.length>25||new Set(p.guestIds).size!==p.guestIds.length)fail(400,'Select up to 25 reviewed guests and type ERASE.')
 const review=await reviewRetention(db)
 if(p.fingerprint!==review.fingerprint)fail(409,'Guest data or retention settings changed. Review again.')
 if(p.guestIds.some((id:unknown)=>!review.guests.some(g=>g.id===id&&g.eligible)))fail(409,'Every selected guest must be eligible for this reviewed run.')
 const completed=[];let floorVersion=review.floorVersion
 // Each identity erasure is atomic and resumable; a later refusal leaves prior completed requests visible.
 for(const guestId of p.guestIds){const result=await eraseRequest(db,actor,{guestId,confirm:'ERASE',retentionReview:{floorVersion,guestVersion:review.guestVersions[guestId],policyVersion:review.policy.version}},'retention');completed.push(result);if(!result.alreadyErased)floorVersion++}
 return {completed}
}
export async function processorTask(db:D1Database,actor:Actor,p:any){
 const request=await db.prepare("SELECT id FROM pm_privacy_requests WHERE id=? AND kind IN ('deletion','retention')").bind(text(p.requestId,'Deletion request')).first()
 if(!request)fail(404,'Deletion request not found.')
 const at=new Date().toISOString()
 if(p.id){
  if(!['submitted','confirmed','retained'].includes(p.state))fail(400,'Choose submitted, confirmed or retained.')
  const existing=await db.prepare('SELECT * FROM pm_privacy_processors WHERE id=? AND request_id=?').bind(p.id,p.requestId).first<any>()
  if(!existing)fail(404,'Processor task not found.')
  if(existing.state==='confirmed'||existing.state==='retained')fail(409,'A completed processor decision cannot be overwritten.')
  const ground=text(p.ground,'Provider receipt or documented retention ground',500)
  await db.batch([ownerFence(db,actor),db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_privacy_processors WHERE id=? AND state=?) THEN 1 ELSE 0 END').bind(p.id,existing.state),db.prepare('UPDATE pm_privacy_processors SET state=?,ground=?,actor_id=?,updated_at=? WHERE id=?').bind(p.state,ground,actor.id,at,p.id),event(db,actor,p.requestId,'processor.'+p.state,{taskId:p.id,ground}),db.prepare('DELETE FROM pm_assertions')])
  return {id:p.id,state:p.state}
 }
 const provider=text(p.provider,'Processor',80),reference=text(p.reference,'Provider record reference',200)
 if(!/^[A-Za-z0-9_.:-]+$/.test(reference))fail(400,'Use a provider record identifier, never a guest contact or message.')
 const taskId=id()
 await db.batch([ownerFence(db,actor),db.prepare('INSERT INTO pm_privacy_processors(id,request_id,provider,reference,state,actor_id,updated_at) VALUES(?,?,?,?,?,?,?)').bind(taskId,p.requestId,provider,reference,'open',actor.id,at),event(db,actor,p.requestId,'processor.recorded',{taskId}),db.prepare('DELETE FROM pm_assertions')])
 return {id:taskId,state:'open'}
}

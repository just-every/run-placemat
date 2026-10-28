import {fail,id,text,number,type Actor} from './model'
import {hash,load} from './store'
import {candidates} from './retention-eligibility'
import {activeGrant,assertion,atomic,contact,factsRow,guestFence,ownerAuthority,ownerFence,settingsRow,workflowRow,type Config,type Facts,type Workflow,type Preview} from './retention-store'
export {publicRetentionConsent,publicRetentionStatus,publicRetentionUnsubscribe,requestRetentionConsent,confirmRetentionConsent} from './retention-consent'
export {runRetentionWorkflows,captureRetentionAttribution} from './retention-mail'
const triggers=['welcome','birthday','anniversary','first-to-second','lapsed','experience']
function configFor(p:any):Config{
 if(!triggers.includes(p.trigger))fail(400,'Choose a supported retention trigger.')
 const clock=(v:unknown)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:fail(400,'Quiet hours must use local 24-hour times.')
 const quietStart=clock(p.quietStart),quietEnd=clock(p.quietEnd)
 if(quietStart===quietEnd)fail(400,'Choose different quiet hour start and end times.')
 if(typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now())fail(400,'Choose a future offer expiry.')
 return {name:text(p.name,'Workflow name',150),trigger:p.trigger,offer:text(p.offer,'Offer',4000),delayDays:number(p.delayDays,'Delay days',0,365),lapsedDays:number(p.lapsedDays,'Lapsed days',1,730),...p.trigger==='experience'?{experienceId:text(p.experienceId,'Published experience',100)}:{},capDays:number(p.capDays,'Frequency cap days',1,365),quietStart,quietEnd,expiresAt:new Date(p.expiresAt).toISOString()}
}
export async function readRetention(db:D1Database,actor:Actor){
 await ownerAuthority(db,actor)
 const [settings,{state},guestRows,facts,consents,workflows,deliveries,attributions]=await Promise.all([settingsRow(db),load(db),db.prepare('SELECT id,data FROM pm_guests ORDER BY id').all<{id:string;data:string}>(),db.prepare('SELECT * FROM pm_retention_facts').all<Facts>(),db.prepare('SELECT guest_id,confirmed_at,purpose,venue_scope FROM pm_retention_consents').all<{guest_id:string;confirmed_at:string;purpose:string;venue_scope:string}>(),db.prepare('SELECT * FROM pm_retention_workflows ORDER BY created_at DESC,id').all<Workflow>(),db.prepare('SELECT * FROM pm_retention_deliveries ORDER BY created_at DESC,id').all<{id:string;workflow_id:string;guest_id:string;state:string;created_at:string;accepted_at:string|null}>(),db.prepare('SELECT * FROM pm_retention_attributions ORDER BY created_at').all<{booking_id:string;delivery_id:string;guest_id:string;created_at:string}>()])
 const liveGuests=guestRows.results.map(r=>JSON.parse(r.data)).filter(g=>!g.erased&&!g.mergedInto)
 const grant=await activeGrant(db)
 return {granted:!!grant&&grant.owner_id===actor.id,guests:liveGuests.map(g=>{const f=facts.results.find(f=>f.guest_id===g.id),c=consents.results.find(c=>c.guest_id===g.id);return {id:g.id,name:g.name,email:g.email,facts:f?{birthday:f.birthday,anniversary:f.anniversary,createdAt:f.created_at,provenance:JSON.parse(f.provenance)}:null,consent:c?{confirmedAt:c.confirmed_at,purpose:c.purpose,venueScope:c.venue_scope}:null}}),workflows:workflows.results.map(w=>{const preview:Preview|null=w.preview_data?JSON.parse(w.preview_data):null;return {...JSON.parse(w.data),id:w.id,status:w.status,previewHash:w.preview_hash,recipients:(preview?.recipients??[]).map(r=>({guestId:r.guestId,name:r.name,email:r.email})),previewPreparedAt:preview?.preparedAt,previewExpiresAt:preview?.expiresAt,createdAt:w.created_at}}),deliveries:deliveries.results.map(d=>({id:d.id,workflowId:d.workflow_id,guestId:d.guest_id,guestName:liveGuests.find(g=>g.id===d.guest_id)?.name??'Erased guest',workflowName:workflows.results.find(w=>w.id===d.workflow_id)?JSON.parse(workflows.results.find(w=>w.id===d.workflow_id)!.data).name:'Workflow',repeatBookings:attributions.results.filter(a=>a.delivery_id===d.id&&state.bookings.some(b=>b.id===a.booking_id&&b.guestId===a.guest_id&&b.status==='completed'&&state.bookings.some(prior=>prior.guestId===b.guestId&&prior.id!==b.id&&prior.status==='completed'&&prior.endAt<=b.startAt))).length,state:d.state,createdAt:d.created_at,acceptedAt:d.accepted_at})),attributions:attributions.results.map(a=>{const booking=state.bookings.find(b=>b.id===a.booking_id&&b.guestId===a.guest_id);return {deliveryId:a.delivery_id,bookingId:a.booking_id,guestId:a.guest_id,status:booking?.status??'unavailable',repeatCompleted:booking?.status==='completed'&&state.bookings.some(b=>b.guestId===a.guest_id&&b.id!==booking.id&&b.status==='completed'&&b.endAt<=booking.startAt)}}),experiences:(state.experiences??[]).filter(e=>e.status==='published').map(e=>({id:e.id,name:e.name})),grantUpdatedAt:settings?.updated_at??null}
}
export async function grantRetention(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 if(typeof p.enabled!=='boolean'||Object.keys(p).some(k=>k!=='enabled'))fail(400,'Supply an explicit marketing automation grant.')
 const at=new Date().toISOString()
 await atomic(db,[ownerFence(db,actor.id),db.prepare('INSERT INTO pm_retention_settings(id,enabled,owner_id,revision,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,owner_id=excluded.owner_id,revision=excluded.revision,updated_at=excluded.updated_at').bind(p.enabled?1:0,actor.id,id(),at),db.prepare('DELETE FROM pm_retention_approvals'),db.prepare("UPDATE pm_retention_workflows SET status='stopped' WHERE status='approved'"),db.prepare("UPDATE pm_retention_deliveries SET state='cancelled' WHERE state='claimed'")])
 return readRetention(db,actor)
}
export async function saveRetentionFacts(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 const guestId=text(p.guestId,'Guest',100),c=await contact(db,guestId)
 if(!c)fail(404,'Choose a current guest with an email address.')
 const prior=await factsRow(db,guestId),at=new Date().toISOString(),provenance=JSON.parse(prior?.provenance??'{}')
 const date=(value:unknown)=>{if(value===null||value==='')return null;if(typeof value!=='string'||!/^\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`2000-${value}T12:00:00Z`))||new Date(`2000-${value}T12:00:00Z`).toISOString().slice(5,10)!==value)fail(400,'Use a valid month and day in MM-DD form.');return value}
 const birthday=p.birthday===undefined?prior?.birthday??null:date(p.birthday),anniversary=p.anniversary===undefined?prior?.anniversary??null:date(p.anniversary)
 for(const field of ['birthday','anniversary'])if(p[field]!==undefined)provenance[field]={source:'staff-observed',actor:actor.id,at,...typeof p.reference==='string'?{reference:text(p.reference,'Date source reference',500)}:{}}
 await atomic(db,[ownerFence(db,actor.id),guestFence(db,c!),db.prepare('INSERT INTO pm_retention_facts(guest_id,created_at,birthday,anniversary,provenance,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(guest_id) DO UPDATE SET birthday=excluded.birthday,anniversary=excluded.anniversary,provenance=excluded.provenance,updated_at=excluded.updated_at').bind(guestId,prior?.created_at??at,birthday,anniversary,JSON.stringify(provenance),at)])
 return readRetention(db,actor)
}
export async function draftRetention(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 const config=configFor(p),workflowId=p.workflowId?text(p.workflowId,'Workflow',100):id(),prior=await workflowRow(db,workflowId),at=new Date().toISOString()
 if(p.workflowId&&!prior)fail(404,'Workflow not found.')
 const {state}=await load(db)
 if(config.trigger==='experience'&&!state.experiences?.some(e=>e.id===config.experienceId&&e.status==='published'))fail(409,'Choose a currently published experience.')
 await atomic(db,[ownerFence(db,actor.id),db.prepare('DELETE FROM pm_retention_approvals WHERE workflow_id=?').bind(workflowId),db.prepare("INSERT INTO pm_retention_workflows(id,data,status,created_at,updated_at) VALUES(?,?,'draft',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,status='draft',preview_hash=NULL,preview_data=NULL,updated_at=excluded.updated_at").bind(workflowId,JSON.stringify(config),at,at),db.prepare("UPDATE pm_retention_deliveries SET state='cancelled' WHERE workflow_id=? AND state='claimed'").bind(workflowId)])
 return {...await previewRetention(db,actor,{workflowId}),workflowId}
}
export async function previewRetention(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 const workflowId=text(p.workflowId,'Workflow',100),w=await workflowRow(db,workflowId)
 if(!w)fail(404,'Workflow not found.')
 const config:Config=JSON.parse(w!.data),now=new Date(),recipients=await candidates(db,config,workflowId,now),preview:Preview={offer:config.offer,config,recipients,preparedAt:now.toISOString(),expiresAt:new Date(Math.min(now.getTime()+86400000,Date.parse(config.expiresAt))).toISOString()},previewHash=await hash(JSON.stringify(preview))
 await atomic(db,[ownerFence(db,actor.id),assertion(db,'EXISTS(SELECT 1 FROM pm_retention_workflows WHERE id=? AND data=? AND updated_at=?)',workflowId,w!.data,w!.updated_at),db.prepare('DELETE FROM pm_retention_approvals WHERE workflow_id=?').bind(workflowId),db.prepare("UPDATE pm_retention_workflows SET status='draft',preview_hash=?,preview_data=?,updated_at=? WHERE id=?").bind(previewHash,JSON.stringify(preview),now.toISOString(),workflowId),db.prepare("UPDATE pm_retention_deliveries SET state='cancelled' WHERE workflow_id=? AND state='claimed'").bind(workflowId)])
 return {...await readRetention(db,actor),preview:{workflowId,previewHash,offer:config.offer,recipients:recipients.map(r=>({guestId:r.guestId,name:r.name,email:r.email})),expiresAt:preview.expiresAt}}
}
export async function approveRetention(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 const workflowId=text(p.workflowId,'Workflow',100),previewHash=text(p.previewHash,'Exact preview hash',100),w=await workflowRow(db,workflowId),grant=await activeGrant(db),at=new Date().toISOString()
 if(!grant||grant.owner_id!==actor.id)fail(409,'Grant marketing automation separately before approving a workflow.')
 if(!w||w.status!=='draft'||w.preview_hash!==previewHash||!w.preview_data)fail(409,'Review the exact current recipient and offer preview before approval.')
 const preview:Preview=JSON.parse(w!.preview_data!)
 if(preview.expiresAt<=at||await hash(w!.preview_data!)!==previewHash)fail(409,'Refresh the expired preview before approval.')
 const current=await candidates(db,preview.config,workflowId,new Date())
 if(JSON.stringify(current)!==JSON.stringify(preview.recipients))fail(409,'Recipients or their consent changed. Refresh the preview before approval.')
 await atomic(db,[ownerFence(db,actor.id),assertion(db,'EXISTS(SELECT 1 FROM pm_retention_settings WHERE id=1 AND enabled=1 AND owner_id=? AND revision=?) AND EXISTS(SELECT 1 FROM pm_retention_workflows WHERE id=? AND preview_hash=? AND preview_data=? AND status=\'draft\')',actor.id,grant!.revision,workflowId,previewHash,w!.preview_data),db.prepare('INSERT INTO pm_retention_approvals(workflow_id,owner_id,grant_revision,preview_hash,approved_at,expires_at) VALUES(?,?,?,?,?,?)').bind(workflowId,actor.id,grant!.revision,previewHash,at,preview.config.expiresAt),db.prepare("UPDATE pm_retention_workflows SET status='approved',updated_at=? WHERE id=?").bind(at,workflowId)])
 return readRetention(db,actor)
}
export async function stopRetention(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 const workflowId=text(p.workflowId,'Workflow',100)
 if(!await workflowRow(db,workflowId))fail(404,'Workflow not found.')
 await atomic(db,[ownerFence(db,actor.id),db.prepare('DELETE FROM pm_retention_approvals WHERE workflow_id=?').bind(workflowId),db.prepare("UPDATE pm_retention_workflows SET status='stopped',updated_at=? WHERE id=?").bind(new Date().toISOString(),workflowId),db.prepare("UPDATE pm_retention_deliveries SET state='cancelled' WHERE workflow_id=? AND state='claimed'").bind(workflowId)])
 return readRetention(db,actor)
}

import type {Bindings} from '../auth.server'
import {fail,id,text,type Actor} from './model'
import {atomic,activeAssignee,assigneeFence,caseView,liveFences,liveVisit,managerAuthority,managerFence,messages,ownerAuthority,ownerFence,publicView,settingsRow,tokenContext,type FeedbackVisit} from './feedback-store'

export async function readFeedback(db:D1Database,actor:Actor){
 await managerAuthority(db,actor)
 const [settings,staff,rows]=await Promise.all([settingsRow(db),db.prepare("SELECT id,display_name AS name,role FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY display_name,id").all<{id:string;name:string;role:string}>(),db.prepare('SELECT v.*,g.data AS guest_data FROM pm_feedback_visits v LEFT JOIN pm_guests g ON g.id=v.guest_id ORDER BY v.created_at DESC,v.id').all<FeedbackVisit&{guest_data:string|null}>()])
 const assignee=staff.results.find(s=>s.id===settings?.recovery_assignee_id)
 const visits=await Promise.all(rows.results.map(async v=>{const guest=v.guest_data?JSON.parse(v.guest_data):null;return {id:v.id,bookingId:v.booking_id,guestId:v.guest_id,guestName:guest&&!guest.erased?guest.name:'Erased guest',visitDate:v.visit_date,rating:v.rating,comment:guest&&!guest.erased?v.comment:'',inviteState:v.invite_state,withdrawn:!!v.withdrawn_at,case:await caseView(db,v),messages:guest&&!guest.erased?await messages(db,v.id):[]}}))
 return {settings:{enabled:!!settings?.enabled,publicReviewUrl:settings?.public_review_url??'',recoveryAssigneeId:settings?.recovery_assignee_id??(actor.role==='owner'?actor.id:''),recoveryAssigneeName:assignee?.name??(actor.role==='owner'?actor.name:''),slaHours:48},staff:staff.results,visits}
}
export async function saveFeedbackSettings(db:D1Database,actor:Actor,p:any,venueOrigin?:string){
 await ownerAuthority(db,actor)
 if(typeof p.enabled!=='boolean'||typeof p.publicReviewUrl!=='string'||Object.keys(p).some(k=>!['enabled','publicReviewUrl','recoveryAssigneeId'].includes(k)))fail(400,'Supply feedback consent settings and a public review URL.')
 let url=p.publicReviewUrl.trim()
 if(url){try{const parsed=new URL(url);if(parsed.protocol!=='https:'||venueOrigin&&parsed.origin===new URL(venueOrigin).origin||parsed.username||parsed.password||parsed.hash||parsed.href.length>1500)throw new Error();url=parsed.href}catch{fail(400,'Use an external HTTPS public review URL without credentials or a fragment.')}}
 if(p.enabled&&!url)fail(400,'Set the public review URL before enabling feedback.')
 const current=await settingsRow(db),assigneeId=p.recoveryAssigneeId===undefined?current?.recovery_assignee_id??actor.id:text(p.recoveryAssigneeId,'Recovery assignee',100)
 if(!await activeAssignee(db,assigneeId))fail(409,'Assign recovery to a current venue manager.')
 await atomic(db,[ownerFence(db,actor.id),assigneeFence(db,assigneeId),db.prepare('INSERT INTO pm_feedback_settings(id,enabled,owner_id,public_review_url,recovery_assignee_id,updated_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,owner_id=excluded.owner_id,public_review_url=excluded.public_review_url,recovery_assignee_id=excluded.recovery_assignee_id,updated_at=excluded.updated_at').bind(p.enabled?1:0,actor.id,url,assigneeId,new Date().toISOString()),...!p.enabled?[db.prepare('DELETE FROM pm_feedback_credentials')]:[]])
 return readFeedback(db,actor)
}
export async function readPublicFeedback(db:D1Database,p:any){return publicView(db,await tokenContext(db,p))}
export async function submitFeedback(db:D1Database,p:any){
 const c=await tokenContext(db,p)
 if(!Number.isInteger(p.rating)||p.rating<1||p.rating>5||typeof p.comment!=='string'||p.comment.trim().length>4000||Object.keys(p).some(k=>!['token','rating','comment'].includes(k)))fail(400,'Choose a rating from 1 to 5 and a comment up to 4000 characters.')
 const comment=p.comment.trim()
 if(c.visit.rating!==null){if(c.visit.rating!==p.rating||c.visit.comment!==comment)fail(409,'This visit already has feedback. Use the reply thread to add information.');return publicView(db,c)}
 const poor=p.rating<=2,now=new Date().toISOString(),assigneeId=c.settings.recovery_assignee_id
 if(poor&&!await activeAssignee(db,assigneeId))fail(409,'Recovery assignment needs attention. Please contact the venue.')
 await atomic(db,[...liveFences(db,c),...poor?[assigneeFence(db,assigneeId)]:[],db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_feedback_visits WHERE id=? AND rating IS NULL) THEN 1 ELSE 0 END').bind(c.visit.id),db.prepare('UPDATE pm_feedback_visits SET rating=?,comment=?,submitted_at=?,assignee_id=?,assigned_by=?,assigned_at=?,due_at=?,case_state=? WHERE id=?').bind(p.rating,comment,now,poor?assigneeId:null,poor?c.settings.owner_id:null,poor?now:null,poor?new Date(Date.parse(now)+48*3600000).toISOString():null,poor?'open':null,c.visit.id)])
 return publicView(db,await liveVisit(db,c.visit.id))
}
export async function publicFeedbackReply(db:D1Database,p:any){
 const c=await tokenContext(db,p),message=text(p.message,'Reply',4000)
 if(Object.keys(p).some(k=>!['token','message'].includes(k)))fail(400,'Supply the visit token and reply only.')
 if(c.visit.rating===null||c.visit.case_state==='closed')fail(409,'Submit feedback first; closed recovery threads cannot receive replies.')
 const count=await db.prepare('SELECT COUNT(*) AS n FROM pm_feedback_messages WHERE visit_id=? AND author=\'guest\'').bind(c.visit.id).first<{n:number}>()
 if((count?.n??0)>=50)fail(429,'Contact the venue to continue this conversation.')
 await atomic(db,[...liveFences(db,c),db.prepare('INSERT INTO pm_feedback_messages(id,visit_id,author,message,at,state) VALUES(?,?,\'guest\',?,?,\'recorded\')').bind(id(),c.visit.id,message,new Date().toISOString())])
 return publicView(db,await liveVisit(db,c.visit.id))
}
export async function withdrawFeedback(db:D1Database,p:any){
 const c=await tokenContext(db,p)
 await atomic(db,[...liveFences(db,c),db.prepare('UPDATE pm_feedback_visits SET withdrawn_at=? WHERE id=?').bind(new Date().toISOString(),c.visit.id),db.prepare('DELETE FROM pm_feedback_credentials WHERE visit_id=?').bind(c.visit.id)])
 return {withdrawn:true}
}
export async function assignFeedback(db:D1Database,actor:Actor,p:any){
 await managerAuthority(db,actor)
 const visitId=text(p.visitId,'Visit',100),assigneeId=text(p.assigneeId,'Recovery assignee',100),dueAt=text(p.dueAt,'Recovery deadline',100)
 if(!Number.isFinite(Date.parse(dueAt)))fail(400,'Choose a valid recovery deadline.')
 const row=await db.prepare("SELECT id FROM pm_feedback_visits WHERE id=? AND case_state='open'").bind(visitId).first()
 if(!row)fail(409,'Choose an open recovery case.')
 if(!await activeAssignee(db,assigneeId))fail(409,'Choose a current venue manager.')
 await atomic(db,[managerFence(db,actor),assigneeFence(db,assigneeId),db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_feedback_visits WHERE id=? AND case_state='open') THEN 1 ELSE 0 END").bind(visitId),db.prepare('UPDATE pm_feedback_visits SET assignee_id=?,assigned_by=?,assigned_at=?,due_at=? WHERE id=?').bind(assigneeId,actor.id,new Date().toISOString(),new Date(dueAt).toISOString(),visitId)])
 return readFeedback(db,actor)
}
export async function closeFeedback(db:D1Database,actor:Actor,p:any){
 await managerAuthority(db,actor)
 const visitId=text(p.visitId,'Visit',100),outcome=text(p.outcome,'Closure outcome',2000),v=await db.prepare('SELECT * FROM pm_feedback_visits WHERE id=?').bind(visitId).first<FeedbackVisit>()
 if(!v||v.case_state!=='open'||!v.assignee_id||!await activeAssignee(db,v.assignee_id))fail(409,'An open case needs a current recovery assignee before closure.')
 if(!await db.prepare("SELECT id FROM pm_feedback_messages WHERE visit_id=? AND author='manager' AND state='accepted'").bind(visitId).first())fail(409,'A recovery reply must be accepted by the mail provider before closure.')
 await atomic(db,[managerFence(db,actor),assigneeFence(db,v!.assignee_id!),db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_feedback_visits WHERE id=? AND case_state='open' AND assignee_id=?) AND EXISTS(SELECT 1 FROM pm_feedback_messages WHERE visit_id=? AND author='manager' AND state='accepted') THEN 1 ELSE 0 END").bind(visitId,v!.assignee_id,visitId),db.prepare("UPDATE pm_feedback_visits SET case_state='closed',outcome=?,closed_at=?,closed_by=? WHERE id=?").bind(outcome,new Date().toISOString(),actor.id,visitId)])
 return readFeedback(db,actor)
}

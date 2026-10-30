import type {Bindings} from '../auth.server'
import {actorFor,originCheck,jsonBody} from './access'
import {dinerBookingProof} from './diner-accounts'
import {atomic,managerAuthority,managerFence,ownerAuthority,ownerFence,tokenContext,liveFences} from './feedback-store'
import {hash,load} from './store'
import {fail,id,text,Problem,type Actor} from './model'
import {reviewsPage} from './reviews-view'

export const reviewGuidelines='Reviews describe one attended visit. All ratings are welcome. Do not post threats, personal information or spam. Reports are assessed against these same rules regardless of rating. Reports never automatically hide a review. The owner records retention or escalation; escalation keeps the review visible pending independent review. Managers cannot delete or hide reviews. A verified privacy erasure removes personal content under the guest privacy process.'
const minimumCount=5
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
type Review={id:string;booking_id:string;guest_id:string;visit_date:string;rating:number;comment:string;published_at:string;consent_at:string;historical:number;reply:string;reply_at:string|null;reply_by:string|null;revision:number}
const categories=['spam','personal-data','threat','other']
const row=(db:D1Database,reviewId:unknown)=>db.prepare('SELECT * FROM pm_reviews WHERE id=?').bind(text(reviewId,'Review',100)).first<Review>()
const event=(db:D1Database,r:Review,actor:string,action:string,before:unknown,after:unknown)=>db.prepare('INSERT INTO pm_review_events(id,review_id,booking_id,actor,action,at,before_data,after_data) VALUES(?,?,?,?,?,?,?,?)').bind(id(),r.id,r.booking_id,actor,action,new Date().toISOString(),before===null?null:JSON.stringify(before),JSON.stringify(after))
export async function publicReviews(db:D1Database){
 const {state}=await load(db)
 const reviews=(await db.prepare("SELECT r.* FROM pm_reviews r JOIN pm_guests g ON g.id=r.guest_id WHERE r.historical=0 AND COALESCE(json_extract(g.data,'$.erased'),0)=0 AND json_extract(g.data,'$.mergedInto') IS NULL ORDER BY r.published_at DESC,r.id").all<Review>()).results
 const reports=(await db.prepare('SELECT id,review_id,category,at,outcome,decided_at FROM pm_review_reports ORDER BY at,id').all()).results
 return {venueName:state.venue.name,minimumCount,count:reviews.length,average:reviews.length>=minimumCount?Math.round(reviews.reduce((sum,r)=>sum+r.rating,0)/reviews.length*10)/10:null,guidelines:reviewGuidelines,reviews:reviews.map(r=>({id:r.id,visitDate:r.visit_date,rating:r.rating,comment:r.comment,publishedAt:r.published_at,reply:r.reply,replyAt:r.reply_at,reports:reports.filter(report=>report.review_id===r.id)}))}
}
async function eligibility(db:D1Database,p:any){
 const c=await dinerBookingProof(db,p)
 if(!['seated','completed'].includes(c.booking.status))fail(409,'Only a seated or completed visit can be reviewed.')
 const address=c.contact.email.trim().toLowerCase()
 // Staff remain ineligible even when suspended; possession of a guest account is not an exception.
 if(await db.prepare('SELECT id FROM oa_operators WHERE lower(email)=?').bind(address).first())fail(403,'Venue staff cannot review their restaurant.')
 const fences=[...c.fences,db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=?) THEN 1 ELSE 0 END').bind(address)]
 if(p.invitationToken){
  const invitation=await tokenContext(db,{token:p.invitationToken})
  if(invitation.booking.id!==c.booking.id||invitation.guest.id!==c.guest.id)fail(404,'This invitation belongs to another visit.')
  fences.push(...liveFences(db,invitation))
 }
 return {...c,fences}
}
async function submit(db:D1Database,p:any){
 const c=await eligibility(db,p)
 if(p.publish!==true||p.notStaff!==true)fail(400,'Explicitly confirm public publication and that you are not venue staff.')
 if(!Number.isInteger(p.rating)||p.rating<1||p.rating>5)fail(400,'Choose a rating from 1 to 5.')
 const comment=text(p.comment,'Public review',4000),existing=await db.prepare('SELECT * FROM pm_reviews WHERE booking_id=?').bind(c.booking.id).first<Review>()
 if(existing&&!existing.historical)fail(409,'This attended visit already has a public review.')
 const now=new Date().toISOString(),visitDate=new Intl.DateTimeFormat('en-CA',{timeZone:c.state.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c.booking.startAt)),reviewId=existing?.id??id()
 const review={id:reviewId,booking_id:c.booking.id,guest_id:c.guest.id,visit_date:visitDate,rating:p.rating,comment,published_at:now,consent_at:now,historical:0,reply:existing?.reply??'',reply_at:existing?.reply_at??null,reply_by:existing?.reply_by??null,revision:(existing?.revision??0)+1}
 await atomic(db,[...c.fences,...!existing?[db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pm_reviews WHERE booking_id=?) THEN 1 ELSE 0 END').bind(c.booking.id)]:[],...existing?[db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_reviews WHERE id=? AND historical=1 AND revision=?) THEN 1 ELSE 0 END').bind(existing.id,existing.revision)]:[],db.prepare('INSERT INTO pm_reviews(id,booking_id,guest_id,visit_date,rating,comment,published_at,consent_at,historical,revision) VALUES(?,?,?,?,?,?,?,?,0,1) ON CONFLICT(booking_id) DO UPDATE SET guest_id=excluded.guest_id,rating=excluded.rating,comment=excluded.comment,published_at=excluded.published_at,consent_at=excluded.consent_at,historical=0,revision=pm_reviews.revision+1 WHERE pm_reviews.historical=1').bind(reviewId,c.booking.id,c.guest.id,visitDate,p.rating,comment,now,now),event(db,review,'guest','review.published',existing,review)])
 return {published:true,reviewId,...await publicReviews(db)}
}
async function manage(db:D1Database,actor:Actor){
 await managerAuthority(db,actor)
 return {...await publicReviews(db),canModerate:actor.role==='owner',records:(await db.prepare('SELECT * FROM pm_reviews ORDER BY published_at DESC,id').all()).results,reports:(await db.prepare('SELECT * FROM pm_review_reports ORDER BY at,id').all()).results,events:(await db.prepare("SELECT e.*,CASE WHEN e.actor='guest' THEN 'Guest' ELSE COALESCE(o.display_name,'Former staff member') END AS actor_name FROM pm_review_events e LEFT JOIN oa_operators o ON o.id=e.actor ORDER BY e.at,e.id").all()).results}
}
async function reply(db:D1Database,actor:Actor,p:any){
 await managerAuthority(db,actor)
 const r=await row(db,p.reviewId);if(!r||r.historical)fail(404,'Published review not found.')
 if(p.revision!==r!.revision)fail(409,'The reply changed. Refresh before editing.')
 const message=text(p.message,'Public restaurant reply',2000),now=new Date().toISOString()
 await atomic(db,[managerFence(db,actor),db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_reviews WHERE id=? AND historical=0 AND revision=?) THEN 1 ELSE 0 END').bind(r!.id,r!.revision),db.prepare('UPDATE pm_reviews SET reply=?,reply_at=?,reply_by=?,revision=revision+1 WHERE id=?').bind(message,now,actor.id,r!.id),event(db,r!,actor.id,'review.reply', {reply:r!.reply,revision:r!.revision},{reply:message,revision:r!.revision+1})])
 return manage(db,actor)
}
async function report(db:D1Database,p:any,actor?:Actor){
 if(actor)await managerAuthority(db,actor)
 const r=await row(db,p.reviewId);if(!r||r.historical)fail(404,'Published review not found.')
 if(!categories.includes(p.category))fail(400,'Choose a published moderation category.')
 const detail=text(p.detail,'Abuse report',2000),reportId=id(),at=new Date().toISOString()
 const total=await db.prepare("SELECT COUNT(*) AS n FROM pm_review_reports WHERE review_id=? AND outcome='pending'").bind(r!.id).first<{n:number}>()
 if((total?.n??0)>=10)fail(429,'This review already has reports awaiting review.')
 await atomic(db,[...actor?[managerFence(db,actor)]:[],db.prepare('INSERT INTO pm_review_reports(id,review_id,category,detail,at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM pm_reviews WHERE id=? AND historical=0)').bind(reportId,r!.id,p.category,detail,at,r!.id),event(db,r!,actor?.id??'guest','review.reported',null,{reportId,category:p.category,detail})])
 return {reportId,outcome:'pending',visible:true}
}
async function moderate(db:D1Database,actor:Actor,p:any){
 await ownerAuthority(db,actor)
 const reportId=text(p.reportId,'Report',100),rpt=await db.prepare('SELECT * FROM pm_review_reports WHERE id=?').bind(reportId).first<{review_id:string;outcome:string}>()
 if(!rpt||rpt.outcome!=='pending')fail(409,'Choose a pending report.')
 if(!['retained','escalated'].includes(p.outcome))fail(400,'Choose retention or escalation. Ratings never authorize hiding a review.')
 const reason=text(p.reason,'Moderation reason',2000),r=await row(db,rpt!.review_id);if(!r||r.historical)fail(404,'Published review not found.')
 await atomic(db,[ownerFence(db,actor.id),db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_review_reports WHERE id=? AND outcome='pending') THEN 1 ELSE 0 END").bind(reportId),db.prepare('UPDATE pm_review_reports SET outcome=?,reason=?,decided_at=?,decided_by=? WHERE id=?').bind(p.outcome,reason,new Date().toISOString(),actor.id,reportId),event(db,r!,actor.id,'review.moderated',{reportId,outcome:'pending'},{reportId,outcome:p.outcome,reason})])
 return manage(db,actor)
}
export async function reviewsResponse(request:Request,env:Bindings):Promise<Response|null>{
 const path=new URL(request.url).pathname,publicRoute=path.startsWith('/api/public/reviews')
 if(!['/reviews','/reviews/manage','/api/reviews'].includes(path)&&!path.startsWith('/api/reviews/')&&!publicRoute)return null
 try{
  if(path==='/reviews'&&['GET','HEAD'].includes(request.method))return reviewsPage(request)
  const actor=publicRoute||path==='/reviews'?null:await actorFor(request,env)
  if(!publicRoute&&path!=='/reviews'&&!actor) return path==='/reviews/manage'?new Response(null,{status:303,headers:{location:'/signin?returnTo=%2Freviews%2Fmanage'}}):Response.json({error:'Sign in with your personal venue account.'},{status:401,headers})
  if(path==='/reviews/manage'&&['GET','HEAD'].includes(request.method)){await managerAuthority(env.DB,actor!);return reviewsPage(request,true)}
  if(request.method==='GET'&&path==='/api/public/reviews')return Response.json(await publicReviews(env.DB),{headers})
  if(request.method==='GET'&&path==='/api/reviews')return Response.json(await manage(env.DB,actor!),{headers})
  if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405,headers})
  originCheck(request,env)
  const p=await jsonBody(request)
  if(publicRoute){
   const bucket='reviews:'+await hash((request.headers.get('CF-Connecting-IP')??'local')+':'+Math.floor(Date.now()/60000)),limit=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((limit?.count??0)>60)fail(429,'Too many review requests. Please wait a minute.')
  }
  const result=path==='/api/public/reviews/submit'?await submit(env.DB,p):path==='/api/public/reviews/status'?await eligibility(env.DB,p).then(async c=>({bookingId:c.booking.id,visitDate:c.booking.startAt,alreadyPublished:!!await env.DB.prepare('SELECT id FROM pm_reviews WHERE booking_id=? AND historical=0').bind(c.booking.id).first()})):path==='/api/public/reviews/report'?await report(env.DB,p):path==='/api/reviews/reply'?await reply(env.DB,actor!,p):path==='/api/reviews/report'?await report(env.DB,p,actor!):path==='/api/reviews/moderate'?await moderate(env.DB,actor!,p):fail(404,'Review action not found. Reviews cannot be hidden or deleted here.')
  return Response.json(result,{headers})
 }catch(error){return Response.json({error:error instanceof Problem?error.message:'Review could not be saved. Refresh before trying again.'},{status:error instanceof Problem?error.status:503,headers})}
}

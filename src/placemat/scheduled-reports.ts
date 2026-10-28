import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {actorFor,jsonBody,originCheck,person} from './access'
import {fail,id,type Actor} from './model'
import {hash,load,save} from './store'
import {groupToken} from './group'
import {groupRead} from './group-access'
import {reservationReport,reportCsv,type ReservationReport} from './reports'
import {authorizeReports} from './delegation'
import {serviceDate} from './preshift'
import {localReportCsv,reportKinds,reportLabels,type ReportKind} from './recurring-report-data'

const WEEK=7*86400000
export type Schedule={id:string;owner_id:string;recipient_id:string;recipient_hash:string;venues:string;timezone:string;next_at:string;approved_at:string;enabled:number;report_kind:ReportKind;service_id:string|null}
type Delivery={id:string;schedule_id:string;due_at:string;date_from:string;date_to:string;state:string;reason:string}
type Operator={id:string;name:string;email:string;role:string;status:string}
const operator=(db:D1Database,who:string)=>db.prepare('SELECT id,display_name AS name,email,role,status FROM oa_operators WHERE id=?').bind(who).first<Operator>()
const noStore={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
const csv=(body:string)=>new Response(body,{headers:{...noStore,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="placemat-report.csv"'}})
const cell=(value:unknown)=>'"'+(/^[\s\u0000-\u001f]*[=+\-@]/.test(String(value))?"'":'')+String(value??'').replaceAll('"','""')+'"'
const rowsCsv=(rows:unknown[][])=>rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
async function audit(db:D1Database,actor:string,action:string,subject:string,reason='',statements:D1PreparedStatement[]=[]){
 const {state,version}=await load(db)
 state.audit.push({id:id(),at:new Date().toISOString(),actor,action,subject,reason})
 await save(db,state,version,statements)
}
async function manager(db:D1Database,actor:Actor,kind:ReportKind='group-covers'){
 person(actor)
 if(actor.deviceId)fail(403,'Use a personal manager session.')
 const current=await operator(db,actor.id),{state}=await load(db)
 if(!current||current.status!=='active'||!['owner','admin'].includes(current.role)||current.role==='admin'&&kind!=='reservations'&&state.reportScopes?.[actor.id]!==undefined)fail(403,'A current manager with the required report scope must approve schedules.')
 if(['guests','finance'].includes(kind)&&current!.role!=='owner')fail(403,'The owner must approve personal guest or finance report delivery.')
}
function dates(search:URLSearchParams){
 const from=search.get('dateFrom'),to=search.get('dateTo')
 if(!from||!to)fail(400,'Choose both inclusive local service dates.')
 // Reuse the public report validator for dates and range ordering.
 return {from:from!,to:to!}
}

/** Compare the same inclusive local service dates at each explicitly granted venue. No guest fields leave a venue. */
export async function groupComparison(env:Bindings,recipientId:string,venueIds:string[],search:URLSearchParams){
 const recipient=await operator(env.DB,recipientId)
 if(!recipient||recipient.status!=='active'||recipient.role!=='member')fail(403,'The approved group manager is no longer active.')
 const {state}=await load(env.DB)
 if(state.financeIds?.includes(recipientId)||state.serverIds?.includes(recipientId)||state.leadIds?.includes(recipientId))fail(403,'This staff role cannot export group reports.')
 reservationReport(state,search) // Validate before any network request.
 const links=(await env.DB.prepare('SELECT id,origin FROM pm_group_links WHERE revoked_at IS NULL').all<{id:string;origin:string}>()).results
 const token=(await groupToken(env.DB,{id:recipient!.id,name:recipient!.name,role:'member'})).token
 try{
  const reports:ReservationReport[]=[]
  for(const venueId of venueIds){
   const link=links.find(row=>row.id===venueId)
   if(venueId!=='home'&&!link)fail(403,'A selected group venue is disconnected.')
   const url=new URL('/api/group/reports/reservations',venueId==='home'?env.AUTH_ORIGIN:link!.origin)
   url.search=search.toString()
   const request=new Request(url,{headers:{authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(8000)})
   if(venueId==='home')reports.push(await groupRead(env.DB,request,url) as ReservationReport)
   else{
    let response:Response
    try{response=await fetch(request)}catch{fail(403,'A group venue is unreachable. No partial comparison is released.')}
    if(!response!.ok)fail(403,'Group access was refused by a selected venue. No partial comparison is released.')
    reports.push(await response!.json() as ReservationReport)
   }
  }
  return {dateFrom:search.get('dateFrom'),dateTo:search.get('dateTo'),definition:'Inclusive service-start dates in each venue timezone; equal local dates, not equal UTC intervals.',locations:reports.map(r=>({venue:r.venue,timezone:r.timezone,bookedCovers:r.summary.booked.covers,attendedCovers:r.summary.attended.covers,cancelledCovers:r.summary.cancelled.covers,noShowCovers:r.summary.noShow.covers}))}
 }finally{await env.DB.prepare('DELETE FROM pm_group_tokens WHERE token_hash=?').bind(await hash(token)).run()}
}
const comparisonCsv=(report:Awaited<ReturnType<typeof groupComparison>>)=>rowsCsv([['dateFrom','dateTo','venue','timezone','bookedCovers','attendedCovers','cancelledCovers','noShowCovers'],...report.locations.map(r=>[report.dateFrom,report.dateTo,r.venue,r.timezone,r.bookedCovers,r.attendedCovers,r.cancelledCovers,r.noShowCovers])])
async function ownerApprovedAddress(db:D1Database,recipientId:string,emailHash:string){
 const approval=await db.prepare("SELECT 1 AS approved FROM pm_report_schedules s JOIN oa_operators o ON o.id=s.owner_id WHERE s.recipient_id=? AND s.recipient_hash=? AND o.role='owner' AND o.status='active' LIMIT 1").bind(recipientId,emailHash).first()
 if(!approval)fail(403,'A personal owner must first approve this recipient address by creating a report schedule.')
}
async function authority(env:Bindings,s:Schedule){
 if(!s.enabled)fail(403,'The schedule is stopped.')
 const owner=await operator(env.DB,s.owner_id)
 if(!owner)fail(403,'The schedule owner is no longer active.')
 await manager(env.DB,{id:owner!.id,name:owner!.name,role:owner!.role},s.report_kind)
 const recipient=await operator(env.DB,s.recipient_id)
 if(!recipient||recipient.status!=='active'||await hash(recipient.email)!==s.recipient_hash)fail(403,'The approved recipient identity changed or was removed.')
 if(owner!.role!=='owner')await ownerApprovedAddress(env.DB,s.recipient_id,s.recipient_hash)
 return recipient!
}
async function scheduleById(db:D1Database,scheduleId:string){return await db.prepare('SELECT * FROM pm_report_schedules WHERE id=?').bind(scheduleId).first<Schedule>()??fail(404,'Report schedule not found.')}
async function reportFor(env:Bindings,s:Schedule,search:URLSearchParams){
 const recipient=await authority(env,s)
 if(s.report_kind==='group-covers')return comparisonCsv(await groupComparison(env,s.recipient_id,JSON.parse(s.venues),search))
 if(JSON.stringify(JSON.parse(s.venues))!==JSON.stringify(['home']))fail(403,'Personal reports stay in their own venue.')
 if(s.service_id)search.set('serviceId',s.service_id)
 // Both current identities must still have the report's native authority.
 const owner=await operator(env.DB,s.owner_id)
 await localReportCsv(env.DB,{id:owner!.id,name:owner!.name,role:owner!.role},s.report_kind,search)
 return localReportCsv(env.DB,{id:recipient.id,name:recipient.name,role:recipient.role},s.report_kind,search)
}
async function deliver(env:Bindings,s:Schedule,attempt:Delivery){
 let submitted=false
 try{
  const recipient=await authority(env,s)
  await reportFor(env,s,new URLSearchParams({dateFrom:attempt.date_from,dateTo:attempt.date_to}))
  const sender=operatorMail(env)
  if(!sender||!env.MAIL_FROM||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1')fail(409,'A production mail sender is required.')
  // Recheck after the group calls and immediately before the outbound edge.
  await authority(env,await scheduleById(env.DB,s.id))
  const url=new URL('/api/report-deliveries/'+attempt.id+'.csv',env.AUTH_ORIGIN)
  let accepted=false
  try{
   submitted=true
   const result=await sender!.send({deliveryId:attempt.id,from:env.MAIL_FROM!,to:[recipient.email],subject:'Your weekly '+reportLabels[s.report_kind]+' report',text:`Sign in as the approved recipient to open your report: ${url.href}\nLocal service dates: ${attempt.date_from} through ${attempt.date_to}. The link grants no access by itself. Current permissions and erasure apply whenever it is opened.`,html:`<p>Sign in as the approved recipient to open your <a href="${url.href}">${reportLabels[s.report_kind]} report</a>.</p><p>The link grants no access by itself. Current permissions and erasure apply whenever it is opened.</p>`,headers:{'Auto-Submitted':'auto-generated'}})
   accepted=result.status==='accepted'
  }catch{/* An uncertain submission is never retried automatically. */}
  await env.DB.prepare('UPDATE pm_report_deliveries SET state=? WHERE id=?').bind(accepted?'provider accepted':'delivery unconfirmed',attempt.id).run()
  await audit(env.DB,s.owner_id,'report.delivery-attempt',s.id,accepted?'Provider accepted; mailbox delivery unconfirmed.':'Delivery unconfirmed; owner must explicitly resend.')
 }catch{
  if(submitted){
   await env.DB.prepare("UPDATE pm_report_deliveries SET state='delivery unconfirmed',reason='' WHERE id=?").bind(attempt.id).run()
   await audit(env.DB,s.owner_id,'report.delivery-attempt',s.id,'Delivery unconfirmed; owner must explicitly resend.');return
  }
  await env.DB.prepare("UPDATE pm_report_deliveries SET state='blocked',reason='Current owner, recipient, venue authority or mail configuration refused delivery.' WHERE id=?").bind(attempt.id).run()
  await audit(env.DB,s.owner_id,'report.recheck-refused',s.id,'Current authority refused delivery. No report or email was released.')
 }
}
/** The runtime cron owns due processing. Durable claims prevent repeats, including concurrent ticks or an interrupted send. */
export async function runReportSchedules(env:Bindings,now=new Date()){
 const due=(await env.DB.prepare('SELECT * FROM pm_report_schedules WHERE enabled=1 AND next_at<=? ORDER BY next_at LIMIT 20').bind(now.toISOString()).all<Schedule>()).results
 for(const s of due){
  const day=serviceDate(s.next_at,s.timezone),end=new Date(day+'T00:00:00Z'),start=new Date(end.getTime()-WEEK)
  const next=new Date(Date.parse(s.next_at)+(Math.floor((now.getTime()-Date.parse(s.next_at))/WEEK)+1)*WEEK).toISOString()
  const attempt:Delivery={id:id(),schedule_id:s.id,due_at:s.next_at,date_from:start.toISOString().slice(0,10),date_to:new Date(end.getTime()-86400000).toISOString().slice(0,10),state:'delivery unconfirmed',reason:''}
  const claimed=await env.DB.batch<Delivery>([env.DB.prepare("INSERT INTO pm_report_deliveries(id,schedule_id,due_at,date_from,date_to,state) VALUES(?,?,?,?,?,'delivery unconfirmed') ON CONFLICT(schedule_id,due_at) DO NOTHING RETURNING *").bind(attempt.id,s.id,s.next_at,attempt.date_from,attempt.date_to),env.DB.prepare('UPDATE pm_report_schedules SET next_at=? WHERE id=? AND next_at=?').bind(next,s.id,s.next_at)])
  if(claimed[0].results.length)await deliver(env,s,attempt)
 }
}

export async function scheduledReportResponse(request:Request,env:Bindings):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname
 if(!path.startsWith('/api/report-schedules')&&!path.startsWith('/api/report-deliveries/')&&path!=='/api/group-comparison'&&path!=='/api/report-export.csv')return null
 const actor=await actorFor(request,env)
 // Signed-out link attempts are audited without revealing schedule metadata.
 if(!actor){if(path.startsWith('/api/report-deliveries/'))await audit(env.DB,'anonymous','report.link-refused',path.split('/').at(-1)!.replace('.csv',''));fail(401,'Sign in as the approved report recipient.')}
 if(request.method!=='GET')originCheck(request,env)
 if(path==='/api/report-export.csv'){
  if(request.method!=='GET')fail(405,'Use GET for report downloads.')
  const kind=url.searchParams.get('kind')??'reservations'
  if(kind==='guests'||kind==='finance')return csv(await localReportCsv(env.DB,actor!,kind,url.searchParams))
  const gate=new URL('/api/reports/reservations.csv',env.AUTH_ORIGIN);gate.search=url.search
  await authorizeReports(env.DB,actor!,request,gate);person(actor!)
  const {state}=await load(env.DB),r=reservationReport(state,url.searchParams)
  if(kind==='reservations')return csv(reportCsv(r))
  if(kind==='visits')return csv(reportCsv({...r,rows:r.rows.filter(row=>['seated','completed'].includes(row.status))}))
  // Guest personal fields and finance CSVs retain their existing owner-only business export and finance doors.
  fail(403,'Use the existing permitted guest or finance export door for personal or financial fields.')
 }
 if(path==='/api/group-comparison'){
  if(request.method!=='GET'||actor!.agent||actor!.deviceId)fail(403,'Use a personal group manager session.')
  const venues=url.searchParams.getAll('venueId');if(!venues.length||venues.length>20||new Set(venues).size!==venues.length)fail(400,'Choose distinct group venues.')
  dates(url.searchParams)
  const report=await groupComparison(env,actor!.id,venues,url.searchParams)
  return url.searchParams.get('format')==='csv'?csv(comparisonCsv(report)):Response.json(report,{headers:noStore})
 }
 if(path.startsWith('/api/report-deliveries/')){
  if(request.method!=='GET')fail(405,'Use GET for a delivered report.')
  const attempt=await env.DB.prepare('SELECT * FROM pm_report_deliveries WHERE id=?').bind(path.split('/').at(-1)!.replace(/\.csv$/,'')).first<Delivery>()
  const s=attempt?await scheduleById(env.DB,attempt.schedule_id):null
  try{
   if(!attempt||!s||actor!.agent||actor!.deviceId||actor!.id!==s.recipient_id||attempt.state==='blocked')fail(403,'Only the approved identity may open this report.')
   await authority(env,s!)
   const report=await reportFor(env,s!,new URLSearchParams({dateFrom:attempt!.date_from,dateTo:attempt!.date_to}))
   await audit(env.DB,actor!.id,'report.link-opened',attempt!.id)
   return csv(report)
  }catch(error){await audit(env.DB,actor!.id,'report.link-refused',attempt?.id??'unknown','No report disclosed.');throw error}
 }
 await manager(env.DB,actor!,'reservations')
 if(path==='/api/report-schedules'&&request.method==='GET'){
  const all=actor!.role==='owner',schedules=(await env.DB.prepare(all?'SELECT * FROM pm_report_schedules ORDER BY approved_at':'SELECT * FROM pm_report_schedules WHERE owner_id=? ORDER BY approved_at').bind(...(all?[]:[actor!.id])).all<Schedule>()).results
  const deliveries=(await env.DB.prepare('SELECT d.* FROM pm_report_deliveries d JOIN pm_report_schedules s ON s.id=d.schedule_id WHERE s.owner_id=? OR ? ORDER BY d.due_at DESC LIMIT 100').bind(actor!.id,all?1:0).all<Delivery>()).results
  const recipients=(await env.DB.prepare("SELECT id,display_name AS name,role FROM oa_operators WHERE status='active' ORDER BY display_name,id").all<{id:string;name:string;role:string}>()).results
  const links=(await env.DB.prepare('SELECT id,name FROM pm_group_links WHERE revoked_at IS NULL').all<{id:string;name:string}>()).results
  return Response.json({schedules:schedules.map(({recipient_hash,...s})=>({...s,venues:JSON.parse(s.venues)})),deliveries,recipients,services:(await load(env.DB)).state.services.map(s=>({id:s.id,name:s.name})),venues:[{id:'home',name:(await load(env.DB)).state.venue.name},...links]},{headers:noStore})
 }
 if(request.method!=='POST')fail(405,'Use POST to change a schedule.')
 const p=await jsonBody(request)
 if(path==='/api/report-schedules'){
  const reportKind=p.reportKind??'group-covers'
  if(!reportKinds.includes(reportKind))fail(400,'Choose a supported report type.')
  await manager(env.DB,actor!,reportKind)
  if(p.serviceId!==undefined&&p.serviceId!==null&&typeof p.serviceId!=='string')fail(400,'Choose a service.')
  const serviceId=p.serviceId||null
  if(reportKind==='group-covers'&&serviceId)fail(400,'Group covers compare complete local dates.')
  if(reportKind!=='group-covers'&&JSON.stringify(p.venueIds)!==JSON.stringify(['home']))fail(400,'Local reports may only select this venue.')
  if(p.acknowledged!==true)fail(400,'Explicitly approve this recipient and weekly email delivery.')
  if(!Array.isArray(p.venueIds)||!p.venueIds.length||p.venueIds.length>20||p.venueIds.some((v:unknown)=>typeof v!=='string')||new Set(p.venueIds).size!==p.venueIds.length)fail(400,'Choose distinct group venues.')
  if(typeof p.nextAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.nextAt)||!Number.isFinite(Date.parse(p.nextAt))||Date.parse(p.nextAt)<=Date.now())fail(400,'Choose a future first delivery instant in UTC.')
  const recipient=await operator(env.DB,String(p.recipientId)),{state}=await load(env.DB),day=serviceDate(p.nextAt,state.venue.timezone)
  if(serviceId&&!state.services.some(s=>s.id===serviceId))fail(400,'Choose an existing service.')
  if(!recipient)fail(403,'Choose a current native recipient.')
  const candidate:Schedule={id:'preview',owner_id:actor!.id,recipient_id:recipient!.id,recipient_hash:await hash(recipient!.email),venues:JSON.stringify(p.venueIds),timezone:state.venue.timezone,next_at:p.nextAt,approved_at:new Date().toISOString(),enabled:1,report_kind:reportKind,service_id:serviceId}
  if(actor!.role!=='owner'){
   try{await ownerApprovedAddress(env.DB,recipient!.id,await hash(recipient!.email))}
   catch(error){await audit(env.DB,actor!.id,'report.recipient-refused',recipient!.id,'Owner approval of this recipient address is required.');throw error}
  }
  await reportFor(env,candidate,new URLSearchParams({dateFrom:day,dateTo:day}))
  const scheduleId=id(),at=new Date().toISOString()
  await audit(env.DB,actor!.id,'report.recipient-approved',scheduleId,'Explicit weekly email approval for one native identity; authenticated links only.',[env.DB.prepare('INSERT INTO pm_report_schedules(id,owner_id,recipient_id,recipient_hash,venues,timezone,next_at,approved_at,report_kind,service_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(scheduleId,actor!.id,recipient!.id,await hash(recipient!.email),JSON.stringify(p.venueIds),state.venue.timezone,p.nextAt,at,reportKind,serviceId)])
  return Response.json({id:scheduleId},{status:201,headers:noStore})
 }
 const s=await scheduleById(env.DB,String(p.scheduleId))
 await manager(env.DB,actor!,s.report_kind)
 if(actor!.role!=='owner'&&s.owner_id!==actor!.id)fail(403,'Only this schedule owner or the venue owner may change it.')
 if(path==='/api/report-schedules/stop'){
  await audit(env.DB,actor!.id,'report.schedule-stopped',s.id,'',[env.DB.prepare('UPDATE pm_report_schedules SET enabled=0 WHERE id=?').bind(s.id)])
  return Response.json({stopped:true},{headers:noStore})
 }
 if(path==='/api/report-schedules/resend'){
  if(p.acknowledged!==true)fail(400,'Explicitly confirm a manual resend; the earlier email may have arrived.')
  const original=await env.DB.prepare('SELECT * FROM pm_report_deliveries WHERE id=? AND schedule_id=?').bind(String(p.deliveryId),s.id).first<Delivery>()??fail(404,'Delivery attempt not found.')
  const attempt={...original,id:id(),due_at:'manual-'+id(),state:'delivery unconfirmed',reason:''}
  await audit(env.DB,actor!.id,'report.manual-resend-approved',attempt.id,'Explicit resend of a previous report attempt; the earlier email may have arrived.',[env.DB.prepare('INSERT INTO pm_report_deliveries(id,schedule_id,due_at,date_from,date_to,state) VALUES(?,?,?,?,?,?)').bind(attempt.id,s.id,attempt.due_at,attempt.date_from,attempt.date_to,attempt.state)])
  await deliver(env,s,attempt)
  return Response.json({id:attempt.id},{headers:noStore})
 }
 return fail(404,'Unknown report schedule action.')
}

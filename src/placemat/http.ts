import {adviseInventory} from './inventory-advisor'
import {adviseShiftAdjustments} from './shift-advisor'
import {adviseAllocations} from './allocation-advisor'
import {noShowReport} from './no-show'
import {pacingReport} from './pacing'
import {seatingPreview,issuePacingReview} from './pacing-review'
import {queuePage} from './queue-views'
import {queueQr} from './queue-qr'
import {publicJoin,publicQueue,publicQueueUpdate,publicQueueRotate} from './wait-join'
import {sectionsDashboard} from './staffing'
import {timeline} from './timeline'
import {floorStage} from './service-status'
import type { Bindings } from '../auth.server'
import { Problem,fail,id,text,type Actor } from './model'
import { actorFor,person,originCheck,jsonBody } from './access'
import { load,guests,hash,save } from './store'
import { slots } from './availability'
import { execute,onlineBook } from './commands'
import { productPage } from './views'
import { actorNames } from './people'
import { importResponse,eraseImportedGuest } from './import/index'
import { backup,restore,erasureCheckpoint } from './backup'
import { reminderCsv,calendar } from './downloads'
import { reservationReport,reportCsv } from './reports'
import {readPerformance,publishPerformance} from './performance-store'
import { searchGuests } from './guests'
import {reservationSearch} from './reservation-search'

const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
const json=(data:any,status=200)=>Response.json(data,{status,headers})
const paths=new Set(['/api/allocation-advice','/api/reports/no-show','/api/reports/performance','/api/pacing','/api/pacing/preview','/api/sections','/api/floor-version','/api/public/search','/api/queue-qr','/api/timeline','/api/guests','/api/reports/reservations','/api/reports/reservations.csv','/api/state','/api/commands','/api/public/services','/api/public/book','/api/reminders.csv','/api/agent-keys','/api/backup','/api/restore'])
export async function placematResponse(request:Request,env:Bindings):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname
 if(path!=='/app'&&path!=='/book'&&path!=='/queue'&&!path.startsWith('/api/public/queue/')&&!paths.has(path)&&!path.startsWith('/api/import/')&&!path.startsWith('/api/calendar/')&&!path.startsWith('/api/agent-keys/'))return null
 try{
  if(path==='/queue'){if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);return queuePage(request)}
  if(path.startsWith('/api/public/queue/')){
   if(path==='/api/public/queue/services'&&request.method==='GET'){
    const {state}=await load(env.DB)
    return json({venue:state.venue,services:state.services.filter(s=>s.status==='published'&&!s.closedAt&&Date.parse(s.endAt)>Date.now()).map(s=>({id:s.id,name:s.name,startAt:s.startAt,endAt:s.endAt,publicQueuePaused:s.publicQueuePaused===true,areas:[...new Set(state.tables.map(t=>t.area??'Dining room'))]}))})
   }
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env);const p=await jsonBody(request)
   if(path==='/api/public/queue/join')return json(await publicJoin(env.DB,p),201)
   if(path==='/api/public/queue/status')return json(await publicQueue(env.DB,p.token))
   if(path==='/api/public/queue/update')return json(await publicQueueUpdate(env.DB,p))
   if(path==='/api/public/queue/rotate')return json(await publicQueueRotate(env.DB,p))
   return json({error:'Not found'},404)
  }
  if(path==='/book'){if(request.method!=='GET')return json({error:'Method not allowed'},405);return productPage(request,env)}
  if(path==='/api/public/search'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB)
   return json(reservationSearch(state,url.searchParams))
  }
  if(path==='/api/public/services'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB)
   return json({venue:state.venue,services:state.services.filter(s=>s.status==='published'&&!s.closedAt).map(({staffing,...service})=>({...service,slots:slots(state,{...service,staffing},url.searchParams.get('partySize')??2)}))})
  }
  if(path==='/api/public/book'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':'+Math.floor(Date.now()/60000))
   const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((count?.count??0)>20)fail(429,'Too many booking requests. Please wait a minute.')
   await env.DB.prepare('DELETE FROM pm_public_limits WHERE rowid IN (SELECT rowid FROM pm_public_limits ORDER BY rowid DESC LIMIT -1 OFFSET 500)').run()
   return json({result:await onlineBook(env.DB,await jsonBody(request))},201)
  }
  const actor=await actorFor(request,env)
  if(!actor){if(path==='/app')return new Response(null,{status:303,headers:{...headers,location:'/signin?returnTo=%2Fapp'}});fail(401,'Sign in to the venue first.')}
  if(!['owner','admin','member','host','agent'].includes(actor!.role))fail(403,'This role has no venue access.')
  if(path==='/app'){if(actor!.agent)fail(403,'Agent keys use the API.');return productPage(request,env,actor!)}
  if(request.method!=='GET')originCheck(request,env)
  if(path.startsWith('/api/import/')){person(actor!,true);return await importResponse(request,env,actor!)??json({error:'Not found'},404)}
  if(path==='/api/allocation-advice'){
   if(!actor!.agent)person(actor!)
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB),serviceId=text(url.searchParams.get('serviceId'),'Service')
   const bookings=state.bookings.filter(b=>b.serviceId===serviceId)
   const now=new Date().toISOString()
   return json({...adviseAllocations(state,serviceId,now),inventory:adviseInventory(state,serviceId,now),shifts:adviseShiftAdjustments(state,serviceId,now),current:{bookedCovers:bookings.filter(b=>b.status==='booked').reduce((n,b)=>n+b.partySize,0),seatedCovers:bookings.filter(b=>b.status==='seated').reduce((n,b)=>n+b.partySize,0),physicalSeats:state.tables.filter(t=>!t.retiredAt).reduce((n,t)=>n+t.seats,0)}})
  }
  if(path==='/api/reports/no-show'){
   person(actor!)
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB)
   const people=await guests(env.DB)
   return json({...noShowReport(state,people,text(url.searchParams.get('serviceId'),'Service')),names:await actorNames(env.DB,state,people)})
  }
  if(path==='/api/reports/performance'){
   person(actor!)
   if(request.method==='GET')return json(await readPerformance(env.DB,url.searchParams))
   if(request.method==='POST')return json(await publishPerformance(env.DB,actor!,await jsonBody(request)),201)
   return json({error:'Method not allowed'},405)
  }
  if(path.startsWith('/api/reports/')&&request.method==='GET'){
   person(actor!);const {state}=await load(env.DB),report=reservationReport(state,url.searchParams)
   if(path.endsWith('.csv'))return new Response(reportCsv(report),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="placemat-reservations.csv"'}})
   return json(report)
  }
  if(path==='/api/guests'&&request.method==='GET')return json({guests:searchGuests(await guests(env.DB),url.searchParams.get('search')??'')})
  if(path==='/api/queue-qr'&&request.method==='GET'){
   const {state}=await load(env.DB),service=state.services.find(s=>s.id===url.searchParams.get('serviceId'))??fail(404,'Service not found.')
   return new Response(queueQr(env.AUTH_ORIGIN,service.id),{headers:{...headers,'content-type':'image/svg+xml'}})
  }
  if(path==='/api/sections'&&request.method==='GET'){const {state}=await load(env.DB);return json(sectionsDashboard(state,url.searchParams))}
  if(path==='/api/timeline'&&request.method==='GET'){
   const {state}=await load(env.DB)
   return json(timeline(state,await guests(env.DB),url.searchParams))
  }
  if(path==='/api/floor-version'&&request.method==='GET'){
   const {version}=await load(env.DB);return json({version})
  }
  if(path==='/api/state'&&request.method==='GET'){
   const {state,version}=await load(env.DB)
   const keys=actor!.role==='owner'?(await env.DB.prepare('SELECT id,name,created_at,revoked_at FROM pm_agent_keys ORDER BY created_at DESC').all()).results:[]
   const people=await guests(env.DB)
   return json({state,version,guests:people,actor,keys,serviceStages:Object.fromEntries(state.bookings.map(b=>[b.id,floorStage(state,b,new Date().toISOString())])),names:await actorNames(env.DB,state,people)})
  }
  if(path==='/api/pacing'&&request.method==='GET'){const {state}=await load(env.DB);return json(pacingReport(state,url.searchParams.get('serviceId')??'',new Date().toISOString()))}
  if(path==='/api/pacing/preview'&&request.method==='POST'){
   const {state,version}=await load(env.DB),p=await jsonBody(request),now=new Date().toISOString()
   const preview=seatingPreview(state,actor!,p.command,p.payload,now)
   return json({violations:preview.violations,version,review:await issuePacingReview(env.SESSION_SECRET,actor!,p.command,p.payload,version,now)})
  }
  if(path==='/api/commands'&&request.method==='POST'){
   const p=await jsonBody(request)
   if(p.command==='guest.erase'){
    person(actor!,true);if(p.payload?.confirm!=='ERASE')fail(400,'Confirm guest erasure with ERASE.')
    await erasureCheckpoint(env.DB)
    const result=await eraseImportedGuest(env.DB,p.payload.guestId,actor!)
    await erasureCheckpoint(env.DB)
    return json({result})
   }
   return json({result:await execute(env.DB,actor!,text(p.command,'Command'),p.payload??{},env.SESSION_SECRET)})
  }
  if(path==='/api/reminders.csv'&&request.method==='GET'){
   person(actor!);const {state,version}=await load(env.DB)
   return new Response(await reminderCsv(env.DB,state,version),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="placemat-reminders.csv"'}})
  }
  if(path.startsWith('/api/calendar/')&&request.method==='GET'){
   person(actor!);const {state}=await load(env.DB)
   return new Response(calendar(state,decodeURIComponent(path.slice('/api/calendar/'.length))),{headers:{...headers,'content-type':'text/calendar; charset=utf-8','content-disposition':'attachment; filename="booking.ics"'}})
  }
  if(path==='/api/agent-keys'&&request.method==='POST'){
   person(actor!,true);const p=await jsonBody(request),name=text(p.name,'Agent name',80),secret='pm_'+id().replaceAll('-','')+id().replaceAll('-',''),keyId=id()
   await env.DB.prepare('INSERT INTO pm_agent_keys(id,digest,name,created_by,created_at) VALUES(?,?,?,?,?)').bind(keyId,await hash(secret),name,actor!.id,new Date().toISOString()).run()
   return json({result:{id:keyId,name,key:secret}},201)
  }
  if(path.startsWith('/api/agent-keys/')&&request.method==='DELETE'){
   person(actor!,true);await env.DB.prepare('UPDATE pm_agent_keys SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),path.slice('/api/agent-keys/'.length)).run();return json({result:{revoked:true}})
  }
  if(path==='/api/backup'&&request.method==='GET'){person(actor!,true);return json(await backup(env.DB,actor!.id))}
  if(path==='/api/restore'&&request.method==='POST'){
   person(actor!,true);const p=await jsonBody(request);if(p.confirm!=='RESTORE')fail(400,'Confirm restore with RESTORE.');return json({result:await restore(env.DB,p.archive,actor!.id,p.journal)})
  }
  return json({error:'Method not allowed'},405)
 }catch(error){
  if(error instanceof Problem)return json({error:error.message},error.status)
  if(error instanceof Error&&'status' in error&&typeof error.status==='number')return json({error:('code' in error?String(error.code):error.message)},error.status)
  if(error instanceof Error&&error.message.includes('pm_assertions'))return json({error:'The guest changed or was erased. Reload before saving again.'},409)
  console.error('Placemat request failed',error instanceof Error?error.name:'unknown')
  return json({error:'The request could not finish. Reload the current floor and try again.'},500)
 }
}

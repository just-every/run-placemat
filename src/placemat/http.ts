import {scheduledReportResponse} from './scheduled-reports'
import {readGuarantees,issueGuarantee,endGuarantee,guestGuarantee} from './card-guarantees'
import {readMerchant,connectMerchant,disconnectMerchant,collectMerchantCard,syncMerchantCard} from './stripe-merchant'
import {ownerReservationResponse} from './api/reservations'
import {costsResponse} from './costs'
import {privacyResponse} from './privacy/http'
import {queueOrder} from './queue-order'
import {integrationResponse} from './api/reads'
import {createHold,readHold,abandonHold} from './booking-holds'
import {createFeePolicy,recordFeeConsent,previewFee,assessFee,readFees,feeAudit,endFeeAuthorization,requestFeeRecollection,feeAuthorizations} from './fees'
import {refundWebhook,refundFollowups} from './refund-events'
import {sendRefundNotice,refundNotices,refundNoticeAudit} from './refund-notices'
import {readManagement,previewManagement,commitManagement} from './booking-management'
import {managementPage} from './booking-management-view'
import {sendManagement} from './booking-management-mail'
import {handoverAssignees} from './host-projection'
import {paymentAlerts,closePaymentRequest,createPaymentRequest,issuePaymentLink,syncPaymentRequest} from './payment-links'
import {executeRefund,synchronizeRefundCharge,refundAudit} from './refunds'
import {authorizeReports,projectAuthority} from './delegation'
import {sharedDeviceResponse} from './shared-device'
import {projectHandover} from './handover'
import {onboardingPreview} from './onboarding-preview'
import {onboardingDefaults,publicVenue} from './onboarding'
import {serviceInput} from './service-input'
import {kitchen,filterNotes} from './service-notes'
import {kitchenPage} from './kitchen-view'
import {preshift,serviceDate,preshiftPdf} from './preshift'
import {preshiftPage} from './preshift-view'
import {auditRows} from './audit'
import {businessCsv} from './business-export'
import {readCloseReport,closeReportCsv,closeReportPdf} from './service-close-report'
import {businessExportKinds} from './business-export'
import {readBusinessCsv} from './business-export-store'
import {inquiryPage} from './inquiry-views'
import {publicCreateInquiry,publicReadInquiry,publicReplyInquiry} from './inquiries'
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
import {groupInvite,groupAccept,groupJoin,groupLeave,groupGrant,groupDisconnect,groupToken,groupStatus,isGroupAdmin} from './group'
import {groupIntrospect,groupRead} from './group-access'
import {financeSummary,financeExport,isFinance} from './finance'
import {financePage} from './finance-view'
import {timeline} from './timeline'
import {floorStage} from './service-status'
import type { Bindings } from '../auth.server'
import { Problem,fail,id,text,type Actor } from './model'
import {outageReview} from './outage'
import { actorFor,person,originCheck,jsonBody } from './access'
import { load,guests,hash,save } from './store'
import { slots } from './availability'
import { execute,onlineBook } from './commands'
import { productPage } from './views'
import {embedOrigins} from './embed'
import {activeProviders,savedKeys} from './analytics'
import {publicVisit,bookingVisit,sendAnalytics} from './analytics-events'
import { actorNames } from './people'
import { importResponse,eraseImportedGuest } from './import/index'
import { backup,restore,erasureCheckpoint } from './backup'
import { reminderCsv,calendar } from './downloads'
import { reservationReport,reportCsv } from './reports'
import {readPerformance,publishPerformance} from './performance-store'
import { searchGuests,duplicateReview } from './guests'
import {mergeReview,unmergeReview} from './guest-merge'
import {filterMergeAudit,readMergeJournal} from './guest-merge-store'
import {reservationSearch} from './reservation-search'

const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
const paths=new Set(['/api/payments/guarantees','/api/payments/guarantees/issue','/api/payments/guarantees/end','/api/payments/merchant','/api/payments/merchant/connect','/api/payments/merchant/disconnect','/api/payments/merchant/collect','/api/payments/merchant/sync','/api/payments/fee-expiry','/api/payments/fee-recollection','/api/payments/fee-policy','/api/payments/fee-consent','/api/payments/fee-preview','/api/payments/fees','/finance','/api/finance','/api/onboarding','/api/onboarding/preview','/kitchen','/api/kitchen','/preshift','/api/preshift','/api/preshift.pdf','/api/audit','/api/audit.csv','/api/reports/closed','/api/reports/closed.csv','/api/reports/closed.pdf','/api/allocation-advice','/api/reports/no-show','/api/reports/performance','/api/pacing','/api/pacing/preview','/api/sections','/api/floor-version','/api/public/search','/api/public/analytics','/api/queue-qr','/api/timeline','/api/guests','/api/guests/merge-preview','/api/guests/merges','/api/guests/unmerge-preview','/api/reports/reservations','/api/reports/reservations.csv','/api/state','/api/commands','/api/public/services','/api/public/book','/api/reminders.csv','/api/agent-keys','/api/backup','/api/restore'])
paths.add('/api/outage/review')
/** `defer` hands work to the runtime after the response (waitUntil); BOOK-002 analytics sends use it so a provider never delays a guest. */
export async function placematResponse(request:Request,env:Bindings,defer:(work:Promise<unknown>)=>void):Promise<Response|null>{
 const costs=await costsResponse(request,env);if(costs)return costs
 const privacy=await privacyResponse(request,env);if(privacy)return privacy
 const url=new URL(request.url),path=url.pathname
 let responseActor:Actor|null=null
 const json=async(data:any,status=200)=>{
  const visibleTaskIds=new Set<string>()
  if(responseActor?.role==='host'&&!responseActor.agent){
   const {state}=await load(env.DB)
   if(state.hostIds?.includes(responseActor.id))for(const booking of state.bookings)for(const task of booking.handover??[])if(task.ownerId===responseActor.id)visibleTaskIds.add(task.id)
  }
  return Response.json(projectAuthority(projectHandover(data,responseActor,visibleTaskIds),responseActor),{status,headers})
 }
 if(path==='/api/payments/refund-events')return refundWebhook(env,request)
 if(!path.startsWith('/api/report-schedules')&&!path.startsWith('/api/report-deliveries/')&&path!=='/api/group-comparison'&&path!=='/api/report-export.csv'&&!path.startsWith('/api/public/card-guarantee/')&&!path.startsWith('/api/v')&&!path.startsWith('/api/integration-keys')&&!path.startsWith('/api/integration-subscriptions')&&!path.startsWith('/api/public/booking-holds')&&path!=='/api/group'&&!path.startsWith('/api/group/')&&!path.startsWith('/api/finance/')&&path!=='/manage-booking'&&!path.startsWith('/api/public/booking-management/')&&path!=='/hoststand'&&!path.startsWith('/api/hoststand/')&&!path.startsWith('/api/business-export/')&&path!=='/inquiry'&&!path.startsWith('/api/public/inquiries/')&&path!=='/app'&&path!=='/book'&&path!=='/queue'&&!path.startsWith('/api/public/queue/')&&!paths.has(path)&&!path.startsWith('/api/import/')&&!path.startsWith('/api/calendar/')&&!path.startsWith('/api/agent-keys/'))return null
 try{
  const scheduled=await scheduledReportResponse(request,env);if(scheduled)return scheduled
  if(path.startsWith('/api/public/card-guarantee/')){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':card-guarantee:'+Math.floor(Date.now()/60000)),limit=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((limit?.count??0)>30)fail(429,'Too many collection requests. Please wait a minute.')
   return json(await guestGuarantee(env,await jsonBody(request),path.split('/').at(-1)!))
  }
  if(path==='/api/v1/owner-reservations')return await ownerReservationResponse(request,env)
  const integration=await integrationResponse(request,env);if(integration)return integration
  const shared=await sharedDeviceResponse(request,env);if(shared)return shared
  if(path==='/manage-booking'){if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);return managementPage(request)}
  if(path.startsWith('/api/public/booking-management/')){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':manage-booking:'+Math.floor(Date.now()/60000))
   const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((count?.count??0)>60)fail(429,'Too many reservation-management requests. Please wait a minute.')
   const p=await jsonBody(request)
   if(path==='/api/public/booking-management/status')return json(await readManagement(env.DB,p))
   if(path==='/api/public/booking-management/preview')return json(await previewManagement(env.DB,p))
   if(path==='/api/public/booking-management/commit')return json(await commitManagement(env.DB,p))
   return json({error:'Not found'},404)
  }
  if(path==='/inquiry'){if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);return inquiryPage(request)}
  if(path.startsWith('/api/public/inquiries/')){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env);const p=await jsonBody(request)
   if(path==='/api/public/inquiries/create'){
    const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':inquiry:'+Math.floor(Date.now()/60000))
    const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
    if((count?.count??0)>20)fail(429,'Too many inquiry requests. Please wait a minute.')
    return json(await publicCreateInquiry(env.DB,p),201)
   }
   if(path==='/api/public/inquiries/status')return json(await publicReadInquiry(env.DB,p.token))
   if(path==='/api/public/inquiries/reply')return json(await publicReplyInquiry(env.DB,p))
   return json({error:'Not found'},404)
  }
  if(path==='/queue'){if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);return queuePage(request)}
  if(path.startsWith('/api/public/queue/')){
   if(path==='/api/public/queue/services'&&request.method==='GET'){
    const {state}=await load(env.DB)
    return json({venue:publicVenue(state.venue),services:state.services.filter(s=>s.status==='published'&&!s.closedAt&&Date.parse(s.endAt)>Date.now()).map(s=>({id:s.id,name:s.name,startAt:s.startAt,endAt:s.endAt,publicQueuePaused:s.publicQueuePaused===true,areas:[...new Set(state.tables.map(t=>t.area??'Dining room'))]}))})
   }
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env);const p=await jsonBody(request)
   if(path==='/api/public/queue/join')return json(await publicJoin(env.DB,p),201)
   if(path==='/api/public/queue/status')return json(await publicQueue(env.DB,p.token))
   if(path==='/api/public/queue/update')return json(await publicQueueUpdate(env.DB,p))
   if(path==='/api/public/queue/rotate')return json(await publicQueueRotate(env.DB,p))
   return json({error:'Not found'},404)
  }
  if(path==='/book'){if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);return productPage(request,env,undefined,embedOrigins((await load(env.DB)).state))}
  if(path==='/api/public/search'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB)
   return json(reservationSearch(state,url.searchParams))
  }
  if(path==='/api/public/services'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB)
   return json({venue:publicVenue(state.venue),analytics:activeProviders(state,await savedKeys(env.DB)),services:state.services.filter(s=>s.status==='published'&&!s.closedAt).map(({staffing,managerPreorders,...service})=>({...service,slots:slots(state,{...service,staffing},url.searchParams.get('partySize')??2)}))})
  }
  if(path==='/api/public/analytics'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':analytics:'+Math.floor(Date.now()/60000))
   const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((count?.count??0)>60)fail(429,'Too many analytics events. Please wait a minute.')
   await env.DB.prepare('DELETE FROM pm_public_limits WHERE rowid IN (SELECT rowid FROM pm_public_limits ORDER BY rowid DESC LIMIT -1 OFFSET 500)').run()
   const {state}=await load(env.DB),{event,visit}=publicVisit(state,await jsonBody(request),request),providers=activeProviders(state,await savedKeys(env.DB))
   if(providers.length)defer(sendAnalytics(env.DB,event,visit,env.AUTH_ORIGIN+'/book'))
   return json({providers},202)
  }
  if(path.startsWith('/api/public/booking-holds')){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':holds:'+Math.floor(Date.now()/60000))
   const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((count?.count??0)>60)fail(429,'Too many checkout requests. Please wait a minute.')
   const p=await jsonBody(request)
   if(path==='/api/public/booking-holds')return json(await createHold(env.DB,p))
   if(path==='/api/public/booking-holds/status')return json(await readHold(env.DB,p))
   if(path==='/api/public/booking-holds/abandon')return json(await abandonHold(env.DB,p))
   return json({error:'Not found'},404)
  }
  if(path==='/api/public/book'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':'+Math.floor(Date.now()/60000))
   const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((count?.count??0)>20)fail(429,'Too many booking requests. Please wait a minute.')
   await env.DB.prepare('DELETE FROM pm_public_limits WHERE rowid IN (SELECT rowid FROM pm_public_limits ORDER BY rowid DESC LIMIT -1 OFFSET 500)').run()
   const p=await jsonBody(request),result=await onlineBook(env.DB,p),visit=bookingVisit(p,result.partySize,request)
   if(visit&&!result.checkoutReplay)defer(sendAnalytics(env.DB,'booking',visit,env.AUTH_ORIGIN+'/book'))
   return json({result},201)
  }
  if(['/api/group/join-accept','/api/group/introspect'].includes(path)){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':group:'+Math.floor(Date.now()/60000))
   const count=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((count?.count??0)>60)fail(429,'Too many group requests. Please wait a minute.')
   const p=await jsonBody(request)
   return json(path==='/api/group/join-accept'?await groupAccept(env.DB,p):await groupIntrospect(env.DB,request.headers.get('x-group-link'),p.token))
  }
  if(path==='/api/group/reports/reservations'||path==='/api/group/preshift')return json(await groupRead(env.DB,request,url))
  const actor=await actorFor(request,env);responseActor=actor
  if(!actor){if(path==='/app')return new Response(null,{status:303,headers:{...headers,location:'/signin?returnTo=%2Fapp'}});fail(401,'Sign in to the venue first.')}
  if(!['owner','admin','member','host','lead','server','finance','agent'].includes(actor!.role))fail(403,'This role has no venue access.')
  // A signed-in server reaches only their own pre-shift sheet and kitchen view; every other door is refused by default.
  if(actor!.role==='server'&&!actor!.agent){
   if(path==='/app')return new Response(null,{status:303,headers:{...headers,location:'/preshift'}})
   if(request.method!=='GET'||!['/preshift','/api/preshift','/api/preshift.pdf','/kitchen','/api/kitchen','/api/floor-version'].includes(path))fail(403,'Servers open their own section sheet and kitchen view.')
  }
  // A finance identity reads money records only: its own page, JSON and four CSV kinds; every other door is refused by default.
  if(isFinance(actor!)){
   if(path==='/app')return new Response(null,{status:303,headers:{...headers,location:'/finance'}})
   if(request.method!=='GET'||!(['/finance','/api/finance'].includes(path)||path.startsWith('/api/finance/export/')))fail(403,'Finance opens reconciliation and finance exports only.')
   if(path==='/finance')return financePage(await financeSummary(env.DB),(await load(env.DB)).state.venue.name)
   if(path==='/api/finance')return json(await financeSummary(env.DB))
   const kind=path.slice('/api/finance/export/'.length).replace(/\.csv$/,'')
   if(!path.endsWith('.csv'))fail(404,'Unknown finance export.')
   return new Response(await financeExport(env.DB,kind),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="placemat-${kind}.csv"`}})
  }
  if(path==='/finance'||path==='/api/finance'||path.startsWith('/api/finance/'))fail(403,'The owner must grant finance access.')
  if(path.startsWith('/api/reports/'))await authorizeReports(env.DB,actor!,request,url)
  if(path==='/kitchen'||path==='/api/kitchen'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state,version}=await load(env.DB),view=kitchen(state,actor!,text(url.searchParams.get('serviceId'),'Service'),undefined,await actorNames(env.DB,state))
   return path==='/kitchen'?kitchenPage(view,version):json(view)
  }
  if(['/preshift','/api/preshift','/api/preshift.pdf'].includes(path)){
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB),date=url.searchParams.get('date')??serviceDate(new Date().toISOString(),state.venue.timezone)
   const sheet=preshift(state,await guests(env.DB),actor!,date,undefined,await actorNames(env.DB,state),await paymentAlerts(env.DB),await feeAuthorizations(env.DB,actor!),await readGuarantees(env.DB,actor!))
   if(path==='/preshift')return preshiftPage(sheet)
   if(path.endsWith('.pdf'))return new Response(preshiftPdf(sheet),{headers:{...headers,'content-type':'application/pdf','content-disposition':`attachment; filename="placemat-preshift-${date}.pdf"`}})
   return json(sheet)
  }
  if(path==='/app'){if(actor!.agent)fail(403,'Agent keys use the API.');return productPage(request,env,actor!)}
  if(request.method!=='GET')originCheck(request,env)
  if(path==='/api/outage/review'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   const {state,version}=await load(env.DB)
   return json(await outageReview(state,actor!,await jsonBody(request),version,env.SESSION_SECRET,new Date().toISOString()))
  }
  if(path.startsWith('/api/payments/guarantees')){
   if(path==='/api/payments/guarantees'&&request.method==='GET')return json({guarantees:await readGuarantees(env.DB,actor!)})
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env);const p=await jsonBody(request)
   if(path.endsWith('/issue'))return json({result:await issueGuarantee(env,actor!,p)})
   if(path.endsWith('/end'))return json({result:await endGuarantee(env.DB,actor!,p)})
   return json({error:'Not found'},404)
  }
  if(path.startsWith('/api/payments/merchant')){
   if(path==='/api/payments/merchant'&&request.method==='GET')return json(await readMerchant(env.DB,actor!))
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   originCheck(request,env);const p=await jsonBody(request)
   if(path.endsWith('/connect'))return json({result:await connectMerchant(env,actor!,p)})
   if(path.endsWith('/disconnect'))return json({result:await disconnectMerchant(env,actor!)})
   if(path.endsWith('/collect'))return json({result:await collectMerchantCard(env,actor!,p)})
   if(path.endsWith('/sync'))return json({result:await syncMerchantCard(env,actor!,p)})
   return json({error:'Not found'},404)
  }
  if(path.startsWith('/api/payments/fee')){
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   const p=await jsonBody(request)
   if(path==='/api/payments/fee-expiry')return json({result:await endFeeAuthorization(env.DB,actor!,p)})
   if(path==='/api/payments/fee-recollection')return json({result:await requestFeeRecollection(env.DB,actor!,p)})
   if(path==='/api/payments/fee-policy')return json({result:await createFeePolicy(env.DB,actor!,p)})
   if(path==='/api/payments/fee-consent')return json({result:await recordFeeConsent(env,actor!,p)})
   if(path==='/api/payments/fee-preview')return json({result:await previewFee(env.DB,actor!,p)})
   if(path==='/api/payments/fees')return json({result:await assessFee(env,actor!,p)})
  }
  if(path==='/api/group'||path.startsWith('/api/group/')){
   if(path==='/api/group'&&request.method==='GET')return json(await groupStatus(env.DB,actor!))
   if(request.method!=='POST')return json({error:'Method not allowed'},405)
   if(path==='/api/group/token')return json({result:await groupToken(env.DB,actor!)},201)
   const p=await jsonBody(request)
   if(path==='/api/group/invite')return json({result:await groupInvite(env.DB,actor!,p)},201)
   if(path==='/api/group/join')return json({result:await groupJoin(env.DB,actor!,p,env.AUTH_ORIGIN)})
   if(path==='/api/group/leave')return json({result:await groupLeave(env.DB,actor!)})
   if(path==='/api/group/admin')return json({result:await groupGrant(env.DB,actor!,p)})
   if(path==='/api/group/admin/revoke')return json({result:await groupGrant(env.DB,actor!,{operatorId:p.operatorId,venues:{}})})
   if(path==='/api/group/link/revoke')return json({result:await groupDisconnect(env.DB,actor!,p)})
   return json({error:'Not found'},404)
  }
  if(path==='/api/onboarding'){
   person(actor!,true);if(request.method!=='GET')return json({error:'Method not allowed'},405)
   return json({defaults:onboardingDefaults()})
  }
  if(path==='/api/onboarding/preview'){
   person(actor!,true);if(request.method!=='POST')return json({error:'Method not allowed'},405)
   return json(onboardingPreview((await load(env.DB)).state,await jsonBody(request)))
  }
  if(path.startsWith('/api/business-export/')){
   person(actor!,true)
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const kind=path.slice('/api/business-export/'.length).replace(/\.csv$/,'')
   if(!path.endsWith('.csv')||!businessExportKinds.includes(kind as any))fail(404,'Unknown business export.')
   return new Response(await readBusinessCsv(env.DB,kind),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="placemat-${kind}.csv"`}})
  }
  if(path.startsWith('/api/import/')){person(actor!,true);return await importResponse(request,env,actor!)??json({error:'Not found'},404)}
  if(path==='/api/allocation-advice'){
   if(!actor!.agent)person(actor!)
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB),serviceId=text(url.searchParams.get('serviceId'),'Service')
   const bookings=state.bookings.filter(b=>b.serviceId===serviceId)
   const now=new Date().toISOString()
   return json({...adviseAllocations(state,serviceId,now),inventory:adviseInventory(state,serviceId,now),shifts:adviseShiftAdjustments(state,serviceId,now),current:{bookedCovers:bookings.filter(b=>b.status==='booked').reduce((n,b)=>n+b.partySize,0),seatedCovers:bookings.filter(b=>b.status==='seated').reduce((n,b)=>n+b.partySize,0),physicalSeats:state.tables.filter(t=>!t.retiredAt&&t.inventoryKind!=='pool').reduce((n,t)=>n+t.seats,0)}})
  }
  if(path==='/api/reports/closed'||path==='/api/reports/closed.csv'||path==='/api/reports/closed.pdf'){
   person(actor!)
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const report=await readCloseReport(env.DB,text(url.searchParams.get('serviceId'),'Service'))
   if(path.endsWith('.csv'))return new Response(closeReportCsv(report),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="placemat-service-close.csv"'}})
   if(path.endsWith('.pdf'))return new Response(closeReportPdf(report,await actorNames(env.DB,(await load(env.DB)).state)),{headers:{...headers,'content-type':'application/pdf','content-disposition':'attachment; filename="placemat-service-close.pdf"'}})
   return json(report)
  }
  if(path==='/api/reports/no-show'){
   person(actor!)
   if(request.method!=='GET')return json({error:'Method not allowed'},405)
   const {state}=await load(env.DB)
   const people=await guests(env.DB)
   return json({...noShowReport(state,people,text(url.searchParams.get('serviceId'),'Service')),names:await actorNames(env.DB,state,people)})
  }
  if((path==='/api/audit'||path==='/api/audit.csv')&&request.method==='GET'){
   const {state}=await load(env.DB);if(!actor!.agent&&['owner','admin'].includes(actor!.role))state.audit.push(...await refundAudit(env.DB),...await refundNoticeAudit(env.DB));if(actor!.role==='owner'&&!actor!.agent&&!actor!.deviceId)state.audit.push(...await feeAudit(env.DB,actor!));const rows=auditRows(filterMergeAudit(filterNotes(state,actor!),actor!),url.searchParams)
   if(path.endsWith('.csv')){
    person(actor!,true)
    return new Response(businessCsv({...state,audit:rows},[],'audit'),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="placemat-audit.csv"'}})
   }
   return json({rows,names:await actorNames(env.DB,{...state,audit:rows})})
  }
  if(path==='/api/reports/performance'){
   if(actor!.role!=='lead')person(actor!)
   if(request.method==='GET'){const result=await readPerformance(env.DB,url.searchParams);if(actor!.role==='lead'){delete (result.report as any).closure;result.recovery=null}return json(result)}
   person(actor!)
   if(request.method==='POST')return json(await publishPerformance(env.DB,actor!,await jsonBody(request)),201)
   return json({error:'Method not allowed'},405)
  }
  if(path.startsWith('/api/reports/')&&request.method==='GET'){
   if(actor!.role!=='lead')person(actor!);const {state}=await load(env.DB),report=reservationReport(state,url.searchParams)
   if(path.endsWith('.csv'))return new Response(reportCsv(report),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="placemat-reservations.csv"'}})
   return json(report)
  }
  if(path.startsWith('/api/guests/')&&request.method==='GET'){
   person(actor!)
   if(path==='/api/guests/merges')return json({merges:await readMergeJournal(env.DB,text(url.searchParams.get('guestId'),'Guest'))})
   const {state}=await load(env.DB)
   if(path==='/api/guests/merge-preview')return json(await mergeReview(env.DB,state,text(url.searchParams.get('guestId'),'Guest'),text(url.searchParams.get('duplicateId'),'Duplicate')))
   return json(await unmergeReview(env.DB,state,text(url.searchParams.get('mergeId'),'Merge')))
  }
  if(path==='/api/guests'&&request.method==='GET'){
   const people=await guests(env.DB),review=url.searchParams.get('review')
   if(review!==null)return json({review:duplicateReview(people,(await load(env.DB)).state,review)})
   return json({guests:searchGuests(people,url.searchParams.get('search')??'')})
  }
  if(path==='/api/queue-qr'&&request.method==='GET'){
   const {state}=await load(env.DB),service=state.services.find(s=>s.id===url.searchParams.get('serviceId'))??fail(404,'Service not found.')
   return new Response(queueQr(env.AUTH_ORIGIN,service.id),{headers:{...headers,'content-type':'image/svg+xml'}})
  }
  if(path==='/api/sections'&&request.method==='GET'){const {state}=await load(env.DB);return json(sectionsDashboard(state,url.searchParams))}
  if(path==='/api/timeline'&&request.method==='GET'){
   const {state}=await load(env.DB)
   const result=timeline(state,await guests(env.DB),url.searchParams),alerts=!actor!.agent&&['host','owner','admin'].includes(actor!.role)?await paymentAlerts(env.DB):[]
   return json({...result,rows:result.rows.map(row=>({...row,paymentRequests:alerts.filter(r=>r.bookingId===row.id)}))})
  }
  if(path==='/api/floor-version'&&request.method==='GET'){
   const {version}=await load(env.DB);return json({version})
  }
  if(path==='/api/state'&&request.method==='GET'){
   const {state,version}=await load(env.DB)
   const keys=actor!.role==='owner'?(await env.DB.prepare('SELECT id,name,created_at,revoked_at FROM pm_agent_keys ORDER BY created_at DESC').all()).results:[]
   const people=await guests(env.DB)
   const analytics=actor!.role==='owner'?{keys:[...await savedKeys(env.DB)],results:(await env.DB.prepare('SELECT provider,event,status,detail,at FROM pm_analytics_results ORDER BY provider').all()).results}:undefined
   const handoverPeople=await handoverAssignees(env.DB,state),paymentRequests=!actor!.agent&&['host','owner','admin'].includes(actor!.role)?await paymentAlerts(env.DB):[],refundCharges=!actor!.agent&&['owner','admin'].includes(actor!.role)?(await env.DB.prepare('SELECT charge_id AS chargeId,booking_id AS bookingId,amount_cents AS amountCents,imported_refunded_cents AS importedRefundedCents FROM pm_refund_charges').all()).results:[],refunds=!actor!.agent&&['owner','admin'].includes(actor!.role)?(await env.DB.prepare('SELECT id,request_id AS requestId,actor_id AS actorId,booking_id AS bookingId,charge_id AS chargeId,amount_cents AS amountCents,reason,status,processor_id AS processorId,created_at AS createdAt FROM pm_refunds').all()).results:[]
   const bookingContacts=!actor!.agent?Object.fromEntries((await env.DB.prepare('SELECT booking_id,data FROM pm_booking_contacts').all<{booking_id:string;data:string}>()).results.map(row=>[row.booking_id,JSON.parse(row.data)])):{}
   return json({merchantWork:actor!.role==='owner'&&!actor!.agent&&!actor!.deviceId?await readMerchant(env.DB,actor!):undefined,queueOrder:queueOrder(state),feeWork:actor!.role==='owner'&&!actor!.agent&&!actor!.deviceId?await readFees(env.DB,actor!):undefined,refundFollowups:!actor!.agent&&!actor!.deviceId&&['owner','admin'].includes(actor!.role)?await refundFollowups(env.DB):[],refundNotices:actor!.role==='owner'?await refundNotices(env.DB):[],bookingContacts,handoverPeople,paymentRequests,refundCharges,refunds,state:filterMergeAudit(filterNotes(state,actor!),actor!),version,guests:people,actor,keys,groupAdmin:!actor!.agent&&await isGroupAdmin(env.DB,actor!.id),...(actor!.role==='owner'?{businessExportKinds,analytics}:{}),serviceStages:Object.fromEntries(state.bookings.map(b=>[b.id,floorStage(state,b,new Date().toISOString())])),names:await actorNames(env.DB,state,people)})
  }
  if(path==='/api/pacing'&&request.method==='GET'){const {state}=await load(env.DB);return json(pacingReport(state,url.searchParams.get('serviceId')??'',new Date().toISOString()))}
  if(path==='/api/pacing/preview'&&request.method==='POST'){
   const {state,version}=await load(env.DB),p=await jsonBody(request),now=new Date().toISOString()
   const preview=seatingPreview(state,actor!,p.command,p.payload,now)
   return json({violations:preview.violations,version,review:await issuePacingReview(env.SESSION_SECRET,actor!,p.command,p.payload,version,now)})
  }
  if(path==='/api/commands'&&request.method==='POST'){
   const p=await jsonBody(request)
   if(p.command==='payment.merchant-connect')return json({result:await connectMerchant(env,actor!,p.payload??{})})
   if(p.command==='payment.merchant-disconnect')return json({result:await disconnectMerchant(env,actor!)})
   if(p.command==='payment.guarantee-issue')return json({result:await issueGuarantee(env,actor!,p.payload??{})})
   if(p.command==='payment.guarantee-end')return json({result:await endGuarantee(env.DB,actor!,p.payload??{})})
   if(p.command==='payment.guarantee-sync')return json({result:await syncMerchantCard(env,actor!,{requestId:p.payload?.id})})
   if(p.command==='booking.management.send')return json({result:await sendManagement(env,actor!,p.payload??{})})
   if(p.command==='payment.close')return json({result:await closePaymentRequest(env,actor!,p.payload?.requestId)})
   if(p.command==='payment.request')return json({result:await createPaymentRequest(env.DB,actor!,p.payload??{})})
   if(p.command==='payment.link')return json({result:await issuePaymentLink(env,actor!,p.payload?.requestId)})
   if(p.command==='payment.sync')return json({result:await syncPaymentRequest(env,actor!,p.payload?.requestId)})
   if(p.command==='payment.charge-sync')return json({result:await synchronizeRefundCharge(env.DB,actor!,p.payload??{},env.STRIPE_SECRET_KEY)})
   if(p.command==='payment.fee-expiry')return json({result:await endFeeAuthorization(env.DB,actor!,p.payload??{})})
   if(p.command==='payment.fee-recollection')return json({result:await requestFeeRecollection(env.DB,actor!,p.payload??{})})
   if(p.command==='payment.fee-policy')return json({result:await createFeePolicy(env.DB,actor!,p.payload??{})})
   if(p.command==='payment.fee-consent')return json({result:await recordFeeConsent(env,actor!,p.payload??{})})
   if(p.command==='payment.fee-preview')return json({result:await previewFee(env.DB,actor!,p.payload??{})})
   if(p.command==='payment.fee')return json({result:await assessFee(env,actor!,p.payload??{})})
   if(p.command==='payment.refund-notice')return json({result:await sendRefundNotice(env,actor!,p.payload??{})})
   if(p.command==='payment.refund')return json({result:await executeRefund(env.DB,actor!,p.payload??{},env.STRIPE_SECRET_KEY)})
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
  if(error instanceof Error&&(error.message.includes('pm_assertions')||error.message.includes('IMPORT_ATOMIC_GUARD')))return json({error:'The guest changed or was erased. Reload before saving again.'},409)
  console.error('Placemat request failed',error instanceof Error?error.name:'unknown')
  return json({error:'The request could not finish. Reload the current floor and try again.'},500)
 }
}

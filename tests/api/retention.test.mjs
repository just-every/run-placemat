import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {retentionFixture,retentionTick,marketingMessages,linkToken} from './retention-fixture.mjs'
const pub=(h,action,p,status)=>h.api('/api/public/retention/'+action,p,{as:'',...(status?{status}:{})})
async function futureService(h,days=1){
 const startAt=new Date(h.now()+days*86400000).toISOString(),endAt=new Date(Date.parse(startAt)+4*3600000).toISOString()
 const s=await h.command('service.save',{name:'Return dinner',startAt,endAt,turnMinutes:90,coverLimit:30})
 const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Published return visit service'})
 await h.command('proposal.approve',{proposalId:p.id});return s
}
const localDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',month:'2-digit',day:'2-digit'}).format(new Date(at)).replace('/', '-')

test('Retention owner approves exact audiences and six triggers deliver only due invitations, cap quiet hours and attribute real repeat visits',async()=>{
 const f=await retentionFixture(),{h}=f
 try{
  const postVisit=await f.draft('first-to-second'),firstId=await f.approve(postVisit)
  assert.equal(postVisit.preview.recipients.length,3)
  assert.equal(postVisit.preview.offer,f.config('first-to-second').offer)
  await retentionTick(h);assert.equal(marketingMessages(h).length,0,'An approval does not complete a visit')
  await f.complete(f.bookings[0]);await f.complete(f.bookings[1]);await h.command('booking.status',{bookingId:f.bookings[2].id,status:'cancelled'})
  // The venue-local quiet window delays otherwise due messages.
  await retentionTick(h,Date.parse(f.service.endAt)+3600000)
  assert.equal(marketingMessages(h).length,0)
  await retentionTick(h,f.tickAt)
  const sent=marketingMessages(h)
  assert.equal(sent.length,2);assert.deepEqual(new Set(sent.map(m=>m.to[0])),new Set(f.guests.filter(g=>f.bookings.slice(0,2).some(b=>b.guestId===g.id)).map(g=>g.email)))
  assert.ok(sent.every(m=>m.text.includes(postVisit.preview.offer)))
  await retentionTick(h);assert.equal(marketingMessages(h).length,2)
  const firstGuest=f.guests.find(g=>g.id===f.bookings[0].guestId),message=sent.find(m=>m.to[0]===firstGuest.email),token=linkToken(message)
  const offer=await pub(h,'status',{token});assert.equal(offer.offer,postVisit.preview.offer);assert.equal(new URL(offer.bookingUrl).searchParams.has('retention'),false);assert.equal(new URL(offer.bookingUrl).hash,'#campaign='+token)
  const s=await futureService(h),repeat=(await h.api('/api/public/book',publicGuest(s,0,{name:firstGuest.name,email:firstGuest.email}),{as:'',status:201})).result
  await pub(h,'attribution',{token,bookingId:f.bookings[1].id},409)
  await pub(h,'attribution',{token,bookingId:repeat.id});await pub(h,'attribution',{token,bookingId:repeat.id})
  await f.complete(repeat);await retentionTick(h,Date.parse(s.endAt)+20*3600000)
  const view=await h.api('/api/retention');assert.equal(view.attributions.length,1);assert.equal(view.attributions[0].repeatCompleted,true)
  assert.equal(view.deliveries.filter(d=>d.workflowId===firstId).length,2,'Second visit and cancelled third cannot become another first visit')
  await h.api('/api/retention/stop',{workflowId:firstId})
  let count=marketingMessages(h).length
  const welcome=await f.approve(await f.draft('welcome'));await retentionTick(h);assert.equal(marketingMessages(h).length,count+3)
  await h.api('/api/retention/stop',{workflowId:welcome});count+=3
  for(const trigger of ['birthday','anniversary']){
   const next=h.now()+86400000
   await h.api('/api/retention/facts',{guestId:firstGuest.id,[trigger]:localDay(next)})
   const workflow=await f.approve(await f.draft(trigger))
   await retentionTick(h);assert.equal(marketingMessages(h).length,count,'Wrong date and cross-workflow frequency cap suppress email')
   await retentionTick(h,next);assert.equal(marketingMessages(h).length,++count)
   await h.api('/api/retention/stop',{workflowId:workflow})
  }
  const lapsed=await f.approve(await f.draft('lapsed'));await retentionTick(h,h.now()+86400000);assert.equal(marketingMessages(h).length,count+2);count+=2
  await h.api('/api/retention/stop',{workflowId:lapsed})
  await h.command('table.save',{...f.floor[4],area:'Dining room'})
  const eventService=await futureService(h,30),draft=await h.command('experience.save',{name:'Orchard supper',kind:'free',amountCents:0,currency:'USD',menu:'Seasonal orchard menu',image:'',serviceIds:[eventService.id],areas:['Dining room'],ticketClasses:[{name:'Supper',quantityLimit:20}],cancellationRules:'Contact the venue before service.',turnMinutes:90,cleanupMinutes:0,lastSeatingAt:{[eventService.id]:new Date(Date.parse(eventService.startAt)+2*3600000).toISOString()}})
  await h.command('experience.publish',{id:draft.id,version:draft.version,confirm:true})
  const invitation=await f.approve(await f.draft('experience',{experienceId:draft.id}))
  await retentionTick(h);assert.equal(marketingMessages(h).length,count+1,'The guest without a recent campaign may receive the experience; capped guests wait')
  count++
  await retentionTick(h,h.now()+86400000);assert.equal(marketingMessages(h).length,count+2);count+=2
  await h.api('/api/retention/stop',{workflowId:invitation});await retentionTick(h,h.now()+86400000);assert.equal(marketingMessages(h).length,count)
  assert.equal(new Set((await h.api('/api/retention')).workflows.map(w=>w.trigger)).size,6)
 }finally{await h.close()}
})

test('Retention refuses missing authority and stale consent, stops queued recipients, and portable history cannot restore sending or erased identity',async()=>{
 const f=await retentionFixture(),{h}=f
 try{
  const manager=await h.signIn(['retention-manager','example.test'].join('@'),'admin'),member=await h.signIn(['retention-reader','example.test'].join('@'))
  for(const as of [manager,member]){await h.api('/api/retention',undefined,{as,status:403});await h.api('/api/retention/grant',{enabled:true},{as,status:403});await h.api('/api/retention/approve',{workflowId:'denied',previewHash:'denied'},{as,status:403})}
  await h.api('/api/retention',undefined,{as:'',status:401})
  const draft=await f.draft('welcome');await h.api('/api/retention/approve',{workflowId:draft.preview.workflowId,previewHash:'synthetic-placemat-wrong'},{status:409})
  await h.api('/api/retention/grant',{enabled:false});await h.api('/api/retention/approve',{workflowId:draft.preview.workflowId,previewHash:draft.preview.previewHash},{status:409})
  await h.api('/api/retention/grant',{enabled:true})
  const fresh=await h.api('/api/retention/preview',{workflowId:draft.preview.workflowId});await pub(h,'unsubscribe',{token:f.unsubscribeTokens[2]})
  await h.api('/api/retention/approve',{workflowId:fresh.preview.workflowId,previewHash:fresh.preview.previewHash},{status:409})
  const current=await h.api('/api/retention/preview',{workflowId:draft.preview.workflowId});assert.equal(current.preview.recipients.length,2);await f.approve(current)
  await retentionTick(h,f.tickAt);assert.equal(marketingMessages(h).length,2)
  const token=linkToken(marketingMessages(h)[0]),subject=(await h.api('/api/retention')).guests.find(g=>g.email===marketingMessages(h)[0].to[0])
  const access=await h.api('/api/privacy/access',{guestId:subject.id});assert.ok(access.retention);assert.ok(!JSON.stringify(access).includes(token))
  const archive=await h.api('/api/backup'),copy=await installation()
  try{
   assert.ok(!JSON.stringify(archive).includes(token));await copy.api('/api/restore',{archive,confirm:'RESTORE'})
   const restored=await copy.api('/api/retention');assert.equal(restored.granted,false);assert.ok(restored.workflows.every(w=>w.status==='stopped'))
   await copy.api('/api/public/retention/status',{token},{as:'',status:404})
   await(await copy.mf.getWorker()).scheduled({scheduledTime:new Date(f.tickAt+86400000),cron:'17 * * * *'});assert.equal(copy.messages.length,0)
   const csv=await h.request('/api/business-export/retention-deliveries.csv');assert.equal(csv.status,200);assert.ok((await csv.text()).includes('accepted'))
  }finally{await copy.close()}
  const count=marketingMessages(h).length
  await pub(h,'unsubscribe',{token});await pub(h,'status',{token},404);await retentionTick(h,h.now()+86400000);assert.equal(marketingMessages(h).length,count)
  const remaining=(await h.api('/api/retention')).guests.find(g=>g.consent),pending=await f.draft('birthday')
  await h.api('/api/retention/facts',{guestId:remaining.id,birthday:localDay(h.now()+86400000)})
  const pendingFresh=await h.api('/api/retention/preview',{workflowId:pending.preview.workflowId});await f.approve(pendingFresh)
  const owner=(await h.api('/auth/operators')).find(o=>o.role==='owner')
  await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'owner','active',?)").bind('synthetic-placemat-reserve-owner',['reserve-owner','example.test'].join('@'),'Reserve owner',h.now()).run()
  h.autoRenew=false
  await h.db.prepare("UPDATE oa_operators SET status='inactive' WHERE id=?").bind(owner.id).run();await retentionTick(h,h.now()+86400000)
  await h.db.prepare("UPDATE oa_operators SET status='active' WHERE id=?").bind(owner.id).run();await retentionTick(h,h.now()+86400000)
  await h.renewOwner()
  assert.equal(marketingMessages(h).length,count);assert.equal((await h.api('/api/retention')).granted,false)
  const rules=Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:365,ground:'Recorded service and accounting purpose'}]))
  await h.api('/api/privacy/policy',{version:0,rules})
  const erased=await h.api('/api/privacy/erase',{guestId:subject.id,confirm:'ERASE'});assert.ok(erased.processorTasks>=1)
  assert.ok(!(await h.api('/api/retention')).guests.some(g=>g.id===subject.id));await pub(h,'status',{token},404)
  const later=await h.api('/api/backup');assert.ok(!JSON.stringify(later).includes(subject.email))
  const empty=await installation();try{await empty.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})}finally{await empty.close()}
 }finally{await h.close()}
})

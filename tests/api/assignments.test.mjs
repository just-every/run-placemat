import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

async function outageFixture(h){
 const tables=[]
 for(const [label,tags] of [['Outage A',['step-free']],['Outage B',['step-free']],['Stairs',[]]])tables.push(await h.command('table.save',{label,seats:4,area:'Dining room',accessTags:tags,x:20+tables.length*25,y:30}))
 const day=new Date(Date.now()+86400000).toISOString().slice(0,10)
 const service=await h.command('service.save',{name:'Outage dinner',startAt:day+'T17:00:00Z',endAt:day+'T23:00:00Z',turnMinutes:90,coverLimit:40})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Reviewed outage fixture'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 const server=await h.command('server.save',{serviceId:service.id,name:'Outage server',coverCap:20})
 await h.command('section.save',{serviceId:service.id,name:'Outage section',serverId:server.id,tableIds:tables.map(t=>t.id)})
 return {tables,service,server}
}

test('Outage preparation requires personal-owner consent and returns only an expiring anonymous service snapshot',async()=>{
 const h=await installation();try{
  const {tables,service}=await outageFixture(h)
  await h.api('/api/public/book',publicGuest(service,0,{name:'synthetic-placemat-101',email:'private-outage@example.test',requiredAccessTags:['step-free']}),{as:'',status:201})
  const member=await h.signIn('outage-reader@example.test'),manager=await h.signIn('outage-manager@example.test','admin'),host=await h.signIn('outage-host@example.test')
  const hostId=(await h.api('/auth/operators')).find(p=>p.email==='outage-host@example.test').id;await h.command('team.host',{operatorId:hostId,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Outage cannot use preparation keys'})).result
  const payload={serviceId:service.id,consent:'SAVE ANONYMOUS SHEET'}
  await h.command('outage.sheet',payload,{as:'',status:401})
  for(const as of [member,manager,host])await h.command('outage.sheet',payload,{as,status:403})
  await h.command('outage.sheet',payload,{as:'',headers:{authorization:'Bearer '+key.key},status:403})
  await h.command('outage.sheet',{serviceId:service.id},{status:400})
  const before=await h.api('/api/state'),sheet=await h.command('outage.sheet',payload),after=await h.api('/api/state')
  assert.equal(sheet.version,after.version);assert.ok(Date.parse(sheet.expiresAt)>Date.parse(sheet.generatedAt));assert.ok(Date.parse(sheet.expiresAt)-Date.parse(sheet.generatedAt)<=12*3600000)
  assert.equal(sheet.tables.length,3);assert.equal(sheet.bookings.length,1);assert.deepEqual(sheet.bookings[0].tableIds,[tables[0].id])
  for(const value of ['synthetic-placemat-101','private-outage@example.test','guestId','requiredAccessTags','notes','requests','serverName'])assert.ok(!JSON.stringify(sheet).includes(value),value)
  assert.deepEqual(after.state.bookings,before.state.bookings);assert.deepEqual(after.guests,before.guests);assert.deepEqual(after.state.services,before.state.services);assert.deepEqual(after.state.proposals,before.state.proposals)
  const consent=after.state.audit.find(e=>e.action==='outage.consent');assert.equal(consent.actor,after.actor.id);assert.equal(consent.subject,sheet.id);assert.ok(consent.at)
 }finally{await h.close()}
})

test('Outage reconnect reviews sold-table conflicts, binds exact live fit and commits a pending walk-in once',async()=>{
 const h=await installation();try{
  const {tables,service,server}=await outageFixture(h),pending={actionId:crypto.randomUUID(),serviceId:service.id,partySize:4,startAt:service.startAt,capturedAt:new Date().toISOString(),tableIds:[tables[0].id],requiredAccessTags:['step-free']}
  const path='/api/outage/review',before=await h.api('/api/state')
  const initial=await h.api(path,pending);assert.equal(initial.conflict,'');assert.ok(initial.alternatives.some(a=>a.payload.tableIds[0]===tables[0].id));assert.ok(!initial.alternatives.some(a=>a.payload.tableIds.includes(tables[2].id)))
  assert.equal((await h.api('/api/state')).version,before.version,'Review never writes')
  await h.command('booking.outage',pending,{status:409})
  const admin=await h.signIn('outage-reviewer@example.test','admin')
  await h.api(path,pending,{as:'',status:401});await h.api(path,pending,{as:admin,status:403});await h.api(path,pending,{headers:{origin:'https://other.example.test'},status:403})
  const sold=(await h.api('/api/public/book',publicGuest(service,0,{partySize:4,tableIds:[tables[0].id]}),{as:'',status:201})).result
  const old=initial.alternatives[0],commit=(review,alternative=review.alternatives[0])=>({...alternative.payload,version:review.version,review:alternative.review,confirm:'SEAT REVIEWED WALK-IN'})
  await h.command('booking.outage',commit(initial,old),{status:409})
  const review=await h.api(path,pending);assert.ok(review.conflict);assert.equal(review.alternatives.length,1);assert.deepEqual(review.alternatives[0].payload.tableIds,[tables[1].id]);assert.ok(review.alternatives[0].review)
  await h.command('booking.outage',{...commit(review),confirm:''},{status:409})
  await h.command('booking.outage',{...commit(review),partySize:2},{status:409})
  await h.command('booking.outage',{...commit(review),tableIds:[tables[0].id]},{status:409})
  await h.command('booking.outage',{...commit(review),review:review.alternatives[0].review.replace(/^\d+/,String(Date.now()-1))},{status:409})
  // A staffing edit is a new floor version; an earlier review cannot silently pass it.
  await h.command('server.break',{serviceId:service.id,serverId:server.id,onBreak:true,reason:'Recorded break during outage'})
  await h.command('booking.outage',commit(review),{status:409})
  assert.equal((await h.api(path,pending)).alternatives.length,0,'A server break prevents outage seating')
  await h.command('server.break',{serviceId:service.id,serverId:server.id,onBreak:false,reason:'Returned for reconciliation'})
  const current=await h.api(path,pending),payload=commit(current)
  const responses=await Promise.all([h.request('/api/commands',{method:'POST',body:{command:'booking.outage',payload}}),h.request('/api/commands',{method:'POST',body:{command:'booking.outage',payload}})])
  assert.ok(responses.some(r=>r.status===200));for(const response of responses)assert.ok([200,409].includes(response.status))
  const state=await h.api('/api/state'),created=state.state.bookings.find(b=>b.id!==sold.id)
  assert.equal(state.state.bookings.length,2);assert.deepEqual(created.tableIds,[tables[1].id]);assert.deepEqual(state.state.bookings.find(b=>b.id===sold.id).tableIds,[tables[0].id]);assert.equal(created.status,'seated');assert.deepEqual(created.requiredAccessTags,['step-free'])
  const audit=state.state.audit.filter(e=>e.action==='booking.outage');assert.equal(audit.length,1);assert.equal(audit[0].id,pending.actionId);assert.equal(audit[0].actor,state.actor.id);assert.equal(audit[0].subject,created.id)
  assert.equal((await h.api(path,pending)).applied.id,created.id,'Review recovers a lost commit response even when every fitting table is sold')
  const replay=await h.command('booking.outage',payload);assert.equal(replay.id,created.id);assert.equal(replay.replayed,true);assert.equal((await h.api('/api/state')).version,state.version)
  await h.command('guest.erase',{guestId:created.guestId,confirm:'ERASE'});assert.equal((await h.command('booking.outage',payload)).id,created.id);assert.equal((await h.api('/api/state')).state.bookings.length,2,'Erasure never enables duplicate replay')
 }finally{await h.close()}
})

test('FLOOR-009: native host makes atomic versioned moves, swaps and locks; live fit, access, clashes, audit and preparation-only keys hold',async()=>{
 const h=await installation();try{
  const tables=[]
  for(const [label,seats,area,accessTags] of [['Window 4',4,'Dining',['step-free']],['Dining 4',4,'Dining',['step-free']],['Terrace 4',4,'Terrace',[]],['Small 2',2,'Dining',[]]])tables.push(await h.command('table.save',{label,seats,area,accessTags,x:20+tables.length*20,y:30}))
  const day=new Date(Date.now()+86400000).toISOString().slice(0,10)
  const service=await h.command('service.save',{name:'Dinner',startAt:day+'T17:00:00Z',endAt:day+'T23:00:00Z',turnMinutes:90,coverLimit:80})
  const publish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Ready for dinner'})
  await h.command('proposal.approve',{proposalId:publish.id})
  const online=async(i,startAt=service.startAt)=>(await h.api('/api/public/book',publicGuest(service,i,{partySize:4,startAt,...(i===0?{requiredAccessTags:['step-free']}:{})}),{as:'',status:201})).result
  const a=await online(0),b=await online(1),c=await online(2)
  const hostCookie=await h.signIn('host@example.test'),reader=await h.signIn('reader@example.test')
  const host=(await h.api('/auth/operators')).find(p=>p.email==='host@example.test')
  await h.command('team.host',{operatorId:host.id,enabled:true})
  assert.equal((await h.api('/api/state',undefined,{as:hostCookie})).actor.role,'host')
  const current=async()=>h.api('/api/state')
  const act=async(command,payload,opts={})=>h.command(command,{...payload,version:(await current()).version},{as:hostCookie,...opts})
  await act('booking.move',{bookingId:a.id,tableIds:[tables[0].id]},{as:reader,status:403})
  await h.command('venue.update',{name:'Forbidden',timezone:'America/New_York'},{as:hostCookie,status:403})
  await h.api('/api/backup',undefined,{as:hostCookie,status:403})
  await h.command('proposal.approve',{proposalId:publish.id},{as:hostCookie,status:403})
  await h.command('booking.stage',{bookingId:a.id,stage:'arrived'},{as:hostCookie})
  await h.command('booking.stage',{bookingId:a.id,stage:'seated'},{as:hostCookie})
  // Free the second table while keeping another occupied and a future clash.
  await h.command('booking.stage',{bookingId:b.id,stage:'cancelled'})
  const before=(await current()).state.bookings.find(v=>v.id===a.id).tableIds
  const moved=await act('booking.move',{bookingId:a.id,tableIds:[tables[1].id],reason:'Guest prefers the dining room'})
  assert.deepEqual(moved.booking.tableIds,[tables[1].id])
  const movedState=await current(),moveRows=movedState.state.audit.filter(v=>v.action==='booking.move')
  assert.equal(moveRows.length,1);assert.equal(moveRows[0].actor,host.id);assert.ok(moveRows[0].at);assert.deepEqual(moveRows[0].before[0].tableIds,before);assert.deepEqual(moveRows[0].after[0].tableIds,[tables[1].id]);assert.ok(moveRows[0].reason.includes('prefers'))
  await h.command('booking.move',{bookingId:a.id,tableIds:[tables[0].id],version:movedState.version-1},{as:hostCookie,status:409})
  await h.command('booking.stage',{bookingId:c.id,stage:'seated'},{as:hostCookie})
  await act('booking.move',{bookingId:a.id,tableIds:[tables[2].id]},{status:409})
  const accessRefusal=await h.api('/api/commands',{command:'booking.move',payload:{bookingId:a.id,tableIds:[tables[2].id],version:(await current()).version}},{as:hostCookie,status:409});assert.match(accessRefusal.error,/access needs/)
  await h.command('booking.stage',{bookingId:c.id,stage:'completed'},{as:hostCookie});await h.command('booking.stage',{bookingId:c.id,stage:'ready'},{as:hostCookie})
  await act('booking.move',{bookingId:a.id,tableIds:[tables[3].id]},{status:409})
  await act('booking.move',{bookingId:a.id,tableIds:[tables[0].id,tables[2].id]},{status:409})
  const next=await online(3,new Date(Date.parse(service.startAt)+90*60000).toISOString())
  const later=await online(4,new Date(Date.parse(service.startAt)+90*60000).toISOString())
  await act('booking.move',{bookingId:later.id,tableIds:[tables[0].id]},{status:409})
  const nextBefore=(await current()).state.bookings.find(v=>v.id===next.id).tableIds
  const laterBefore=(await current()).state.bookings.find(v=>v.id===later.id).tableIds
  await act('booking.swap',{bookingId:next.id,otherBookingId:later.id,reason:'Balance arrivals'})
  const swapped=await current()
  assert.deepEqual(swapped.state.bookings.find(v=>v.id===next.id).tableIds,laterBefore)
  assert.deepEqual(swapped.state.bookings.find(v=>v.id===later.id).tableIds,nextBefore)
  const swapAudit=swapped.state.audit.filter(v=>v.action==='booking.swap');assert.equal(swapAudit.length,1);assert.equal(swapAudit[0].before.length,2);assert.equal(swapAudit[0].after.length,2)
  await act('booking.lock',{bookingId:next.id,locked:true,reason:'Keep this family together'})
  const locked=await current(),lockTables=locked.state.bookings.find(v=>v.id===next.id).tableIds
  assert.equal(locked.state.bookings.find(v=>v.id===next.id).assignmentLocked,true)
  assert.equal(locked.state.audit.filter(v=>v.action==='booking.lock').length,1)
  assert.deepEqual((await current()).state.bookings.find(v=>v.id===next.id).tableIds,lockTables)
  const key=(await h.api('/api/agent-keys',{name:'Table planner'},{status:201})).result
  const auth={as:'',headers:{authorization:'Bearer '+key.key}}
  await h.command('booking.move',{bookingId:later.id,tableIds:[tables[0].id],version:(await current()).version},{...auth,status:403})
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:next.id,tableIds:[tables[2].id]},reason:'Locked must refuse'},{...auth,status:409})
  const prepared=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:later.id,tableIds:[tables[2].id]},reason:'Human reviews this exact move'},auth)
  await h.command('proposal.approve',{proposalId:prepared.id},{...auth,status:403})
  assert.equal(prepared.status,'pending')
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:later.id,tableIds:[tables[2].id]},reason:'Humans move directly'},{status:403})
  await online(5,new Date(Date.parse(service.startAt)+90*60000).toISOString())
  assert.deepEqual((await current()).state.bookings.find(v=>v.id===next.id).tableIds,lockTables)
  const guestId=(await current()).state.bookings.find(v=>v.id===a.id).guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  const erased=await current();assert.deepEqual(erased.state.bookings.find(v=>v.id===a.id).requiredAccessTags,[]);assert.equal(erased.state.audit.find(v=>v.action==='booking.move').reason,'')
  await h.command('team.host',{operatorId:host.id,enabled:false})
  await act('booking.lock',{bookingId:later.id,locked:true},{status:403})
 }finally{await h.close()}
})

// AGENT-004 keeps the complete destination ledger and exact review behind the normal command door.
test('AGENT-004: demand-aware alternatives free stranded capacity, preserve promises, require a person and refuse stale approval',async()=>{
 const {allocationService}=await import('./allocation-fixture.mjs')
 const h=await installation();try{
  const {service,tables,reservation,waiting,before,server}=await allocationService(h)
  const manager=await h.signIn('allocation-manager@example.test','admin'),reader=await h.signIn('allocation-reader@example.test'),hostCookie=await h.signIn('allocation-host@example.test')
  const host=(await h.api('/auth/operators')).find(p=>p.email==='allocation-host@example.test')
  await h.command('team.host',{operatorId:host.id,enabled:true});await h.command('team.pacing',{operatorId:host.id,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Seating adviser'})).result
  const agent={as:'',headers:{authorization:'Bearer '+key.key}},path='/api/allocation-advice?serviceId='+service.id
  await h.api(path,undefined,{as:'',status:401})
  for(const as of [reader,hostCookie])await h.api(path,undefined,{as,status:403})
  const report=await h.api(path,undefined,agent)
  assert.equal(report.alternatives.length,2,'Two independent accessible destinations improve the same recorded demand')
  assert.equal(report.before.requestedSlotCovers,0)
  assert.equal(report.current.seatedCovers,0)
  for(const alternative of report.alternatives){
   assert.equal(alternative.moves.length,1);assert.equal(alternative.moves[0].bookingId,reservation.id)
   assert.ok([tables[1].id,tables[2].id].includes(alternative.moves[0].tableIds[0]))
   assert.equal(alternative.after.requestedSlotCovers,waiting.partySize)
   assert.equal(alternative.preview.affectedBookings[0].original.startAt,before.startAt)
   assert.deepEqual(alternative.preview.affectedBookings[0].original.requiredAccessTags,before.requiredAccessTags)
   assert.ok(alternative.preview.explanations.length)
   assert.equal(alternative.preview.waits[0].after.earliestAt,service.startAt)
  }
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===reservation.id),before,'Advice never mutates the reservation')
  const prepare=(alternative,opts=agent)=>h.command('proposal.prepare',{kind:'allocation.improve',plan:{serviceId:service.id,alternativeId:alternative.id},reason:'Keep AveryAccessPrivate-R12 step-free and free the large table for recorded demand'},opts)
  const stale=await prepare(report.alternatives[0]),approved=await prepare(report.alternatives[1])
  await h.command('proposal.approve',{proposalId:approved.id},{...agent,status:403})
  for(const as of [reader,hostCookie])await h.command('proposal.approve',{proposalId:approved.id},{as,status:403})
  await h.command('proposal.approve',{proposalId:approved.id},{headers:{origin:'https://other.example.test'},status:403})
  const accepted=await h.command('proposal.approve',{proposalId:approved.id},{as:manager})
  assert.equal(accepted.status,'approved');assert.ok(accepted.approvedBy);assert.ok(accepted.approvedAt)
  let state=(await h.api('/api/state')).state,booking=state.bookings.find(b=>b.id===reservation.id)
  assert.deepEqual(booking.tableIds,approved.plan.moves[0].tableIds)
  for(const k of ['startAt','endAt','cleanupEndAt','partySize','requiredArea','requiredAccessTags','guestId'])assert.deepEqual(booking[k],before[k])
  const audit=state.audit.find(e=>e.action==='allocation.improve')
  assert.deepEqual(audit.before[0].tableIds,before.tableIds);assert.deepEqual(audit.after[0].tableIds,booking.tableIds);assert.equal(audit.actor,accepted.approvedBy)
  const seated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:service.startAt,tableIds:[tables[0].id]},{as:hostCookie})
  assert.deepEqual(seated.tableIds,[tables[0].id]);assert.deepEqual(seated.requiredAccessTags,['step-free'])
  const changed=(await h.api('/api/state')).state
  await h.command('proposal.approve',{proposalId:stale.id},{as:manager,status:409})
  assert.deepEqual((await h.api('/api/state')).state,changed,'Stale refusal cannot partially apply a multi-party plan')
  const actual=await h.api(path);assert.equal(actual.current.seatedCovers,waiting.partySize);assert.equal(actual.current.bookedCovers,before.partySize)
  assert.equal(actual.alternatives.length,0,'No fabricated demand after the recorded party is seated')
  assert.equal(h.messages.length,3,'No advisor send crossed the network edge')
  // Captured constraints and free text follow existing guest erasure in every retained exact plan.
  await h.command('guest.erase',{guestId:before.guestId,confirm:'ERASE'})
  const erased=(await h.api('/api/state')).state
  assert.ok(!JSON.stringify(erased).includes('AveryAccessPrivate-R12'))
  for(const proposal of erased.proposals.filter(p=>p.kind==='allocation.improve')){
   assert.deepEqual(proposal.plan.inputs.bookings.find(b=>b.id===before.id).requiredAccessTags,[])
   assert.deepEqual(proposal.plan.preview.affectedBookings.find(b=>b.bookingId===before.id).original.requiredAccessTags,[])
  }
 }finally{await h.close()}
})

test('AGENT-004: generated advice honors locks, staffed capacity, kitchen pacing, promised turns and exact approved joins',async()=>{
 const {allocationService}=await import('./allocation-fixture.mjs')
 const h=await installation();try{
  const {service,tables,reservation,server}=await allocationService(h)
  const advice=()=>h.api('/api/allocation-advice?serviceId='+service.id)
  const lock=async locked=>h.command('booking.lock',{bookingId:reservation.id,locked,version:(await h.api('/api/state')).version})
  await lock(true);assert.equal((await advice()).alternatives.length,0);await lock(false)
  await h.command('server.break',{serviceId:service.id,serverId:server.id,onBreak:true,reason:'Staff meal'})
  assert.equal((await advice()).alternatives.length,0);await h.command('server.break',{serviceId:service.id,serverId:server.id,onBreak:false,reason:'Back on shift'})
  await h.command('kitchen.save',{serviceId:service.id,area:'Dining room',coverCap:2});assert.equal((await advice()).alternatives.length,0)
  await h.command('kitchen.save',{serviceId:service.id,area:'Dining room',coverCap:12})
  const pacing={intervalMinutes:30,arrivalCovers:2,arrivalParties:6,concurrentCovers:12,areaArrivalCaps:{'Dining room':12}}
  await h.command('service.pacing',{serviceId:service.id,pacing});assert.equal((await advice()).alternatives.length,0)
  await h.command('service.pacing',{serviceId:service.id,pacing:{...pacing,arrivalCovers:12}})
  assert.equal((await advice()).alternatives.length,2)
  const turn=await h.command('proposal.prepare',{kind:'service.turns',plan:{serviceId:service.id,turnPolicy:{cleanupMinutes:15,partyTurns:[],tableTurns:{[tables[1].id]:120,[tables[2].id]:120},areaTurns:{}}},reason:'Longer turns for future small-table reservations'})
  await h.command('proposal.approve',{proposalId:turn.id});assert.equal((await advice()).alternatives.length,0,'Do not move a committed guest onto a table requiring a longer promised turn')
 }finally{await h.close()}
 const joined=await installation();try{
  const {service,tables,reservation}=await allocationService(joined,{size:4,demand:6,largeSeats:6}),path='/api/allocation-advice?serviceId='+service.id
  assert.equal((await joined.api(path)).alternatives.length,0,'Unapproved pairs are unavailable')
  await joined.command('combination.save',{tableIds:[tables[1].id,tables[2].id],capacity:4,accessTags:['step-free'],setupMinutes:0,enabled:true,adjacent:true})
  const report=await joined.api(path);assert.equal(report.alternatives.length,1)
  assert.deepEqual(new Set(report.alternatives[0].moves[0].tableIds),new Set([tables[1].id,tables[2].id]))
  const proposal=await joined.command('proposal.prepare',{kind:'allocation.improve',plan:{serviceId:service.id,alternativeId:report.alternatives[0].id},reason:'Move the four-top to the exact approved accessible join'})
  await joined.command('proposal.approve',{proposalId:proposal.id})
  const moved=(await joined.api('/api/state')).state.bookings.find(b=>b.id===reservation.id)
  assert.equal(moved.combination.capacity,4);assert.deepEqual(moved.requiredAccessTags,['step-free']);assert.equal(moved.startAt,service.startAt)
 }finally{await joined.close()}
})

test('AGENT-004: protected direct inventory and exact shift extensions require person approval and preserve commitments through public doors',async()=>{
 const {allocationService}=await import('./allocation-fixture.mjs')
 const h=await installation();try{
  const {service,tables,reservation,before}=await allocationService(h)
  const path='/api/allocation-advice?serviceId='+service.id
  const key=(await h.api('/api/agent-keys',{name:'Service adviser'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const manager=await h.signIn('service-manager@example.test','admin'),reader=await h.signIn('service-reader@example.test')
  let report=await h.api(path,undefined,agent)
  const alternative=report.inventory.alternatives.find(a=>a.protection.tableIds[0]===tables[1].id)
  assert.ok(alternative,'An unused accessible small table can be protected without reducing current queue feasibility')
  assert.equal(alternative.before.requestedSlotCovers,alternative.after.requestedSlotCovers)
  assert.ok(alternative.explanations.some(v=>v.includes('No current booking moves')))
  const prepare=async(kind,plan,opts=agent)=>h.command('proposal.prepare',{kind,plan,reason:'Keep direct website capacity and all access promises'},opts)
  const protectedPlan=await prepare('inventory.protect',{serviceId:service.id,alternativeId:alternative.id})
  const staleProtection=await prepare('inventory.protect',{serviceId:service.id,alternativeId:alternative.id})
  assert.deepEqual((await h.api('/api/state')).state.services.find(s=>s.id===service.id).directInventory,undefined)
  for(const opts of [agent,{as:reader}])await h.command('proposal.approve',{proposalId:protectedPlan.id},{...opts,status:403})
  await h.command('proposal.approve',{proposalId:protectedPlan.id},{as:manager})
  let state=(await h.api('/api/state')).state
  const protection=state.services.find(s=>s.id===service.id).directInventory[0]
  assert.deepEqual(protection.tableIds,[tables[1].id]);assert.deepEqual(state.bookings.find(b=>b.id===reservation.id),before)
  const walk={serviceId:service.id,startAt:service.startAt,name:'Casey Green',email:'casey@example.test',partySize:2,tableIds:[tables[1].id]}
  await h.command('booking.walkin',walk,{status:409})
  const queued=await h.command('waitlist.add',{serviceId:service.id,name:'Website interval check',email:'interval@example.test',partySize:2,contactConsent:false})
  await h.command('waitlist.seat',{waitlistId:queued.id,startAt:service.startAt,tableIds:[tables[1].id]},{status:409})
  await h.command('proposal.approve',{proposalId:staleProtection.id},{status:409})
  await h.command('booking.move',{bookingId:reservation.id,tableIds:[tables[1].id],version:(await h.api('/api/state')).version}) // Existing direct guest may use protected inventory.
  await h.command('booking.walkin',{...walk,tableIds:[tables[2].id]})
  const walkBooking=(await h.api('/api/state')).state.bookings.find(b=>b.source==='walk-in')
  await h.command('booking.move',{bookingId:walkBooking.id,tableIds:[tables[1].id],version:(await h.api('/api/state')).version},{status:409})
  await h.command('booking.stage',{bookingId:reservation.id,stage:'cancelled'})
  const web=(await h.api('/api/public/book',{serviceId:service.id,startAt:service.startAt,name:'Robin Reed',email:'robin@example.test',partySize:2,area:'Dining room',requiredAccessTags:['step-free']},{as:'',status:201})).result
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===web.id).tableIds,[tables[1].id],'Website booking can consume its protected fitting table')
  const release=await prepare('inventory.protect',{serviceId:service.id,releaseId:protection.id})
  await h.command('proposal.approve',{proposalId:release.id},{as:manager})
  assert.deepEqual((await h.api('/api/state')).state.services.find(s=>s.id===service.id).directInventory,[])
  assert.ok((await h.api('/api/state')).state.audit.some(e=>e.action==='inventory.protect'))
  await h.command('booking.stage',{bookingId:web.id,stage:'cancelled'})
  const seated=await h.command('waitlist.seat',{waitlistId:queued.id,startAt:service.startAt,tableIds:[tables[1].id]})
  assert.deepEqual(seated.tableIds,[tables[1].id],'Explicit release restores staff seating capacity')
 }finally{await h.close()}
 const shift=await installation();try{
  const {service,reservation,before}=await allocationService(shift)
  // Queue arrives too late for the full 90-minute turn plus cleanup in current hours.
  const late=new Date(Date.parse(service.endAt)-30*60000).toISOString()
  await shift.command('waitlist.add',{serviceId:service.id,name:'Late accessible four',email:'late@example.test',phone:'+12025550129',partySize:4,preferredAt:late,preferredArea:'Dining room',requiredAccessTags:['step-free'],contactConsent:false})
  const path='/api/allocation-advice?serviceId='+service.id,key=(await shift.api('/api/agent-keys',{name:'Shift adviser'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const manager=await shift.signIn('shift-manager@example.test','admin'),reader=await shift.signIn('shift-reader@example.test')
  let report=await shift.api(path,undefined,agent)
  assert.ok(report.shifts.alternatives.length)
  for(const a of report.shifts.alternatives){assert.ok(a.after.feasibleQueuedCovers>a.before.feasibleQueuedCovers);assert.deepEqual(a.preview.unchangedBookings.find(b=>b.id===reservation.id),before);assert.ok(a.preview.waits.some(w=>w.before.earliestAt===null&&w.after.earliestAt));assert.ok(a.preview.explanations.length)}
  const prepare=()=>shift.command('proposal.prepare',{kind:'service.adjust',plan:{serviceId:service.id,alternativeId:report.shifts.alternatives[0].id},reason:'Manager confirms recorded team and kitchen remain available through the displayed extension'},agent)
  const stale=await prepare()
  await shift.command('waitlist.add',{serviceId:service.id,name:'Another party',email:'another@example.test',partySize:2,preferredAt:late,contactConsent:false})
  await shift.command('proposal.approve',{proposalId:stale.id},{status:409})
  report=await shift.api(path);const pending=await prepare()
  for(const opts of [agent,{as:reader}])await shift.command('proposal.approve',{proposalId:pending.id},{...opts,status:403})
  assert.equal((await shift.api('/api/state')).state.services.find(s=>s.id===service.id).endAt,service.endAt)
  await shift.command('proposal.approve',{proposalId:pending.id},{as:manager})
  const state=(await shift.api('/api/state')).state
  assert.equal(state.services.find(s=>s.id===service.id).endAt,pending.plan.endAt)
  assert.deepEqual(state.bookings.find(b=>b.id===reservation.id),before)
  assert.ok(state.audit.some(e=>e.action==='service.adjust'&&e.before.endAt===service.endAt&&e.after.endAt===pending.plan.endAt&&e.actor))
  await shift.command('guest.erase',{guestId:before.guestId,confirm:'ERASE'})
  for(const p of (await shift.api('/api/state')).state.proposals.filter(p=>p.kind==='service.adjust')){
   assert.deepEqual(p.plan.inputs.bookings.find(b=>b.id===before.id).requiredAccessTags,[])
   assert.deepEqual(p.plan.preview.unchangedBookings.find(b=>b.id===before.id).requiredAccessTags,[])
  }
 }finally{await shift.close()}
})


test('Counter seats and anonymous pools share overlapping-turn capacity, pacing, transfers, pre-shift output and restore guards',async()=>{
 const {seatFixture}=await import('./seat-fixture.mjs'),h=await installation();let restored;
 try{
  const f=await seatFixture(h),counter=await f.units('Chef counter'),pool=await f.units('Lounge');
  const hostCookie=await h.signIn('synthetic-placemat-host@example.test'),host=(await h.api('/auth/operators')).find(p=>p.email==='synthetic-placemat-host@example.test');
  await h.command('inventory.create',{name:'Forbidden',kind:'pool',capacity:20,turnMinutes:90,arrivalCovers:20,intervalMinutes:30,adjacent:false},{as:hostCookie,status:403});
  await h.command('team.host',{operatorId:host.id,enabled:true});
  await f.book('Chef counter',{tableIds:[counter[0].id,counter[2].id]},409);
  await f.book('Chef counter',{tableIds:[counter[0].id]},409);
  await f.book('Chef counter',{tableIds:[counter[0].id,f.table.id]},409);
  const first=await f.book('Chef counter',{tableIds:counter.slice(0,2).map(t=>t.id)});
  for(let i=0;i<4;i++)await f.book();
  await f.book('Chef counter',{},409);
  await f.book('Chef counter',{startAt:new Date(Date.parse(f.service.startAt)+30*60000).toISOString()},409);
  const rows=(await f.state()).bookings.filter(b=>b.tableIds.some(id=>counter.some(t=>t.id===id)));
  assert.equal(new Set(rows.flatMap(b=>b.tableIds)).size,10);assert.equal(rows.length,5);
  for(const b of rows){assert.equal(b.tableIds.length,2);const selected=b.tableIds.map(id=>counter.find(t=>t.id===id).ordinal).sort((a,b)=>a-b);assert.equal(selected[1]-selected[0],1);assert.equal(Date.parse(b.endAt)-Date.parse(b.startAt),90*60000)}
  const later=await f.book('Chef counter',{startAt:new Date(Date.parse(f.service.startAt)+90*60000).toISOString()});assert.ok(later);
  const lounge=await f.book('Lounge'),before=(await f.state()).bookings.find(b=>b.id===lounge.id);assert.equal(before.tableIds.length,2);assert.ok(before.tableIds.every(id=>pool.some(t=>t.id===id)));
  await h.command('booking.stage',{bookingId:lounge.id,stage:'seated'},{as:hostCookie,status:409});
  for(let i=0;i<9;i++)await f.book('Lounge');await f.book('Lounge',{},409);
  // A counter cancellation releases its exact seats. One transfer releases pool covers and acquires the seats atomically.
  await h.command('booking.status',{bookingId:first.id,status:'cancelled'});
  await f.move(lounge,counter.slice(0,2).map(t=>t.id));
  let state=await f.state();assert.equal(state.bookings.filter(b=>!['cancelled','no-show'].includes(b.status)&&b.startAt===f.service.startAt&&b.tableIds.some(id=>pool.some(t=>t.id===id))).reduce((n,b)=>n+b.partySize,0),18);
  await h.command('booking.stage',{bookingId:lounge.id,stage:'seated'},{as:hostCookie});
  await f.book('Chef counter',{tableIds:counter.slice(0,2).map(t=>t.id)},409);
  await h.command('booking.move',{bookingId:lounge.id,tableIds:pool.slice(0,2).map(t=>t.id),version:(await h.api('/api/state')).version},{status:409});
  await f.move(lounge,[f.table.id]);state=await f.state();const moved=state.bookings.find(b=>b.id===lounge.id);assert.deepEqual(moved.tableIds,[f.table.id]);assert.equal(moved.startAt,before.startAt);assert.equal(moved.endAt,before.endAt);
  const released=await f.book('Chef counter',{tableIds:counter.slice(0,2).map(t=>t.id)});assert.ok(released);
  const sheet=await h.api('/api/preshift?date='+f.date),sheetText=JSON.stringify(sheet);assert.match(sheetText,/Chef counter seat 1/);assert.match(sheetText,/Lounge unassigned cover/);
  const pdf=await (await h.request('/api/preshift.pdf?date='+f.date)).text();assert.match(pdf,/Chef counter seat 1/);assert.match(pdf,/Lounge unassigned cover/);
  const report=await h.api('/api/reports/performance?serviceId='+f.service.id);assert.equal(report.report.utilization.availableSeatMinutes,14*360);assert.equal(report.report.utilization.pool.availableCoverMinutes,20*360);assert.equal(report.report.utilization.tables.length,11);
  const {csvRecords}=await import('./business-fixture.mjs');const inventoryCsv=csvRecords(await (await h.request('/api/business-export/inventories.csv')).text());assert.deepEqual(inventoryCsv.map(r=>JSON.parse(r.data_json)),(await f.state()).inventories);
  const archive=await h.api('/api/backup');restored=await installation();await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.equal((await restored.api('/api/state')).state.inventories.length,2);
  await h.command('table.save',{...counter[0],seats:2},{status:409});await h.command('proposal.prepare',{kind:'floor.change',plan:{tableId:counter[0].id,changes:{seats:2}},reason:'Invalid inventory edit'},{status:409});
  // Counter observations retain correction history and immutable exact numeric publications.
  const liveStart=new Date(Math.floor(Date.now()/900000)*900000-3600000).toISOString();
  const live=await h.command('service.save',{name:'Live counter',startAt:liveStart,endAt:new Date(Date.parse(liveStart)+4*3600000).toISOString(),turnMinutes:90,coverLimit:40});
  const livePlan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:live.id},reason:'Live counter reviewed'});await h.command('proposal.approve',{proposalId:livePlan.id});
  const observed=await h.command('booking.walkin',{serviceId:live.id,startAt:live.startAt,tableIds:counter.slice(0,2).map(t=>t.id),partySize:2,name:'synthetic-placemat-counter-observed',email:'synthetic-placemat-counter-observed@example.test'});
  await h.command('booking.stage',{bookingId:observed.id,stage:'completed'});
  const published=await h.api('/api/reports/performance',{serviceId:live.id}),fact=published.report.rows.find(b=>b.bookingId===observed.id);
  assert.equal(published.report.utilization.observedSeatMinutes,2*(Date.parse(fact.actualDepartureAt)-Date.parse(fact.actualSeatAt))/60000);assert.ok(published.report.utilization.observedSeatMinutes>0);
  const event=(await f.state()).serviceEvents.filter(e=>e.bookingId===observed.id).at(-1);
  await h.command('booking.stage',{bookingId:observed.id,correctsEventId:event.id,reason:'Correct an accidental completion'});
  assert.deepEqual((await h.api('/api/reports/performance?snapshot='+published.publication.id)).report,published.report);
  const corrected=await h.api('/api/reports/performance?serviceId='+live.id);assert.equal(corrected.report.rows[0].actualDepartureAt,null);assert.equal(corrected.report.rows[0].serviceHistory.at(-1).correctsEventId,event.id);
  await h.command('booking.stage',{bookingId:observed.id,stage:'completed'});await h.command('booking.stage',{bookingId:observed.id,stage:'ready'});
  // Own inventory pacing and duration are independent of the service default.
  const paced=await h.command('inventory.create',{name:'Paced counter',kind:'counter',capacity:4,turnMinutes:60,arrivalCovers:2,intervalMinutes:30,adjacent:true});assert.ok(paced.id);
  const one=await f.book('Paced counter');assert.equal(Date.parse(one.endAt)-Date.parse(one.startAt),60*60000);await f.book('Paced counter',{},409);
  await f.book('Paced counter',{startAt:new Date(Date.parse(f.service.startAt)+30*60000).toISOString()});
  await h.command('guest.erase',{guestId:rows[0].guestId,confirm:'ERASE'});assert.ok(!JSON.stringify(await h.api('/api/preshift?date='+f.date)).includes('synthetic-placemat-4"'));
 }finally{if(restored)await restored.close();await h.close()}
})

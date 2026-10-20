import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

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
  const {service,tables,reservation}=await allocationService(joined,{size:4,demand:6}),path='/api/allocation-advice?serviceId='+service.id
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

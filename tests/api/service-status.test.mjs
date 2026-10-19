import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

test('FLOOR-006: staff service/course observations, running floor timers, paid/dirty seating guards, reasoned corrections and next-shift handover preserve history',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
  const table=await h.command('table.save',{label:'Dining 2',seats:2,x:30,y:30})
  const other=await h.command('table.save',{label:'Dining 6',seats:6,x:70,y:30})
  const day=new Date(Date.now()+86400000).toISOString().slice(0,10)
  const service=await h.command('service.save',{name:'Dinner',startAt:day+'T17:00:00Z',endAt:day+'T23:00:00Z',turnMinutes:90,coverLimit:40})
  const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Review dinner'})
  await h.command('proposal.approve',{proposalId:plan.id})
  const confirmation=(await h.api('/api/public/book',publicGuest(service,0),{as:'',status:201})).result
  const b=(await h.api('/api/state')).state.bookings.find(b=>b.id===confirmation.id)
  const manager=await h.signIn('dinner-host@example.test','admin'),reader=await h.signIn('next-shift@example.test')
  await h.command('booking.stage',{bookingId:b.id,stage:'arrived'},{as:reader,status:403})
  await h.command('booking.stage',{bookingId:b.id,stage:'arrived',source:'pos'},{as:manager,status:400})
  const recorded=[]
  const step=async stage=>{const result=await h.command('booking.stage',{bookingId:b.id,stage,reason:''},{as:manager});recorded.push(result.event);assert.equal(['mains','dessert','check-dropped','needs-bussing','ready'].includes(stage)?result.stage.status:result.stage.serviceStatus,stage);return result}
  const initial=await h.api('/api/state',undefined,{as:manager})
  assert.equal(initial.serviceStages[b.id].serviceStatus,'confirmed');assert.equal(initial.serviceStages[b.id].status,'reserved');assert.equal(initial.serviceStages[b.id].since,b.createdAt)
  for(const stage of ['reconfirmed','late','partially-arrived','arrived','seated','ordering','check-open','mains'])await step(stage)
  const mains=(await h.api('/api/state')).serviceStages[b.id]
  assert.equal(mains.status,'mains');assert.equal(mains.since,recorded.at(-1).at);assert.ok(mains.elapsedMinutes>=0)
  const dessert=await step('dessert')
  await h.command('booking.stage',{bookingId:b.id,correctsEventId:dessert.event.id},{as:manager,status:400})
  const correction=await h.command('booking.stage',{bookingId:b.id,correctsEventId:dessert.event.id,reason:'Dessert tap was accidental; mains are still on the table'},{as:manager})
  assert.equal(correction.stage.status,'mains');assert.equal(correction.event.correctsEventId,dessert.event.id)
  const afterCorrection=await h.api('/api/state',undefined,{as:reader})
  assert.ok(afterCorrection.state.serviceEvents.some(e=>e.id===dessert.event.id&&e.after.floorStatus==='dessert'),'original observation retained')
  assert.ok(afterCorrection.state.serviceEvents.some(e=>e.id===correction.event.id&&e.reason.includes('accidental')))
  assert.equal(afterCorrection.names[correction.event.actor],'Floor manager')
  await step('dessert');await step('check-dropped');const paid=await step('paid')
  assert.equal(paid.stage.status,'check-dropped');assert.equal(paid.booking.needsBussing,true)
  const later=day+'T19:00:00Z'
  await h.command('booking.walkin',publicGuest(service,1,{startAt:later,tableIds:[table.id]}),{as:manager,status:409})
  await step('clearing');const complete=await step('completed')
  assert.equal(complete.stage.status,'needs-bussing');assert.equal(complete.booking.needsBussing,true)
  await h.command('booking.walkin',publicGuest(service,1,{startAt:later,tableIds:[table.id]}),{as:manager,status:409})
  // Automatic staff allocation chooses a clean table, never the dirty two-top.
  const clean=await h.command('booking.walkin',publicGuest(service,2,{startAt:later}),{as:manager})
  assert.deepEqual(clean.tableIds,[other.id])
  const ready=await step('ready');assert.equal(ready.stage.status,'ready');assert.equal(ready.booking.needsBussing,false)
  await h.api('/api/public/book',publicGuest(service,14,{partySize:8,startAt:day+'T17:15:00Z'}),{as:'',status:409})
  const next=await h.command('booking.walkin',publicGuest(service,1,{startAt:later,tableIds:[table.id]}),{as:manager})
  assert.equal(next.status,'seated')
  // Reversing a ready observation cannot reclaim a table now used by another party.
  await h.command('booking.stage',{bookingId:b.id,correctsEventId:ready.event.id,reason:'Unsafe correction into the next party'},{as:manager,status:409})
  const handover=await h.api('/api/state',undefined,{as:reader})
  assert.equal(handover.serviceStages[b.id].status,'ready');assert.equal(handover.serviceStages[next.id].status,'seated')
  assert.ok(handover.state.serviceEvents.filter(e=>e.bookingId===b.id).every(e=>e.actor===paid.event.actor&&e.source==='staff-recorded'&&!Number.isNaN(Date.parse(e.at))))
  assert.ok(handover.state.audit.some(a=>a.action==='booking.stage'&&a.subject===b.id))
  // Cancellation and no-show are distinct guarded statuses on the same public command door.
  const late=(await h.api('/api/public/book',publicGuest(service,3,{startAt:day+'T21:00:00Z'}),{as:'',status:201})).result
  await h.command('booking.status',{bookingId:late.id,status:'no-show'},{as:manager})
  const cancel=(await h.api('/api/public/book',publicGuest(service,4,{startAt:day+'T21:00:00Z'}),{as:'',status:201})).result
  await h.command('booking.status',{bookingId:cancel.id,status:'cancelled'},{as:manager})
  await h.command('booking.status',{bookingId:cancel.id,status:'completed'},{as:manager,status:409})
  await h.command('guest.erase',{guestId:b.guestId,confirm:'ERASE'})
  const erased=await h.api('/api/state');assert.ok(erased.state.serviceEvents.filter(e=>e.bookingId===b.id).every(e=>e.reason===''))
 }finally{await h.close()}
})

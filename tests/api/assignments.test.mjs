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

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {searchFixture} from './timeline-fixture.mjs'

const at=(value,minutes)=>new Date(Date.parse(value)+minutes*60000).toISOString()
test('FLOOR-005: late six-top, actual turn extension, collision and direct host replacement preserve both histories; day/service timeline and header open their parties',async()=>{
 const h=await installation();try{
  const tables=[]
  for(const [label,seats,area] of [['Window 6',6,'Dining'],['Garden 6',6,'Garden'],['Counter 2',2,'Dining']])tables.push(await h.command('table.save',{label,seats,area,x:20+tables.length*25,y:30}))
  const startAt=new Date(Date.now()+3500).toISOString(),service=await h.command('service.save',{name:'Evening service',startAt,endAt:at(startAt,240),turnMinutes:15,coverLimit:60,turnPolicy:{cleanupMinutes:5}})
  const publish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Evening ready'})
  await h.command('proposal.approve',{proposalId:publish.id})
  const book=async(i,minutes=0)=>(await h.api('/api/public/book',publicGuest(service,i,{partySize:6,startAt:at(startAt,minutes)}),{as:'',status:201})).result
  const six=await book(0),next=await book(1,30)
  const hostCookie=await h.signIn('timeline-host@example.test'),host=(await h.api('/auth/operators')).find(p=>p.email==='timeline-host@example.test')
  await h.command('team.host',{operatorId:host.id,enabled:true})
  const remaining=Date.parse(startAt)-Date.now()+50;if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining))
  await h.command('booking.stage',{bookingId:six.id,stage:'late'},{as:hostCookie})
  await h.command('booking.stage',{bookingId:six.id,stage:'arrived'},{as:hostCookie})
  await h.command('booking.stage',{bookingId:six.id,stage:'seated'},{as:hostCookie})
  let state=await h.api('/api/state'),original=structuredClone(state.state.bookings.find(b=>b.id===six.id))
  await h.command('booking.extend',{bookingId:six.id,expectedEndAt:at(startAt,45),reason:'Six-top is still enjoying mains'},{as:hostCookie})
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:state.state.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(startAt))
  const url='/api/timeline?serviceId='+service.id+'&date='+day
  const timeline=await h.api(url+'&nextMinutes=45&zoom=15',undefined,{as:hostCookie}),row=timeline.rows.find(b=>b.id===six.id),arrival=timeline.rows.find(b=>b.id===next.id)
  assert.equal(row.late,true);assert.ok(row.actualSeatAt);assert.ok(row.actualArrivalAt);assert.equal(row.expectedSeatAt,startAt)
  assert.equal(row.endAt,original.endAt);assert.equal(row.cleanupEndAt,original.cleanupEndAt);assert.equal(row.expectedDepartureAt,at(startAt,45));assert.equal(row.expectedResetAt,at(startAt,50))
  assert.ok(row.collisionIds.includes(next.id));assert.ok(arrival.collisionIds.includes(six.id));assert.equal(row.turnHistory.length,1);assert.equal(row.turnHistory[0].actor,host.id)
  assert.equal(timeline.header.seatedCovers.covers,6);assert.deepEqual(timeline.header.seatedCovers.bookingIds,[six.id]);assert.equal(timeline.header.dueCovers.covers,6);assert.deepEqual(timeline.header.dueCovers.bookingIds,[next.id]);assert.equal(timeline.header.averageActualTurn.minutes,null)
  assert.equal((await h.api(url+'&nextMinutes=1')).header.dueCovers.covers,0)
  assert.equal((await h.api(url+'&search=Alex')).rows.length,1)
  assert.equal((await h.api(url+'&area=Garden')).rows.length,0)
  assert.equal((await h.api(url+'&serverId=not-assigned')).rows.length,0)
  assert.equal((await h.api('/api/timeline?date=2020-01-01')).rows.length,0)
  await h.api('/api/timeline?date=2026-02-31',undefined,{status:400})
  state=await h.api('/api/state')
  await h.command('booking.move',{bookingId:next.id,tableIds:original.tableIds,version:state.version},{as:hostCookie,status:409})
  const moved=await h.command('booking.move',{bookingId:next.id,tableIds:[tables[1].id],version:state.version,reason:'Resolve the six-top overrun'},{as:hostCookie})
  assert.deepEqual(moved.booking.tableIds,[tables[1].id])
  const resolved=await h.api(url),sixHistory=resolved.rows.find(b=>b.id===six.id),nextHistory=resolved.rows.find(b=>b.id===next.id)
  assert.deepEqual(sixHistory.collisionIds,[]);assert.deepEqual(nextHistory.collisionIds,[]);assert.equal(sixHistory.turnHistory.length,1);assert.equal(nextHistory.assignmentHistory.length,1)
  assert.ok(sixHistory.serviceHistory.some(e=>e.after.status==='late'));assert.ok(nextHistory.assignmentHistory[0].reason.includes('overrun'))
  await h.command('booking.stage',{bookingId:six.id,stage:'completed'},{as:hostCookie})
  const completed=await h.api(url),average=completed.header.averageActualTurn
  assert.ok(average.minutes>=0);assert.deepEqual(average.bookingIds,[six.id]);assert.ok(completed.rows.find(b=>b.id===six.id).actualDepartureAt)
  await h.command('booking.stage',{bookingId:six.id,stage:'ready'},{as:hostCookie})
  assert.ok((await h.api(url)).rows.find(b=>b.id===six.id).actualResetAt)
  // A real staff walk-in with a past promised end exposes an ongoing overdue table.
  const past=new Date(Date.now()-120*60000).toISOString(),old=await h.command('service.save',{name:'Late lunch',startAt:past,endAt:at(past,240),turnMinutes:15,coverLimit:20})
  const oldPlan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:old.id},reason:'Lunch in progress'});await h.command('proposal.approve',{proposalId:oldPlan.id})
  const overdue=await h.command('booking.walkin',{serviceId:old.id,startAt:past,partySize:2,name:'Lunch lingerer',email:'linger@example.test',tableIds:[tables[2].id]})
  const lunchDay=new Intl.DateTimeFormat('en-CA',{timeZone:state.state.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(past))
  const overdueRow=(await h.api('/api/timeline?serviceId='+old.id+'&date='+lunchDay)).rows.find(b=>b.id===overdue.id)
  assert.equal(overdueRow.overdue,true);assert.ok(overdueRow.overdueMinutes>0)
  await h.command('booking.extend',{bookingId:overdue.id,expectedEndAt:at(new Date().toISOString(),30),reason:''},{as:hostCookie,status:400})
  await h.command('booking.extend',{bookingId:next.id,expectedEndAt:at(startAt,90),reason:'Not seated'},{as:hostCookie,status:409})
 }finally{await h.close()}
})


test('FLOOR-007: phone suffix/name/email/booking/table search, combined service/source/status filters and current VIP/allergy/access alerts follow erasure',async()=>{
 const h=await installation();try{
  const f=await searchFixture(h),base='/api/timeline?date='+f.date
  const rows=async(params={},opts={})=>(await h.api(base+'&'+new URLSearchParams(params),undefined,opts)).rows
  const ids=items=>items.map(row=>row.id).sort()
  const all=[f.elena,f.jules,f.morgan,f.taylor,f.later]
  const before=(await h.api('/api/state')).state
  assert.deepEqual(ids(await rows({search:'0191'})),ids([f.elena,f.later]))
  for(const search of ['(415) 555-0191','+1 415 555 0191','elena garcia','ELENA@EXAMPLE.TEST'])assert.deepEqual(ids(await rows({search})),ids([f.elena,f.later]),search)
  assert.deepEqual(ids(await rows({search:f.elena.id})),[f.elena.id])
  assert.deepEqual(ids(await rows({search:'pAtIo 14'})),[f.jules.id])
  assert.deepEqual(ids(await rows({search:'not a guest'})),[])
  assert.deepEqual(ids(await rows({source:'online'})),ids([f.elena,f.jules,f.later]))
  assert.deepEqual(ids(await rows({source:'walk-in'})),[f.morgan.id])
  assert.deepEqual(ids(await rows({source:'waitlist'})),[f.taylor.id])
  assert.deepEqual(ids(await rows({status:'cancelled'})),[f.jules.id])
  assert.deepEqual(ids(await rows({status:'seated'})),ids([f.morgan,f.taylor]))
  assert.deepEqual(ids(await rows({search:'0191',serviceId:f.first.id,source:'online',status:'booked'})),[f.elena.id])
  assert.deepEqual(ids(await rows({search:'0191',serviceId:f.first.id,source:'walk-in',status:'booked'})),[])
  const row=(await rows({serviceId:f.first.id,search:'0191'}))[0]
  assert.equal(row.vipLevel,'vip');assert.equal(row.requests.allergyNotes,'Shellfish <guest supplied>');assert.equal(row.requests.wheelchair,true);assert.deepEqual(row.requiredAccessTags,['step-free'])
  assert.ok(!JSON.stringify(await rows()).includes('Private planning note'))
  assert.deepEqual((await h.api('/api/state')).state,before,'FLOOR-007 search changes no guest, booking, request or permission')
  for(const suffix of ['source=google','status=paid','source=online&source=waitlist','status=booked&status=seated'])await h.api(base+'&'+suffix,undefined,{status:400})
  await h.api(base,undefined,{as:'',status:401})
  const host=await h.signIn('search-host@example.test'),member=await h.signIn('search-reader@example.test'),manager=await h.signIn('search-manager@example.test','admin')
  const operator=(await h.api('/auth/operators')).find(p=>p.email==='search-host@example.test')
  await h.command('team.host',{operatorId:operator.id,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Search preparation'})).result
  for(const as of [host,member,manager])assert.deepEqual(ids(await rows({}, {as})),ids(all),'FLOOR-007 inherits existing native timeline read authority')
  assert.deepEqual(ids(await rows({}, {as:'',headers:{authorization:'Bearer '+key.key}})),ids(all))
  await h.request('/api/agent-keys/'+key.id,{method:'DELETE'})
  await h.api(base,undefined,{as:'',headers:{authorization:'Bearer '+key.key},status:401})
  await h.command('guest.erase',{guestId:f.guest.id,confirm:'ERASE'})
  for(const search of ['0191','elena garcia','elena@example.test'])assert.deepEqual(await rows({search}),[],'FLOOR-007 erased identity never matches '+search)
  const erased=(await rows({search:f.elena.id}))[0]
  assert.equal(erased.guestName,'Erased guest');assert.equal(erased.vipLevel,'none');assert.equal(erased.requests.allergyNotes,'');assert.equal(erased.requests.wheelchair,false);assert.deepEqual(erased.requiredAccessTags,[])
 }finally{await h.close()}
})

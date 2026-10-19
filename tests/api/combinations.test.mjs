import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
const at=(value,minutes)=>new Date(Date.parse(value)+minutes*60000).toISOString()

test('FLOOR-003: only exact manager-approved adjacent joins allocate, preserve access/capacity and reserve setup across public, staff and prepared doors',async()=>{
 const h=await installation();try{
  const tables=[]
  for(const label of ['T1','T2','T8','T9'])tables.push(await h.command('table.save',{label,seats:4,area:'Dining',accessTags:['step-free'],x:20+tables.length*20,y:30}))
  const reader=await h.signIn('joins-reader@example.test'),host=await h.signIn('joins-host@example.test')
  const operator=(await h.api('/auth/operators')).find(p=>p.email==='joins-host@example.test');await h.command('team.host',{operatorId:operator.id,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Join preparation'})).result.key,agent={as:'',headers:{authorization:'Bearer '+key}}
  const settings={tableIds:[tables[0].id,tables[1].id],capacity:6,accessTags:['step-free'],setupMinutes:15,enabled:true,adjacent:true}
  await h.command('combination.save',settings,{as:reader,status:403});await h.command('combination.save',settings,{as:host,status:403});await h.command('combination.save',settings,{...agent,status:403})
  await h.command('combination.save',{...settings,adjacent:false},{status:400})
  await h.command('combination.save',{...settings,capacity:9},{status:400})
  await h.command('combination.save',{...settings,accessTags:['wheelchair']},{status:400})
  const join=await h.command('combination.save',settings)
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
  const draft=await h.command('service.save',{name:'Friday joined tables',startAt:day+'T16:00:00Z',endAt:day+'T21:00:00Z',turnMinutes:60,turnPolicy:{cleanupMinutes:15},coverLimit:100})
  const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Review joins and service'})
  await h.command('proposal.approve',{proposalId:plan.id})
  const query=new URLSearchParams({date:day,partySize:'6',requiredAccessTags:'step-free'})
  const results=(await h.api('/api/public/search?'+query,undefined,{as:''})).results
  assert.ok(!JSON.stringify(results).includes(tables[0].id),'Public results do not disclose private join inventory')
  assert.equal(results[0].startAt,at(draft.startAt,15),'Setup fits from the service opening')
  await h.api('/api/public/book',publicGuest(draft,0,{partySize:6,startAt:draft.startAt}),{as:'',status:409})
  await h.api('/api/public/book',publicGuest(draft,0,{partySize:7,startAt:at(draft.startAt,15)}),{as:'',status:409})
  await h.api('/api/public/book',publicGuest(draft,0,{partySize:6,startAt:at(draft.startAt,15),requiredAccessTags:['wheelchair']}),{as:'',status:409})
  const first=(await h.api('/api/public/book',publicGuest(draft,1,{partySize:6,startAt:at(draft.startAt,15),requiredAccessTags:['step-free']}),{as:'',status:201})).result
  let state=await h.api('/api/state'),b=state.state.bookings.find(b=>b.id===first.id)
  assert.deepEqual([...b.tableIds].sort(),[tables[0].id,tables[1].id].sort());assert.equal(b.setupStartAt,draft.startAt);assert.equal(b.combination.id,join.id)
  const original={startAt:b.startAt,endAt:b.endAt,cleanupEndAt:b.cleanupEndAt,setupStartAt:b.setupStartAt}
  const move=async(tableIds,opts={})=>h.command('booking.move',{bookingId:b.id,tableIds,version:(await h.api('/api/state')).version},opts)
  await move([tables[0].id,tables[2].id],{as:host,status:409})
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:[tables[0].id,tables[2].id]},reason:'Prohibited distant join'}, {...agent,status:409})
  // The reset ends 90 minutes after opening; a join at minute 90 would start setup at 75.
  await h.api('/api/public/book',publicGuest(draft,2,{partySize:6,startAt:at(draft.startAt,90)}),{as:'',status:409})
  const second=(await h.api('/api/public/book',publicGuest(draft,2,{partySize:6,startAt:at(draft.startAt,105)}),{as:'',status:201})).result
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===second.id).setupStartAt,at(draft.startAt,90))
  const waiting=await h.command('waitlist.add',publicGuest(draft,3,{partySize:6}))
  await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:at(draft.startAt,195),tableIds:[tables[0].id,tables[2].id]},{status:409})
  const seated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:at(draft.startAt,195),tableIds:[tables[0].id,tables[1].id]})
  assert.equal(seated.combination.id,join.id)
  await h.command('booking.walkin',publicGuest(draft,4,{partySize:6,startAt:at(draft.startAt,15),tableIds:[tables[2].id,tables[3].id]}),{status:409})
  const other=await h.command('combination.save',{...settings,tableIds:[tables[2].id,tables[3].id],setupMinutes:0})
  const prepared=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:[tables[2].id,tables[3].id]},reason:'Review permitted alternative join'},agent)
  await h.command('combination.save',{...settings,id:other.id,tableIds:other.tableIds,setupMinutes:5})
  await h.command('proposal.approve',{proposalId:prepared.id},{status:409})
  await h.command('combination.save',{...settings,id:join.id,capacity:7},{status:409})
  await h.command('combination.save',{...settings,id:join.id,enabled:false})
  state=await h.api('/api/state');b=state.state.bookings.find(row=>row.id===first.id)
  assert.equal(b.combination.capacity,6);assert.deepEqual(Object.fromEntries(Object.keys(original).map(k=>[k,b[k]])),original)
  await move([tables[0].id,tables[1].id],{as:host,status:409})
  const changed=await move([tables[2].id,tables[3].id],{as:host})
  state=await h.api('/api/state');b=state.state.bookings.find(row=>row.id===first.id)
  assert.equal(b.startAt,original.startAt);assert.equal(b.endAt,original.endAt);assert.equal(b.cleanupEndAt,original.cleanupEndAt)
  assert.equal(b.setupStartAt,at(b.startAt,-5));assert.equal(b.combination.id,other.id)
  const audit=state.state.audit.findLast(e=>e.action==='booking.move'&&e.subject===b.id)
  assert.ok(audit.before.length&&audit.after.length);assert.equal(audit.actor,operator.id)
  assert.equal(audit.before[0].setupStartAt,original.setupStartAt);assert.equal(audit.after[0].setupStartAt,b.setupStartAt)
  // A swap rechecks both exact joins and preserves both original guest intervals.
  await h.command('booking.swap',{bookingId:first.id,otherBookingId:second.id,version:state.version},{as:host,status:409})
  await h.command('combination.save',{...settings,id:join.id,enabled:true})
  const swapped=await h.command('booking.swap',{bookingId:first.id,otherBookingId:second.id,version:(await h.api('/api/state')).version},{as:host})
  state=await h.api('/api/state');const swappedFirst=state.state.bookings.find(row=>row.id===first.id),swappedSecond=state.state.bookings.find(row=>row.id===second.id)
  assert.equal(swappedFirst.combination.id,join.id);assert.equal(swappedSecond.combination.id,other.id)
  assert.equal(swappedFirst.setupStartAt,original.setupStartAt);assert.equal(swappedSecond.setupStartAt,at(swappedSecond.startAt,-5))
  assert.equal(swapped.audit.before.length,2);assert.equal(swapped.audit.after.length,2)
  await h.command('booking.lock',{bookingId:first.id,locked:true,version:state.version},{as:host})
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:first.id,tableIds:other.tableIds},reason:'Locked join must not change'}, {...agent,status:409})
  const portable=await h.api('/api/backup'),restored=await installation()
  try{await restored.api('/api/restore',{archive:portable,confirm:'RESTORE'});const copy=(await restored.api('/api/state')).state;assert.deepEqual(copy.combinations,state.state.combinations);assert.equal(copy.bookings.find(row=>row.id===first.id).setupStartAt,original.setupStartAt)}finally{await restored.close()}

 }finally{await h.close()}
})

test('FLOOR-002: rooms, shapes, reviewed edits and retirement preserve promised fit, history, reports and portable records',async()=>{
 const h=await installation();try{
  const dining=await h.command('room.save',{name:'Dining room',kind:'indoor'}),patio=await h.command('room.save',{name:'Patio',kind:'outdoor'}),bar=await h.command('room.save',{name:'Bar',kind:'bar'})
  const manager=await h.signIn('floor-manager@example.test','admin'),reader=await h.signIn('floor-reader@example.test'),host=await h.signIn('floor-host@example.test')
  const operator=(await h.api('/auth/operators')).find(p=>p.email==='floor-host@example.test');await h.command('team.host',{operatorId:operator.id,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Floor planning'})).result.key,agent={as:'',headers:{authorization:'Bearer '+key}}
  for(const opts of [{as:reader},{as:host},agent])await h.command('room.save',{name:'Forbidden',kind:'indoor'},{...opts,status:403})
  await h.api('/api/floor-version',undefined,{as:'',status:401})
  const create=(label,area,shape,x)=>h.command('table.save',{label,seats:4,area,shape,accessTags:['step-free'],x,y:30},{as:manager})
  const source=await create('12',dining.name,'round',15),replacement=await create('14',dining.name,'rectangle',50),garden=await create('21',patio.name,'square',30),counter=await create('B1',bar.name,'bar',75)
  let state=await h.api('/api/state');assert.deepEqual(state.state.rooms.map(r=>r.kind),['indoor','outdoor','bar']);assert.deepEqual(state.state.tables.map(t=>t.shape),['round','rectangle','square','bar'])
  assert.equal((await h.api('/api/floor-version',undefined,{as:host})).version,state.version)
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),draft=await h.command('service.save',{name:'US Friday dinner',startAt:day+'T21:00:00Z',endAt:day+'T23:59:00Z',turnMinutes:60,coverLimit:40})
  let plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Review room layout'});await h.command('proposal.approve',{proposalId:plan.id})
  const book=async(i,area)=>(await h.api('/api/public/book',publicGuest(draft,i,{partySize:4,area,requiredAccessTags:['step-free']}),{as:'',status:201})).result
  const historical=await book(8,dining.name);await h.command('booking.status',{bookingId:historical.id,status:'no-show'})
  const first=await book(0,dining.name),outdoor=await book(1,patio.name)
  state=await h.api('/api/state');const original=state.state.bookings.find(b=>b.id===first.id);assert.deepEqual(original.tableIds,[source.id]);assert.deepEqual(state.state.bookings.find(b=>b.id===outdoor.id).tableIds,[garden.id])
  const proposal=(p,opts={})=>h.command('proposal.prepare',{kind:'floor.change',plan:{tableId:source.id,...p},reason:'Replace worn table 12 for guest0@example.test without changing guest promises'},opts)
  plan=await proposal({changes:{seats:2}});assert.ok(plan.plan.impacts.some(i=>i.bookingId===first.id));await h.command('proposal.approve',{proposalId:plan.id},{status:409})
  plan=await proposal({changes:{shape:'square',x:25}});await h.command('proposal.approve',{proposalId:plan.id});assert.equal((await h.api('/api/state')).state.tables.find(t=>t.id===source.id).shape,'square')
  plan=await proposal({retire:true});await h.command('proposal.approve',{proposalId:plan.id},{status:409})
  plan=await proposal({retire:true,replacements:[{bookingId:first.id,tableIds:[garden.id]}]});await h.command('proposal.approve',{proposalId:plan.id},{status:409})
  await h.command('booking.lock',{bookingId:first.id,locked:true,version:(await h.api('/api/state')).version},{as:host})
  plan=await proposal({retire:true,replacements:[{bookingId:first.id,tableIds:[replacement.id]}]});await h.command('proposal.approve',{proposalId:plan.id},{status:409})
  await h.command('booking.lock',{bookingId:first.id,locked:false,version:(await h.api('/api/state')).version},{as:host})
  plan=await proposal({retire:true,replacements:[{bookingId:first.id,tableIds:[replacement.id]}]},agent)
  await h.command('proposal.approve',{proposalId:plan.id},{...agent,status:403})
  await h.command('table.save',{...counter,x:70})
  await h.command('proposal.approve',{proposalId:plan.id},{status:409})
  plan=await proposal({retire:true,replacements:[{bookingId:first.id,tableIds:[replacement.id]}]},{as:manager})
  const beforeVersion=(await h.api('/api/floor-version')).version
  await h.command('proposal.approve',{proposalId:plan.id},{as:manager})
  state=await h.api('/api/state');assert.ok((await h.api('/api/floor-version')).version>beforeVersion)
  const retired=state.state.tables.find(t=>t.id===source.id),moved=state.state.bookings.find(b=>b.id===first.id)
  assert.deepEqual(state.state.bookings.find(b=>b.id===historical.id).tableIds,[source.id]);assert.equal(state.state.bookings.find(b=>b.id===historical.id).status,'no-show')
  assert.ok(retired.retiredAt);assert.equal(retired.label,'12');assert.deepEqual(moved.tableIds,[replacement.id]);for(const field of ['startAt','endAt','cleanupEndAt','requiredArea','requiredAccessTags'])assert.deepEqual(moved[field],original[field])
  const history=state.state.audit.findLast(e=>e.action==='table.assign'&&e.subject===first.id&&e.before?.some(b=>b.bookingId===first.id&&b.tableIds.includes(source.id)));assert.ok(history);assert.deepEqual(history.after[0].tableIds,[replacement.id])
  await h.command('booking.move',{bookingId:first.id,tableIds:[source.id],version:state.version},{as:host,status:409})
  const report=await h.api('/api/reports/reservations?area=Patio');assert.ok(JSON.stringify(report).includes(outdoor.id));assert.ok(!JSON.stringify(report).includes(first.id))
  await h.api('/api/public/book',publicGuest(draft,2,{partySize:4,area:dining.name}),{as:'',status:409})
  const archive=await h.api('/api/backup'),restored=await installation()
  try{await restored.api('/api/restore',{archive,confirm:'RESTORE'});const copy=(await restored.api('/api/state')).state;assert.deepEqual(copy.rooms,state.state.rooms);assert.deepEqual(copy.tables,state.state.tables);assert.deepEqual(copy.bookings,state.state.bookings)}finally{await restored.close()}
  await h.command('guest.erase',{guestId:moved.guestId,confirm:'ERASE'});assert.ok(!JSON.stringify(await h.api('/api/state')).includes('guest0@example.test'),'Erasure redacts guest-linked floor proposal and replacement reasons')
 }finally{await h.close()}
})

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

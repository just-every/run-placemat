import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'

export async function closureService(h){
 const setup=await service(h,{tables:4,covers:40})
 await h.command('table.save',{...setup.floor[3],area:'Patio'})
 const bookings=[]
 for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(setup.service,i,{area:'Dining room'}),{as:'',status:201})).result)
 return {...setup,bookings}
}
const prepare=(h,s,scope='room',extra={})=>h.command('proposal.prepare',{kind:'service.closure',plan:{serviceId:s.id,scope,area:'Dining room',...extra},reason:'Water leak; arrange personal follow-up'})

test('SERVICE-003 exact reviewed room closure keeps three bookings and accountable failed-contact work; every current allocation respects it',async()=>{
 const h=await installation()
 try{
  const {service:s,bookings,floor}=await closureService(h),original=(await h.api('/api/state')).state.bookings
  const member=await h.signIn('reader@example.test'),manager=await h.signIn('manager@example.test','admin')
  await h.command('proposal.prepare',{kind:'service.closure',plan:{serviceId:s.id,scope:'room',area:'Dining room'},reason:'Not authorized'},{as:member,status:403})
  const key=(await h.api('/api/agent-keys',{name:'Closure preparation'})).result.key,headers={authorization:`Bearer ${key}`}
  const stale=await prepare(h,s)
  assert.deepEqual(stale.plan.bookingIds,bookings.map(b=>b.id))
  await h.command('booking.lock',{bookingId:bookings[0].id,locked:true,version:(await h.api('/api/state')).version})
  await h.command('proposal.approve',{proposalId:stale.id},{status:409})
  await h.command('booking.lock',{bookingId:bookings[0].id,locked:false,version:(await h.api('/api/state')).version})
  const before=(await h.api('/api/state')).state.bookings
  const proposal=await prepare(h,s)
  await h.command('proposal.approve',{proposalId:proposal.id},{headers,status:403})
  await h.command('proposal.approve',{proposalId:proposal.id},{as:manager})
  let current=await h.api('/api/state'),change=current.state.serviceChanges[0]
  assert.equal(change.tasks.length,3);assert.equal(change.approvedBy,current.state.proposals.find(p=>p.id===proposal.id).approvedBy)
  assert.ok(change.tasks.every(t=>t.ownerId===change.approvedBy&&t.status==='open'&&t.updatedAt===change.approvedAt))
  assert.deepEqual(current.state.bookings,before)
  await h.api('/api/public/book',publicGuest(s,3,{area:'Dining room',startAt:new Date(Date.parse(s.startAt)+2*3600000).toISOString()}),{as:'',status:409})
  await h.command('booking.walkin',{...publicGuest(s,4),tableIds:[floor[0].id]},{status:409})
  const patio=(await h.api('/api/public/book',publicGuest(s,3,{area:'Patio'}),{as:'',status:201})).result
  await h.command('booking.move',{bookingId:patio.id,tableIds:[floor[0].id],version:(await h.api('/api/state')).version},{status:409})
  await h.command('service.followup',{changeId:change.id,taskId:change.tasks[2].id,status:'completed',outcome:'Cannot claim resolution'},{status:400})
  await h.command('service.followup',{changeId:change.id,taskId:change.tasks[2].id,status:'failed-contact',outcome:'Staff phone attempt: no answer; personal follow-up needed'})
  current=await h.api('/api/state');change=current.state.serviceChanges[0]
  assert.equal(change.tasks[2].status,'failed-contact');assert.equal(change.tasks[2].ownerId,current.actor.id)
  assert.ok(current.state.audit.some(a=>a.action==='service.followup.recorded'&&a.subject===bookings[2].id&&a.actor===current.actor.id&&a.at))
  assert.deepEqual(current.state.bookings.filter(b=>bookings.some(v=>v.id===b.id)),before)
  assert.equal(h.messages.length,2,'Only native invitations crossed the mail edge')
  assert.ok((await h.api('/api/public/services',undefined,{as:''})).services.every(v=>!JSON.stringify(v).includes('follow-up')))
  const csv=await h.request('/api/business-export/service-changes.csv');assert.equal(csv.status,200);assert.match(await csv.text(),/failed-contact/)
  // Restore is an archive journey: this test file is run through heavy-slot.
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await copy.api('/api/state')).state.serviceChanges,current.state.serviceChanges)}finally{await copy.close()}
  const guestId=original[2].guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  current=await h.api('/api/state');assert.equal(current.state.serviceChanges[0].reason,'');assert.ok(current.state.serviceChanges[0].tasks.every(t=>!t.reason&&!t.outcome))
  assert.ok(!JSON.stringify(current.state).includes('Water leak'));assert.ok(!JSON.stringify(current.state).includes('Staff phone attempt'))
 }finally{await h.close()}
})

test('SERVICE-003 full-date, arrival-window and private holds require exact review and enforce half-open boundaries across services',async()=>{
 const h=await installation()
 try{
  const {service:s,floor}=await service(h,{tables:2,covers:30})
  const at=n=>new Date(Date.parse(s.startAt)+n*60000).toISOString()
  const arrival=await prepare(h,s,'arrival',{startAt:at(30),endAt:at(60)})
  await h.command('proposal.approve',{proposalId:arrival.id})
  const publicSlots=(await h.api('/api/public/services?partySize=2',undefined,{as:''})).services[0].slots
  assert.ok(publicSlots.some(v=>v.startAt===at(0)));assert.ok(!publicSlots.some(v=>v.startAt===at(30)));assert.ok(publicSlots.some(v=>v.startAt===at(60)))
  const hold=await prepare(h,s,'private',{tableIds:[floor[0].id],startAt:at(0),endAt:at(90)})
  await h.command('proposal.approve',{proposalId:hold.id})
  await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})
  await h.api('/api/public/book',publicGuest(s,1),{as:'',status:409})
  const closure=await prepare(h,s,'service')
  await h.command('proposal.approve',{proposalId:closure.id})
  const overlapping=await h.command('service.save',{name:'Parallel catalog',startAt:s.startAt,endAt:s.endAt,turnMinutes:90,coverLimit:30})
  const publish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:overlapping.id},reason:'Shared physical room'})
  await h.command('proposal.approve',{proposalId:publish.id})
  await h.api('/api/public/book',publicGuest(overlapping,2),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,1)
 }finally{await h.close()}
})

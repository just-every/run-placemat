import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'

test('WAIT-006: staff queue history, quotes, priority, seating and shift-close dispositions leave owned follow-up and no ghost offers',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h,{tables:4,covers:30})
  const manager=await h.signIn('queue-manager@example.test','admin'),member=await h.signIn('queue-reader@example.test')
  const owner=(await h.api('/api/state')).actor.id
  const add=(i,extra={})=>h.command('waitlist.add',publicGuest(s,i,{phone:`+1 415 555 ${String(1000+i)}`,...extra}))
  const queued=await add(10),offered=await add(11),seated=await add(12),declined=await add(13),abandoned=await add(14),expired=await add(15),noPhone=await add(16,{phone:'',email:'',contactReason:'Guest has no phone; ask the host stand to check on the party.'})
  assert.equal(queued.status,'queued');assert.ok(queued.createdAt)
  assert.equal(noPhone.followUps[0].kind,'no-contact');assert.equal(noPhone.followUps[0].owner,owner)
  const p={waitlistId:queued.id,priority:5,reason:'Keep the six-top promise ahead of later fitting parties.'}
  await h.command('waitlist.priority',p,{as:'',status:401})
  await h.command('waitlist.priority',p,{as:member,status:403})
  await h.command('waitlist.priority',p,{as:manager,headers:{origin:'https://foreign.example'},status:403})
  const key=(await h.api('/api/agent-keys',{name:'Queue preparation assistant'})).result
  await h.command('waitlist.priority',p,{as:'',headers:{authorization:'Bearer '+key.key},status:403})
  const prioritized=await h.command('waitlist.priority',p,{as:manager})
  assert.equal(prioritized.priority,5);assert.notEqual(prioritized.owner,owner)
  const change=prioritized.history.at(-1)
  assert.equal(change.reason,p.reason);assert.equal(change.actor,prioritized.owner)
  assert.deepEqual(change.details,{before:0,after:5})
  await h.command('waitlist.quote',{waitlistId:seated.id,quoteMin:20,quoteMax:30,basis:'Two occupied tables finishing dessert.'})
  const update=(row,status,reason)=>h.command('waitlist.status',{waitlistId:row.id,status,reason})
  await update(offered,'offered','Host verbally offered the next fitting table; reply not yet received.')
  await update(seated,'offered','Host spoke with the party at the entrance.')
  await update(seated,'accepted','Party accepted the staff offer in person.')
  const arrived=await update(seated,'arrived','Party is present at the host stand.')
  assert.equal(arrived.status,'arrived')
  const booking=await h.command('waitlist.seat',{waitlistId:seated.id,startAt:s.startAt})
  await h.command('waitlist.seat',{waitlistId:seated.id,startAt:s.startAt},{status:409})
  await update(declined,'declined','Guest declined and will return another day.')
  await update(abandoned,'abandoned','Party left before a table became available.')
  await update(expired,'offered','Host made an in-person offer and asked the party to return.')
  const missed=await update(expired,'expired','Party did not return to the host stand.')
  assert.equal(missed.followUps[0].kind,'missed-offer');assert.equal(missed.followUps[0].owner,owner)
  await h.command('waitlist.status',{waitlistId:queued.id,status:'seated',reason:'Skip capacity check'},{status:409})
  await h.command('waitlist.status',{waitlistId:queued.id,status:'accepted',reason:'Skip offering'},{status:409})
  await h.command('waitlist.priority',{waitlistId:queued.id,priority:3},{status:400})
  await h.command('waitlist.quote',{waitlistId:queued.id,quoteMin:30,quoteMax:20,basis:'Invalid range'},{status:400})
  await h.command('waitlist.status',{waitlistId:offered.id,status:'expired'},{status:400})
  const before=(await h.api('/api/state')).state
  const seatedBefore=before.waitlist.find(row=>row.id===seated.id)
  assert.equal(seatedBefore.status,'seated');assert.equal(seatedBefore.bookingId,booking.id)
  assert.equal(seatedBefore.quote.minMinutes,20);assert.equal(seatedBefore.quote.maxMinutes,30)
  assert.equal(seatedBefore.actualWaitMinutes,(Date.parse(seatedBefore.seatedAt)-Date.parse(seatedBefore.createdAt))/60000)
  assert.ok(seatedBefore.actualWaitMinutes>=0)
  assert.deepEqual(seatedBefore.history.map(e=>e.to),['queued','queued','offered','accepted','arrived','seated'])
  const offerEvent=before.waitlist.find(row=>row.id===offered.id).history.at(-1)
  assert.equal(offerEvent.details.source,'staff-recorded');assert.equal(offerEvent.details.delivery,'not sent by Placemat')
  const closed=await h.command('service.close',{serviceId:s.id,reason:'Dinner finished; contact remaining parties next shift.'},{as:manager})
  assert.ok(closed.closedAt);assert.equal(closed.closedBy,prioritized.owner)
  const after=await h.api('/api/state',undefined,{as:member}),rows=after.state.waitlist
  assert.ok(rows.every(row=>['seated','declined','expired','abandoned'].includes(row.status)))
  assert.equal(rows.find(row=>row.id===queued.id).status,'abandoned')
  assert.equal(rows.find(row=>row.id===offered.id).status,'expired')
  assert.equal(rows.find(row=>row.id===noPhone.id).status,'abandoned')
  assert.deepEqual(rows.find(row=>row.id===seated.id),seatedBefore,'Close preserves realized seated history and actual wait')
  for(const row of rows){
   for(const event of row.history){assert.ok(event.actor);assert.ok(event.owner);assert.ok(event.reason);assert.ok(Number.isFinite(Date.parse(event.at)));assert.ok(after.names[event.actor])}
   for(const task of row.followUps||[]){assert.ok(task.owner);assert.ok(task.reason);assert.ok(Number.isFinite(Date.parse(task.createdAt)));assert.ok(after.names[task.owner])}
  }
  for(const row of rows){assert.ok(row.resolvedAt);assert.equal(row.actualWaitMinutes,(Date.parse(row.resolvedAt)-Date.parse(row.createdAt))/60000)}
  assert.ok(!(await h.api('/api/public/services',undefined,{as:''})).services.some(service=>service.id===s.id))
  const unresolved=rows.find(row=>row.id===offered.id)
  const followup=unresolved.followUps.find(task=>task.kind==='missed-offer')
  assert.equal(followup.status,'open')
  await h.command('waitlist.followup',{waitlistId:unresolved.id,followUpId:followup.id,outcome:'Spoke with party; they chose to return tomorrow.'},{as:member,status:403})
  const resolved=await h.command('waitlist.followup',{waitlistId:unresolved.id,followUpId:followup.id,outcome:'Spoke with party; they chose to return tomorrow.'},{as:manager})
  assert.equal(resolved.followUps[0].status,'completed');assert.ok(resolved.followUps[0].completedBy)
  await h.command('service.close',{serviceId:s.id,reason:'Duplicate close'},{status:409})
  await h.command('waitlist.add',publicGuest(s,20),{status:409})
  await h.command('waitlist.seat',{waitlistId:queued.id,startAt:s.startAt},{status:409})
  await h.command('waitlist.status',{waitlistId:offered.id,status:'accepted',reason:'Late acceptance after close'},{status:409})
  await h.api('/api/public/book',publicGuest(s,21),{as:'',status:409})
  await h.command('proposal.prepare',{kind:'service.turns',plan:{serviceId:s.id,turnPolicy:{cleanupMinutes:0,partyTurns:[],tableTurns:{},areaTurns:{}}},reason:'Review retained closed-service settings'})
  await h.command('guest.erase',{guestId:seated.guestId,confirm:'ERASE'})
  const erasedState=(await h.api('/api/state')).state,erasedQueue=erasedState.waitlist.find(w=>w.id===seated.id)
  assert.equal(erasedQueue.quote.basis,'');assert.ok(erasedQueue.history.every(e=>e.reason===''))
  const archive=JSON.stringify(await h.api('/api/backup'))
  assert.ok(!archive.includes('Two occupied tables finishing dessert.'));assert.ok(!archive.includes('Host spoke with the party at the entrance.'));assert.ok(!archive.includes('Dinner finished; contact remaining parties next shift.'))

 }finally{await h.close()}
})


test('Quoted waits: explicit guest sharing, revised scoped estimate and fitting bypass retain six-top priority',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h,{tables:1,seats:2,covers:40})
  const six=await h.command('waitlist.add',publicGuest(s,96,{partySize:6,entryKind:'reservation-request',quoteMin:20,quoteMax:30,basis:'Private staff basis'}))
  const two=await h.command('waitlist.add',publicGuest(s,97,{partySize:2,entryKind:'walk-in'}))
  const status=token=>h.api('/api/public/queue/status',{token},{as:''})
  assert.equal((await status(six.token)).entry.quote,null)
  await h.command('waitlist.priority',{waitlistId:six.id,priority:5,reason:'Retain six-top promise'})
  await h.command('waitlist.quote',{waitlistId:six.id,quoteMin:20,quoteMax:30,basis:'Waiting for the larger table',guestVisible:true})
  assert.equal((await status(six.token)).entry.quote.minMinutes,20)
  await h.command('waitlist.quote',{waitlistId:six.id,quoteMin:35,quoteMax:45,basis:'The previous turn is delayed',guestVisible:true})
  const guest=await status(six.token);assert.equal(guest.entry.quote.minMinutes,35);assert.equal(guest.entry.quote.basis,'The previous turn is delayed');assert.equal(guest.entry.entryKind,'reservation-request');assert.ok(!JSON.stringify(guest).includes('Private staff basis'));assert.ok(!JSON.stringify(guest).includes('actor'))
  assert.equal((await status(two.token)).entry.entryKind,'walk-in')
  const order=(await h.api('/api/state')).queueOrder;assert.equal(order[0].id,two.id);assert.equal(order[0].fits,true);assert.match(order[0].reason,/earlier party retains priority/);assert.equal(order[1].retainedOrder,1);assert.equal(order[1].fits,false)
  await h.command('waitlist.seat',{waitlistId:two.id,startAt:s.startAt});const retained=(await h.api('/api/state')).state.waitlist.find(w=>w.id===six.id);assert.equal(retained.priority,5);assert.equal(retained.status,'queued');assert.equal(retained.history.filter(e=>e.action==='wait-quoted').length,2)
 }finally{await h.close()}
})

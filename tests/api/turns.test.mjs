import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

test('SERVICE-006: party, table and area turns fit last seating and cleanup; exact reviewed policy edits preserve confirmed reservations',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
  const two=await h.command('table.save',{label:'T2',area:'Dining room',seats:2,x:20,y:20})
  const six=await h.command('table.save',{label:'T6',area:'Dining room',seats:6,x:50,y:20})
  const patio=await h.command('table.save',{label:'P4',area:'Patio',seats:4,x:75,y:60})
  const date=new Date();date.setUTCFullYear(date.getUTCFullYear()+1);const day=date.toISOString().slice(0,10),at=h=>`${day}T${h}:00.000Z`
  const policy={cleanupMinutes:15,partyTurns:[{minSize:1,maxSize:2,minutes:90},{minSize:3,maxSize:6,minutes:120}],tableTurns:{},areaTurns:{Patio:105},lastSeatingAt:at('22:00')}
  const draft=await h.command('service.save',{name:'Friday dinner',startAt:at('17:00'),endAt:at('23:00'),turnMinutes:150,coverLimit:100,turnPolicy:policy})
  const publish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Review party-size turns and reset'})
  await h.command('proposal.approve',{proposalId:publish.id})
  const twoSlots=(await h.api('/api/public/services?partySize=2')).services.find(s=>s.id===draft.id).slots
  assert.ok(twoSlots.some(s=>s.startAt===at('21:15')));assert.ok(!twoSlots.some(s=>s.startAt===at('21:30')))
  const sixSlots=(await h.api('/api/public/services?partySize=6')).services.find(s=>s.id===draft.id).slots
  assert.ok(sixSlots.some(s=>s.startAt===at('20:45')));assert.ok(!sixSlots.some(s=>s.startAt===at('21:00')))
  const b2=(await h.api('/api/public/book',publicGuest(draft,0,{startAt:at('17:00')}),{as:'',status:201})).result
  assert.equal(b2.endAt,at('18:30'));assert.equal(b2.cleanupEndAt,at('18:45'))
  const b6=(await h.api('/api/public/book',publicGuest(draft,1,{partySize:6,startAt:at('17:00')}),{as:'',status:201})).result
  assert.equal(b6.endAt,at('19:00'));assert.equal(b6.cleanupEndAt,at('19:15'))
  await h.command('booking.walkin',publicGuest(draft,2,{startAt:at('18:30'),tableIds:[two.id]}),{status:409})
  await h.command('booking.status',{bookingId:b2.id,status:'seated'});await h.command('booking.status',{bookingId:b2.id,status:'completed'})
  await h.command('booking.stage',{bookingId:b2.id,stage:'ready'})
  await h.command('booking.walkin',publicGuest(draft,2,{startAt:at('18:30'),tableIds:[two.id]}),{status:409})
  const nextTwo=await h.command('booking.walkin',publicGuest(draft,2,{startAt:at('18:45'),tableIds:[two.id]}))
  assert.equal(nextTwo.startAt,b2.cleanupEndAt);assert.equal(nextTwo.endAt,at('20:15'))
  const p4=await h.command('booking.walkin',publicGuest(draft,3,{partySize:4,startAt:at('17:00'),tableIds:[patio.id]}))
  assert.equal(p4.endAt,at('18:45'));assert.equal(p4.cleanupEndAt,at('19:00'),'area rule overrides the party range')
  const manager=await h.signIn('turn-manager@example.test','admin'),reader=await h.signIn('turn-reader@example.test')
  const changed={...policy,cleanupMinutes:30,partyTurns:[{minSize:1,maxSize:2,minutes:60},{minSize:3,maxSize:6,minutes:135}],tableTurns:{[patio.id]:75},lastSeatingAt:at('20:00')}
  await h.command('proposal.prepare',{kind:'service.turns',plan:{serviceId:draft.id,turnPolicy:changed},reason:'Not a manager'},{as:reader,status:403})
  const plan=await h.command('proposal.prepare',{kind:'service.turns',plan:{serviceId:draft.id,turnPolicy:changed},reason:'Review longer large-party turns and earlier last seating'},{as:manager})
  const impact=plan.plan.impacts.find(i=>i.bookingId===b6.id)
  assert.equal(impact.current.endAt,at('19:00'));assert.equal(impact.proposed.endAt,at('19:15'));assert.equal(impact.preserved,true);assert.equal(impact.changed,true)
  // A booking after preparation invalidates the exact impact review.
  const later=(await h.api('/api/public/book',publicGuest(draft,4,{startAt:at('20:30')}),{as:'',status:201})).result
  await h.command('proposal.approve',{proposalId:plan.id},{as:manager,status:409})
  const fresh=await h.command('proposal.prepare',{kind:'service.turns',plan:{serviceId:draft.id,turnPolicy:changed},reason:'Reviewed new booking too'},{as:manager})
  assert.equal(fresh.plan.impacts.find(i=>i.bookingId===later.id).outsideNewPolicy,true)
  const approved=await h.command('proposal.approve',{proposalId:fresh.id},{as:manager})
  const state=(await h.api('/api/state')).state
  for(const original of [b2,b6,p4,nextTwo,later]){const kept=state.bookings.find(b=>b.id===original.id);assert.equal(kept.endAt,original.endAt);assert.equal(kept.cleanupEndAt,original.cleanupEndAt)}
  assert.ok(state.audit.some(a=>a.action==='proposal.approve'&&a.subject===fresh.id&&a.actor===approved.approvedBy))
  const after=(await h.api('/api/public/services?partySize=2')).services.find(s=>s.id===draft.id).slots
  assert.ok(after.some(s=>s.startAt===at('20:00')))
  assert.ok(after.every(s=>s.startAt<=at('20:00')),'last seating is inclusive and new bookings use it')
  await h.api('/api/public/book',publicGuest(draft,9,{startAt:at('20:15')}),{as:'',status:400})
  await h.command('booking.status',{bookingId:p4.id,status:'completed'});await h.command('booking.stage',{bookingId:p4.id,stage:'ready'})
  const tableRule=await h.command('booking.walkin',publicGuest(draft,8,{partySize:4,startAt:at('19:00'),tableIds:[patio.id]}))
  assert.equal(tableRule.endAt,at('20:15'));assert.equal(tableRule.cleanupEndAt,at('20:45'),'table rule overrides area and party rules')
  const newPolicyBooking=(await h.api('/api/public/book',publicGuest(draft,12,{partySize:2,startAt:at('20:00')}),{as:'',status:201})).result
  assert.equal(newPolicyBooking.endAt,at('21:00'));assert.equal(newPolicyBooking.cleanupEndAt,at('21:30'))
  // Reset space remains physical across overlapping services, not just within one schedule.
  const other=await h.command('service.save',{name:'Patio overlap',startAt:at('20:15'),endAt:at('23:00'),turnMinutes:60,coverLimit:20})
  const otherPlan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:other.id},reason:'Review overlapping sitting'})
  await h.command('proposal.approve',{proposalId:otherPlan.id})
  await h.command('booking.status',{bookingId:tableRule.id,status:'completed'});await h.command('booking.stage',{bookingId:tableRule.id,stage:'ready'})
  await h.command('booking.walkin',publicGuest(other,10,{startAt:at('20:15'),tableIds:[patio.id]}),{status:409})
  const adjacent=await h.command('booking.walkin',publicGuest(other,10,{startAt:at('20:45'),tableIds:[patio.id]}))
  assert.equal(adjacent.startAt,tableRule.cleanupEndAt)
  // Service defaults still apply when no party/table/area rule matches.
  const defaultTurn=await h.command('booking.walkin',publicGuest(other,11,{partySize:2,startAt:at('21:30'),tableIds:[six.id]}))
  assert.equal(defaultTurn.endAt,at('22:30'))
  for(const b of [nextTwo,defaultTurn]){await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,stage:'ready'})}
  await h.command('combination.save',{tableIds:[two.id,six.id],capacity:8,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
  const comboDay=new Date(Date.parse(at('17:00'))+86400000).toISOString().slice(0,10)
  const combo=await h.command('service.save',{name:'Combined turn',startAt:comboDay+'T17:00:00Z',endAt:comboDay+'T23:00:00Z',turnMinutes:60,coverLimit:30,turnPolicy:{cleanupMinutes:15,partyTurns:[],tableTurns:{[two.id]:90,[six.id]:120},areaTurns:{}}})
  const comboPlan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:combo.id},reason:'Review longest joined-table turn'})
  await h.command('proposal.approve',{proposalId:comboPlan.id})
  const joined=await h.command('booking.walkin',publicGuest(combo,14,{partySize:8,startAt:combo.startAt,tableIds:[two.id,six.id]}))
  assert.equal(Date.parse(joined.endAt)-Date.parse(joined.startAt),120*60000)
  assert.equal(Date.parse(joined.cleanupEndAt)-Date.parse(joined.endAt),15*60000)
  for(const bad of [{...changed,cleanupMinutes:-1},{...changed,partyTurns:[{minSize:1,maxSize:4,minutes:60},{minSize:2,maxSize:6,minutes:90}]},{...changed,tableTurns:{missing:90}},{...changed,areaTurns:{missing:90}},{...changed,lastSeatingAt:at('16:00')}])await h.command('proposal.prepare',{kind:'service.turns',plan:{serviceId:draft.id,turnPolicy:bad},reason:'Invalid policy'},{status:400})
 }finally{await h.close()}
})

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

test('SERVICE-002: weekly shifts, inclusive seasons and holiday exceptions preview exact capacity/conflicts; reviewed publication and renewal preserve guest commitments',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
  await h.command('table.save',{label:'Dining 2',seats:2,x:20,y:20})
  await h.command('table.save',{label:'Dining 6',seats:6,x:60,y:20})
  // A retired table stays in history but is not a physical seat in any preview.
  const old=await h.command('table.save',{label:'Old 10',seats:10,x:80,y:20})
  await h.command('proposal.approve',{proposalId:(await h.command('proposal.prepare',{kind:'floor.change',plan:{tableId:old.id,retire:true},reason:'Retire the old table before scheduling'})).id})
  const manager=await h.signIn('schedule-manager@example.test','admin'),reader=await h.signIn('schedule-reader@example.test')
  const base={seasonStart:'2027-11-22',seasonEnd:'2027-11-28',weekdays:[0,1,2,3,4,5,6],turnMinutes:90,coverLimit:30,exceptions:[]}
  await h.command('schedule.save',{...base,name:'Dinner',shift:'dinner',startTime:'17:00',endTime:'22:00'},{as:reader,status:403})
  const breakfast=await h.command('schedule.save',{...base,name:'Breakfast',shift:'breakfast',startTime:'07:00',endTime:'10:00',exceptions:[{date:'2027-11-25',closed:true}]},{as:manager})
  const lunch=await h.command('schedule.save',{...base,name:'Lunch',shift:'lunch',startTime:'11:00',endTime:'15:00'},{as:manager})
  const dinner=await h.command('schedule.save',{...base,name:'Dinner',shift:'dinner',startTime:'17:00',endTime:'22:00',exceptions:[{date:'2027-11-25',closed:false,startTime:'14:00',endTime:'20:00',turnMinutes:120,coverLimit:24}]},{as:manager})
  const range={fromDate:'2027-11-22',toDate:'2027-11-28',reason:'Review Thanksgiving week shifts and physical capacity'}
  const overlap=await h.command('schedule.preview',range,{as:manager})
  assert.ok(overlap.plan.conflicts.length,'Thanksgiving lunch/dinner overlap is shown before publication')
  await h.command('schedule.publish',{proposalId:overlap.id},{as:manager,status:409})
  const editedLunch=await h.command('schedule.save',{...lunch,exceptions:[{date:'2027-11-25',closed:true}]},{as:manager})
  await h.command('schedule.publish',{proposalId:overlap.id},{as:manager,status:409})
  const preview=await h.command('schedule.preview',range,{as:manager})
  assert.equal(preview.plan.conflicts.length,0)
  assert.equal(preview.plan.candidates.length,19)
  assert.ok(preview.plan.candidates.every(c=>c.capacity.seats===8&&c.capacity.coverLimit>0))
  const holiday=preview.plan.candidates.find(c=>c.scheduleId===dinner.id&&c.localDate==='2027-11-25')
  assert.equal(holiday.service.startAt,'2027-11-25T19:00:00.000Z');assert.equal(holiday.service.endAt,'2027-11-26T01:00:00.000Z')
  assert.equal(holiday.service.turnMinutes,120);assert.equal(holiday.capacity.coverLimit,24)
  assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.length,0,'preview creates no bookable services')
  await h.command('proposal.approve',{proposalId:preview.id},{as:reader,status:403})
  const approved=await h.command('proposal.approve',{proposalId:preview.id},{as:manager})
  assert.equal(approved.status,'approved');assert.equal(approved.approvedBy,(await h.api('/api/state',undefined,{as:manager})).actor.id)
  const visible=(await h.api('/api/public/services',undefined,{as:''})).services
  assert.equal(visible.length,19)
  for(const c of preview.plan.candidates){const actual=visible.find(s=>s.id===c.service.id);assert.ok(actual);for(const key of ['startAt','endAt','turnMinutes','coverLimit'])assert.equal(actual[key],c.service[key])}
  const repeated=await h.command('schedule.preview',range,{as:manager});await h.command('schedule.publish',{proposalId:repeated.id},{as:manager})
  assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.length,19,'identical preview never duplicates a shift')
  const confirmation=(await h.api('/api/public/book',publicGuest(holiday.service,0,{startAt:holiday.service.startAt}),{as:'',status:201})).result
  const booking=(await h.api('/api/state')).state.bookings.find(b=>b.id===confirmation.id)
  await h.command('schedule.save',{...dinner,startTime:'18:00',coverLimit:28,exceptions:[{date:'2027-11-25',closed:false,startTime:'15:00',endTime:'20:00',turnMinutes:90,coverLimit:20}]},{as:manager})
  const changed=await h.command('schedule.preview',range,{as:manager})
  assert.equal(changed.plan.requiresRenewedApproval.length,7)
  const bookedImpact=changed.plan.requiresRenewedApproval.find(r=>r.serviceId===holiday.service.id)
  assert.equal(bookedImpact.preserved,true);assert.equal(bookedImpact.manualReviewRequired,true);assert.ok(bookedImpact.bookingIds.includes(booking.id))
  const renewIds=changed.plan.requiresRenewedApproval.filter(r=>!r.manualReviewRequired).map(r=>r.serviceId)
  const renewal=await h.command('schedule.preview',{...range,renewServiceIds:renewIds},{as:manager})
  await h.command('schedule.publish',{proposalId:renewal.id},{as:manager})
  const state=(await h.api('/api/state')).state
  assert.deepEqual(state.bookings.find(b=>b.id===booking.id),booking)
  assert.equal(state.services.find(s=>s.id===holiday.service.id).startAt,holiday.service.startAt)
  for(const serviceId of renewIds)assert.equal(state.services.find(s=>s.id===serviceId).coverLimit,28)
  assert.ok(state.audit.some(a=>a.action==='schedule.publish'||a.action==='proposal.approve'))
  const outside=await h.command('schedule.preview',{fromDate:'2027-11-21',toDate:'2027-11-29',reason:'Check inclusive seasonal bounds'},{as:manager})
  assert.ok(outside.plan.candidates.every(c=>c.localDate>='2027-11-22'&&c.localDate<='2027-11-28'))
  // An edit after preparing a new batch makes its exact review stale.
  await h.command('schedule.save',{...breakfast,seasonEnd:'2027-12-05'},{as:manager})
  const stale=await h.command('schedule.preview',{fromDate:'2027-11-29',toDate:'2027-12-05',reason:'Review next week'},{as:manager})
  await h.command('table.save',{label:'Patio 2',seats:2,x:80,y:70})
  await h.command('schedule.publish',{proposalId:stale.id},{as:manager,status:409})
  assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.length,19)
  // Weekly filtering, one-off opening and overnight end use the venue calendar.
  const special=await h.command('schedule.save',{...base,name:'Late dinner',shift:'dinner',weekdays:[5],startTime:'22:00',endTime:'02:00',exceptions:[{date:'2027-11-25',closed:false,startTime:'21:00',endTime:'01:00'}]},{as:manager})
  const nights=await h.command('schedule.preview',{...range,scheduleIds:[special.id]},{as:manager})
  assert.deepEqual(nights.plan.candidates.map(c=>c.localDate),['2027-11-25','2027-11-26'])
  assert.equal(nights.plan.candidates[1].service.endAt,'2027-11-27T07:00:00.000Z')
  // DST gaps refuse; repeated local times require the actual selected offset.
  const dst=await h.command('schedule.save',{...base,name:'DST breakfast',shift:'breakfast',seasonStart:'2027-03-14',seasonEnd:'2027-11-07',startTime:'02:30',endTime:'05:00'},{as:manager})
  await h.command('schedule.preview',{scheduleIds:[dst.id],fromDate:'2027-03-14',toDate:'2027-03-14',reason:'Nonexistent local start'},{as:manager,status:400})
  await h.command('schedule.save',{...dst,startTime:'01:30',endTime:'04:00'},{as:manager})
  await h.command('schedule.preview',{scheduleIds:[dst.id],fromDate:'2027-11-07',toDate:'2027-11-07',reason:'Ambiguous local start'},{as:manager,status:400})
  const resolved=await h.command('schedule.save',{...dst,startTime:'01:30',endTime:'04:00',startOffset:'-05:00'},{as:manager})
  const dstPlan=await h.command('schedule.preview',{scheduleIds:[resolved.id],fromDate:'2027-11-07',toDate:'2027-11-07',reason:'Choose repeated standard-time start'},{as:manager})
  assert.equal(dstPlan.plan.candidates[0].service.startAt,'2027-11-07T06:30:00.000Z')
  assert.equal(editedLunch.version,lunch.version+1)
  // DATA-002: exact schedule snapshots must not retain erased override free text.
  const extra=await h.command('service.save',{name:'Private service',startAt:'2028-01-05T17:00:00Z',endAt:'2028-01-05T22:00:00Z',turnMinutes:90,coverLimit:30,bookingRules:{'walk-in':{minParty:4,maxParty:20,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:20,blockedStarts:[]}}})
  const extraPlan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:extra.id},reason:'Review private service'})
  await h.command('proposal.approve',{proposalId:extraPlan.id})
  const overridden=await h.command('booking.walkin',publicGuest(extra,18,{startAt:extra.startAt,overrideReason:'Guest Rowan private accommodation'}))
  await h.command('schedule.preview',range)
  const custody=JSON.stringify((await h.api('/api/state')).state)
  assert.ok(custody.includes('Guest Rowan private accommodation'))
  await h.command('guest.erase',{guestId:overridden.guestId,confirm:'ERASE'})
  assert.ok(!JSON.stringify((await h.api('/api/state')).state).includes('Guest Rowan private accommodation'))
 }finally{await h.close()}
})

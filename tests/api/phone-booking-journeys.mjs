import assert from 'node:assert/strict'

/** Public HTTP journey; the caller owns installation lifecycle and test registration. */
export async function phoneBookingJourney(h){
 await h.command('venue.update',{name:'synthetic-placemat-1',timezone:'America/New_York'})
 const tables=[]
 for(let n=1;n<=4;n++)tables.push(await h.command('table.save',{label:`synthetic-placemat-${n}`,seats:4,area:'synthetic-placemat-1',x:n*20,y:30}))
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),startAt=day+'T20:00:00.000Z'
 const service=await h.command('service.save',{name:'synthetic-placemat-1',startAt,endAt:day+'T23:00:00.000Z',turnMinutes:60,coverLimit:40,pacing:{intervalMinutes:15,arrivalCovers:4,arrivalParties:4,concurrentCovers:40,areaArrivalCaps:{}}})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'synthetic-placemat-1'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 const at=minutes=>new Date(Date.parse(startAt)+minutes*60000).toISOString()
 const publicBooking=(await h.api('/api/public/book',{serviceId:service.id,startAt,partySize:4,name:'synthetic-placemat-1',email:'synthetic-placemat-1@example.test',phone:'+14155550101'},{as:'',status:201})).result
 const guest=(await h.api('/api/guests?search=synthetic-placemat-1@example.test')).guests[0]
 const host=await h.signIn('synthetic-placemat-2@example.test','member','synthetic-placemat-2')
 const operator=(await h.api('/auth/operators')).find(p=>p.email==='synthetic-placemat-2@example.test')
 await h.command('team.host',{operatorId:operator.id,enabled:true})
 const payload={serviceId:service.id,startAt:at(90),partySize:2,guestId:guest.id,staffIntake:{source:'concierge',contactPreference:'sms',confirmationConsent:true},requests:{occasion:'synthetic-placemat-1',allergyNotes:'synthetic-placemat-2',wheelchair:true},requestsAcknowledged:true}
 const phone=await h.command('booking.phone',payload,{as:host})
 assert.equal(phone.guestId,guest.id);assert.equal(phone.source,'phone');assert.deepEqual(phone.staffIntake,payload.staffIntake)
 assert.equal(phone.requests.allergyNotes,payload.requests.allergyNotes);assert.equal(phone.requests.wheelchair,true)
 let state=await h.api('/api/state')
 assert.equal(state.guests.filter(g=>g.id===guest.id).length,1)
 assert.ok(state.state.bookings.some(b=>b.id===publicBooking.id));assert.ok(state.state.bookings.some(b=>b.id===phone.id))
 const changed=await h.command('booking.phone.change',{bookingId:phone.id,startAt:at(105),partySize:3,version:state.version},{as:host})
 assert.equal(changed.guestId,guest.id);assert.deepEqual(changed.staffIntake,phone.staffIntake);assert.deepEqual(changed.requests,phone.requests)
 await h.command('booking.phone.change',{bookingId:phone.id,startAt:at(120),partySize:3,version:state.version},{as:host,status:409})
 await h.command('booking.phone',{...payload,guestId:'synthetic-placemat-404',startAt:at(120)},{as:host,status:404})
 const overflow={serviceId:service.id,startAt,partySize:2,name:'synthetic-placemat-3',email:'synthetic-placemat-3@example.test',staffIntake:{source:'offline',contactPreference:'email',confirmationConsent:true}}
 await h.command('booking.phone',overflow,{as:host,status:403})
 await h.command('team.pacing',{operatorId:operator.id,enabled:true})
 const review=await h.api('/api/pacing/preview',{command:'booking.phone',payload:overflow},{as:host})
 assert.ok(review.violations.some(v=>v.kind==='arrival-covers'&&v.excess===2))
 await h.command('booking.phone',overflow,{as:host,status:409})
 const confirmed={...overflow,pacingReview:review.review,pacingConfirm:'yes',pacingReason:'synthetic-placemat-1'}
 await h.command('booking.phone',{...confirmed,partySize:3},{as:host,status:409})
 const overridden=await h.command('booking.phone',confirmed,{as:host})
 assert.equal(overridden.status,'booked');assert.equal(overridden.pacingOverride.actor,operator.id)
 state=await h.api('/api/state')
 assert.ok(state.state.audit.some(a=>a.subject===overridden.id&&a.action==='booking.pacing-override'))
 await h.api('/api/pacing/preview',{command:'booking.phone',payload:{...overflow,email:'synthetic-placemat-4@example.test',tableIds:state.state.bookings.find(b=>b.id===publicBooking.id).tableIds}},{as:host,status:409})
 const nextDay=new Date(Date.parse(startAt)+86400000).toISOString(),rules={minParty:1,maxParty:1,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:20,blockedStarts:[]}
 const restricted=await h.command('service.save',{name:'synthetic-placemat-2',startAt:nextDay,endAt:new Date(Date.parse(nextDay)+3*3600000).toISOString(),turnMinutes:60,coverLimit:40,bookingRules:{online:rules}})
 const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:restricted.id},reason:'synthetic-placemat-2'})
 await h.command('proposal.approve',{proposalId:publication.id})
 const exception={serviceId:restricted.id,startAt:nextDay,partySize:2,name:'synthetic-placemat-5',email:'synthetic-placemat-5@example.test',overrideReason:'synthetic-placemat-2'}
 await h.command('booking.phone',exception,{as:host,status:409})
 const managerException=await h.command('booking.phone',exception)
 assert.equal(managerException.ruleOverride.channel,'phone');assert.equal(managerException.ruleOverride.reason,exception.overrideReason)
 await h.command('booking.phone',{...exception,email:'synthetic-placemat-6@example.test',tableIds:managerException.tableIds},{status:409})
 return {service,phone,overridden,tables,host,operator}
}

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

// Native allocation, deadline and modification proof uses the actual Worker with a pinned clock.
export async function nativeChannelJourney(){
 const {installation}=await import('./harness.mjs'),{csvRecords}=await import('./business-fixture.mjs')
 let now=Date.parse('2026-11-02T12:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now});let restored
 try{
  await h.command('venue.update',{name:'synthetic-placemat-1',timezone:'UTC'})
  const tables=[];for(let n=0;n<3;n++)tables.push(await h.command('table.save',{label:`synthetic-placemat-${n}`,seats:4,x:20+n*25,y:30}))
  const service=await h.command('service.save',{name:'synthetic-placemat-1',startAt:'2026-11-09T18:00:00Z',endAt:'2026-11-10T00:00:00Z',turnMinutes:60,coverLimit:60})
  const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'synthetic-placemat-1'});await h.command('proposal.approve',{proposalId:publication.id})
  const directDeadline='2026-11-02T13:00:00.000Z',phoneDeadline='2026-11-02T14:00:00.000Z'
  const protect=async(index,channel,releaseAt)=>{
   const advice=await h.api('/api/allocation-advice?serviceId='+service.id),alternative=advice.inventory.alternatives.find(a=>a.protection.tableIds[0]===tables[index].id&&(a.protection.channel??'online')===channel)
   assert.ok(alternative,`${channel} protection is feasible`)
   const proposal=await h.command('proposal.prepare',{kind:'inventory.protect',plan:{serviceId:service.id,alternativeId:alternative.id,releaseAt},reason:'synthetic-placemat-1'})
   return h.command('proposal.approve',{proposalId:proposal.id})
  }
  await protect(0,'online',directDeadline);await protect(1,'online',directDeadline);await protect(2,'phone',phoneDeadline)
  let serial=0
  const payload=(index,extra={})=>({serviceId:service.id,startAt:service.startAt,tableIds:[tables[index].id],partySize:4,name:`synthetic-placemat-${++serial}`,email:[`synthetic-placemat-${serial}`,'example.test'].join('@'),...extra})
  const phone=p=>h.command('booking.phone',p),website=(p,status=201)=>h.api('/api/public/book',p,{as:'',status})
  await h.command('booking.phone',payload(1),{status:409})
  const blocked=await website(payload(2,{pacingConfirm:'yes',overrideReason:'synthetic-placemat-1'}),409);assert.match(blocked.error,/protected for phone/)
  const first=await phone(payload(2,{staffIntake:{source:'phone',contactPreference:'none',confirmationConsent:false,campaign:'synthetic-placemat-phone'}}))
  await h.command('booking.phone',payload(2),{status:409})
  await h.command('embed.origins',{origins:['https://restaurant.example.test']})
  const direct=(await website(payload(0,{embedOrigin:'https://restaurant.example.test',campaign:'synthetic-placemat-widget'}))).result
  const cancelled=(await website(payload(1))).result;await h.command('booking.status',{bookingId:cancelled.id,status:'cancelled'})
  // Expiring direct protection releases that channel restriction only; phone keeps its own deadline.
  now=Date.parse(directDeadline)
  const stillProtected=await website(payload(2),409);assert.match(stillProtected.error,/protected for phone/)
  const before=(await h.api('/api/state')).state.bookings.length
  const raced=await Promise.all([h.request('/api/public/book',{method:'POST',as:'',body:payload(1)}),h.request('/api/commands',{method:'POST',body:{command:'booking.phone',payload:payload(1)}})])
  assert.equal(raced.filter(r=>r.ok).length,1);assert.equal(raced.filter(r=>r.status===409).length,1)
  assert.equal((await h.api('/api/state')).state.bookings.length,before+1)
  now=Date.parse(phoneDeadline)
  const occupied=await website(payload(2),409);assert.doesNotMatch(occupied.error,/protected for phone/)
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===first.id).status,'booked')
  console.log('PROBE DIST-004 allocation: reviewed two direct four-tops and one phone four-top -> channel exhaustion, independent deadlines and one concurrent last-table winner; occupied phone table retained')
  // Guests genuinely change time and size; source, campaign and widget origin stay immutable.
  const change=async booking=>{
   await h.command('booking.management.send',{bookingId:booking.id,acknowledged:true})
   const token=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
   const preview=await h.api('/api/public/booking-management/preview',{token,action:'change',startAt:new Date(Date.parse(booking.startAt)+15*60000).toISOString(),partySize:3},{as:''})
   await h.api('/api/public/booking-management/commit',{token,previewId:preview.previewId,acknowledged:true},{as:''})
   const actual=(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id)
   assert.equal(actual.partySize,3);assert.equal(Date.parse(actual.startAt),Date.parse(booking.startAt)+15*60000)
   assert.equal(actual.source,booking.source);assert.deepEqual(actual.staffIntake,booking.staffIntake);assert.deepEqual(actual.attribution,booking.attribution)
   return actual
  }
  await change((await h.api('/api/state')).state.bookings.find(b=>b.id===direct.id))
  const native=[]
  for(const [index,source] of ['phone','concierge','offline'].entries()){
   const booking=await phone(payload(2,{startAt:new Date(Date.parse(service.startAt)+(index+1)*90*60000).toISOString(),partySize:2,staffIntake:{source,contactPreference:'email',confirmationConsent:true,campaign:`synthetic-placemat-${source}`}}))
   const actual=await change(booking);native.push(actual)
   for(const staffIntake of [{...actual.staffIntake,source:source==='phone'?'offline':'phone'},{...actual.staffIntake,campaign:'synthetic-placemat-replaced'}]){
    const view=await h.api('/api/state');await h.command('booking.phone.change',{bookingId:actual.id,startAt:actual.startAt,partySize:actual.partySize,version:view.version,staffIntake},{status:409});assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===actual.id),actual)
   }
  }
  console.log('PROBE DIST-004 attribution: guest management preview and commit -> actual time and size edits preserve phone, concierge, offline, campaign and original widget origin; staff replacement refused unchanged')
  const bookings=(await h.api('/api/state')).state.bookings,services=(await h.api('/api/state')).state.services
  const csv=csvRecords(await(await h.request('/api/business-export/bookings.csv')).text())
  for(const booking of bookings){const row=csv.find(r=>r.id===booking.id);assert.equal(row.source,booking.source);assert.deepEqual(JSON.parse(row.attribution_json||'null'),booking.attribution??null);assert.deepEqual(JSON.parse(row.staffIntake_json||'null'),booking.staffIntake??null)}
  const serviceCsv=csvRecords(await(await h.request('/api/business-export/services.csv')).text());assert.deepEqual(JSON.parse(serviceCsv.find(r=>r.id===service.id).directInventory_json),services.find(s=>s.id===service.id).directInventory)
  restored=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now});await restored.api('/api/restore',{archive:await h.api('/api/backup'),confirm:'RESTORE'})
  const after=(await restored.api('/api/state')).state;assert.deepEqual(after.bookings,bookings);assert.deepEqual(after.services,services)
  const {channelSummary}=await import('../../public/placemat-widget.js'),summary=channelSummary(bookings,v=>String(v))
  assert.match(summary,/concierge: 1 parties · 3 covers/);assert.match(summary,/offline: 1 parties · 3 covers/);assert.match(summary,new RegExp(`Total: ${bookings.length} parties · ${bookings.reduce((n,b)=>n+b.partySize,0)} covers`))
  console.log('PROBE DIST-004 reconciliation: booking and service CSV downloads plus archive restore -> exact native source, campaign, release records and cover totals retained')
 }finally{if(restored)await restored.close();await h.close()}
}

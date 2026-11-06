import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,resendDeliveryFixture,service} from './harness.mjs'

test('SERVICE-004: lunch/dinner channel rules refuse early, late, oversized and blocked guests; manager overrides remain physical and audited',async()=>{
 const h=await installation();try{
  // Keep a passed cutoff available even during New York's midnight minute.
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date())==='00'?'America/Los_Angeles':'America/New_York'
  await h.command('venue.update',{name:'Cedar & Salt',timezone:zone})
  const table=await h.command('table.save',{label:'Dining 1',seats:6,x:30,y:30})
  const manager=await h.signIn('rules-manager@example.test','admin'),reader=await h.signIn('rules-reader@example.test')
  const base={minParty:2,maxParty:4,horizonDays:60,leadMinutes:30,sameDayCutoff:'23:59',slotMinutes:30,inquiryAbove:12,blockedStarts:[]}
  const date=new Date();date.setUTCDate(date.getUTCDate()+7);const day=date.toISOString().slice(0,10)
  async function publish(name,startAt,endAt,online,staff={...base,leadMinutes:20000,maxParty:6}){
   const s=await h.command('service.save',{name,startAt,endAt,turnMinutes:60,coverLimit:100,bookingRules:{online,'walk-in':staff,waitlist:{...staff,leadMinutes:0}}})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Review exact channel rules'})
   await h.command('proposal.approve',{proposalId:p.id});return s
  }
  const lunch=await publish('Lunch',day+'T16:00:00Z',day+'T20:00:00Z',{...base,blockedStarts:[day+'T17:00:00Z']})
  const dinner=await publish('Dinner',day+'T22:00:00Z',new Date(Date.parse(day+'T22:00:00Z')+4*3600000).toISOString(),{...base,minParty:1,maxParty:6,slotMinutes:15})
  const availability=(await h.api('/api/public/services?partySize=4',undefined,{as:''})).services
  const starts=availability.find(s=>s.id===lunch.id).slots.map(s=>s.startAt)
  assert.ok(starts.includes(day+'T16:00:00.000Z'));assert.ok(!starts.includes(day+'T17:00:00.000Z'))
  assert.ok(!starts.includes(day+'T16:15:00.000Z'));assert.ok(availability.find(s=>s.id===dinner.id).slots.some(s=>s.startAt.endsWith('22:15:00.000Z')))
  async function refuse(s,extra,status=409,pattern){const r=await h.api('/api/public/book',publicGuest(s,10,extra),{as:'',status});if(pattern)assert.match(r.error,pattern);return r}
  await refuse(lunch,{partySize:1},409,/Party size/)
  await refuse(lunch,{partySize:5},409,/Party size/)
  await refuse(lunch,{partySize:16},409,/inquiry.*no booking/i)
  await refuse(lunch,{startAt:day+'T17:00:00Z'},409,/blocked/)
  await refuse(lunch,{startAt:day+'T16:15:00Z'},400,/30-minute/)
  await refuse(lunch,{startAt:day+'T19:30:00Z'},400,/full turn/)
  const beyond=await publish('Too far',day+'T10:00:00Z',day+'T13:00:00Z',{...base,horizonDays:1},{...base,horizonDays:1,minParty:1,maxParty:1,leadMinutes:0})
  await refuse(beyond,{},409,/open 1/)
  const lead=await publish('Too early',day+'T06:00:00Z',day+'T09:00:00Z',{...base,leadMinutes:20000})
  await refuse(lead,{},409,/lead time/)
  assert.equal((await h.api('/api/public/services?partySize=2')).services.find(s=>s.id===lead.id).slots.length,0)
  // Test the cutoff with an arrival in today's service, including late-night runs.
  // Relative UTC instants avoid a fixed DST offset and a tomorrow-only slot.
  const cutoffStart=Math.floor(Date.now()/1800000)*1800000
  const cutoff=await publish('Same-day cutoff',new Date(cutoffStart).toISOString(),new Date(cutoffStart+3*3600000).toISOString(),{...base,sameDayCutoff:'00:00'})
  await refuse(cutoff,{startAt:cutoff.startAt},409,/cutoff/)
  await h.command('booking.walkin',publicGuest(lunch,3,{tableIds:[table.id]}),{as:manager,status:409})
  await h.command('booking.walkin',publicGuest(lunch,3,{tableIds:[table.id],overrideReason:'Caller already at the host stand'}),{as:reader,status:403})
  const before=(await h.api('/api/state')).state.bookings.length
  await h.api('/api/public/book',publicGuest(lead,1,{overrideReason:'public cannot override'}),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,before)
  const seated=await h.command('booking.walkin',publicGuest(lunch,3,{tableIds:[table.id],overrideReason:'Caller already at the host stand'}),{as:manager})
  assert.match(seated.ruleOverride.violations.join(' '),/lead time/);assert.equal(seated.ruleOverride.reason,'Caller already at the host stand')
  const state=(await h.api('/api/state')).state
  assert.ok(state.audit.some(a=>a.action==='booking.rule-override'&&a.subject===seated.id&&a.actor===seated.ruleOverride.actor))
  await h.command('booking.walkin',publicGuest(lunch,4,{partySize:6,tableIds:[table.id],overrideReason:'Cannot create seats'}),{as:manager,status:409})
  await h.command('booking.status',{bookingId:seated.id,status:'completed'});await h.command('booking.stage',{bookingId:seated.id,stage:'ready'})
  const exception=await h.command('booking.walkin',publicGuest(beyond,5,{overrideReason:'Manager accepted advance two-top'}),{as:manager})
  assert.equal(exception.ruleOverride.violations.length,2)
  assert.match(exception.ruleOverride.violations.join(' '),/Party size.*open 1/)
  await h.command('booking.status',{bookingId:exception.id,status:'completed'});await h.command('booking.stage',{bookingId:exception.id,stage:'ready'})
  const waiting=await h.command('waitlist.add',publicGuest(dinner,2))
  const waitSeated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:dinner.startAt})
  assert.equal(waitSeated.ruleOverride,undefined,'separate waitlist lead rule applies')
  await h.command('service.save',{name:'Invalid rules',startAt:day+'T06:00:00Z',endAt:day+'T09:00:00Z',turnMinutes:60,coverLimit:10,bookingRules:{online:{...base,minParty:5,maxParty:2}}},{status:400})
  await h.command('guest.erase',{guestId:seated.guestId,confirm:'ERASE'})
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===seated.id).ruleOverride.reason,'')
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('Caller already at the host stand'))
 }finally{await h.close()}
})

test('BOOK-003: accessible Friday search offers a real Saturday alternative, commits exact area/access and reselects stale inventory without a false booking',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
  const accessible=await h.command('table.save',{label:'Window four',seats:4,area:'Dining',accessTags:['wheelchair','step-free'],x:20,y:30})
  const patio=await h.command('table.save',{label:'Patio four',seats:4,area:'Patio',accessTags:['step-free'],x:60,y:30})
  const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7))
  const friday=date.toISOString().slice(0,10),saturday=new Date(date.getTime()+86400000).toISOString().slice(0,10),sunday=new Date(date.getTime()+2*86400000).toISOString().slice(0,10)
  const publish=async(name,day)=>{const s=await h.command('service.save',{name,startAt:day+'T23:00:00Z',endAt:new Date(Date.parse(day+'T23:00:00Z')+90*60000).toISOString(),turnMinutes:90,coverLimit:40});const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Review public search service'});await h.command('proposal.approve',{proposalId:p.id});return s}
  const fri=await publish('Friday dinner',friday),sat=await publish('Saturday dinner',saturday),sun=await publish('Sunday dinner',sunday)
  await h.api('/api/public/book',publicGuest(fri,0,{partySize:4,area:'Dining',requiredAccessTags:['wheelchair']}),{as:'',status:201})
  const search=async(extra={})=>{const p=new URLSearchParams({date:friday,partySize:'4',area:'Dining',requiredAccessTags:'wheelchair',...extra});return h.api('/api/public/search?'+p,undefined,{as:''})}
  const found=await search()
  assert.ok(found.results.length);assert.ok(found.results.every(r=>r.date!==friday&&r.alternative))
  assert.equal(found.results[0].serviceId,sat.id);assert.equal(found.results[0].date,saturday)
  assert.ok(!JSON.stringify(found).includes('guest0@example.test'))
  assert.deepEqual(found.query.requiredAccessTags,['wheelchair']);assert.ok(found.accessTags.includes('step-free'))
  const patioSearch=await search({area:'Patio',requiredAccessTags:'step-free'})
  assert.equal(patioSearch.results[0].serviceId,fri.id);assert.equal(patioSearch.results[0].alternative,false)
  const empty=await search({area:'Patio'})
  assert.equal(empty.results.length,0);assert.match(empty.message,/Change.*date.*contact.*No booking/i)
  assert.equal((await search({partySize:'5'})).results.length,0)
  const pick=found.results[0]
  const confirmed=(await h.api('/api/public/book',publicGuest(sat,1,{partySize:4,startAt:pick.startAt,area:'Dining',requiredAccessTags:['wheelchair']}),{as:'',status:201})).result
  assert.equal(confirmed.startAt,pick.startAt);assert.equal(confirmed.area,'Dining');assert.deepEqual(confirmed.requiredAccessTags,['wheelchair'])
  let state=await h.api('/api/state'),booking=state.state.bookings.find(b=>b.id===confirmed.id)
  assert.deepEqual(booking.tableIds,[accessible.id]);assert.equal(booking.requiredArea,'Dining')
  await h.command('booking.move',{bookingId:booking.id,tableIds:[patio.id],version:state.version},{status:409})
  const stale=await h.api('/api/public/book',publicGuest(sat,2,{partySize:4,startAt:pick.startAt,area:'Dining',requiredAccessTags:['wheelchair']}),{as:'',status:409})
  assert.match(stale.error,/another available time|another time/)
  assert.ok(!(await search()).results.some(r=>r.serviceId===sat.id))
  // Two guests act on the same real Sunday result; the public transaction door admits one.
  const responses=await Promise.all([3,4].map(i=>h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(sun,i,{partySize:4,area:'Dining',requiredAccessTags:['wheelchair']})})))
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409])
  state=await h.api('/api/state');assert.equal(state.state.bookings.filter(b=>b.serviceId===sat.id).length,1);assert.equal(state.state.bookings.filter(b=>b.serviceId===sun.id).length,1)
  assert.equal((await search()).results.length,0)
  for(const suffix of ['date=2026-02-30','date=2026-13-01','date=2026-01-01&date=2026-01-02','partySize=0'])await h.api('/api/public/search?'+suffix,undefined,{as:'',status:400})
  await h.api('/api/public/search',{}, {as:'',status:405})
  // An arrival after local midnight belongs to the arrival day, even when its service began yesterday.
  const lateDate=new Date(date.getTime()+3*86400000).toISOString().slice(0,10)
  const late=await h.command('service.save',{name:'Late dining',startAt:lateDate+'T03:30:00Z',endAt:lateDate+'T09:00:00Z',turnMinutes:90,coverLimit:40})
  const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:late.id},reason:'Late arrival date search'});await h.command('proposal.approve',{proposalId:p.id})
  const localSearch=await search({date:lateDate})
  const lateResults=localSearch.results.filter(r=>r.serviceId===late.id)
  assert.ok(lateResults.length);assert.ok(lateResults.every(r=>r.date===lateDate));assert.ok(!lateResults.some(r=>r.startAt===late.startAt),'Local arrival day excludes the prior evening')
  await h.command('guest.erase',{guestId:booking.guestId,confirm:'ERASE'})
  booking=(await h.api('/api/state')).state.bookings.find(b=>b.id===confirmed.id)
  assert.equal(booking.requiredArea,undefined);assert.deepEqual(booking.requiredAccessTags,[])
 }finally{await h.close()}
})


test('Private guest reservation links deliver scoped consent, atomic two-to-four changes and replay-safe cancellation',async()=>{
 const h=await installation();try{
  const {service}=await import('./harness.mjs'),f=await service(h,{tables:1,seats:4,covers:8})
  const book=async(i,extra={})=>(await h.api('/api/public/book',publicGuest(f.service,i,extra),{as:'',status:201})).result
  const booked=await book(1,{name:'Amelia Chen'}),other=await book(2,{startAt:new Date(Date.parse(f.startAt)+2*3600000).toISOString()})
  const manager=await h.signIn('synthetic-placemat-manage-manager@example.test','admin')
  const host=await h.signIn('synthetic-placemat-manage-host@example.test'),reader=await h.signIn('synthetic-placemat-manage-reader@example.test')
  const hostId=(await h.api('/api/state',undefined,{as:host})).actor.id
  await h.command('team.host',{operatorId:hostId,enabled:true})
  for(const as of [host,reader])await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true},{as,status:403})
  await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true,channel:'sms'},{as:manager,status:400})
  await h.command('booking.management.send',{bookingId:booked.id},{status:400})
  const issued=await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true},{as:manager});assert.equal(issued.status,'accepted');assert.equal(issued.token,undefined)
  const mail=h.messages.at(-1),link=new URL(mail.text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]);let token=new URLSearchParams(link.hash.slice(1)).get('token')
  assert.equal(link.search,'');assert.ok(token)
  const api=(action,p={},status=200)=>h.api('/api/public/booking-management/'+action,{token,...p},{as:'',status})
  let view=await api('status');assert.equal(view.booking.id,booked.id);assert.equal(view.guest.name,'Amelia Chen');assert.ok(!JSON.stringify(view).includes(other.id))
  await api('status',{token:'synthetic-placemat-foreign'},404)
  await api('status',{token:token.slice(0,-1)+(token.at(-1)==='0'?'1':'0')},404)
  const elsewhere=await installation();try{await elsewhere.api('/api/public/booking-management/status',{token},{as:'',status:404})}finally{await elsewhere.close()}
  const preview=await api('preview',{action:'change',partySize:4,startAt:new Date(Date.parse(booked.startAt)+15*60000).toISOString(),contact:{name:'Amelia Chen',email:'amelia@example.test',phone:'+1 212 555 0191'}})
  assert.equal(preview.consequences.feeCents,0);assert.equal(preview.consequences.refundCents,0)
  await api('commit',{previewId:preview.previewId},400)
  const changed=await api('commit',{previewId:preview.previewId,acknowledged:true});assert.equal(changed.booking.partySize,4);assert.equal(Date.parse(changed.booking.startAt),Date.parse(booked.startAt)+15*60000);assert.equal((await h.api('/api/state')).bookingContacts[booked.id].email,'amelia@example.test');{const state=await h.api('/api/state');assert.equal(state.guests.find(g=>g.id===state.state.bookings.find(b=>b.id===booked.id).guestId)?.email,'guest1@example.test')}
  const old=token;assert.equal(changed.token,null);assert.equal(changed.managementAccessEnded,true);await api('status',{token:old},404);await api('commit',{token:old,previewId:preview.previewId,acknowledged:true},404)
  assert.equal(h.messages.at(-1),mail,'Changing an email never sends to the new address automatically')
  await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true},{as:manager});assert.deepEqual(h.messages.at(-1).to,['amelia@example.test']);token=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
  const original=(await h.api('/api/state')).state.bookings.find(b=>b.id===booked.id)
  await api('preview',{action:'change',partySize:5,startAt:booked.startAt},409)
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===booked.id),original)
  // Changed booking versions invalidate a prepared consent; unrelated guests are never returned.
  const stale=await api('preview',{action:'reconfirm'})
  await h.command('booking.lock',{bookingId:booked.id,locked:true,version:(await h.api('/api/state')).version})
  await api('commit',{previewId:stale.previewId,acknowledged:true},404)
  await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true});token=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
  for(let i=0;i<2;i++){const previous=token;await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true},{as:manager});token=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token');await api('status',{token:previous},404)}
  const sent=h.messages.length;await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true},{as:manager,status:429});assert.equal(h.messages.length,sent)
  const issueEvents=(await h.api('/api/audit')).rows.filter(e=>e.action==='booking.management.issue'&&e.subject===booked.id);assert.equal(issueEvents.length,5);assert.ok(issueEvents.every(e=>e.actor));const managerId=(await h.api('/api/state',undefined,{as:manager})).actor.id;assert.ok(issueEvents.some(e=>e.actor===managerId))
  const beforeRotation=await api('status');const reconfirm=await api('preview',{action:'reconfirm'}),reconfirmed=await api('commit',{previewId:reconfirm.previewId,acknowledged:true});assert.equal(reconfirmed.booking.serviceStatus,'reconfirmed');assert.equal(reconfirmed.expiresAt,beforeRotation.expiresAt);token=reconfirmed.token
  const cancelled=await api('preview',{action:'cancel'});assert.equal(cancelled.booking.id,booked.id)
  await api('commit',{previewId:cancelled.previewId,acknowledged:false},400)
  const result=await api('commit',{previewId:cancelled.previewId,acknowledged:true});assert.equal(result.booking.status,'cancelled')
  token=result.token;assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===other.id).status,'booked')
  const owner=(await h.api('/api/state')).actor.id
  await h.command('payment.request',{bookingId:other.id,amountCents:1000,dueAt:new Date(Date.now()+3600000).toISOString(),followupOwnerId:owner,reason:'Guest agreed to this deposit'})
  await h.command('booking.management.send',{bookingId:other.id,acknowledged:true});const moneyToken=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
  const review=await api('status',{token:moneyToken});assert.equal(review.managerReviewRequired,true);assert.match(review.managerReviewMessage,/manager.*fees.*refunds/);assert.equal(review.consequences,undefined)
  const refused=await api('preview',{token:moneyToken,action:'cancel'},409);assert.match(refused.error,/manager.*fees.*refunds/);assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===other.id).status,'booked')
  const archive=await h.api('/api/backup');assert.ok(!JSON.stringify(archive).includes(token));assert.ok(!JSON.stringify(archive).includes(moneyToken));assert.match(await (await h.request('/api/business-export/bookings.csv')).text(),/amelia@example.test/)
  const restored=await installation();try{await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.equal((await restored.api('/api/state')).bookingContacts[booked.id].email,'amelia@example.test');await restored.api('/api/public/booking-management/status',{token},{as:'',status:404})}finally{await restored.close()}
  await h.db.prepare("UPDATE pm_booking_management SET expires_at='2000-01-01T00:00:00.000Z' WHERE booking_id=?").bind(booked.id).run();await api('status',{},404)
  const state=(await h.api('/api/state')).state,audit=await h.api('/api/audit');assert.ok(JSON.stringify(audit).includes('booking.management.cancel'))
  const guestId=state.bookings.find(b=>b.id===booked.id).guestId;await h.command('guest.erase',{guestId,confirm:'ERASE'})
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_booking_contacts WHERE guest_id=?').bind(guestId).first()).n,0)
 }finally{await h.close()}
})


test('Signed booking email observations retain original recipients and order-safe facts without replaying booking effects',async()=>{
 const now=Date.now(),clock=()=>now,fixture=resendDeliveryFixture(clock),bindings={...fixture.bindings}
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock,bindings})
 const address=n=>['synthetic-placemat-'+n,'example.test'].join('@')
 try{
  const f=await service(h,{tables:4,seats:4,covers:40})
  const booked=(await h.api('/api/public/book',publicGuest(f.service,0,{email:address('recipient')}),{as:'',status:201})).result
  const manager=await h.signIn(address('manager'),'admin'),member=await h.signIn(address('member')),host=await h.signIn(address('host')),server=await h.signIn(address('server'))
  const personId=async as=>(await h.api('/api/state',undefined,{as})).actor.id
  await h.command('team.host',{operatorId:await personId(host),enabled:true})
  await h.command('team.server',{operatorId:await personId(server),enabled:true})
  const issued=await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true},{as:manager})
  const recipient=address('recipient'),message=issued.providerMessageId
  assert.ok(message);assert.equal(issued.token,undefined)
  const token=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
  const deliveries=async(as)=>(await h.api('/api/booking-mail',undefined,as?{as}:{})).deliveries
  let rows=await deliveries(manager);assert.equal(rows.length,1);assert.equal(rows[0].status,'accepted');assert.equal(rows[0].recipient,recipient)
  const native=async()=>({state:(await h.api('/api/state')).state,links:(await h.db.prepare('SELECT * FROM pm_booking_management ORDER BY booking_id').all()).results,sends:h.messages.length})
  const baseline=await native(),delivered=fixture.event(message,recipient,'email.delivered',now-4000),eventId='synthetic-placemat-delivered'
  const submit=async(event,id,status=200,options={})=>{
   const r=await fixture.submit(h,event,id,options),value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value
  }
  await submit(delivered,eventId,401,{headers:{'svix-signature':'v1,invalid'}})
  await submit(fixture.event(message,address('wrong')),undefined,403)
  await submit(fixture.event('synthetic-placemat-foreign',recipient),undefined,403)
  await submit(fixture.event(message,[recipient,address('extra')]),undefined,403)
  assert.equal((await deliveries())[0].facts.length,0)
  assert.equal((await submit(delivered,eventId)).results[0].outcome,'stored')
  for(const result of await Promise.all(Array.from({length:4},()=>submit(delivered,eventId))))assert.equal(result.results[0].outcome,'duplicate')
  await submit(fixture.event(message,recipient,'email.bounced',now-4000),eventId,409)
  await submit(fixture.event(message,recipient,'email.sent',now-5000))
  await submit(fixture.event(message,recipient,'email.bounced',now-3000))
  await submit(fixture.event(message,recipient,'email.complained',now-2000))
  await submit(fixture.event(message,recipient,'email.delivered',now-6000))
  await submit(fixture.event(message,recipient,'email.bounced',now-2000))
  await Promise.all([
   submit(fixture.event(message,recipient,'email.delivered',now-1000)),
   submit(fixture.event(message,recipient,'email.complained',now)),
  ])
  rows=await deliveries();assert.equal(rows[0].status,'complained');assert.equal(rows[0].facts.length,8)
  assert.ok(rows[0].facts.some(e=>e.type==='email.delivered'));assert.ok(rows[0].facts.some(e=>e.type==='email.bounced'))
  assert.deepEqual(await native(),baseline,'Provider observations never change bookings, link custody, audit or send counts')
  await h.restart();assert.equal((await deliveries())[0].status,'complained');await submit(delivered,eventId);assert.equal((await deliveries())[0].facts.length,8)
  for(const as of [host,member,server]){await h.api('/api/booking-mail',undefined,{as,status:403});if(as!==server)assert.equal((await h.api('/api/state',undefined,{as})).bookingMail,undefined)}
  const key=(await h.api('/api/agent-keys',{name:'Delivery refusal witness'})).result
  await h.api('/api/booking-mail',undefined,{as:'',headers:{authorization:'Bearer '+key.key},status:403})
  const registration=await h.api('/api/hoststand/devices',{label:'Reservation desk'},{status:201})
  const claim=await h.request('/api/hoststand/claim',{method:'POST',as:'',body:{claimCode:registration.claimCode}})
  assert.equal(claim.status,200)
  const device=claim.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('__Host-pm-device='))
  await h.api('/api/hoststand/pin',{pin:'161803398874'},{as:host})
  await h.api('/api/hoststand/unlock',{operatorId:await personId(host),pin:'161803398874'},{as:device})
  await h.api('/api/booking-mail',undefined,{as:device,status:401})
  await h.api('/api/booking-mail',undefined,{as:h.cookie+'; '+device,status:401})
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  await h.api('/api/booking-mail',undefined,{as:'',headers:{authorization:'Bearer '+key.key},status:401})
  const managerId=await personId(manager)
  await h.api('/auth/operator/status',{operatorId:managerId,status:'inactive'})
  await h.api('/api/booking-mail',undefined,{as:manager,status:401})
  for(const name of ['MAIL_EVENT_NAMESPACE','RER_INSTALLATION_ID','RESEND_WEBHOOK_SECRET']){
   const prior=bindings[name];bindings[name]='';await h.restart()
   await submit(fixture.event(message,recipient),undefined,503)
   bindings[name]=prior;await h.restart()
  }
  const namespace=bindings.MAIL_EVENT_NAMESPACE;bindings.MAIL_EVENT_NAMESPACE+='-other';await h.restart()
  await submit(fixture.event(message,recipient),undefined,403)
  bindings.MAIL_EVENT_NAMESPACE=namespace;await h.restart()
  const tenant=bindings.RER_INSTALLATION_ID;bindings.RER_INSTALLATION_ID+='-other';await h.restart()
  await submit(fixture.event(message,recipient),undefined,403)
  bindings.RER_INSTALLATION_ID=tenant;await h.restart()
  // A real contact change does not reinterpret the original delivery recipient.
  const change=await h.api('/api/public/booking-management/preview',{token,action:'change',contact:{email:address('updated')}},{as:''})
  await h.api('/api/public/booking-management/commit',{token,previewId:change.previewId,acknowledged:true},{as:''})
  await submit(fixture.event(message,address('updated')),undefined,403)
  await submit(fixture.event(message,recipient,'email.opened'))
  bindings.MAIL_EVENT_NAMESPACE='';await h.restart()
  const legacy=await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true})
  bindings.MAIL_EVENT_NAMESPACE=namespace;await h.restart()
  await submit(fixture.event(legacy.providerMessageId,address('updated')),undefined,403)
  const fresh=await h.command('booking.management.send',{bookingId:booked.id,acknowledged:true})
  await submit(fixture.event(fresh.providerMessageId,address('updated'),'email.bounced'))
  const archive=await h.api('/api/backup'),csv=await (await h.request('/api/business-export/booking-mail.csv')).text(),events=await (await h.request('/api/business-export/booking-mail-events.csv')).text()
  assert.ok(csv.includes(message)&&csv.includes(recipient)&&csv.includes('complained'));assert.ok(events.includes('email.bounced'))
  assert.ok(!JSON.stringify(archive).includes(bindings.RESEND_WEBHOOK_SECRET));assert.ok(!JSON.stringify(archive).includes(token))
  const restored=await installation({entry:'tests/api/clock-worker.mjs',clock,bindings})
  try{
   await restored.api('/api/restore',{archive,confirm:'RESTORE'})
   const history=(await restored.api('/api/booking-mail')).deliveries
   assert.equal(history.length,2);assert.ok(history.every(m=>m.historical));assert.equal(history.find(m=>m.providerMessageId===message).status,'complained')
   const r=await fixture.submit(restored,fixture.event(message,recipient));assert.equal(r.status,403)
   assert.equal(restored.messages.length,0)
  }finally{await restored.close()}
  const guestId=(await h.api('/api/state')).state.bookings.find(b=>b.id===booked.id).guestId
  const access=await h.api('/api/privacy/access',{guestId})
  assert.equal(access.bookingMail.length,2);assert.equal(access.bookingMail.find(m=>m.providerMessageId===message).status,'complained')
  assert.ok(!JSON.stringify(access).includes(bindings.RESEND_WEBHOOK_SECRET))
  await h.api('/api/privacy/policy',{version:0,rules:Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:365,ground:'Recorded venue retention review'}]))})
  const review=await h.api('/api/privacy/erase-preview',{guestId})
  // Race through public doors: whichever transaction wins, erasure removes all copies.
  const race=await Promise.all([fixture.submit(h,fixture.event(message,recipient,'email.complained')),h.api('/api/privacy/erase',{guestId,review:review.review,confirm:'ERASE'})])
  assert.ok([200,403,409].includes(race[0].status));assert.deepEqual(await deliveries(),[])
  assert.equal(race[1].processorTasks,2)
  const tasks=(await h.api('/api/privacy')).tasks;assert.ok(tasks.some(t=>t.provider==='Resend'&&t.reference===message&&t.state==='open'))
  await submit(delivered,eventId,403)
  for(const table of ['pm_booking_mail','rer_mail_event_receipts','rer_mail_event_states'])assert.equal((await h.db.prepare('SELECT count(*) AS n FROM '+table).first()).n,0)
  assert.ok(!(await (await h.request('/api/business-export/booking-mail.csv')).text()).includes(recipient))
  const later=await h.api('/api/backup'),empty=await installation()
  try{await empty.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})}finally{await empty.close()}
  // A genuine send paused at the provider edge can finish after local erasure.
  let release,observed
  const accepted=new Promise(resolve=>release=resolve),atEdge=new Promise(resolve=>observed=resolve),outbound=[]
  const late=await installation({entry:'tests/api/clock-worker.mjs',clock,bindings,mailEdge:async request=>{
   outbound.push(await request.json());observed();await accepted
   return Response.json({id:'synthetic-placemat-late-message'})
  }})
  try{
   const f=await service(late),b=(await late.api('/api/public/book',publicGuest(f.service,0,{email:address('late')}),{as:'',status:201})).result
   const sending=late.command('booking.management.send',{bookingId:b.id,acknowledged:true})
   await atEdge
   const guestId=(await late.api('/api/state')).state.bookings.find(row=>row.id===b.id).guestId
   await late.command('guest.erase',{guestId,confirm:'ERASE'});release();await sending
   assert.equal(outbound.length,1);assert.deepEqual((await late.api('/api/booking-mail')).deliveries,[])
   const callback=await fixture.submit(late,fixture.event('synthetic-placemat-late-message',address('late')))
   assert.equal(callback.status,403)
   assert.equal((await late.db.prepare('SELECT count(*) AS n FROM pm_booking_mail').first()).n,0)
  }finally{release();await late.close()}
  console.log('PROBE MSG-003 signed intake, order-safe history, current manager scope, original recipient, erasure and inert restore passed')
 }finally{await h.close()}
})

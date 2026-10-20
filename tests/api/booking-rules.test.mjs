import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

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

import {test} from 'node:test'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {restaurant,logo,floor72,nextService} from './onboarding-fixture.mjs'
const problem=(h,command,payload,options)=>h.api('/api/commands',{command,payload},options)

test('SETUP-001 / SETUP-002: owner onboards a 72-seat US restaurant, acknowledges editable versioned policies and previews without production data; exports and restore retain setup',async()=>{
 const h=await installation(),restored=await installation();try{
  const rules=(await h.api('/api/onboarding')).defaults,manager=await h.signIn('setup-manager@example.test','admin'),member=await h.signIn('setup-reader@example.test')
  await h.api('/api/onboarding',undefined,{as:'',status:401});await h.api('/api/onboarding',undefined,{as:member,status:403})
  await h.command('venue.onboard',{...restaurant,bookingRules:rules},{as:manager,status:403})
  await h.command('venue.onboard',{...restaurant,bookingRules:rules,acknowledge:false},{status:400})
  await h.command('venue.onboard',{...restaurant,bookingRules:rules,phone:'555'},{status:400})
  await h.command('venue.onboard',{...restaurant,bookingRules:rules,timezone:'Not/AZone'},{status:400})
  await h.command('venue.onboard',{...restaurant,bookingRules:rules,logo:'data:image/svg+xml;base64,PHN2Zz4='},{status:400})
  const venue=await h.command('venue.onboard',{...restaurant,logo,bookingRules:rules})
  assert.equal(venue.setup.phone,'+13105550142');assert.equal(venue.setup.legalName,restaurant.legalName);assert.equal(venue.setup.address,restaurant.address);assert.equal(venue.setup.currency,restaurant.currency);assert.equal(venue.setup.logo,logo)
  assert.equal(venue.setup.acknowledgment.actor,(await h.api('/api/state')).actor.id);assert.ok(Number.isFinite(Date.parse(venue.setup.acknowledgment.at)));assert.deepEqual(venue.setup.acknowledgment.rules,rules)
  await h.command('venue.onboard',{...restaurant,bookingRules:rules},{status:409})
  // Change every policy value through the public command, rather than pinning initial numbers.
  const edited=structuredClone(rules)
  for(const [channel,r] of Object.entries(edited))Object.assign(r,{minParty:2,maxParty:10,horizonDays:180,leadMinutes:channel==='online'?10:0,sameDayCutoff:channel==='online'?'18:45':'',slotMinutes:30,inquiryAbove:10,blockedStarts:[]})
  const revised=await h.command('venue.onboard',{...restaurant,logo,version:venue.setup.version,bookingRules:edited})
  assert.equal(revised.setup.version,venue.setup.version+1);assert.deepEqual(revised.setup.bookingDefaults,edited);assert.deepEqual(revised.setup.acknowledgment.rules,edited)
  await floor72(h)
  const before=await h.api('/api/state'),settings=nextService(),preview=await h.api('/api/onboarding/preview',settings)
  assert.equal(preview.preview,true);assert.equal(preview.physicalSeats,72);assert.ok(preview.results.length);assert.equal(preview.venue.logo,logo);assert.deepEqual((await h.api('/api/state')).state,before.state);assert.deepEqual((await h.api('/api/state')).guests,[])
  await h.api('/api/onboarding/preview',settings,{as:member,status:403})
  const draft=await h.command('service.save',settings)
  assert.deepEqual(draft.bookingRules,edited,'new service inherits the acknowledged exact policy')
  const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Owner reviewed first dinner'})
  await h.command('proposal.approve',{proposalId:proposal.id})
  const booking=(await h.api('/api/public/book',publicGuest(draft,0),{as:'',status:201})).result;assert.ok(booking.id)
  const publicData=await h.api('/api/public/services',undefined,{as:''})
  assert.equal(publicData.venue.phone,revised.setup.phone);assert.equal(publicData.venue.setup,undefined);assert.ok(!JSON.stringify(publicData).includes(restaurant.legalName))
  // Recurring services also inherit the exact acknowledged defaults.
  const date=settings.startAt.slice(0,10),schedule=await h.command('schedule.save',{name:'Breakfast',shift:'breakfast',seasonStart:date,seasonEnd:date,weekdays:[0,1,2,3,4,5,6],startTime:'07:00',endTime:'10:00',turnMinutes:90,coverLimit:72,exceptions:[]})
  const generated=await h.command('schedule.preview',{fromDate:date,toDate:date,scheduleIds:[schedule.id],reason:'Review breakfast defaults'})
  assert.deepEqual(generated.plan.candidates[0].service.bookingRules,edited)
  await h.command('venue.update',{name:restaurant.name,timezone:restaurant.timezone});assert.deepEqual((await h.api('/api/state')).state.venue.setup,revised.setup)
  const csv=await (await h.request('/api/business-export/venue.csv')).text();assert.ok(csv.includes('setup_json'));assert.ok(csv.includes(restaurant.legalName))
  const archive=await h.api('/api/backup')
  const invalid=structuredClone(archive),stateRow=invalid.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_state'),broken=JSON.parse(stateRow.row.data)
  broken.venue.setup.acknowledgment.rules.online.maxParty++
  stateRow.row.data=JSON.stringify(broken)
  const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0])
  for(let i=1;i<invalid.length-1;i++){invalid[i]=await makePart(invalid[i].index,invalid[i].items);integrity.add(invalid[i]);for(const item of invalid[i].items)content.add(item)}
  invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest()
  const refused=await restored.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400});assert.match(refused.error,/inquiry threshold|acknowledgment/);assert.equal((await restored.api('/api/state')).state.venue.setup,undefined)
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  assert.deepEqual((await restored.api('/api/state')).state.venue,(await h.api('/api/state')).state.venue)
 }finally{await h.close();await restored.close()}
})

test('SETUP-002: channel policies apply together, inquiries cover large parties, reasoned manager overrides cannot bypass cutoff or physical capacity, staff intake remains open',async()=>{
 const h=await installation();try{
  const defaults=(await h.api('/api/onboarding')).defaults
  await h.command('venue.onboard',{...restaurant,timezone:'America/New_York',bookingRules:defaults})
  await h.command('table.save',{label:'Six seats',seats:6,x:30,y:30});await h.command('table.save',{label:'Other six',seats:6,x:60,y:30})
  const manager=await h.signIn('policy-manager@example.test','admin'),reader=await h.signIn('policy-reader@example.test')
  const rules=structuredClone(defaults),strict={minParty:3,maxParty:6,inquiryAbove:6,horizonDays:1,leadMinutes:20000,sameDayCutoff:'',slotMinutes:30,blockedStarts:[]}
  rules.online={...strict};rules['walk-in']={...strict}
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
  const publish=async(name,startAt,endAt,bookingRules)=>{const s=await h.command('service.save',{name,startAt,endAt,turnMinutes:60,coverLimit:72,bookingRules});const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Review channel limits'});await h.command('proposal.approve',{proposalId:p.id});return s}
  const s=await publish('Rule conjunction',date+'T18:00:00Z',date+'T22:00:00Z',rules)
  const refusal=await h.api('/api/public/book',publicGuest(s,0,{overrideReason:'Public cannot override'}),{as:'',status:409})
  for(const pattern of [/Party size/,/calendar days/,/lead time/])assert.match(refusal.error,pattern)
  assert.match((await h.api('/api/public/book',publicGuest(s,0,{partySize:7}),{as:'',status:409})).error,/inquiry/)
  await h.command('booking.walkin',publicGuest(s,1),{as:manager,status:409})
  await h.command('booking.walkin',publicGuest(s,1,{overrideReason:'Manager approved guest already here'}),{as:reader,status:403})
  const seated=await h.command('booking.walkin',publicGuest(s,1,{overrideReason:'Manager approved guest already here'}),{as:manager})
  assert.equal(seated.ruleOverride.violations.length,3);assert.equal(seated.ruleOverride.actor,(await h.api('/api/state',undefined,{as:manager})).actor.id)
  await h.command('booking.walkin',publicGuest(s,2,{partySize:20,overrideReason:'Cannot create physical seats'}),{as:manager,status:409})
  const ownerSeated=await h.command('booking.walkin',publicGuest(s,3,{overrideReason:'Owner approved exception'}));assert.ok(ownerSeated.ruleOverride)
  assert.ok((await h.api('/api/state')).state.audit.some(a=>a.action==='booking.rule-override'&&a.subject===ownerSeated.id))
  for(const booking of [seated,ownerSeated]){await h.command('booking.status',{bookingId:booking.id,status:'completed'});await h.command('booking.stage',{bookingId:booking.id,stage:'ready'})}
  // At least one US zone is beyond midnight's cutoff even during a midnight minute.
  const now=Date.now(),start=new Date(Math.floor(now/1800000)*1800000).toISOString(),end=new Date(Date.parse(start)+3*3600000).toISOString()
  const cutoffRules=structuredClone(defaults);for(const r of Object.values(cutoffRules))Object.assign(r,{sameDayCutoff:'00:00',leadMinutes:0})
  const cutoff=await publish('Hard cutoff',start,end,cutoffRules)
  if(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now)!=='00'){
   const blocked=await problem(h,'booking.walkin',publicGuest(cutoff,4,{overrideReason:'Owner cannot bypass cutoff'}),{status:409});assert.match(blocked.error,/cutoff/)
  }else{
   // Check tomorrow's NY cutoff using a separate LA installation, whose clock is 21:xx.
   const west=await installation();try{await west.command('venue.update',{name:'West dining',timezone:'America/Los_Angeles'});await west.command('table.save',{label:'Four',seats:4,x:10,y:10});const d=await west.command('service.save',{name:'Cutoff',startAt:start,endAt:end,turnMinutes:60,coverLimit:20,bookingRules:cutoffRules});const p=await west.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:d.id},reason:'Review cutoff'});await west.command('proposal.approve',{proposalId:p.id});assert.match((await problem(west,'booking.walkin',publicGuest(d,4,{overrideReason:'Cannot bypass'}),{status:409})).error,/cutoff/)}finally{await west.close()}
  }
  // The no-cutoff/no-lead staff rules allow current walk-ins and public waitlist intake.
  const open=await publish('Current staff arrivals',start,end,defaults)
  const walkin=await h.command('booking.walkin',publicGuest(open,5,{startAt:start}));assert.equal(walkin.ruleOverride,undefined)
  const queued=await h.api('/api/public/queue/join',{serviceId:open.id,name:'Jordan Park',email:'jordan@example.test',partySize:2,contactConsent:false},{as:'',status:201});assert.ok(queued.entry.id)
 }finally{await h.close()}
})

test('SETUP-001: Los Angeles and New York spring gaps name the next valid time and fall repeats require either explicit offset through service and schedule doors',async()=>{
 for(const [zone,first,second] of [['America/Los_Angeles','-07:00','-08:00'],['America/New_York','-04:00','-05:00']]){
  const h=await installation();try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:zone});await h.command('table.save',{label:'Dining six',seats:6,x:20,y:30})
   const base={name:'DST dinner',startAt:'2027-03-14T02:30',endAt:'2027-03-14T05:00',turnMinutes:60,coverLimit:72}
   const before=(await h.api('/api/state')).state
   const gap=await problem(h,'service.save',base,{status:400});assert.match(gap.error,/does not exist/);assert.match(gap.error,/next valid local time is 2027-03-14 03:00/);assert.deepEqual((await h.api('/api/state')).state,before)
   const spring=await h.command('service.save',{...base,startAt:'2027-03-14T01:30',endAt:'2027-03-14T04:00'});assert.equal(Date.parse(spring.endAt)-Date.parse(spring.startAt),90*60000)
   const fold={...base,startAt:'2027-11-07T01:30',endAt:'2027-11-07T04:00'}
   assert.match((await problem(h,'service.save',fold,{status:400})).error,/occurs twice.*explicit offset/)
   await h.command('service.save',{...fold,startOffset:'-03:00'},{status:400})
   const early=await h.command('service.save',{...fold,startOffset:first}),late=await h.command('service.save',{...fold,startOffset:second})
   assert.equal(Date.parse(late.startAt)-Date.parse(early.startAt),3600000)
   for(const saved of [early,late])assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(saved.startAt)),'01:30')
   const repeatedEnd={...fold,startAt:'2027-11-07T01:15',startOffset:first,endAt:'2027-11-07T01:45',turnMinutes:15}
   assert.match((await problem(h,'service.save',repeatedEnd,{status:400})).error,/occurs twice/);const crossing=await h.command('service.save',{...repeatedEnd,endOffset:second});assert.equal(Date.parse(crossing.endAt)-Date.parse(crossing.startAt),90*60000)
   const schedule=await h.command('schedule.save',{name:'DST breakfast',shift:'breakfast',seasonStart:'2027-03-14',seasonEnd:'2027-11-07',weekdays:[0],startTime:'02:30',endTime:'05:00',turnMinutes:60,coverLimit:72,exceptions:[]})
   assert.match((await problem(h,'schedule.preview',{scheduleIds:[schedule.id],fromDate:'2027-03-14',toDate:'2027-03-14',reason:'Review gap'},{status:400})).error,/next valid local time is 2027-03-14 03:00/)
   await h.command('schedule.save',{...schedule,startTime:'01:30',startOffset:second})
   const plan=await h.command('schedule.preview',{scheduleIds:[schedule.id],fromDate:'2027-11-07',toDate:'2027-11-07',reason:'Review repeated offset'})
   assert.equal(plan.plan.candidates[0].service.startAt,late.startAt)
  }finally{await h.close()}
 }
})

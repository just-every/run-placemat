import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
const policy={intervalMinutes:15,arrivalCovers:12,arrivalParties:3,concurrentCovers:48,areaArrivalCaps:{Dining:12}}
async function prepare(h,extra={}){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
 const tables=[];for(let i=0;i<15;i++)tables.push(await h.command('table.save',{label:String(12+i),seats:4,area:'Dining',x:10+(i%5)*18,y:15+Math.floor(i/5)*30}))
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),startAt=day+'T23:30:00.000Z'
 const service=await h.command('service.save',{name:'Dinner at Cedar & Salt',startAt,endAt:new Date(Date.parse(startAt)+5*3600000).toISOString(),turnMinutes:120,coverLimit:80,pacing:policy,...(typeof extra==='function'?extra(startAt):extra)})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Review dining pacing and physical inventory'});await h.command('proposal.approve',{proposalId:proposal.id})
 return {tables,service,at:minutes=>new Date(Date.parse(startAt)+minutes*60000).toISOString()}
}
const review=(h,command,payload,opts={})=>h.api('/api/pacing/preview',{command,payload},opts)
const confirmation=(payload,r,reason='Host accepted the kitchen warning')=>({...payload,pacingReview:r.review,pacingReason:reason,pacingConfirm:'yes'})

test('SERVICE-005 / REPORT-002: two channels race the final arrival allocation; interval, parties, simultaneous and kitchen limits refuse public booking with alternatives and require a reviewed staff override',async()=>{
 const h=await installation();try{
  const {service,at}=await prepare(h)
  for(let i=0;i<2;i++)await h.api('/api/public/book',publicGuest(service,i,{partySize:4}),{as:'',status:201})
  const requests=await Promise.all([
   h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(service,2,{partySize:4})}),
   h.request('/api/commands',{method:'POST',body:{command:'booking.walkin',payload:publicGuest(service,3,{partySize:4})}}),
  ])
  assert.ok(requests.every(r=>r.ok||r.status===409))
  assert.equal(requests.filter(r=>r.ok).length,1,'one physical and arrival allocation wins across channels')
  let report=await h.api('/api/pacing?serviceId='+service.id)
  assert.equal(report.intervals[0].covers,12);assert.equal(report.intervals[0].parties,3);assert.equal(report.intervals[0].full,true);assert.equal(report.intervals[0].areas.Dining.covers,12);assert.equal(report.intervals[0].bookingIds.length,3)
  const refused=await h.api('/api/public/book',publicGuest(service,4,{partySize:4}),{as:'',status:409});assert.match(refused.error,/Arrival interval covers.*12.*16.*4/)
  for(let group=1;group<=3;group++)for(let i=0;i<3;i++)await h.api('/api/public/book',publicGuest(service,5+group*3+i,{partySize:4,startAt:at(group*15)}),{as:'',status:201})
  const concurrent=await h.api('/api/public/book',publicGuest(service,19,{partySize:4,startAt:at(60)}),{as:'',status:409});assert.match(concurrent.error,/Concurrent dining covers.*48.*52.*4/)
  const state=await h.api('/api/state');assert.equal(state.state.bookings.length,12);assert.equal(state.state.bookings.reduce((n,b)=>n+b.partySize,0),48);assert.ok(state.state.tables.length>state.state.bookings.length,'free physical tables remain')
  const found=await h.api('/api/public/search?'+new URLSearchParams({date:service.startAt.slice(0,10),partySize:'4'}),undefined,{as:''});assert.ok(found.results.length);assert.ok(!found.results.some(r=>r.startAt===at(0)));assert.ok(found.results.every(r=>r.startAt>=at(120)))
  // Reacquiring a cancelled booking must reserve pacing again even with a free table.
  const original=state.state.bookings.find(b=>b.source==='online'&&b.startAt===at(0)),cancelled=await h.command('booking.stage',{bookingId:original.id,stage:'cancelled'})
  const replacement=(await h.api('/api/public/book',publicGuest(service,22,{partySize:4}),{as:'',status:201})).result
  let current=await h.api('/api/state'),free=current.state.tables.find(t=>!current.state.bookings.filter(b=>['booked','seated'].includes(b.status)).some(b=>b.tableIds.includes(t.id)))
  await h.command('booking.move',{bookingId:replacement.id,tableIds:[free.id],version:current.version})
  const reacquire=await h.api('/api/commands',{command:'booking.stage',payload:{bookingId:original.id,correctsEventId:cancelled.event.id,reason:'Correct an accidental cancellation'}},{status:409});assert.match(reacquire.error,/Arrival interval covers|Concurrent dining covers/)
  const payload=publicGuest(service,20,{partySize:4}),r=await review(h,'booking.walkin',payload)
  assert.deepEqual(r.violations.map(v=>v.kind).sort(),['arrival-covers','arrival-parties','area-arrival-covers','concurrent-covers'].sort());assert.ok(r.violations.every(v=>v.excess===v.projected-v.limit))
  const warning=await h.api('/api/commands',{command:'booking.walkin',payload},{status:409});for(const v of r.violations)assert.ok(warning.error.includes(v.label))
  const seated=await h.command('booking.walkin',confirmation(payload,r));assert.equal(seated.status,'seated');assert.equal(seated.pacingOverride.violations.length,4)
  report=await h.api('/api/pacing?serviceId='+service.id);assert.equal(report.intervals[0].covers,16);assert.equal(report.totalCovers,52);assert.equal(report.overrideCount,1);assert.deepEqual(report.overrideBookingIds,[seated.id])
  const performance=(await h.api('/api/reports/performance?serviceId='+service.id)).report
  assert.equal(performance.pacing.overrideCount,1);assert.deepEqual(performance.pacing.overrideBookingIds,[seated.id]);assert.deepEqual(performance.pacing.intervals,report.intervals)
  const joined=await h.api('/api/public/queue/join',publicGuest(service,21,{partySize:2,contactConsent:false}),{as:'',status:201});assert.equal(joined.entry.status,'queued');
  const queuePage=await (await h.request('/queue',{as:''})).text();assert.match(queuePage,/Queued only; no table or time promised/);
  const waiting={id:joined.entry.id},seatPayload={waitlistId:waiting.id,startAt:at(0)}
  const waitReview=await review(h,'waitlist.seat',seatPayload);assert.ok(waitReview.violations.length);await h.command('waitlist.seat',seatPayload,{status:409});const waitSeat=await h.command('waitlist.seat',confirmation(seatPayload,waitReview));assert.equal(waitSeat.source,'waitlist')
  const after=await h.api('/api/state');assert.ok(after.state.audit.some(a=>a.action==='booking.pacing-override'&&a.subject===waitSeat.id&&a.pacing.violations.length));assert.equal(after.state.waitlist.find(w=>w.id===waiting.id).status,'seated')
  const patio=await h.command('table.save',{label:'Patio 1',seats:4,area:'Patio',x:50,y:50}),patioPayload=publicGuest(service,23,{partySize:2,tableIds:[patio.id]})
  const patioReview=await review(h,'booking.walkin',patioPayload),patioSeat=await h.command('booking.walkin',confirmation(patioPayload,patioReview))
  current=await h.api('/api/state');free=current.state.tables.find(t=>t.area==='Dining'&&!current.state.bookings.filter(b=>['booked','seated'].includes(b.status)).some(b=>b.tableIds.includes(t.id)))
  const moved=await h.api('/api/commands',{command:'booking.move',payload:{bookingId:patioSeat.id,tableIds:[free.id],version:current.version}},{status:409});assert.match(moved.error,/Dining arrival covers/)
  const key=(await h.api('/api/agent-keys',{name:'Pacing-aware assignment preparer'})).result
  const prepared=await h.api('/api/commands',{command:'proposal.prepare',payload:{kind:'table.assign',plan:{bookingId:patioSeat.id,tableIds:[free.id]},reason:'Move into full kitchen area'}},{as:'',headers:{authorization:'Bearer '+key.key},status:409});assert.match(prepared.error,/Dining arrival covers/)

 }finally{await h.close()}
})

test('SERVICE-007: owner grants hosts explicit pacing authority; signed exact review, revocation, public/agent refusal, physical clashes, history and erasure guard overrides',async()=>{
 const h=await installation();try{
  const {service,tables}=await prepare(h)
  for(let i=0;i<3;i++)await h.api('/api/public/book',publicGuest(service,i,{partySize:4}),{as:'',status:201})
  const key=(await h.api('/api/agent-keys',{name:'Pacing preparation only'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const host=await h.signIn('pacing-host@example.test'),member=await h.signIn('pacing-reader@example.test'),manager=await h.signIn('pacing-manager@example.test','admin'),operator=(await h.api('/auth/operators')).find(p=>p.email==='pacing-host@example.test')
  await h.command('team.host',{operatorId:operator.id,enabled:true})
  const payload=publicGuest(service,10,{partySize:4})
  await h.command('booking.walkin',payload,{as:host,status:403});await review(h,'booking.walkin',payload,{as:member,status:403});await review(h,'booking.walkin',payload,{...agent,status:403});await h.command('booking.walkin',payload,{...agent,status:403})
  await h.command('team.pacing',{operatorId:operator.id,enabled:true},{as:manager,status:403});await h.command('team.pacing',{operatorId:operator.id,enabled:true})
  const r=await review(h,'booking.walkin',payload,{as:host});assert.ok(r.violations.some(v=>v.kind==='arrival-covers'&&v.limit===12&&v.projected===16&&v.excess===4))
  await h.command('booking.walkin',payload,{as:host,status:409});await h.command('booking.walkin',confirmation({...payload,partySize:2},r),{as:host,status:409})
  await h.command('team.pacing',{operatorId:operator.id,enabled:false});await h.command('booking.walkin',confirmation(payload,r),{as:host,status:403});await h.command('team.pacing',{operatorId:operator.id,enabled:true})
  await h.command('booking.walkin',confirmation(payload,r),{as:host,status:409})
  await review(h,'booking.walkin',{...payload,tableIds:[tables[0].id]},{as:host,status:409})
  const fresh=await review(h,'booking.walkin',payload,{as:host}),saved=await h.command('booking.walkin',confirmation(payload,fresh,'Priya asked us to accept this exception'),{as:host})
  const state=await h.api('/api/state'),audit=state.state.audit.find(a=>a.subject===saved.id&&a.action==='booking.pacing-override');assert.equal(audit.actor,operator.id);assert.equal(audit.pacing.reason,'Priya asked us to accept this exception');assert.equal(saved.pacingOverride.actor,operator.id)
  const timeline=await h.api('/api/timeline?'+new URLSearchParams({serviceId:service.id,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt))}));assert.ok(timeline.rows.find(row=>row.id===saved.id).pacingOverride)
  const covers=await h.api('/api/reports/reservations?serviceId='+service.id);assert.equal(covers.summary.pacingOverrides.bookings,1);assert.deepEqual(covers.summary.pacingOverrides.bookingIds,[saved.id]);
  const csv=await (await h.request('/api/reports/reservations.csv?serviceId='+service.id)).text();assert.ok(csv.includes('pacingOverrideCount'));assert.ok(csv.includes(saved.id));
  const denied=await h.api('/api/public/book',{...publicGuest(service,11,{partySize:4}),pacingReview:fresh.review,pacingReason:'cannot bypass',pacingConfirm:'yes'},{as:'',status:409});assert.match(denied.error,/Arrival interval/)
  const waiting=await h.command('waitlist.add',publicGuest(service,12,{partySize:2})),waitPayload={waitlistId:waiting.id,startAt:service.startAt},waitReview=await review(h,'waitlist.seat',waitPayload,{as:host});const hostSeat=await h.command('waitlist.seat',confirmation(waitPayload,waitReview),{as:host});assert.equal(hostSeat.source,'waitlist');assert.equal(hostSeat.pacingOverride.actor,operator.id);
  await h.command('guest.erase',{guestId:saved.guestId,confirm:'ERASE'});assert.ok(!JSON.stringify(await h.api('/api/state')).includes('Priya asked'));assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('Priya asked'))
 }finally{await h.close()}
})

test('SERVICE-007: blocked slots and total service covers need explicit exact manager review; public and occupied tables stay refused and portable overrides retain their facts',async()=>{
 const h=await installation();let destination
 try{
  const {service}=await prepare(h,startAt=>({coverLimit:4,bookingRules:{'walk-in':{minParty:1,maxParty:20,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:20,blockedStarts:[startAt]}}}))
  await h.command('kitchen.save',{serviceId:service.id,area:'Dining',coverCap:4})
  const first=(await h.api('/api/public/book',publicGuest(service,0,{partySize:4}),{as:'',status:201})).result
  const payload=publicGuest(service,1,{partySize:4}),before=await h.api('/api/state'),r=await review(h,'booking.walkin',payload)
  assert.deepEqual(r.violations.map(v=>v.kind).sort(),['area-concurrent-covers','blocked-start','service-covers'].sort());assert.ok(r.violations.some(v=>v.kind==='service-covers'&&v.limit===4&&v.current===4&&v.projected===8&&v.excess===4));assert.ok(r.violations.some(v=>v.kind==='blocked-start'&&v.limit===0&&v.projected===1&&v.excess===1))
  const after=await h.api('/api/state');assert.equal(after.version,before.version);assert.deepEqual(after.state,before.state);assert.deepEqual(after.guests,before.guests)
  const refused=await h.api('/api/public/book',{...payload,...confirmation({},r)},{as:'',status:409});assert.match(refused.error,/Total service covers/)
  const manager=await h.signIn('blocked-manager@example.test','admin');await h.command('booking.walkin',confirmation(payload,r),{as:manager,status:409})
  const expired={...r,review:String(Date.now()-1)+'.'+r.review.split('.')[1]};await h.command('booking.walkin',confirmation(payload,expired),{status:409})
  const original=before.state.bookings.find(b=>b.id===first.id);await review(h,'booking.walkin',{...payload,tableIds:original.tableIds},{status:409})
  const current=await review(h,'booking.walkin',payload,{as:manager}),saved=await h.command('booking.walkin',confirmation(payload,current,'Manager accepted blocked slot and four extra service covers'),{as:manager})
  assert.equal(saved.pacingOverride.violations.length,3);assert.equal((await h.api('/api/pacing?serviceId='+service.id)).totalCovers,8)
  const covers=await h.api('/api/reports/reservations?serviceId='+service.id),csv=await (await h.request('/api/reports/reservations.csv?serviceId='+service.id)).text()
  const cells=line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replaceAll('""','"'))
  const [columns,...rows]=csv.trim().split('\r\n').map(cells);assert.equal(rows.reduce((n,row)=>n+Number(row[columns.indexOf('pacingOverrideCount')]),0),covers.summary.pacingOverrides.bookings)
  const serverStart=new Date(Date.parse(service.startAt)+86400000).toISOString(),serverService=await h.command('service.save',{name:'Hard server capacity',startAt:serverStart,endAt:new Date(Date.parse(serverStart)+4*3600000).toISOString(),turnMinutes:120,coverLimit:100,pacing:policy})
  const server=await h.command('server.save',{serviceId:serverService.id,name:'Ana Torres',coverCap:4});await h.command('section.save',{serviceId:serverService.id,name:'Ana section',serverId:server.id,tableIds:before.state.tables.map(t=>t.id)})
  const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:serverService.id},reason:'Review a hard server cap'});await h.command('proposal.approve',{proposalId:plan.id});await h.api('/api/public/book',publicGuest(serverService,3,{partySize:4}),{as:'',status:201})
  const hard=await review(h,'booking.walkin',publicGuest(serverService,4,{partySize:4}),{as:manager,status:409});assert.match(hard.error,/Ana Torres.*cap of 4/)
  const archive=await h.api('/api/backup');assert.ok(!JSON.stringify(archive).includes(current.review),'review token never enters portable records')
  destination=await installation();await destination.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=await destination.api('/api/state'),booking=restored.state.bookings.find(b=>b.id===saved.id)
  assert.deepEqual(booking.pacingOverride,saved.pacingOverride);assert.deepEqual(restored.state.services.find(s=>s.id===service.id).pacing,service.pacing)
 }finally{await destination?.close();await h.close()}
})

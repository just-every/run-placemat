import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
const policy={intervalMinutes:15,arrivalCovers:12,arrivalParties:3,concurrentCovers:48,areaArrivalCaps:{Dining:12}}
async function prepare(h,extra={}){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
 const tables=[];for(let i=0;i<15;i++)tables.push(await h.command('table.save',{label:String(12+i),seats:4,area:'Dining',x:10+(i%5)*18,y:15+Math.floor(i/5)*30}))
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),startAt=day+'T23:30:00.000Z'
 const service=await h.command('service.save',{name:'Dinner at Cedar & Salt',startAt,endAt:new Date(Date.parse(startAt)+5*3600000).toISOString(),turnMinutes:120,coverLimit:80,pacing:policy,...extra})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Review dining pacing and physical inventory'});await h.command('proposal.approve',{proposalId:proposal.id})
 return {tables,service,at:minutes=>new Date(Date.parse(startAt)+minutes*60000).toISOString()}
}
const review=(h,command,payload,opts={})=>h.api('/api/pacing/preview',{command,payload},opts)
const confirmation=(payload,r,reason='Host accepted the kitchen warning')=>({...payload,pacingReview:r.review,pacingReason:reason,pacingConfirm:'yes'})

test('SERVICE-005: two channels race the final arrival allocation; interval, parties, simultaneous and kitchen limits refuse public booking with alternatives and require a reviewed staff override',async()=>{
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
  const payload=publicGuest(service,20,{partySize:4}),r=await review(h,'booking.walkin',payload)
  assert.deepEqual(r.violations.map(v=>v.kind).sort(),['arrival-covers','arrival-parties','area-arrival-covers','concurrent-covers'].sort());assert.ok(r.violations.every(v=>v.excess===v.projected-v.limit))
  const warning=await h.api('/api/commands',{command:'booking.walkin',payload},{status:409});for(const v of r.violations)assert.ok(warning.error.includes(v.label))
  const seated=await h.command('booking.walkin',confirmation(payload,r));assert.equal(seated.status,'seated');assert.equal(seated.pacingOverride.violations.length,4)
  report=await h.api('/api/pacing?serviceId='+service.id);assert.equal(report.intervals[0].covers,16);assert.equal(report.totalCovers,52);assert.equal(report.overrideCount,1);assert.deepEqual(report.overrideBookingIds,[seated.id])
  const waiting=await h.command('waitlist.add',publicGuest(service,21,{partySize:2})),seatPayload={waitlistId:waiting.id,startAt:at(0)}
  const waitReview=await review(h,'waitlist.seat',seatPayload);assert.ok(waitReview.violations.length);await h.command('waitlist.seat',seatPayload,{status:409});const waitSeat=await h.command('waitlist.seat',confirmation(seatPayload,waitReview));assert.equal(waitSeat.source,'waitlist')
  const after=await h.api('/api/state');assert.ok(after.state.audit.some(a=>a.action==='booking.pacing-override'&&a.subject===waitSeat.id&&a.pacing.violations.length));assert.equal(after.state.waitlist.find(w=>w.id===waiting.id).status,'seated')
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
  await h.command('guest.erase',{guestId:saved.guestId,confirm:'ERASE'});assert.ok(!JSON.stringify(await h.api('/api/state')).includes('Priya asked'));assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('Priya asked'))
 }finally{await h.close()}
})

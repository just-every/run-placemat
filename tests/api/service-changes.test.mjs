import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {installation,service,publicGuest} from './harness.mjs'

export async function closureService(h){
 const setup=await service(h,{tables:4,covers:40})
 await h.command('table.save',{...setup.floor[3],area:'Patio'})
 const bookings=[]
 for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(setup.service,i),{as:'',status:201})).result)
 return {...setup,bookings}
}
const prepare=(h,s,scope='room',extra={})=>h.command('proposal.prepare',{kind:'service.closure',plan:{serviceId:s.id,scope,area:'Dining room',...extra},reason:'Water leak; arrange personal follow-up'})

test('SERVICE-003 exact reviewed room closure keeps three bookings and accountable failed-contact work; every current allocation respects it',async()=>{
 const h=await installation()
 try{
  const {service:s,bookings,floor}=await closureService(h),original=(await h.api('/api/state')).state.bookings
  const member=await h.signIn('reader@example.test'),manager=await h.signIn('manager@example.test','admin')
  await h.command('proposal.prepare',{kind:'service.closure',plan:{serviceId:s.id,scope:'room',area:'Dining room'},reason:'Not authorized'},{as:member,status:403})
  const key=(await h.api('/api/agent-keys',{name:'Closure preparation'})).result.key,headers={authorization:`Bearer ${key}`}
  const stale=await prepare(h,s)
  assert.deepEqual(stale.plan.bookingIds,bookings.map(b=>b.id))
  await h.command('booking.lock',{bookingId:bookings[0].id,locked:true,version:(await h.api('/api/state')).version})
  await h.command('proposal.approve',{proposalId:stale.id},{status:409})
  await h.command('booking.lock',{bookingId:bookings[0].id,locked:false,version:(await h.api('/api/state')).version})
  const before=(await h.api('/api/state')).state.bookings
  const preparedMove=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:bookings[0].id,tableIds:[floor[3].id]},reason:'Existing assignment proposal'},{headers})
  const proposal=await prepare(h,s)
  await h.command('proposal.approve',{proposalId:proposal.id},{headers,status:403})
  await h.command('proposal.approve',{proposalId:proposal.id},{as:manager})
  let current=await h.api('/api/state'),change=current.state.serviceChanges[0]
  assert.equal(change.tasks.length,3);assert.equal(change.approvedBy,current.state.proposals.find(p=>p.id===proposal.id).approvedBy)
  assert.ok(change.tasks.every(t=>t.ownerId===change.approvedBy&&t.status==='open'&&t.updatedAt===change.approvedAt))
  assert.deepEqual(current.state.bookings,before)
  await h.command('booking.move',{bookingId:bookings[0].id,tableIds:[floor[3].id],version:current.version},{status:409})
  await h.command('proposal.approve',{proposalId:preparedMove.id},{status:409})
  await h.api('/api/public/book',publicGuest(s,3,{area:'Dining room',startAt:new Date(Date.parse(s.startAt)+2*3600000).toISOString()}),{as:'',status:409})
  await h.command('booking.walkin',{...publicGuest(s,4),tableIds:[floor[0].id]},{status:409})
  const patio=(await h.api('/api/public/book',publicGuest(s,3,{area:'Patio'}),{as:'',status:201})).result
  await h.command('booking.move',{bookingId:patio.id,tableIds:[floor[0].id],version:(await h.api('/api/state')).version},{status:409})
  await h.command('service.followup',{changeId:change.id,taskId:change.tasks[2].id,status:'completed',outcome:'Cannot claim resolution'},{status:400})
  await h.command('service.followup',{changeId:change.id,taskId:change.tasks[2].id,status:'failed-contact',outcome:'Staff phone attempt: no answer; personal follow-up needed'})
  current=await h.api('/api/state');change=current.state.serviceChanges[0]
  assert.equal(change.tasks[2].status,'failed-contact');assert.equal(change.tasks[2].ownerId,current.actor.id)
  assert.ok(current.state.audit.some(a=>a.action==='service.followup.recorded'&&a.subject===bookings[2].id&&a.actor===current.actor.id&&a.at))
  assert.deepEqual(current.state.bookings.filter(b=>bookings.some(v=>v.id===b.id)),before)
  assert.equal(h.messages.length,2,'Only native invitations crossed the mail edge')
  assert.ok((await h.api('/api/public/services',undefined,{as:''})).services.every(v=>!JSON.stringify(v).includes('follow-up')))
  const csv=await h.request('/api/business-export/service-changes.csv');assert.equal(csv.status,200);assert.match(await csv.text(),/failed-contact/)
  // Restore is an archive journey: this test file is run through heavy-slot.
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await copy.api('/api/state')).state.serviceChanges,current.state.serviceChanges)}finally{await copy.close()}
  const guestId=original[2].guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  current=await h.api('/api/state');assert.equal(current.state.serviceChanges[0].reason,'');assert.ok(current.state.serviceChanges[0].tasks.every(t=>!t.reason&&!t.outcome))
  assert.ok(!JSON.stringify(current.state).includes('Water leak'));assert.ok(!JSON.stringify(current.state).includes('Staff phone attempt'))
 }finally{await h.close()}
})

test('SERVICE-003 full-date, arrival-window and private holds require exact review and enforce half-open boundaries across services',async()=>{
 const h=await installation()
 try{
  const {service:s,floor}=await service(h,{tables:2,covers:30})
  const at=n=>new Date(Date.parse(s.startAt)+n*60000).toISOString()
  const arrival=await prepare(h,s,'arrival',{startAt:at(30),endAt:at(60)})
  await h.command('proposal.approve',{proposalId:arrival.id})
  const publicSlots=(await h.api('/api/public/services?partySize=2',undefined,{as:''})).services[0].slots
  assert.ok(publicSlots.some(v=>v.startAt===at(0)));assert.ok(!publicSlots.some(v=>v.startAt===at(30)));assert.ok(publicSlots.some(v=>v.startAt===at(60)))
  const hold=await prepare(h,s,'private',{tableIds:[floor[0].id],startAt:at(0),endAt:at(90)})
  await h.command('proposal.approve',{proposalId:hold.id})
  await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})
  await h.api('/api/public/book',publicGuest(s,1),{as:'',status:409})
  const closure=await prepare(h,s,'service')
  await h.command('proposal.approve',{proposalId:closure.id})
  const overlapping=await h.command('service.save',{name:'Parallel catalog',startAt:s.startAt,endAt:s.endAt,turnMinutes:90,coverLimit:30})
  const publish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:overlapping.id},reason:'Shared physical room'})
  await h.command('proposal.approve',{proposalId:publish.id})
  await h.api('/api/public/book',publicGuest(overlapping,2),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,1)
 }finally{await h.close()}
})


test('Reviewed published hours and cover amendments preserve commitments and reject stale or unsafe changes',async()=>{
 const h=await installation()
 try{
  const {service:s}=await service(h,{tables:3,covers:20})
  const b=(await h.api('/api/public/book',publicGuest(s,0,{startAt:new Date(Date.parse(s.startAt)+30*60000).toISOString()}),{as:'',status:201})).result
  let original=(await h.api('/api/state')).state.bookings
  const at=n=>new Date(Date.parse(s.startAt)+n*60000).toISOString()
  const prepare=(changes,opts)=>h.command('proposal.prepare',{kind:'service.amend',plan:{serviceId:s.id,changes},reason:'synthetic-placemat-1'},opts)
  const member=await h.signIn('reader@example.test'),manager=await h.signIn('manager@example.test','admin')
  await prepare({coverLimit:10},{as:member,status:403})
  const key=(await h.api('/api/agent-keys',{name:'Synthetic preparation'})).result.key
  await prepare({coverLimit:10},{headers:{authorization:`Bearer ${key}`},status:403})
  await prepare({startAt:at(15)},{status:400})
  await prepare({coverLimit:1},{status:409})
  await prepare({endAt:at(90)},{status:409})
  const stale=await prepare({coverLimit:10})
  await h.command('booking.lock',{bookingId:b.id,locked:true,version:(await h.api('/api/state')).version})
  await h.command('proposal.approve',{proposalId:stale.id},{as:manager,status:409})
  await h.command('booking.lock',{bookingId:b.id,locked:false,version:(await h.api('/api/state')).version})
  original=(await h.api('/api/state')).state.bookings
  const plan=await prepare({endAt:at(180),coverLimit:2},{as:manager})
  assert.deepEqual(plan.plan.bookingIds,[b.id]);assert.equal(plan.plan.before.endAt,s.endAt);assert.equal(plan.plan.after.endAt,at(180))
  assert.deepEqual((await h.api('/api/state')).state.bookings,original)
  await h.command('proposal.approve',{proposalId:plan.id},{as:member,status:403})
  const held={requestId:'synthetic-placemat-amend',token:randomBytes(32).toString('hex'),booking:publicGuest(s,2),ttlSeconds:300}
  await h.api('/api/public/booking-holds',held,{as:''})
  await h.command('proposal.approve',{proposalId:plan.id},{as:manager,status:409})
  await h.api('/api/public/booking-holds/abandon',held,{as:''})
  await h.command('proposal.approve',{proposalId:plan.id},{as:manager})
  let current=await h.api('/api/state'),amended=current.state.services.find(v=>v.id===s.id)
  assert.equal(amended.endAt,at(180));assert.equal(amended.coverLimit,2);assert.equal(amended.version,plan.plan.before.version+1)
  assert.deepEqual(current.state.bookings,original)
  const event=current.state.audit.find(v=>v.action==='service.amend')
  assert.equal(event.actor,plan.preparedBy);assert.ok(event.at);assert.equal(event.reason,'synthetic-placemat-1')
  await h.command('proposal.approve',{proposalId:plan.id},{status:409})
  await h.api('/api/public/book',publicGuest(s,1),{as:'',status:409})
  const raise=await prepare({coverLimit:4})
  await h.command('proposal.approve',{proposalId:raise.id})
  await h.api('/api/public/book',publicGuest(s,1,{startAt:at(120)}),{as:'',status:400})
  await h.api('/api/public/book',publicGuest(s,1),{as:'',status:201})
  const closure=await h.command('proposal.prepare',{kind:'service.closure',plan:{serviceId:s.id,scope:'service'},reason:'synthetic-placemat-2'})
  await h.command('proposal.approve',{proposalId:closure.id})
  const extend=await prepare({endAt:s.endAt,coverLimit:10})
  await h.command('proposal.approve',{proposalId:extend.id})
  await h.api('/api/public/book',publicGuest(s,2),{as:'',status:409})
  current=await h.api('/api/state')
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await copy.api('/api/state')).state.services,current.state.services)}finally{await copy.close()}
  await h.command('guest.erase',{guestId:original.find(v=>v.id===b.id).guestId,confirm:'ERASE'})
  current=await h.api('/api/state');assert.ok(!JSON.stringify(current.state).includes('synthetic-placemat-1'))
 }finally{await h.close()}
})

test('Affected guests explicitly accept reviewed relocation; permitted single-booking outreach, unanswered commitments and confirmed exact-cent cancellation stay accountable',async()=>{
 const {paymentEdge}=await import('./payment-fixture.mjs'),edge=paymentEdge()
 const h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 try{
  const {service:s,floor}=await service(h,{tables:4,covers:30});await h.command('table.save',{...floor[3],area:'Patio'})
  const bookings=[];for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(s,i,{closureEmailConsent:i!==2}),{as:'',status:201})).result)
  const original=(await h.api('/api/state')).state.bookings,closure=await prepare(h,s)
  await h.command('proposal.approve',{proposalId:closure.id})
  let view=await h.api('/api/state'),change=view.state.serviceChanges[0]
  const payload=i=>({changeId:change.id,taskId:change.tasks[i].id})
  const review=i=>({...payload(i),serviceId:s.id,tableIds:[floor[3].id],area:'Patio',startAt:s.startAt,reason:'synthetic-placemat-2'})
  const reader=await h.signIn('reader@example.test'),manager=await h.signIn('manager@example.test','admin')
  await h.command('service.relocation',review(0),{as:reader,status:403})
  const offer=await h.command('service.relocation',review(0),{as:manager})
  assert.deepEqual((await h.api('/api/state')).state.bookings,original)
  await h.command('service.outreach',{...payload(0),acknowledged:false},{status:400})
  await h.command('service.outreach',{...payload(0),acknowledged:true,to:'other@example.test'},{status:400})
  await h.command('service.outreach',{...payload(0),acknowledged:true},{as:reader,status:403})
  const sent=h.messages.length,attempt=await h.command('service.outreach',{...payload(0),acknowledged:true},{as:manager})
  assert.equal(attempt.state,'accepted');assert.equal(attempt.mailboxDelivery,'unconfirmed');assert.equal(h.messages.length,sent+1)
  const message=h.messages.at(-1);assert.deepEqual(message.to,['guest0@example.test']);assert.ok(!JSON.stringify(message).includes(bookings[1].id));assert.equal(attempt.token,undefined)
  await h.command('service.outreach',{...payload(0),acknowledged:true},{status:409});assert.equal(h.messages.length,sent+1)
  const token=new URLSearchParams(new URL(message.text.match(/https:\/\/[^\s]+\/relocation#[^\s]+/)[0]).hash.slice(1)).get('token')
  const guest=(action,p={},status=200)=>h.api('/api/public/relocation/'+action,{token,...p},{as:'',status})
  await guest('status',{bookingId:bookings[1].id},404)
  const status=await guest('status');assert.equal(status.booking.id,bookings[0].id);assert.equal(status.offered.area,'Patio');assert.ok(!JSON.stringify(status).includes('guest1'))
  assert.deepEqual((await h.api('/api/state')).state.bookings,original,'Opening the offer is not acceptance')
  await guest('accept',{},400)
  await h.command('booking.move',{bookingId:bookings[0].id,tableIds:[floor[3].id],version:(await h.api('/api/state')).version},{status:409})
  const accepted=await guest('accept',{acknowledged:true});assert.equal(accepted.decision,'accepted');assert.deepEqual(accepted.booking.tables,['T4']);await guest('accept',{acknowledged:true},404)
  view=await h.api('/api/state');assert.deepEqual(view.state.bookings.find(b=>b.id===bookings[2].id),original[2]);assert.equal(view.state.serviceChanges[0].tasks[0].outreach.state,'guest-opened')
  const chargeId=edge.charge(bookings[1].id,4001)
  await h.command('payment.charge-sync',{bookingId:bookings[1].id,chargeId})
  await h.command('service.cancel',{...payload(1),amountCents:0,reason:'synthetic-placemat-3',acknowledged:true},{status:409})
  edge.setRefundStatus('pending')
  const pending=await h.command('payment.refund',{bookingId:bookings[1].id,chargeId,amountCents:4001,requestId:'synthetic-placemat-4',reason:'Room closed'})
  await h.command('service.cancel',{...payload(1),refundId:pending.id,amountCents:4001,reason:'synthetic-placemat-3',acknowledged:true},{status:409})
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===bookings[1].id).status,'booked')
  edge.refunds.get(pending.processorId).status='succeeded'
  const refund=await h.command('payment.refund',{bookingId:bookings[1].id,chargeId,amountCents:4001,requestId:'synthetic-placemat-4',reason:'Room closed'})
  assert.equal(refund.status,'succeeded')
  await h.command('service.cancel',{...payload(1),refundId:refund.id,amountCents:4000,reason:'synthetic-placemat-3',acknowledged:true},{status:409})
  await h.command('service.cancel',{...payload(2),refundId:refund.id,amountCents:4001,reason:'synthetic-placemat-3',acknowledged:true},{status:409})
  const cancelled=await h.command('service.cancel',{...payload(1),refundId:refund.id,amountCents:4001,reason:'synthetic-placemat-3',acknowledged:true})
  assert.equal(cancelled.cancellation.amountCents,4001);assert.equal(cancelled.cancellation.refundId,refund.id)
  await h.command('service.relocation',{...review(2),startAt:new Date(Date.parse(s.startAt)+120*60000).toISOString()})
  await h.command('service.outreach',{...payload(2),acknowledged:true},{status:409});assert.equal(h.messages.length,sent+1,'Missing permission never calls mail')
  await h.command('service.followup',{...payload(2),status:'failed-contact',outcome:'No permitted email; manager will contact guest personally'})
  view=await h.api('/api/state');assert.equal(view.state.bookings.find(b=>b.id===bookings[1].id).status,'cancelled');assert.deepEqual(view.state.bookings.find(b=>b.id===bookings[2].id),original[2]);assert.equal(view.state.serviceChanges[0].tasks[2].ownerId,view.actor.id)
  assert.ok(view.state.audit.some(e=>e.action==='service.relocation.accepted'&&e.actor==='guest'&&e.at))
  assert.ok(view.state.audit.some(e=>e.action==='service.outreach.attempt'&&e.actor===offer.relocation.reviewedBy&&e.at))
  const csv=await h.request('/api/business-export/service-changes.csv');assert.match(await csv.text(),/4001/)
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});await copy.api('/api/public/relocation/status',{token},{as:'',status:404});assert.equal((await copy.api('/api/state')).state.serviceChanges[0].tasks[1].cancellation.amountCents,4001)}finally{await copy.close()}
  await h.command('guest.erase',{guestId:original[0].guestId,confirm:'ERASE'})
  view=await h.api('/api/state');assert.equal(view.state.serviceChanges[0].tasks[0].relocation.reason,'');assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('synthetic-placemat-2'))
 }finally{await h.close()}
})

test('Relocation capabilities expire, rotate, decline and revalidate stale inventory without changing original commitments or retrying mail',async()=>{
 let failMail=false;const messages=[]
 const h=await installation({mailEdge:async request=>{messages.push(await request.json());return failMail?new Response(null,{status:503}):Response.json({id:'synthetic-placemat-'+messages.length})}})
 try{
  const {service:s,floor}=await service(h,{tables:2,covers:20});await h.command('table.save',{...floor[1],area:'Patio'})
  const b=await h.command('booking.phone',{...publicGuest(s,0,{area:'Dining room'}),staffIntake:{source:'phone',contactPreference:'email',confirmationConsent:true}})
  const plan=await prepare(h,s);await h.command('proposal.approve',{proposalId:plan.id})
  let view=await h.api('/api/state');const original=structuredClone(view.state.bookings[0]),change=view.state.serviceChanges[0],task={changeId:change.id,taskId:change.tasks[0].id},review={...task,serviceId:s.id,startAt:s.startAt,tableIds:[floor[1].id],area:'Patio',reason:'synthetic-placemat-5'}
  const send=async()=>{await h.command('service.relocation',review);await h.command('service.outreach',{...task,acknowledged:true});return new URLSearchParams(new URL(messages.at(-1).text.match(/https:\/\/[^\s]+\/relocation#[^\s]+/)[0]).hash.slice(1)).get('token')}
  const token=await send()
  await h.command('booking.phone.change',{bookingId:b.id,version:(await h.api('/api/state')).version,partySize:2,startAt:new Date(Date.parse(s.startAt)+120*60000).toISOString(),area:'Patio',tableIds:[floor[1].id],staffIntake:{source:'phone',contactPreference:'email',confirmationConsent:true}},{status:409})
  await h.api('/api/public/relocation/decline',{token,acknowledged:true},{as:''});assert.deepEqual((await h.api('/api/state')).state.bookings[0],original)
  await h.api('/api/public/relocation/accept',{token,acknowledged:true},{as:'',status:404})
  const second=await send(),third=await send();await h.api('/api/public/relocation/status',{token:second},{as:'',status:404})
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});await copy.api('/api/public/relocation/status',{token:third},{as:'',status:404});assert.ok(!(await copy.api('/api/state')).state.serviceChanges[0].tasks[0].relocation.tokenHash)}finally{await copy.close()}
  await h.api('/api/public/book',publicGuest(s,1,{area:'Patio'}),{as:'',status:201})
  await h.api('/api/public/relocation/accept',{token:third,acknowledged:true},{as:'',status:409})
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id),original)
  const row=await h.db.prepare('SELECT data FROM pm_state WHERE id=1').first(),state=JSON.parse(row.data);state.serviceChanges[0].tasks[0].relocation.expiresAt=new Date(Date.now()-60000).toISOString();await h.db.prepare('UPDATE pm_state SET data=?,version=version+1 WHERE id=1').bind(JSON.stringify(state)).run()
  await h.api('/api/public/relocation/status',{token:third},{as:'',status:404})
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id),original)
  review.startAt=new Date(Date.parse(s.startAt)+120*60000).toISOString();failMail=true
  const failedToken=await send(),attempts=messages.length
  assert.equal((await h.api('/api/state')).state.serviceChanges[0].tasks[0].outreach.state,'unconfirmed')
  await h.api('/api/public/relocation/status',{token:failedToken},{as:'',status:404})
  await h.command('service.outreach',{...task,acknowledged:true},{status:409});assert.equal(messages.length,attempts,'An uncertain attempt never retries mail automatically')
 }finally{await h.close()}
})

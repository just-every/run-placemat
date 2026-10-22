import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {installation,service,publicGuest} from './harness.mjs'

test('BOOK-001: three public reservations and a race for the last fitting combination return one real confirmation and current availability',async()=>{
 const h=await installation();try{
  const {service:s,floor}=await service(h,{tables:5,seats:2,covers:20})
  const combination=floor.slice(3).map(t=>t.id)
  await h.command('combination.save',{tableIds:combination,capacity:4,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
  const available=async size=>(await h.api('/api/public/services?partySize='+size,undefined,{as:''})).services.find(v=>v.id===s.id)
  assert.ok((await available(2)).slots.some(slot=>slot.startAt===s.startAt),'BOOK-001: published service offers the requested arrival')
  const first=[]
  for(let i=0;i<3;i++){
   const confirmation=(await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result
   assert.match(confirmation.confirmation,/Your table at Cedar & Salt is booked/);assert.equal(confirmation.partySize,2);assert.equal(confirmation.startAt,s.startAt)
   const booking=(await h.api('/api/state')).state.bookings.find(b=>b.id===confirmation.id)
   assert.ok(booking,'BOOK-001: public confirmation points to a durable reservation')
   assert.equal(booking.status,'booked');assert.equal(booking.serviceId,s.id);assert.equal(booking.startAt,s.startAt)
   assert.equal(booking.partySize,2);assert.equal(booking.tableIds.length,1)
   assert.ok(floor.some(table=>table.id===booking.tableIds[0]&&table.seats>=booking.partySize),'BOOK-001: confirmation has a fitting real table')
   first.push(booking)
  }
  assert.equal(new Set(first.flatMap(b=>b.tableIds)).size,3,'BOOK-001: all three confirmed reservations occupy distinct tables')
  assert.ok(first.every(b=>!b.tableIds.some(id=>combination.includes(id))),'BOOK-001: only the final two-table combination remains')
  assert.ok((await available(4)).slots.some(slot=>slot.startAt===s.startAt),'BOOK-001: the last fitting combination is currently bookable')
  const race=await Promise.all([3,4].map(i=>h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(s,i,{partySize:4})})))
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409],'BOOK-001: concurrent guests receive exactly one confirmation and one conflict')
  const answers=await Promise.all(race.map(r=>r.json())),winner=answers[race.findIndex(r=>r.status===201)].result,loser=answers[race.findIndex(r=>r.status===409)]
  assert.match(winner.confirmation,/Your table at Cedar & Salt is booked/);assert.equal(winner.partySize,4);assert.equal(winner.startAt,s.startAt)
  assert.ok(loser.error,'BOOK-001: losing guest gets an actionable conflict');assert.equal(loser.result,undefined,'BOOK-001: conflict is never a false confirmation')
  const state=(await h.api('/api/state')).state
  const assigned=state.bookings.find(b=>b.id===winner.id)
  assert.ok(assigned,'BOOK-001: winning confirmation points to a durable reservation');assert.equal(assigned.status,'booked');assert.equal(assigned.serviceId,s.id);assert.equal(assigned.partySize,4)
  assert.deepEqual([...assigned.tableIds].sort(),[...combination].sort(),'BOOK-001: winner is assigned the exact fitting combination')
  assert.equal(state.bookings.length,4);assert.equal(state.bookings.reduce((sum,b)=>sum+b.partySize,0),10)
  assert.equal(new Set(state.bookings.flatMap(b=>b.tableIds)).size,5)
  assert.deepEqual(state.bookings.map(b=>b.id).sort(),[...first.map(b=>b.id),winner.id].sort(),'BOOK-001: confirmations match durable reservations')
  for(const size of [2,4]){
   const current=await available(size)
   assert.ok(!current.slots.some(slot=>slot.startAt===s.startAt),'BOOK-001: next availability excludes the occupied arrival for party '+size)
   assert.ok(current.slots.some(slot=>slot.startAt===new Date(Date.parse(s.startAt)+90*60000).toISOString()),'BOOK-001: later capacity remains genuinely available')
  }
  await h.api('/api/public/book',publicGuest(s,5),{as:'',status:409})
  assert.deepEqual((await h.api('/api/state')).state,state,'BOOK-001: a full-floor request creates no booking or other state change')
 }finally{await h.close()}
})

test('SERVICE-001: exact dated venue, floor and service publication rejects changed drafts and exposes only the approved service',async()=>{
 const h=await installation();try{
  const manager=await h.signIn('publication-manager@example.test','admin')
  await h.command('venue.update',{name:'Synthetic Friday Bistro',timezone:'America/New_York'})
  const table=await h.command('table.save',{label:'Window 1',seats:4,x:25,y:45},{as:manager})
  const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7));const day=date.toISOString().slice(0,10)
  let draft=await h.command('service.save',{name:'Friday dinner',startAt:day+'T22:00:00Z',endAt:day+'T23:59:00Z',turnMinutes:60,coverLimit:12},{as:manager})
  const hidden=async()=>assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.length,0,'SERVICE-001: an unpublished or merely prepared service is not offered')
  await hidden()
  const prepare=async()=>h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Review the exact Friday restaurant, tables and service'},{as:manager})
  for(const change of ['service','floor','venue']){
   const proposal=await prepare(),snapshot=(await h.api('/api/state')).state
   assert.deepEqual(proposal.plan.service,snapshot.services.find(v=>v.id===draft.id))
   assert.deepEqual(proposal.plan.tables,snapshot.tables);assert.deepEqual(proposal.plan.venue,snapshot.venue)
   await hidden()
   if(change==='service')draft=await h.command('service.save',{...draft,name:'Revised Friday dinner',turnMinutes:75,coverLimit:8},{as:manager})
   if(change==='floor')await h.command('table.save',{...table,x:40,y:55},{as:manager})
   if(change==='venue')await h.command('venue.update',{name:'Synthetic Revised Bistro',timezone:'America/New_York'})
   const before=(await h.api('/api/state')).state
   await h.command('proposal.approve',{proposalId:proposal.id},{as:manager,status:409})
   assert.deepEqual((await h.api('/api/state')).state,before,'SERVICE-001: stale '+change+' approval changes nothing')
   await hidden()
  }
  const other=await h.command('service.save',{name:'Unapproved second sitting',startAt:day+'T20:00:00Z',endAt:day+'T21:30:00Z',turnMinutes:60,coverLimit:4})
  const exact=await prepare(),decision=await h.command('proposal.approve',{proposalId:exact.id},{as:manager})
  const {state,names}=await h.api('/api/state'),published=state.services.find(v=>v.id===draft.id)
  assert.equal(decision.status,'approved');assert.equal(names[decision.approvedBy],'Floor manager')
  assert.equal(published.status,'published');assert.equal(published.turnMinutes,75);assert.equal(published.coverLimit,8)
  assert.equal(published.startAt,day+'T22:00:00.000Z');assert.equal(published.endAt,day+'T23:59:00.000Z')
  assert.equal(state.venue.timezone,'America/New_York');assert.equal(state.venue.name,'Synthetic Revised Bistro')
  assert.deepEqual(state.tables.map(t=>({id:t.id,x:t.x,y:t.y})),[{id:table.id,x:40,y:55}])
  assert.equal(state.services.find(v=>v.id===other.id).status,'draft')
  const available=(await h.api('/api/public/services?partySize=4',undefined,{as:''})).services
  assert.deepEqual(available.map(v=>v.id),[draft.id]);assert.ok(available[0].slots.some(v=>v.startAt===published.startAt))
  await h.api('/api/public/book',publicGuest(other,0),{as:'',status:404})
  const booked=(await h.api('/api/public/book',publicGuest(published,0,{partySize:4}),{as:'',status:201})).result
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(v=>v.id===booked.id).tableIds,[table.id])
 }finally{await h.close()}
})

test('WAIT-001: Friday online bookings, fitting manager walk-in and no-show release seat a queued party while impossible status changes stay atomic',async()=>{
 const h=await installation();try{
  const manager=await h.signIn('queue-manager@example.test','admin'),{service:s,floor}=await service(h),online=[]
  assert.equal(new Date(s.startAt).getUTCDay(),5,'WAIT-001: this is the dated Friday journey')
  for(let i=0;i<3;i++)online.push((await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result)
  const walkin=await h.command('booking.walkin',publicGuest(s,3),{as:manager})
  assert.equal(walkin.status,'seated');assert.equal(walkin.source,'walk-in');assert.equal(walkin.partySize,2)
  assert.ok(walkin.tableIds.every(id=>floor.some(t=>t.id===id&&t.seats>=walkin.partySize)),'WAIT-001: manager walk-in receives a fitting physical table')
  const waiting=await h.command('waitlist.add',publicGuest(s,4),{as:manager})
  let state=(await h.api('/api/state')).state
  assert.equal(state.bookings.length,4);assert.equal(new Set(state.bookings.flatMap(b=>b.tableIds)).size,4)
  assert.equal(state.waitlist.find(w=>w.id===waiting.id).status,'queued')
  assert.equal(state.waitlist.find(w=>w.id===waiting.id).serviceId,s.id)
  const refuse=async(command,payload)=>{
   const before=(await h.api('/api/state')).state
   await h.command(command,payload,{as:manager,status:409})
   assert.deepEqual((await h.api('/api/state')).state,before,'WAIT-001: refused '+command+' writes neither business state nor history')
  }
  await refuse('booking.status',{bookingId:online[1].id,status:'completed'})
  await refuse('waitlist.seat',{waitlistId:waiting.id,startAt:s.startAt})
  await refuse('booking.walkin',publicGuest(s,5))
  const released=state.bookings.find(b=>b.id===online[0].id).tableIds
  await h.command('booking.status',{bookingId:online[0].id,status:'no-show'},{as:manager})
  const seated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:s.startAt},{as:manager})
  assert.equal(seated.status,'seated');assert.equal(seated.source,'waitlist');assert.equal(seated.guestId,waiting.guestId)
  assert.equal(seated.serviceId,s.id);assert.equal(seated.partySize,waiting.partySize);assert.deepEqual(seated.tableIds,released,'WAIT-001: waiting party uses exactly the no-show capacity')
  state=(await h.api('/api/state')).state
  assert.equal(state.waitlist.find(w=>w.id===waiting.id).status,'seated')
  assert.equal(state.bookings.find(b=>b.id===online[0].id).status,'no-show')
  assert.equal(new Set(state.bookings.filter(b=>['booked','seated'].includes(b.status)).flatMap(b=>b.tableIds)).size,4)
  await refuse('waitlist.seat',{waitlistId:waiting.id,startAt:s.startAt})
  await h.command('booking.status',{bookingId:online[1].id,status:'cancelled'},{as:manager})
  await h.command('booking.status',{bookingId:online[2].id,status:'seated'},{as:manager})
  await h.command('booking.status',{bookingId:online[2].id,status:'completed'},{as:manager})
  await h.command('booking.status',{bookingId:seated.id,status:'completed'},{as:manager})
  for(const [bookingId,terminal] of [[online[0].id,'no-show'],[online[1].id,'cancelled'],[online[2].id,'completed']]){
   for(const status of ['seated','completed','cancelled','no-show'].filter(v=>v!==terminal))await refuse('booking.status',{bookingId,status})
   assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===bookingId).status,terminal)
  }
  const final=(await h.api('/api/state')).state
  assert.equal(final.bookings.find(b=>b.id===seated.id).status,'completed')
  assert.ok(final.serviceEvents.some(e=>e.bookingId===seated.id&&e.after.bookingStatus==='seated'))
  assert.ok(final.serviceEvents.some(e=>e.bookingId===seated.id&&e.after.bookingStatus==='completed'))
 }finally{await h.close()}
})

test('GUEST-001: authorized guest/state reads retain contact, edited notes, imported dated visits and current completed, cancelled and no-show reservations on one guest',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h,{covers:12}),manager=await h.signIn('history-manager@example.test','admin'),reader=await h.signIn('history-reader@example.test')
  const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\nsynthetic-history-1,Alex History,alex.history@example.test,+1 415 555 0101,Imported window preference,2026-08-10,2,completed\nsynthetic-history-1,Alex History,alex.history@example.test,+1 415 555 0101,Imported window preference,2026-09-05,4,cancelled\nsynthetic-history-1,Alex History,alex.history@example.test,+1 415 555 0101,Imported window preference,2026-09-12,3,no-show\n'
  const expectedHistory=[{date:'2026-08-10',partySize:2,status:'completed'},{date:'2026-09-05',partySize:4,status:'cancelled'},{date:'2026-09-12',partySize:3,status:'no-show'}]
  const dry=(await h.api('/api/import/dry-run',{csv})).result
  assert.equal(dry.canApply,true);await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
  const guest=(await h.api('/api/guests?search=alex.history',undefined,{as:reader})).guests[0]
  assert.equal(guest.name,'Alex History');assert.equal(guest.email,'alex.history@example.test');assert.equal(guest.phone,'+1 415 555 0101')
  assert.equal(guest.notes,'Imported window preference');assert.deepEqual(guest.history,expectedHistory)
  const bookings=[]
  for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(s,i,{name:guest.name,email:i===1?'ALEX.HISTORY@example.test':guest.email,phone:guest.phone,startAt:new Date(Date.parse(s.startAt)+i*15*60000).toISOString()}),{as:'',status:201})).result)
  await h.command('booking.status',{bookingId:bookings[0].id,status:'seated'},{as:manager})
  await h.command('booking.status',{bookingId:bookings[0].id,status:'completed'},{as:manager})
  await h.command('booking.status',{bookingId:bookings[1].id,status:'cancelled'},{as:manager})
  await h.command('booking.status',{bookingId:bookings[2].id,status:'no-show'},{as:manager})
  const statuses=['completed','cancelled','no-show']
  const assertHistory=async notes=>{
   for(const as of [h.cookie,manager,reader]){
    const fromDoor=(await h.api('/api/guests?search='+encodeURIComponent(guest.email),undefined,{as})).guests
    const {state,guests}=await h.api('/api/state',undefined,{as}),stored=guests.find(g=>g.id===guest.id)
    assert.equal(fromDoor.length,1);assert.equal(guests.length,1,'GUEST-001: repeat reservations reuse the imported guest identity')
    for(const g of [fromDoor[0],stored]){
     assert.equal(g.id,guest.id);assert.equal(g.name,guest.name);assert.equal(g.email,guest.email);assert.equal(g.phone,guest.phone)
     assert.equal(g.notes,notes);assert.deepEqual(g.history,expectedHistory,'GUEST-001: editing current notes and statuses preserves every imported visit')
    }
    const linked=state.bookings.filter(b=>b.guestId===guest.id)
    assert.equal(linked.length,3);assert.deepEqual(linked.map(b=>b.id).sort(),bookings.map(b=>b.id).sort())
    for(const [i,b] of bookings.entries()){
     const current=linked.find(v=>v.id===b.id)
     assert.equal(current.status,statuses[i]);assert.equal(current.serviceId,s.id);assert.equal(current.startAt,b.startAt);assert.equal(current.partySize,2)
    }
   }
  }
  await assertHistory('Imported window preference')
  for(const notes of ['Staff recorded a quiet-window request','Manager corrected the service note']){
   await h.command('guest.update',{guestId:guest.id,notes},{as:manager})
   await assertHistory(notes)
  }
  const final=await h.api('/api/state',undefined,{as:manager}),current=final.guests[0]
  assert.deepEqual(current.notesHistory.map(n=>n.notes),['Staff recorded a quiet-window request','Manager corrected the service note'])
  for(const revision of current.notesHistory){assert.equal(final.names[revision.provenance.actor],'Floor manager');assert.ok(Number.isFinite(Date.parse(revision.provenance.at)))}
  await h.api('/api/guests',undefined,{as:'',status:401});await h.api('/api/state',undefined,{as:'',status:401})
 }finally{await h.close()}
})

test('OSS-001: complete Friday service without a license/payment account; online bookings, walk-in, waitlist, no-show, reminder export and history',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h),bookings=[]
  assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.length,1)
  for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result)
  const walkin=await h.command('booking.walkin',publicGuest(s,3))
  await h.api('/api/public/book',publicGuest(s,4),{as:'',status:409})
  const waiting=await h.command('waitlist.add',publicGuest(s,4))
  let {state,guests}=await h.api('/api/state')
  assert.equal(state.bookings.length,4);assert.equal(new Set(state.bookings.flatMap(b=>b.tableIds)).size,4);assert.equal(walkin.status,'seated');assert.equal(state.waitlist[0].status,'queued')
  assert.equal(guests.find(g=>g.email==='guest0@example.test').name,'Alex Rowan')
  await h.command('booking.status',{bookingId:bookings[0].id,status:'no-show'})
  await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:s.startAt})
  const p=await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:s.id},reason:'Remind the remaining booked guests'})
  await h.command('proposal.approve',{proposalId:p.id})
  const csv=await (await h.request('/api/reminders.csv')).text();assert.ok(csv.includes('guest1@example.test'));assert.ok(!csv.includes('guest0@example.test'))
  const ics=await (await h.request('/api/calendar/'+bookings[1].id)).text();assert.ok(ics.includes('BEGIN:VEVENT'));assert.ok(ics.includes('DTSTART:'))
  state=(await h.api('/api/state')).state;assert.equal(state.bookings.find(b=>b.id===bookings[0].id).status,'no-show');assert.equal(state.waitlist[0].status,'seated');assert.ok(state.proposals.every(p=>p.approvedBy&&p.approvedAt))
  for(const b of state.bookings.filter(b=>b.status==='booked'||b.status==='seated')){if(b.status==='booked')await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,stage:'ready'})}
  await h.command('service.close',{serviceId:s.id,reason:'Friday service finished without a payment or license setup'})
  const closed=(await h.api('/api/state')).state;assert.ok(closed.services.find(v=>v.id===s.id).closedAt);assert.ok(closed.bookings.every(b=>['completed','no-show'].includes(b.status)))
 }finally{await h.close()}
})

test('Direct transport roles, CSRF, agent preparation and exact-draft person approval',async()=>{
 const h=await installation();try{
  for(const path of ['/api/state','/api/backup','/api/import/journal','/api/calendar/missing'])await h.api(path,undefined,{as:'',status:401})
  await h.api('/api/commands',{command:'table.save',payload:{}},{as:'',status:401})
  const member=await h.signIn('host@example.test'),manager=await h.signIn('manager@example.test','admin')
  await h.api('/api/state',undefined,{as:member})
  const first=await h.command('table.save',{label:'T1',seats:4,x:20,y:20},{as:manager})
  const second=await h.command('table.save',{label:'T2',seats:4,x:60,y:20})
  await h.command('table.save',{label:'T2',seats:4,x:60,y:20},{as:member,status:403})
  await h.api('/api/commands',{command:'venue.update',payload:{name:'Forged',timezone:'UTC'}},{headers:{origin:'https://wrong.example'},status:403})
  await h.api('/api/agent-keys',{name:'Unauthorized'},{as:manager,status:403})
  const key=(await h.api('/api/agent-keys',{name:'Service assistant'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const startAt=new Date(Date.now()+7*86400000).toISOString(),endAt=new Date(Date.parse(startAt)+3*3600000).toISOString()
  const draft=await h.command('service.save',{name:'Dinner',startAt,endAt,turnMinutes:60,coverLimit:20})
  const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Prepare venue service'},agent)
  await h.command('proposal.approve',{proposalId:p.id},{...agent,status:403})
  await h.command('service.save',{...draft,name:'Revised dinner'})
  await h.command('proposal.approve',{proposalId:p.id},{status:409})
  const latest=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Updated exact draft'},agent)
  for(const command of ['proposal.prepare','proposal.approve'])await h.command(command,command==='proposal.prepare'?{kind:'service.publish',plan:{serviceId:draft.id},reason:'Member cannot prepare publication'}:{proposalId:latest.id},{as:member,status:403})
  const publication=await h.command('proposal.approve',{proposalId:latest.id},{as:manager})
  const published=await h.api('/api/state',undefined,{as:manager}),state=published.state
  assert.equal(state.services[0].status,'published');assert.equal(state.proposals.at(-1).preparedBy,key.id);assert.ok(state.proposals.at(-1).approvedBy!==key.id)
  assert.equal(published.names[publication.preparedBy],'Service assistant (preparation key)');assert.equal(published.names[publication.approvedBy],'Floor manager')
  assert.equal(publication.reason,'Updated exact draft');assert.deepEqual(publication.plan,latest.plan)
  assert.ok(Number.isFinite(Date.parse(publication.preparedAt)));assert.ok(Date.parse(publication.approvedAt)>=Date.parse(publication.preparedAt))
  for(const opts of [{as:''},{as:member},agent]){
   const offered=(await h.api('/api/public/services?partySize=2',undefined,opts)).services
   assert.ok(offered.some(v=>v.id===draft.id&&v.slots.some(slot=>slot.startAt===draft.startAt)))
  }
  const booked=(await h.api('/api/public/book',publicGuest(draft,0),{as:'',status:201})).result
  for(const opts of [{as:member},agent]){
   const current=await h.api('/api/state',undefined,opts),guest=(await h.api('/api/guests?search=guest0',undefined,opts)).guests[0]
   assert.equal(guest.email,'guest0@example.test');assert.equal(current.state.bookings.find(b=>b.id===booked.id).guestId,guest.id)
  }
  await h.api('/api/guests',undefined,{as:'',status:401})
  await h.command('booking.status',{bookingId:booked.id,status:'cancelled'},{...agent,status:403})
  const move=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:booked.id,tableIds:[second.id]},reason:'Place the guest by the window'},agent)
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===booked.id).tableIds,[first.id],'Preparation leaves the current assignment unchanged')
  await h.command('proposal.approve',{proposalId:move.id},{...agent,status:403})
  const moved=await h.command('proposal.approve',{proposalId:move.id},{as:manager})
  const afterMove=await h.api('/api/state',undefined,{as:manager})
  assert.deepEqual(afterMove.state.bookings.find(b=>b.id===booked.id).tableIds,[second.id],'Person approval commits the reviewed destination')
  assert.equal(moved.reason,'Place the guest by the window');assert.deepEqual(moved.plan,move.plan)
  assert.equal(afterMove.names[moved.preparedBy],'Service assistant (preparation key)');assert.equal(afterMove.names[moved.approvedBy],'Floor manager')
  const clash=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:booked.id,tableIds:[first.id]},reason:'Review a currently free destination'},agent)
  await h.api('/api/public/book',publicGuest(draft,1),{as:member,status:201})
  const occupied=(await h.api('/api/state')).state
  await h.command('proposal.approve',{proposalId:clash.id},{as:manager,status:409})
  assert.deepEqual((await h.api('/api/state')).state,occupied,'A competing public booking prevents the prepared move without changing either reservation')
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  await h.api('/api/state',undefined,{...agent,status:401})
  await h.api('/api/guests',undefined,{...agent,status:401})
  await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:draft.id},reason:'Revoked key cannot prepare'},{...agent,status:401})
  const later=new Date(Date.parse(draft.startAt)+60*60000).toISOString()
  assert.ok((await h.api('/api/public/services?partySize=2',undefined,agent)).services.find(v=>v.id===draft.id).slots.some(v=>v.startAt===later),'Revoking a private credential does not close public availability')
  const publicBooking=(await h.api('/api/public/book',publicGuest(draft,2,{startAt:later}),{...agent,status:201})).result
  assert.equal(publicBooking.startAt,later);assert.equal(publicBooking.partySize,2)
  await h.api('/api/backup',undefined,{as:member,status:403})
 }finally{await h.close()}
})

test('ACCESS-001: native roles and preparation keys enforce downloads, move-in, erasure and backup custody on every direct door',async()=>{
 const h=await installation(),empty=await installation();try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result
  const manager=await h.signIn('custody-manager@example.test','admin'),member=await h.signIn('custody-reader@example.test')
  const key=(await h.api('/api/agent-keys',{name:'Custody preparation'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const proposal=await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:s.id},reason:'Reviewed reminders for authorized download'},agent)
  await h.command('proposal.approve',{proposalId:proposal.id},{as:manager})
  const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\ncustody-1,Custody Import,custody@example.test,+1 415 555 0123,Window,2026-08-10,2,completed\n'
  const dry=(await h.api('/api/import/dry-run',{csv})).result
  const job=(await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})).result.job
  assert.equal((await h.request('/api/reminders.csv')).status,200) // Establish the legitimate exported state before testing refusals.
  const archive=await h.api('/api/backup'),guest=(await h.api('/api/guests?search=guest0')).guests[0]
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.startAt))
  const ownerDownloads=['/api/backup','/api/business-export/guests.csv','/api/audit.csv','/api/import/journal','/api/import/journal/'+job.id]
  const managerDownloads=['/api/reminders.csv','/api/calendar/'+booking.id,'/api/reports/reservations.csv','/api/preshift?date='+date,'/api/preshift.pdf?date='+date,'/preshift?date='+date]
  const writes=[
   ['/api/import/dry-run',{csv}],['/api/import/apply',{csv,confirm:dry.fingerprint}],
   ['/api/import/undo',{jobId:job.id,confirm:'UNDO',fingerprint:dry.fingerprint}],
   ['/api/restore',{archive,confirm:'RESTORE'}],['/api/agent-keys',{name:'Must be refused'}],
   ['/api/agent-keys/'+key.id,{},'DELETE'],
   ['/api/commands',{command:'guest.erase',payload:{guestId:guest.id,confirm:'ERASE'}}]
  ]
  const before=(await h.api('/api/state')).state
  for(const [label,opts,owner,operate] of [['signed out',{as:''},false,false],['owner',{},true,true],['admin',{as:manager},false,true],['member',{as:member},false,false],['preparation',agent,false,false]]){
   const denied=label==='signed out'?401:403
   for(const path of ownerDownloads.concat(managerDownloads)){
    const allowed=ownerDownloads.includes(path)?owner:operate,r=await h.request(path,opts)
    assert.equal(r.status,allowed?200:denied,label+' '+path)
    const body=await r.text()
    if(!allowed)assert.ok(!body.includes('guest0@example.test')&&!body.includes('custody@example.test'),'Denied download exposes no guest values')
    else if(path==='/api/reminders.csv')assert.ok(body.includes('guest0@example.test'),'Permitted manager reminder download contains the approved guest')
    else if(path==='/api/calendar/'+booking.id)assert.match(body,/BEGIN:VEVENT/)
   }
   if(!owner)for(const [path,body,method='POST'] of writes){const r=await h.request(path,{...opts,method,body});await r.text();assert.equal(r.status,denied,label+' '+method+' '+path)}
  }
  // The owner's otherwise-valid mutations must all fail before changing data when the browser origin is wrong or absent.
  for(const origin of ['https://outside.example',''])for(const [path,body,method='POST'] of writes){
   const r=await h.request(path,{method,body,headers:{origin}});await r.text();assert.equal(r.status,403,'Cross-origin '+method+' '+path)
  }
  assert.deepEqual((await h.api('/api/state')).state,before,'Refused custody requests change neither records nor audit history')
  assert.equal((await h.api('/api/import/journal/'+job.id)).result.job.state,'completed')
  await h.api('/api/import/undo',{jobId:job.id,confirm:'UNDO',fingerprint:dry.fingerprint})
  assert.equal((await h.api('/api/import/journal/'+job.id)).result.job.state,'undone')
  await empty.api('/api/restore',{archive,confirm:'RESTORE'})
  assert.equal((await empty.api('/api/state')).guests.find(g=>g.id===guest.id).email,'guest0@example.test','Owner restore really imports authorized guest data')
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  assert.equal((await h.api('/api/guests?search=guest0')).guests.length,0,'Owner erasure succeeds after unauthorized attempts were refused')
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  for(const path of ['/api/state','/api/guests',...ownerDownloads,...managerDownloads]){const r=await h.request(path,agent);await r.text();assert.equal(r.status,401,'Revoked key '+path)}
  for(const [path,body,method='POST'] of writes){
   const r=await h.request(path,{...agent,method,body}).catch(error=>{throw new Error('Revoked key '+method+' '+path+' transport: '+error.cause?.message,{cause:error})});await r.text();assert.equal(r.status,401,'Revoked key '+method+' '+path)
  }
 }finally{await h.close();await empty.close()}
})

test('FLOOR-001: combinations, UTC turn bounds, service-wide table conflicts, cover cap and stale review protect capacity',async()=>{
 const h=await installation();try{
  const {service:s,floor}=await service(h,{tables:2,seats:2,covers:8})
  await h.command('combination.save',{tableIds:floor.map(t=>t.id),capacity:4,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
  const results=await Promise.all([0,1].map(i=>h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(s,i,{partySize:4})})))
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,1)
  let state=(await h.api('/api/state')).state;assert.equal(state.bookings[0].tableIds.length,2)
  const b=state.bookings[0]
  const key=(await h.api('/api/agent-keys',{name:'Floor capacity planner'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  assert.equal(b.startAt,s.startAt);assert.equal(b.endAt,new Date(Date.parse(s.startAt)+90*60000).toISOString())
  const later=new Date(Date.parse(s.startAt)+90*60000).toISOString()
  const availability=(await h.api('/api/public/services?partySize=4',undefined,{as:''})).services.find(v=>v.id===s.id)
  assert.ok(availability.slots.some(slot=>slot.startAt===later),'A turn ending at the next start does not overlap it')
  assert.ok(!availability.slots.some(slot=>slot.startAt===new Date(Date.parse(s.startAt)+75*60000).toISOString()),'An overlapping turn still holds both physical tables')
  await h.api('/api/public/book',publicGuest(s,2,{startAt:new Date(Date.parse(s.startAt)+5*60000).toISOString()}),{as:'',status:400})
  await h.api('/api/public/book',publicGuest(s,2,{startAt:new Date(Date.parse(s.endAt)-75*60000).toISOString()}),{as:'',status:400})
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:[floor[0].id,floor[0].id]},reason:'Reject a duplicate physical table'},{...agent,status:400})
  const overlapping=await h.command('service.save',{name:'Private dining shares the floor',startAt:s.startAt,endAt:s.endAt,turnMinutes:90,coverLimit:8})
  const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:overlapping.id},reason:'Review overlapping service capacity'})
  await h.command('proposal.approve',{proposalId:publication.id})
  await h.api('/api/public/book',publicGuest(overlapping,2,{partySize:4}),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,1,'A second service cannot sell the same physical tables')
  const stale=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:floor.map(t=>t.id)},reason:'Review exact booked party'},agent)
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:[floor[0].id]},reason:'Too few seats'},{...agent,status:409})
  await h.command('booking.status',{bookingId:b.id,status:'completed'},{status:409})
  await h.command('booking.status',{bookingId:b.id,status:'seated'})
  await h.command('proposal.approve',{proposalId:stale.id},{status:409})
  await h.command('booking.status',{bookingId:b.id,status:'completed'})
  await h.command('booking.stage',{bookingId:b.id,stage:'ready'})
  const next=(await h.api('/api/public/book',publicGuest(s,2,{partySize:4,startAt:later}),{as:'',status:201})).result
  await h.command('booking.status',{bookingId:next.id,status:'seated'});await h.command('booking.status',{bookingId:next.id,status:'completed'})
  await h.api('/api/public/book',publicGuest(s,3,{startAt:new Date(Date.parse(s.startAt)+150*60000).toISOString()}),{as:'',status:409})
  const after=await h.api('/api/state')
  assert.ok(after.state.bookings.every(b=>b.status==='completed'),'The cover cap still applies after physical tables become free')
  assert.equal(after.state.proposals.find(p=>p.id===stale.id).status,'pending','A changed plan requires renewed review')
  assert.equal((await h.api('/api/state')).state.bookings.reduce((n,b)=>n+b.partySize,0),8)
 }finally{await h.close()}
})

test('Owner backup restores real product data into an empty installation and refuses corruption or overwrite',async()=>{
 const h=await installation(),other=await installation(),broken=await installation();try{
  const {service:s}=await service(h);await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})
  const archive=await h.api('/api/backup');assert.equal(archive[0].format,'runeditrun-portability')
  await other.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=await other.api('/api/state');assert.equal(restored.state.bookings.length,1);assert.equal(restored.guests[0].email,'guest0@example.test')
  await other.api('/api/restore',{archive,confirm:'RESTORE'},{status:409})
  const bad=structuredClone(archive),part=bad.find(x=>x.kind==='part');part.items.find(x=>x.table==='pm_guests').row.data='{}'
  await broken.api('/api/restore',{archive:bad,confirm:'RESTORE'},{status:400})
  assert.equal((await broken.api('/api/state')).state.bookings.length,0)
 }finally{await h.close();await other.close();await broken.close()}
})

test('Tablein dry-run, exact apply, durable journal, undo and edited-row conflict use Base import-kit',async()=>{
 const h=await installation();try{
  const csv=await readFile('fixtures/tablein-guests.csv','utf8'),dry=(await h.api('/api/import/dry-run',{csv})).result
  assert.equal(dry.canApply,true);assert.equal((await h.api('/api/state')).guests.length,0)
  const emptyJournal=(await h.api('/api/import/journal')).result.jobs
  assert.deepEqual(emptyJournal,[],'Dry-run creates no import job')
  await h.api('/api/import/apply',{csv,confirm:'wrong'},{status:409})
  assert.equal((await h.api('/api/state')).guests.length,0,'Refused confirmation imports no guest')
  assert.deepEqual((await h.api('/api/import/journal')).result.jobs,emptyJournal,'Refused confirmation creates no journal entry')
  const invalid=csv+'shape-invalid,Invalid Visit,invalid@example.test,+12025550199,,2026-02-30,2,completed\n'
  const rejected=(await h.api('/api/import/dry-run',{csv:invalid})).result
  assert.equal(rejected.canApply,false)
  await h.api('/api/import/apply',{csv:invalid,confirm:rejected.fingerprint},{status:422})
  assert.equal((await h.api('/api/state')).guests.length,0,'A bad history row prevents the valid rows from being imported too')
  assert.deepEqual((await h.api('/api/import/journal')).result.jobs,emptyJournal)
  const applied=(await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})).result.job
  assert.equal(applied.state,'completed')
  const imported=(await h.api('/api/guests')).guests
  assert.equal(imported.length,2)
  const alex=imported.find(g=>g.email==='alex.sample@example.test'),sam=imported.find(g=>g.email==='sam.example@example.test')
  assert.equal(alex.name,'Alex Sample');assert.equal(alex.phone,'+61 400 000 001');assert.equal(alex.notes,'Window seat preferred, historical note')
  assert.deepEqual(alex.history,[{date:'2026-08-10',partySize:2,status:'completed'},{date:'2026-09-05',partySize:4,status:'cancelled'}])
  assert.deepEqual(sam.history,[{date:'2026-09-12',partySize:3,status:'no-show'}])
  for(const guest of imported)for(const field of ['name','email','phone','notes'])assert.equal(guest.provenance[field].source,'imported')
  assert.equal((await h.api('/api/state')).state.bookings.length,0,'Historical visits never become live reservations')
  const jobs=(await h.api('/api/import/journal')).result.jobs;assert.ok(jobs.some(j=>j.id===applied.id))
  assert.equal(jobs.length,1);assert.equal(jobs[0].state,'completed');assert.equal(jobs[0].checkpoint,jobs[0].total)
  assert.deepEqual((await h.api('/api/import/journal/'+applied.id)).result.job,jobs[0],'The retained job is readable through its documented journal door')
  const undone=(await h.api('/api/import/undo',{jobId:applied.id,confirm:'UNDO',fingerprint:dry.fingerprint})).result.job
  assert.equal(undone.state,'undone');assert.equal((await h.api('/api/state')).guests.length,0)
  assert.equal((await h.api('/api/import/journal/'+applied.id)).result.job.state,'undone')
  const csv2=csv.replaceAll('example.test','example.org'),dry2=(await h.api('/api/import/dry-run',{csv:csv2})).result
  const job=(await h.api('/api/import/apply',{csv:csv2,confirm:dry2.fingerprint})).result.job
  const guest=(await h.api('/api/state')).guests[0];await h.command('guest.update',{guestId:guest.id,notes:'Staff edited this record after move-in'})
  const edited=(await h.api('/api/state')).guests
  await h.api('/api/import/undo',{jobId:job.id,confirm:'UNDO',fingerprint:dry2.fingerprint},{status:409})
  assert.ok((await h.api('/api/state')).guests.some(g=>g.notes.includes('Staff edited')))
  assert.deepEqual((await h.api('/api/state')).guests,edited,'A conflict preserves both the staff edit and every other imported guest')
 }finally{await h.close()}
})

test('Erasure removes guest and imported custody, blocks reimport and fences old backup restore',async()=>{
 const h=await installation(),empty=await installation();try{
  const csv=await readFile('fixtures/tablein-guests.csv','utf8'),dry=(await h.api('/api/import/dry-run',{csv})).result
  await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
  const archive=await h.api('/api/backup'),guest=(await h.api('/api/state')).guests[0],member=await h.signIn('staff@example.test')
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'},{as:member,status:403})
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  const after=await h.api('/api/state'),erased=after.guests.find(g=>g.id===guest.id);assert.equal(erased.erased,true);assert.equal(erased.email,'');assert.equal(erased.notes,'')
  const nextDry=(await h.api('/api/import/dry-run',{csv})).result;assert.equal(nextDry.canApply,false)
  const later=await h.api('/api/backup'),afterArchive=JSON.stringify(later);assert.ok(!afterArchive.includes(guest.email));assert.ok(!afterArchive.includes(guest.name))
  await empty.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})
 }finally{await h.close();await empty.close()}
})

test('A guest re-imported under a new id can be erased, then a booked guest too; refusals and approvals read in plain language',async()=>{
 const h=await installation(),empty=await installation();try{
  const {service:s}=await service(h),amelia=(await h.api('/api/public/book',publicGuest(s,0,{name:'Amelia Patel',phone:'0412 345 603'}),{as:'',status:201})).result
  const csv=id=>`guest_id,name,email,phone,notes,visit_date,party_size,visit_status\n${id},Grace Wilson,grace@example.test,+61 400 111 301,,2026-08-10,2,completed\n`
  for(const id of ['g-1','g-2']){
   const dry=(await h.api('/api/import/dry-run',{csv:csv(id)})).result,job=(await h.api('/api/import/apply',{csv:csv(id),confirm:dry.fingerprint})).result.job
   if(id==='g-1'){await h.api('/api/import/undo',{jobId:job.id,confirm:'UNDO',fingerprint:dry.fingerprint});continue}
   const grace=(await h.api('/api/state')).guests.find(g=>g.name==='Grace Wilson');await h.command('guest.update',{guestId:grace.id,notes:'Edited by staff'})
   const refused=await h.api('/api/import/undo',{jobId:job.id,confirm:'UNDO',fingerprint:dry.fingerprint},{status:409});assert.match(refused.error,/Grace Wilson/);assert.ok(!/NATIVE_EDIT_CONFLICT/.test(refused.error))
   const archive=await h.api('/api/backup');await h.api('/api/restore',{archive,confirm:'RESTORE'},{status:409}).then(r=>assert.ok(!/ik_batches|target_not_empty/.test(r.error)))
   await h.command('guest.erase',{guestId:grace.id,confirm:'ERASE'})
   const later=await h.api('/api/backup');assert.ok(!/erasure_epoch/.test((await empty.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})).error))
  }
  const key=(await h.api('/api/agent-keys',{name:'Dinner planning assistant'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const p=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:amelia.id,tableIds:[(await h.api('/api/state')).state.tables.at(-1).id]},reason:'Move the booking'},agent);await h.command('proposal.approve',{proposalId:p.id})
  const state=await h.api('/api/state');assert.equal(state.names[p.preparedBy],'Dinner planning assistant (preparation key)');assert.equal(state.names[state.state.proposals.at(-1).approvedBy],'Venue owner')
  await h.command('guest.erase',{guestId:state.guests.find(g=>g.name==='Amelia Patel').id,confirm:'ERASE'})
  const csvNow=await (await h.request('/api/reminders.csv')).text();assert.ok(!csvNow.includes('Amelia'))
 }finally{await h.close();await empty.close()}
})


test('BOUND-001: public reservations, staff actions and exports cannot create gift cards, stored value, vouchers or food orders',async()=>{
 const h=await installation();try{
  const setup=await h.mf.dispatchFetch(h.origin+'/setup',{method:'POST',redirect:'manual',headers:{origin:h.origin,host:new URL(h.origin).host,cookie:h.cookie,'content-type':'application/x-www-form-urlencoded'},body:'confirm=yes'})
  assert.equal(setup.status,303);assert.equal(setup.headers.get('location'),'/app')
  const {service:s}=await service(h)
  const financial={giftCard:{amount:10000},storedValue:10000,voucher:'DINNER',order:{items:[{name:'Halibut',quantity:2}]},payment:{amount:10000},balance:10000,transferTo:'another-booking'}
  const booking=(await h.api('/api/public/book',publicGuest(s,0,financial),{as:'',status:201})).result
  const before=await h.api('/api/state')
  assert.equal(before.state.bookings.length,1)
  assert.equal(before.state.bookings[0].id,booking.id)
  for(const field of Object.keys(financial)){
   assert.equal(Object.hasOwn(booking,field),false,`BOUND-001: confirmation has no ${field}`)
   assert.equal(Object.hasOwn(before.state.bookings[0],field),false,`BOUND-001: reservation has no ${field}`)
  }
  for(const command of ['giftCard.issue','storedValue.topup','voucher.redeem','balance.transfer','order.create']){
   await h.command(command,{bookingId:booking.id,...financial},{status:400})
  }
  assert.deepEqual(await h.api('/api/state'),before,'BOUND-001: unsupported value/order actions make no changes')
  for(const path of ['/api/gift-cards','/api/stored-value','/api/vouchers','/api/orders']){
   assert.equal((await h.request(path,{method:'POST',body:financial})).status,404,`BOUND-001: ${path} is not a product door`)
  }
  const forbidden=/gift[-_ ]?cards?|stored[-_ ]?value|vouchers?|(?:food|online)[-_ ]?orders?|transferTo/i
  for(const path of ['/app','/book']){
   const response=await h.request(path);assert.equal(response.status,200,`BOUND-001: ${path} is an actual product screen`)
   const html=await response.text()
   assert.match(html,/<main\b/,'BOUND-001: product document was rendered; browser journey inspects hydrated controls')
   const controls=[...html.matchAll(/<(?:button|a|input|select)\b[^>]*>(?:[^<]*)/g)].map(m=>m[0]).join(' ')
   assert.doesNotMatch(controls,forbidden,`BOUND-001: ${path} exposes no value or food-order controls`)
  }
  for(const path of ['/api/backup','/api/reports/reservations.csv','/api/reminders.csv','/api/calendar/'+booking.id]){
   const response=await h.request(path);assert.equal(response.status,200)
   assert.doesNotMatch(await response.text(),forbidden,`BOUND-001: ${path} exports no injected value or order`)
  }
  const http=await readFile(new URL('../../docs/HTTP-CONTRACT.md',import.meta.url),'utf8')
  const doors=[...http.matchAll(/`((?:GET|POST|DELETE) )?\/?api\/[^`]+`/g)].map(m=>m[0]).join(' ')
  assert.ok(doors.length,'BOUND-001: documented doors were inspected')
  assert.doesNotMatch(doors,forbidden,'BOUND-001: documented API has no value or food-order doors')
 }finally{await h.close()}
})

test('Shared host stand: owner enrollment, personal PIN switch, attributed seating/moves, throttles, live suspension/revocation and restricted-door refusal',async()=>{
 const {sharedDeviceFixture}=await import('./shared-device-fixture.mjs'),h=await installation();try{
  const f=await sharedDeviceFixture(h),as=f.deviceCookie;
  await h.api('/api/hoststand/devices',{label:'No member enrollment'},{as:f.staff[0].cookie,status:403});
  await h.api('/api/hoststand/claim',{claimCode:f.registration.claimCode},{as:'',status:409});
  await h.api('/api/hoststand/floor',undefined,{as,status:423});
  await f.unlock(0);let view=await f.floor(),firstGeneration=view.generation;assert.equal(view.actor.id,f.staff[0].id);assert.equal(view.actor.name,'Avery Host');
  for(const value of [f.guest.email,'synthetic-placemat-private-note','synthetic-placemat-private-tag','synthetic-placemat-private-allergy',f.staff[0].pin,f.registration.claimCode])assert.ok(!JSON.stringify(view).includes(value));
  const action=async(command,payload,status=200,generation=view.generation)=>{const response=await h.api('/api/hoststand/commands',{generation,command,payload},{as,status});for(const value of ['synthetic-placemat-private-note','synthetic-placemat-private-allergy',f.guest.email])assert.ok(!JSON.stringify(response).includes(value));return response};
  await action('booking.stage',{bookingId:f.booking.id,stage:'seated'});
  const laterPersonal=await h.signIn('synthetic-placemat-later-personal@example.test','admin'),mixed=as+'; '+laterPersonal;
  await h.api('/auth/operators',undefined,{as:laterPersonal});for(const path of ['/auth/operators','/auth/request','/signin','/setup'])assert.equal((await h.request(path,{as:mixed})).status,403,path);
  await h.api('/api/hoststand/unlock',{operatorId:f.staff[1].id,pin:f.staff[1].pin},{as:mixed});await h.api('/auth/operators',undefined,{as:laterPersonal,status:401});
  const lockPersonal=await h.signIn('synthetic-placemat-lock-personal@example.test','admin');await h.api('/api/hoststand/lock',{}, {as:as+'; '+lockPersonal});await h.api('/auth/operators',undefined,{as:lockPersonal,status:401});await f.unlock(1);view=await f.floor();assert.equal(view.actor.id,f.staff[1].id);
  await action('booking.move',{bookingId:f.booking.id,tableIds:[f.tables[1].id],version:view.version},409,firstGeneration);
  await action('booking.move',{bookingId:f.booking.id,tableIds:[f.tables[1].id],version:view.version});
  const state=(await h.api('/api/state')).state,events=state.audit.filter(e=>e.subject===f.booking.id&&['booking.stage','booking.move'].includes(e.action));assert.deepEqual(events.map(e=>e.actor),f.staff.map(s=>s.id));assert.ok(events.every(e=>e.deviceId===f.registration.id));assert.deepEqual(state.bookings.find(b=>b.id===f.booking.id).tableIds,[f.tables[1].id]);
  for(const path of ['/api/state','/api/guests','/api/backup','/api/reminders.csv','/api/reports/reservations.csv','/api/agent-keys','/api/audit','/auth/operators'])assert.equal((await h.request(path,{as})).status,path.startsWith('/auth/')?403:401,path);
  for(const command of ['guest.erase','venue.update','proposal.approve','service.pacing'])await action(command,{bookingId:f.booking.id},403);
  await action('payment.refund',{bookingId:f.booking.id,amountCents:1},403);
  await h.api('/api/hoststand/commands',{generation:view.generation,command:'booking.stage',payload:{bookingId:f.booking.id,stage:'ordering'}},{as,headers:{origin:'https://other.example.test'},status:403});
  for(let i=0;i<10;i++)await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:'999999999999'},{as,status:i===9?429:401});await f.unlock(0,429);assert.equal((await h.api('/api/hoststand/status',undefined,{as})).locked,true);
  await f.unlock(1);await h.api('/auth/operator/status',{operatorId:f.staff[1].id,status:'inactive'});await h.api('/api/hoststand/floor',undefined,{as,status:423});await f.unlock(1,401);
  await h.api('/auth/operator/status',{operatorId:f.staff[1].id,status:'active'});await f.unlock(1,401);
  const renewed=await h.signIn('synthetic-placemat-renewed@example.test','member','Renewed Host'),operator=(await h.api('/auth/operators')).find(p=>p.email==='synthetic-placemat-renewed@example.test');await h.command('team.host',{operatorId:operator.id,enabled:true});await h.api('/api/hoststand/pin',{pin:'161803398874'},{as:renewed});
  await h.api('/api/hoststand/unlock',{operatorId:operator.id,pin:'161803398874'},{as});await h.command('team.host',{operatorId:operator.id,enabled:false});await h.command('team.host',{operatorId:operator.id,enabled:true});await h.api('/api/hoststand/unlock',{operatorId:operator.id,pin:'161803398874'},{as,status:401});
  const registration=await h.api('/api/hoststand/devices',{label:'Second stand'},{status:201}),oldManager=await h.signIn('synthetic-placemat-device-manager@example.test','admin');
  const claimed=await h.request('/api/hoststand/claim',{method:'POST',body:{claimCode:registration.claimCode},as:oldManager});assert.equal(claimed.status,200);await h.api('/auth/operators',undefined,{as:oldManager,status:401});
  const other=claimed.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('__Host-pm-device='));
  for(let i=0;i<10;i++)await h.api('/api/hoststand/unlock',{operatorId:`synthetic-placemat-unknown-${i}`,pin:'999999999999'},{as:other,status:i===9?429:401});
  await h.api('/api/hoststand/pin',{pin:f.staff[0].pin},{as:f.staff[0].cookie});await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:f.staff[0].pin},{as:other,status:429});
  const archive=await h.api('/api/backup'),archiveText=JSON.stringify(archive);for(const table of ['pm_host_devices','pm_host_pins','pm_host_security_events'])assert.ok(archive[0].excludedTables.includes(table));for(const secret of [f.registration.claimCode,f.deviceCookie.split('=')[1],...f.staff.map(s=>s.pin)])assert.ok(!archiveText.includes(secret));
  await h.api('/api/hoststand/revoke',{deviceId:f.registration.id});await h.api('/api/hoststand/status',undefined,{as,status:403});await h.api('/api/hoststand/floor',undefined,{as,status:403});
  // A fresh stand keeps this separate from the existing per-minute work limit.
  const windowRegistration=await h.api('/api/hoststand/devices',{label:'Next shift stand'},{status:201}),windowClaim=await h.request('/api/hoststand/claim',{method:'POST',body:{claimCode:windowRegistration.claimCode},as:''}),windowAs=windowClaim.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('__Host-pm-device='));assert.equal(windowClaim.status,200);
  // Consecutive failures survive elapsed device windows and require a full-session reset.
  for(let i=0;i<4;i++)await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:'999999999999'},{as:windowAs,status:401});
  await h.db.prepare('UPDATE pm_host_devices SET failure_window_at=? WHERE id=?').bind(Date.now()-16*60000,windowRegistration.id).run();
  for(let i=0;i<6;i++)await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:'999999999999'},{as:windowAs,status:i===5?429:401});
  await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:f.staff[0].pin},{as:windowAs,status:429});
  const manager=await h.signIn('synthetic-placemat-security-manager@example.test','admin');assert.ok((await h.api('/api/hoststand/security-events',undefined,{as:manager})).events.some(e=>e.action==='pin-disabled-ten-failures'&&e.operator_id===f.staff[0].id));
  await h.api('/api/hoststand/pin',{pin:f.staff[0].pin},{as:f.staff[0].cookie});await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:f.staff[0].pin},{as:windowAs});
  const previousPin=f.staff[0].pin;f.staff[0].pin='314159265358';await h.api('/api/hoststand/pin',{pin:f.staff[0].pin},{as:f.staff[0].cookie});await h.api('/api/hoststand/floor',undefined,{as:windowAs,status:423});await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:previousPin},{as:windowAs,status:401});await h.api('/api/hoststand/unlock',{operatorId:f.staff[0].id,pin:f.staff[0].pin},{as:windowAs});

 }finally{await h.close()}
})


test('Shared host stand idle lock is enforced by the server despite background status reads', {timeout:140000},async()=>{
 const {sharedDeviceFixture}=await import('./shared-device-fixture.mjs'),h=await installation();try{
  const f=await sharedDeviceFixture(h);await f.unlock();const before=await f.floor();
  for(let i=0;i<4;i++){await new Promise(resolve=>setTimeout(resolve,31000));const status=await h.api('/api/hoststand/status',undefined,{as:f.deviceCookie});assert.equal(status.locked,i===3,'Background status reads do not extend the two-minute lease');}
  await h.api('/api/hoststand/floor',undefined,{as:f.deviceCookie,status:423});await h.api('/api/hoststand/commands',{generation:before.generation,command:'booking.stage',payload:{bookingId:f.booking.id,stage:'seated'}},{as:f.deviceCookie,status:423});assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===f.booking.id).status,'booked');
 }finally{await h.close()}
})


test('Manager and shift lead: owner-scoped seating exceptions, report and snapshot boundaries, recorded refund authority and immediate revocation',async()=>{
 const {delegationFixture}=await import('./delegation-fixture.mjs'),h=await installation();let restored;try{
  const f=await delegationFixture(h);assert.equal((await h.api('/api/state',undefined,{as:f.leadCookie})).actor.role,'lead');
  const manager=await h.api('/api/state',undefined,{as:f.managerCookie});assert.equal(manager.state.managerRefundLimits[f.manager.id],10000);
  const lead=await h.api('/api/state',undefined,{as:f.leadCookie});assert.equal(lead.state.managerRefundLimits,undefined);assert.deepEqual(lead.state.reportScopes,{[f.lead.id]:[f.first.id]});assert.ok(!JSON.stringify(lead.state.audit).includes('refundLimitCents'));
  await h.command('team.manager-limit',{operatorId:f.manager.id,refundLimitCents:20000},{as:f.managerCookie,status:403});await h.command('analytics.settings',{}, {as:f.managerCookie,status:403});await h.command('team.host',{operatorId:f.lead.id,enabled:true},{status:409});
  const payload={serviceId:f.first.id,startAt:f.first.startAt,partySize:2,name:'synthetic-placemat-lead-walkin',email:'synthetic-placemat-lead-walkin@example.test',tableIds:[f.tables[1].id]};
  const preview=await h.api('/api/pacing/preview',{command:'booking.walkin',payload},{as:f.leadCookie});assert.ok(preview.violations.some(v=>v.kind==='arrival-covers'));
  await h.command('booking.walkin',payload,{as:f.leadCookie,status:409});
  const seated=await h.command('booking.walkin',{...payload,pacingReview:preview.review,pacingConfirm:'yes',pacingReason:'Lead explicitly reviews seating capacity and current staffing'},{as:f.leadCookie});assert.equal(seated.pacingOverride.actor,f.lead.id);
  const state=(await h.api('/api/state')).state;assert.ok(state.audit.some(e=>e.action==='booking.pacing-override'&&e.actor===f.lead.id&&e.source==='person'));assert.ok(state.audit.some(e=>e.action==='team.manager-limit'&&e.changes.some(c=>c.kind==='managerRefundLimits')));
  await h.api('/api/pacing/preview',{command:'booking.walkin',payload:{...payload,email:'synthetic-placemat-clash@example.test',tableIds:[f.tables[0].id]}},{as:f.leadCookie,status:409});
  for(const command of ['venue.update','analytics.settings','proposal.approve','team.host','service.save','guest.update','payment.refund'])await h.command(command,{refundLimitCents:10001},{as:f.leadCookie,status:403});
  for(const path of ['/api/backup','/api/business-export/guests.csv','/api/reminders.csv','/api/reports/reservations.csv?serviceId='+f.first.id])await h.request(path,{as:f.leadCookie}).then(r=>assert.equal(r.status,403,path));
  const snapshots=[];for(const service of [f.first,f.second])snapshots.push(await h.api('/api/reports/performance',{serviceId:service.id}));
  for(const as of [f.leadCookie,f.managerCookie]){
   for(const path of ['/api/reports/reservations','/api/reports/performance','/api/reports/no-show'])await h.api(path+'?serviceId='+f.second.id,undefined,{as,status:403});
   await h.api('/api/reports/reservations',undefined,{as,status:403});await h.api('/api/reports/reservations?serviceId='+f.first.id,undefined,{as});
   await h.api('/api/reports/performance?snapshot='+snapshots[1].publication.id+'&serviceId='+f.first.id,undefined,{as,status:403});await h.api('/api/reports/performance?snapshot='+snapshots[0].publication.id,undefined,{as});
  }
  await h.api('/api/reports/performance',{serviceId:f.first.id},{as:f.leadCookie,status:403});await h.api('/api/reports/performance',{serviceId:f.first.id},{as:f.managerCookie});assert.equal((await h.request('/api/reports/reservations.csv?serviceId='+f.first.id,{as:f.managerCookie})).status,200);for(const path of ['/api/reports/reservations.csv','/api/reports/closed.csv','/api/reports/closed.pdf'])assert.equal((await h.request(path+'?serviceId='+f.second.id,{as:f.managerCookie})).status,403);
  const archive=await h.api('/api/backup');restored=await installation();await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await restored.api('/api/state')).state.reportScopes,(await h.api('/api/state')).state.reportScopes);
  await h.command('team.reports',{operatorId:f.lead.id,serviceIds:[]});await h.api('/api/reports/reservations?serviceId='+f.first.id,undefined,{as:f.leadCookie,status:403});
  await h.command('team.lead',{operatorId:f.lead.id,enabled:false});await h.api('/api/pacing/preview',{command:'booking.walkin',payload},{as:f.leadCookie,status:403});await h.command('booking.stage',{bookingId:seated.id,stage:'ordering'},{as:f.leadCookie,status:403});
 }finally{if(restored)await restored.close();await h.close()}
})

test('Host PIN pepper resists an unpeppered digest and upgrades its stored key version and work factor on unlock',async()=>{
 const {pbkdf2Sync,createHmac}=await import('node:crypto'),{sharedDeviceFixture}=await import('./shared-device-fixture.mjs'),pepper='synthetic-placemat-1',h=await installation({bindings:{HOST_PIN_PEPPERS:JSON.stringify({v1:pepper,v2:'synthetic-placemat-2'}),HOST_PIN_PEPPER_VERSION:'v2'}});try{
  const f=await sharedDeviceFixture(h);for(const pin of ['123456','111111','482482'])await h.api('/api/hoststand/pin',{pin},{as:f.staff[0].cookie,status:400});
  const original=await h.db.prepare('SELECT * FROM pm_host_pins WHERE operator_id=?').bind(f.staff[0].id).first();
  const withoutPepper=pbkdf2Sync(f.staff[0].pin,Buffer.from(original.salt,'hex'),original.iterations,32,'sha256').toString('hex');assert.notEqual(withoutPepper,original.digest);
  await h.db.prepare('UPDATE pm_host_pins SET digest=? WHERE operator_id=?').bind(withoutPepper,f.staff[0].id).run();await f.unlock(0,401);
  const older=pbkdf2Sync(createHmac('sha256',pepper).update(f.staff[0].pin).digest(),Buffer.from(original.salt,'hex'),10000,32,'sha256').toString('hex');
  await h.db.prepare("UPDATE pm_host_pins SET digest=?,pepper_version='v1',iterations=10000 WHERE operator_id=?").bind(older,f.staff[0].id).run();await f.unlock();const upgraded=await h.db.prepare('SELECT * FROM pm_host_pins WHERE operator_id=?').bind(f.staff[0].id).first();assert.equal(upgraded.pepper_version,'v2');assert.equal(upgraded.iterations,100000);assert.notEqual(upgraded.salt,original.salt);await f.floor();
 }finally{await h.close()}
})

test('Host stand live grants permit phone booking, walk-in and queue intake, while owner renewal extends an aged lease',async()=>{
 const {sharedDeviceFixture}=await import('./shared-device-fixture.mjs'),h=await installation();try{
  const f=await sharedDeviceFixture(h);await f.unlock();let view=await f.floor();const action=(command,payload,status=200)=>h.api('/api/hoststand/commands',{generation:view.generation,command,payload},{as:f.deviceCookie,status});
  const phone=await action('booking.phone',{serviceId:f.service.id,startAt:new Date(Date.parse(f.service.startAt)+90*60000).toISOString(),name:'Phone Guest',phone:'4155550177',partySize:2});assert.equal(phone.result.source,'phone');
  view=await f.floor();await action('booking.phone.change',{bookingId:phone.result.id,startAt:new Date(Date.parse(f.service.startAt)+105*60000).toISOString(),partySize:3,version:view.version});
  await action('booking.walkin',{serviceId:f.service.id,startAt:f.service.startAt,name:'Walk-in Guest',partySize:2},403);await h.command('team.pacing',{operatorId:f.staff[0].id,enabled:true});await action('booking.walkin',{serviceId:f.service.id,startAt:f.service.startAt,name:'Walk-in Guest',partySize:2});
  const queue=await action('waitlist.add',{serviceId:f.service.id,name:'Queued Guest',partySize:2,contactConsent:false});await action('waitlist.party',{waitlistId:queue.result.id,partySize:3});
  await h.db.prepare('UPDATE pm_host_devices SET created_at=?,expires_at=? WHERE id=?').bind(Date.now()-24*86400000,Date.now()+6*86400000,f.registration.id).run();assert.equal((await h.api('/api/hoststand/status',undefined,{as:f.deviceCookie})).renewalWarning,true);
  await h.api('/api/hoststand/renew',{deviceId:f.registration.id,days:31},{status:400});await h.api('/api/hoststand/renew',{deviceId:f.registration.id,days:30},{as:f.staff[0].cookie,status:403});
  await h.db.prepare('UPDATE pm_host_devices SET created_at=?,expires_at=? WHERE id=?').bind(Date.now()-31*86400000,Date.now()-86400000,f.registration.id).run();await f.floor().then(()=>assert.fail('Expired stand must refuse'),()=>{});
  await h.api('/api/hoststand/renew',{deviceId:f.registration.id,days:30});await f.unlock();assert.equal((await f.floor()).actor.id,f.staff[0].id);assert.equal((await h.api('/api/hoststand/status',undefined,{as:f.deviceCookie})).renewalWarning,false);
 }finally{await h.close()}
})

test('Refund authority caps one person across booking charges and counts pending plus succeeded refunds before any processor call',async()=>{
 const {paymentEdge}=await import('./payment-fixture.mjs'),edge=paymentEdge(),h=await installation({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:edge.edge});try{
  const f=await service(h,{tables:3,seats:4,covers:80}),booking=(await h.api('/api/public/book',publicGuest(f.service,0),{as:'',status:201})).result;
  const manager=await h.signIn('synthetic-placemat-refunder@example.test','admin'),noLimit=await h.signIn('synthetic-placemat-no-limit@example.test','admin'),people=await h.api('/auth/operators'),managerId=people.find(p=>p.email==='synthetic-placemat-refunder@example.test').id;
  const chargeId=edge.charge(booking.id),otherCharge=edge.charge(booking.id);await h.command('payment.charge-sync',{bookingId:booking.id,chargeId});await h.command('payment.charge-sync',{bookingId:booking.id,chargeId:otherCharge});
  const refund=(amountCents,requestId,as=manager,charge=chargeId,status=200)=>h.command('payment.refund',{bookingId:booking.id,chargeId:charge,amountCents,requestId,reason:'Guest-requested deposit refund'},{as,status});
  let count=edge.calls.length;await refund(1,'absent',noLimit,chargeId,403);assert.equal(edge.calls.length,count);await h.command('team.manager-limit',{operatorId:managerId,refundLimitCents:10000});
  assert.equal((await refund(6000,'first')).status,'succeeded');assert.equal((await refund(4000,'second')).status,'succeeded');count=edge.calls.length;await refund(1,'excess',manager,chargeId,409);await refund(1,'split',manager,otherCharge,409);assert.equal(edge.calls.length,count);
  await refund(6000,'first');assert.equal(edge.calls.length,count,'Successful replay makes no processor call');await refund(5000,'owner',h.cookie);assert.equal(edge.calls.length,count+1,'Owner is uncapped within the charge balance');
  await h.command('team.manager-limit',{operatorId:managerId,refundLimitCents:11000});edge.setRefundStatus('pending');assert.equal((await refund(1000,'pending',manager,otherCharge)).status,'pending');count=edge.calls.length;await refund(1,'pending-excess',manager,otherCharge,409);assert.equal(edge.calls.length,count);
  const beforeErasure=JSON.stringify(await h.api('/api/backup'));assert.ok(beforeErasure.includes('Guest-requested deposit refund'));const guest=(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).guestId;await h.command('guest.erase',{guestId:guest,confirm:'ERASE'});assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('Guest-requested deposit refund'));
  await h.command('team.manager-limit',{operatorId:managerId,refundLimitCents:1.5},{status:400});await h.command('team.manager-limit',{operatorId:managerId,refundLimitCents:20000},{as:manager,status:403});
  const allAudit=(await h.api('/api/audit')).rows;assert.ok(allAudit.some(r=>r.action==='payment.refund'&&r.actor===managerId&&r.changes.some(c=>c.after.status==='succeeded'&&c.before?.status==='pending')));
  const audit=allAudit.filter(r=>r.action==='team.manager-limit');assert.ok(audit.some(r=>r.changes.some(c=>c.kind==='managerRefundLimits'&&c.after[managerId]===10000)));assert.ok(audit.some(r=>r.changes.some(c=>c.kind==='managerRefundLimits'&&c.before?.[managerId]===10000&&c.after[managerId]===11000)));
 }finally{await h.close()}
})

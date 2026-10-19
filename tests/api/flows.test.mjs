import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {installation,service,publicGuest} from './harness.mjs'

test('Friday service: three online bookings, walk-in floor, waitlist, no-show, approved reminders and guest history',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h),bookings=[]
  assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.length,1)
  for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result)
  const walkin=await h.command('booking.walkin',publicGuest(s,3))
  await h.api('/api/public/book',publicGuest(s,4),{as:'',status:409})
  const waiting=await h.command('waitlist.add',publicGuest(s,4))
  let {state,guests}=await h.api('/api/state')
  assert.equal(state.bookings.length,4);assert.equal(new Set(state.bookings.flatMap(b=>b.tableIds)).size,4);assert.equal(walkin.status,'seated');assert.equal(state.waitlist[0].status,'waiting')
  assert.equal(guests.find(g=>g.email==='guest0@example.test').name,'Alex Rowan')
  await h.command('booking.status',{bookingId:bookings[0].id,status:'no-show'})
  await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:s.startAt})
  const p=await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:s.id},reason:'Remind the remaining booked guests'})
  await h.command('proposal.approve',{proposalId:p.id})
  const csv=await (await h.request('/api/reminders.csv')).text();assert.ok(csv.includes('guest1@example.test'));assert.ok(!csv.includes('guest0@example.test'))
  const ics=await (await h.request('/api/calendar/'+bookings[1].id)).text();assert.ok(ics.includes('BEGIN:VEVENT'));assert.ok(ics.includes('DTSTART:'))
  state=(await h.api('/api/state')).state;assert.equal(state.bookings.find(b=>b.id===bookings[0].id).status,'no-show');assert.equal(state.waitlist[0].status,'seated');assert.ok(state.proposals.every(p=>p.approvedBy&&p.approvedAt))
 }finally{await h.close()}
})

test('Direct transport roles, CSRF, agent preparation and exact-draft person approval',async()=>{
 const h=await installation();try{
  for(const path of ['/api/state','/api/backup','/api/import/journal','/api/calendar/missing'])await h.api(path,undefined,{as:'',status:401})
  await h.api('/api/commands',{command:'table.save',payload:{}},{as:'',status:401})
  const member=await h.signIn('host@example.test'),manager=await h.signIn('manager@example.test','admin')
  await h.api('/api/state',undefined,{as:member})
  await h.command('table.save',{label:'T1',seats:4,x:20,y:20},{as:manager})
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
  await h.command('proposal.approve',{proposalId:latest.id},{as:manager})
  const state=(await h.api('/api/state')).state;assert.equal(state.services[0].status,'published');assert.equal(state.proposals.at(-1).preparedBy,key.id);assert.ok(state.proposals.at(-1).approvedBy!==key.id)
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  await h.api('/api/state',undefined,{...agent,status:401})
  await h.api('/api/backup',undefined,{as:member,status:403})
 }finally{await h.close()}
})

test('FLOOR-001: combinations, UTC turn bounds, service-wide table conflicts, cover cap and stale review protect capacity',async()=>{
 const h=await installation();try{
  const {service:s,floor}=await service(h,{tables:2,seats:2,covers:8})
  const results=await Promise.all([0,1].map(i=>h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(s,i,{partySize:4})})))
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,1)
  let state=(await h.api('/api/state')).state;assert.equal(state.bookings[0].tableIds.length,2)
  const b=state.bookings[0]
  assert.equal(b.startAt,s.startAt);assert.equal(b.endAt,new Date(Date.parse(s.startAt)+90*60000).toISOString())
  const later=new Date(Date.parse(s.startAt)+90*60000).toISOString()
  const availability=(await h.api('/api/public/services?partySize=4',undefined,{as:''})).services.find(v=>v.id===s.id)
  assert.ok(availability.slots.some(slot=>slot.startAt===later),'A turn ending at the next start does not overlap it')
  assert.ok(!availability.slots.some(slot=>slot.startAt===new Date(Date.parse(s.startAt)+75*60000).toISOString()),'An overlapping turn still holds both physical tables')
  await h.api('/api/public/book',publicGuest(s,2,{startAt:new Date(Date.parse(s.startAt)+5*60000).toISOString()}),{as:'',status:400})
  await h.api('/api/public/book',publicGuest(s,2,{startAt:new Date(Date.parse(s.endAt)-75*60000).toISOString()}),{as:'',status:400})
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:[floor[0].id,floor[0].id]},reason:'Reject a duplicate physical table'},{status:400})
  const overlapping=await h.command('service.save',{name:'Private dining shares the floor',startAt:s.startAt,endAt:s.endAt,turnMinutes:90,coverLimit:8})
  const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:overlapping.id},reason:'Review overlapping service capacity'})
  await h.command('proposal.approve',{proposalId:publication.id})
  await h.api('/api/public/book',publicGuest(overlapping,2,{partySize:4}),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,1,'A second service cannot sell the same physical tables')
  const stale=await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:floor.map(t=>t.id)},reason:'Review exact booked party'})
  await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:b.id,tableIds:[floor[0].id]},reason:'Too few seats'},{status:409})
  await h.command('booking.status',{bookingId:b.id,status:'completed'},{status:409})
  await h.command('booking.status',{bookingId:b.id,status:'seated'})
  await h.command('proposal.approve',{proposalId:stale.id},{status:409})
  await h.command('booking.status',{bookingId:b.id,status:'completed'})
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
  await h.api('/api/import/apply',{csv,confirm:'wrong'},{status:409})
  const applied=(await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})).result.job
  assert.equal(applied.state,'completed');assert.ok((await h.api('/api/state')).guests.length>0)
  const jobs=(await h.api('/api/import/journal')).result.jobs;assert.ok(jobs.some(j=>j.id===applied.id))
  const undone=(await h.api('/api/import/undo',{jobId:applied.id,confirm:'UNDO',fingerprint:dry.fingerprint})).result.job
  assert.equal(undone.state,'undone');assert.equal((await h.api('/api/state')).guests.length,0)
  const csv2=csv.replaceAll('example.test','example.org'),dry2=(await h.api('/api/import/dry-run',{csv:csv2})).result
  const job=(await h.api('/api/import/apply',{csv:csv2,confirm:dry2.fingerprint})).result.job
  const guest=(await h.api('/api/state')).guests[0];await h.command('guest.update',{guestId:guest.id,notes:'Staff edited this record after move-in'})
  await h.api('/api/import/undo',{jobId:job.id,confirm:'UNDO',fingerprint:dry2.fingerprint},{status:409})
  assert.ok((await h.api('/api/state')).guests.some(g=>g.notes.includes('Staff edited')))
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

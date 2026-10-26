import {experienceFixture} from './experience-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {installation,publicGuest} from './harness.mjs'

const choice=entry=>({experienceId:entry.id,ticketClassId:entry.ticketClasses[0].id,experienceVersion:entry.version,acknowledgedExperienceTerms:true})
const search=(h,s,entry,extra='')=>h.api('/api/public/search?'+new URLSearchParams({date:s.startAt.slice(0,10),partySize:'2',experienceId:entry.id,ticketClassId:entry.ticketClasses[0].id})+extra,undefined,{as:''})

test('Experience catalog publishes tasting and patio events with exact turns, shared physical inventory, pacing and ticket limits through guest search and checkout',async()=>{
 const h=await installation()
 try{
  const f=await experienceFixture(h),reader=await h.signIn('reader@example.test')
  await h.command('experience.save',f.draft('Denied menu',['Dining room'],120,15),{as:reader,status:403})
  await h.command('experience.save',{...f.draft('Unsafe last seating',['Dining room'],120,15),lastSeatingAt:f.at(150)},{status:400})
  const tasting=await f.create(f.draft('Chef tasting dinner',['Dining room'],120,15,2)),patio=await f.create(f.draft('Free patio evening',['Patio'],60,15,8))
  const paid=await f.create({...f.draft('Prepaid celebration catalog',['Dining room'],120,15),kind:'prepaid',amountCents:9000})
  const catalog=(await h.api('/api/public/services',undefined,{as:''})).experiences
  assert.equal(catalog.length,3);assert.equal(catalog.find(e=>e.id===paid.id).bookingAvailable,false);assert.ok(!JSON.stringify(catalog).includes(tasting.createdBy))
  await h.api('/api/public/book',publicGuest(f.service,4,{...choice(paid)}),{as:'',status:409})
  const ordinary=(await h.api('/api/public/book',publicGuest(f.service,0,{tableIds:[f.floor[0].id]}),{as:'',status:201})).result
  const found=await search(h,f.service,tasting)
  assert.ok(found.results.some(r=>r.startAt===f.at(0)));assert.ok(found.results.every(r=>r.experienceId===tasting.id&&r.endAt<=f.at(225)&&r.cleanupEndAt<=f.at(240)))
  assert.equal((await search(h,f.service,tasting,'&area=Patio')).results.length,0)
  assert.ok(!(await search(h,f.service,tasting,'&requiredAccessTags=wheelchair')).results.some(r=>r.startAt===f.at(0)),'The ordinary reservation consumes the only accessible table')
  await h.api('/api/public/book',publicGuest(f.service,1,{...choice(tasting),acknowledgedExperienceTerms:false}),{as:'',status:400})
  const input=publicGuest(f.service,1,{...choice(tasting)}),hold={requestId:randomUUID(),token:randomBytes(32).toString('hex'),booking:input}
  const held=await h.api('/api/public/booking-holds',hold,{as:''});assert.equal(held.hold.experience.id,tasting.id);assert.equal(held.hold.cleanupEndAt,f.at(135))
  assert.equal((await search(h,f.service,tasting)).results.length,0,'A live checkout consumes the ticket quantity')
  await h.command('experience.withdraw',{id:tasting.id,version:tasting.version,confirm:true},{status:409})
  const booked=(await h.api('/api/public/book',{...input,checkout:{requestId:hold.requestId,token:hold.token}},{as:'',status:201})).result
  assert.equal(booked.experienceName,'Chef tasting dinner');assert.equal(booked.endAt,f.at(120));assert.equal(booked.cleanupEndAt,f.at(135))
  const replay=(await h.api('/api/public/booking-holds/status',hold,{as:''})).result;assert.equal(replay.experienceName,'Chef tasting dinner');assert.equal(replay.id,booked.id)
  await h.api('/api/public/book',publicGuest(f.service,2,{...choice(tasting),startAt:f.at(150)}),{as:'',status:409})
  const patioBooking=(await h.api('/api/public/book',publicGuest(f.service,2,{...choice(patio)}),{as:'',status:201})).result
  assert.equal(patioBooking.endAt,f.at(60));assert.equal(patioBooking.cleanupEndAt,f.at(75))
  await h.api('/api/public/book',publicGuest(f.service,3,{area:'Patio',startAt:f.at(60)}),{as:'',status:409})
  await h.api('/api/public/book',publicGuest(f.service,3,{area:'Patio',startAt:f.at(75)}),{as:'',status:201})
  await h.command('booking.walkin',{...publicGuest(f.service,9),...choice(patio)},{status:400})
  const state=(await h.api('/api/state')).state
  assert.equal(state.bookings.find(b=>b.id===booked.id).serviceId,state.bookings.find(b=>b.id===ordinary.id).serviceId)
  assert.ok(!state.bookings.find(b=>b.id===booked.id).tableIds.some(id=>state.bookings.find(b=>b.id===ordinary.id).tableIds.includes(id)))
  const policy={intervalMinutes:15,arrivalCovers:2,arrivalParties:2,concurrentCovers:40,areaArrivalCaps:{}}
  await h.command('service.pacing',{serviceId:f.service.id,pacing:policy})
  assert.ok(!(await search(h,f.service,patio)).results.some(r=>r.startAt===f.at(0)),'Experience and ordinary arrivals share one service pacing budget')
 }finally{await h.close()}
})

test('Experience stale selections require explicit reselection; frozen terms, uploads, public isolation and portable records survive erasure-safe restore',async()=>{
 const h=await installation()
 try{
  const f=await experienceFixture(h),image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  let entry=await f.create({...f.draft('Accessible tasting dinner',['Dining room'],120,15,6),image})
  const selected=(await search(h,f.service,entry,'&requiredAccessTags=wheelchair')).results.find(r=>r.startAt===f.at(0));assert.ok(selected)
  await h.api('/api/public/book',publicGuest(f.service,0,{area:'Dining room',requiredAccessTags:['wheelchair']}),{as:'',status:201})
  const stale=publicGuest(f.service,1,{...choice(entry),requiredAccessTags:['wheelchair']})
  await h.api('/api/public/booking-holds',{requestId:randomUUID(),token:randomBytes(32).toString('hex'),booking:stale},{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,1)
  const newChoice=(await search(h,f.service,entry,'&requiredAccessTags=wheelchair')).results[0];assert.ok(newChoice.startAt>=f.at(90))
  const b=(await h.api('/api/public/book',{...stale,startAt:newChoice.startAt},{as:'',status:201})).result
  let view=await h.api('/api/state');const saved=view.state.bookings.find(row=>row.id===b.id)
  assert.equal(saved.experience.cancellationRules,entry.cancellationRules);assert.deepEqual(saved.requiredAccessTags,['wheelchair'])
  const exported=await h.request('/api/business-export/experiences.csv');assert.equal(exported.status,200);assert.match(await exported.text(),/Accessible tasting dinner/)
  const csv=await h.request('/api/business-export/bookings.csv');assert.match(await csv.text(),/experience_json/)
  await h.command('experience.withdraw',{id:entry.id,version:entry.version,confirm:true})
  const updated=await h.command('experience.save',{...entry,version:entry.version+1,cancellationRules:'New bookings use new terms.'})
  await h.command('experience.publish',{id:updated.id,version:updated.version,confirm:true})
  await h.api('/api/public/book',publicGuest(f.service,2,{...choice(entry),startAt:f.at(105)}),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id).experience.cancellationRules,entry.cancellationRules)
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});const restored=(await copy.api('/api/state')).state;assert.equal(restored.experiences[0].image,image);assert.deepEqual(restored.bookings.find(row=>row.id===b.id).experience,saved.experience)}finally{await copy.close()}
  await h.command('guest.erase',{guestId:saved.guestId,confirm:'ERASE'});const erased=await h.api('/api/backup');assert.ok(!JSON.stringify(erased).includes('guest1@example.test'))
  const erasedCopy=await installation();try{await erasedCopy.api('/api/restore',{archive:erased,confirm:'RESTORE'});assert.equal((await erasedCopy.api('/api/state')).state.experiences[0].name,'Accessible tasting dinner')}finally{await erasedCopy.close()}
 }finally{await h.close()}
})

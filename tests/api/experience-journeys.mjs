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
  const deposit=await f.create({...f.draft('Deposit tasting catalog',['Dining room'],120,15),kind:'deposit',amountCents:2500})
  const catalog=(await h.api('/api/public/services',undefined,{as:''})).experiences
  assert.deepEqual(new Set(catalog.map(e=>e.id)),new Set([tasting.id,patio.id,paid.id,deposit.id]));assert.equal(catalog.find(e=>e.id===paid.id).bookingAvailable,false);assert.ok(!JSON.stringify(catalog).includes(tasting.createdBy))
  for(const entry of [paid,deposit])await h.api('/api/public/book',publicGuest(f.service,4,{...choice(entry)}),{as:'',status:409})
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

test('Experience ticket choices reserve the final included supplement once, retain exact recovery, feed authorized kitchen and sheet totals, and erase personal choices',async()=>{
 const h=await installation()
 try{
  const f=await experienceFixture(h)
  for(const table of (await h.api('/api/state')).state.tables.filter(row=>f.floor.slice(0,2).some(table=>table.id===row.id)))await h.command('table.save',{...table,seats:4})
  const entry=await f.create({...f.draft('Four-course tasting',['Dining room'],120,15,8),ticketClasses:[{name:'Early dinner',quantityLimit:8},{name:'Second class',quantityLimit:8}],addOns:[{name:'Wine pairing',unitAmountCents:0,quantityLimit:8},{name:'Limited mushroom supplement',unitAmountCents:0,quantityLimit:1}],dietaryChoices:[{name:'Plant-based menu'},{name:'Standard tasting menu'}]})
  const servers=await Promise.all([h.signIn('experience-server-a@example.test'),h.signIn('experience-server-b@example.test')])
  const operators=await h.api('/auth/operators')
  for(const [index,email] of ['experience-server-a@example.test','experience-server-b@example.test'].entries()){
   const operator=operators.find(row=>row.email===email);await h.command('team.server',{operatorId:operator.id,enabled:true})
   const assigned=await h.command('server.save',{serviceId:f.service.id,name:index?'Garden server':'Window server',coverCap:20,operatorId:operator.id})
   await h.command('section.save',{serviceId:f.service.id,name:index?'Garden':'Window',serverId:assigned.id,tableIds:[f.floor[index].id]})
  }
  const cart={items:[{id:entry.addOns[0].id,quantity:2},{id:entry.addOns[1].id,quantity:1}],dietaryChoices:[{guestNumber:1,choiceId:entry.dietaryChoices[0].id},{guestNumber:2,choiceId:entry.dietaryChoices[1].id}]}
  const inputs=[0,1].map(index=>publicGuest(f.service,index,{partySize:4,area:'Dining room',tableIds:[f.floor[index].id],...choice(entry),ticketClassId:entry.ticketClasses[index].id,experienceCart:cart}))
  for(const invalid of [{...cart,dietaryChoices:[{guestNumber:5,choiceId:entry.dietaryChoices[0].id}]},{...cart,dietaryChoices:[cart.dietaryChoices[0],cart.dietaryChoices[0]]},{...cart,totalCents:0}])await h.api('/api/public/booking-holds',{requestId:randomUUID(),token:randomBytes(32).toString('hex'),booking:{...inputs[0],experienceCart:invalid}},{as:'',status:400})
  const identities=inputs.map(booking=>({requestId:randomUUID(),token:randomBytes(32).toString('hex'),booking}))
  const raced=await Promise.all(identities.map(body=>h.request('/api/public/booking-holds',{method:'POST',body,as:''})))
  assert.deepEqual(raced.map(row=>row.status).sort(),[200,409]);const winner=raced.findIndex(row=>row.ok),hold=await raced[winner].json()
  const heldPublic=(await h.api('/api/public/services',undefined,{as:''})).experiences.find(row=>row.id===entry.id);assert.equal(heldPublic.addOns.find(row=>row.id===entry.addOns[1].id).remainingByServiceId[f.service.id],0)
  assert.equal(hold.hold.experienceCart.items.find(item=>item.id===entry.addOns[1].id).quantity,1);assert.deepEqual(hold.hold.experienceCart.dietaryChoices,[],'Hold inventory contains no personal dietary choices')
  const result=(await h.api('/api/public/book',{...inputs[winner],checkout:identities[winner]},{as:'',status:201})).result
  assert.equal(result.partySize,4);assert.equal(result.endAt,f.at(120));assert.equal(result.cleanupEndAt,f.at(135));assert.equal(result.experienceCart.totalCents,0)
  const recovered=(await h.api('/api/public/booking-holds/status',identities[winner],{as:''})).result;assert.equal(recovered.id,result.id);assert.deepEqual(recovered.experienceCart,result.experienceCart)
  await h.api('/api/public/book',inputs[1-winner],{as:'',status:409})
  const noSupplement={...inputs[1-winner],experienceCart:{...cart,items:[cart.items[0]],dietaryChoices:[]}}
  const second=(await h.api('/api/public/book',noSupplement,{as:'',status:201})).result
  await h.api('/api/public/book',{...inputs[winner],checkout:identities[winner]},{as:'',status:201});
  assert.notEqual(second.id,result.id);assert.equal((await h.api('/api/state')).state.bookings.length,2)
  await h.api('/api/public/book',publicGuest(f.service,4,{startAt:f.at(150),experienceCart:cart}),{as:'',status:400})
  const kitchen=await h.api('/api/kitchen?serviceId='+f.service.id)
  assert.deepEqual(new Map(kitchen.experienceTotals.items.map(row=>[row.name,row.quantity])),new Map([['Wine pairing',4],['Limited mushroom supplement',1]]))
  assert.deepEqual(kitchen.experienceTotals.dietaryChoices.map(row=>[row.name,row.quantity]),[['Plant-based menu',1],['Standard tasting menu',1]])
  assert.ok(!JSON.stringify(kitchen).includes('guest0@example.test'));assert.ok(!JSON.stringify(kitchen).includes('Alex Rowan'))
  const ownKitchen=await h.api('/api/kitchen?serviceId='+f.service.id,undefined,{as:servers[winner]});assert.equal(ownKitchen.needs.length,1);assert.equal(ownKitchen.experienceTotals,undefined);assert.equal(ownKitchen.needs[0].experienceOrder.dietaryChoices[0].name,'Plant-based menu')
  const otherKitchen=await h.api('/api/kitchen?serviceId='+f.service.id,undefined,{as:servers[1-winner]});assert.equal(otherKitchen.needs.length,1);assert.deepEqual(otherKitchen.needs[0].experienceOrder.dietaryChoices,[])
  for(const door of ['/api/preshift?date=','/preshift?date=','/api/preshift.pdf?date=']){
   const response=await h.request(door+f.service.startAt.slice(0,10),{as:servers[1-winner]});assert.equal(response.status,200);assert.ok(!(await response.text()).includes('Plant-based menu'))
  }
  const host=await h.signIn('experience-host@example.test'),member=await h.signIn('experience-member@example.test'),hostId=(await h.api('/auth/operators')).find(row=>row.email==='experience-host@example.test').id
  await h.command('team.host',{operatorId:hostId,enabled:true})
  const date=f.service.startAt.slice(0,10),sheet='/api/preshift?date='+date
  await h.api(sheet,undefined,{as:member,status:403})
  for(const path of [sheet,'/preshift?date='+date,'/api/preshift.pdf?date='+date]){
   const response=await h.request(path,{as:host});assert.equal(response.status,200);const body=await response.text()
   assert.ok(body.includes('Wine pairing'));assert.ok(body.includes('Plant-based menu'));assert.ok(!body.includes('guest0@example.test'))
  }
  await h.command('experience.withdraw',{id:entry.id,version:entry.version,confirm:true})
  await h.command('experience.save',{...entry,version:entry.version+1,addOns:entry.addOns.map((item,index)=>({...item,quantityLimit:index===0?1:item.quantityLimit}))},{status:409})
  await h.command('experience.publish',{id:entry.id,version:entry.version+1,confirm:true})
  const exported=await (await h.request('/api/business-export/bookings.csv')).text();assert.ok(exported.includes('experienceCart_json'));assert.ok(exported.includes('Limited mushroom supplement'))
  const archive=await h.api('/api/backup'),copy=await installation()
  try{await copy.api('/api/restore',{archive,confirm:'RESTORE'});const restored=(await copy.api('/api/state')).state;assert.deepEqual(restored.bookings.find(row=>row.id===result.id).experienceCart,(await h.api('/api/state')).state.bookings.find(row=>row.id===result.id).experienceCart)}finally{await copy.close()}
  const guestId=(await h.api('/api/state')).state.bookings.find(row=>row.id===result.id).guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  const erased=(await h.api('/api/state')).state.bookings.find(row=>row.id===result.id)
  assert.deepEqual(erased.experienceCart.dietaryChoices,[]);assert.equal(erased.experienceCart.items.find(item=>item.id===entry.addOns[1].id).quantity,1,'Anonymous fulfilled quantities still reserve stock')
  const current=await h.api('/api/kitchen?serviceId='+f.service.id);assert.deepEqual(current.experienceTotals.dietaryChoices,[]);assert.equal(current.experienceTotals.items.find(item=>item.name==='Limited mushroom supplement').quantity,1)
  const ephemeralBooking={...inputs[winner],...choice((await h.api('/api/state')).state.experiences.find(row=>row.id===entry.id)),experienceCart:{items:[cart.items[1]],dietaryChoices:[]}}
  await h.command('booking.status',{bookingId:result.id,status:'cancelled'})
  const ephemeral={requestId:randomUUID(),token:randomBytes(32).toString('hex'),booking:ephemeralBooking,ttlSeconds:5}
  await h.api('/api/public/booking-holds',ephemeral,{as:''});await new Promise(resolve=>setTimeout(resolve,5200));assert.equal((await h.api('/api/public/booking-holds/status',ephemeral,{as:''})).status,'expired')
  const released={...ephemeral,requestId:randomUUID(),token:randomBytes(32).toString('hex')}
  await h.api('/api/public/booking-holds',released,{as:''});await h.api('/api/public/booking-holds/abandon',released,{as:''})
  const available=(await h.api('/api/public/services',undefined,{as:''})).experiences.find(row=>row.id===entry.id);assert.equal(available.addOns.find(row=>row.id===entry.addOns[1].id).remainingByServiceId[f.service.id],1)
  const erasedCopy=await installation();try{await erasedCopy.api('/api/restore',{archive:await h.api('/api/backup'),confirm:'RESTORE'});assert.deepEqual((await erasedCopy.api('/api/state')).state.bookings.find(row=>row.id===result.id).experienceCart.dietaryChoices,[])}finally{await erasedCopy.close()}
 }finally{await h.close()}
})

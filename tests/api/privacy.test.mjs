import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'

test('PRIVACY-001: signed-out availability and confirmations isolate guest contacts, notes and visit history',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h)
  // Draft services stay private even when a guest knows their identifier.
  const draft=await h.command('service.save',{name:'Private rehearsal',startAt:s.startAt,endAt:s.endAt,turnMinutes:90,coverLimit:8})
  const inputs=[
   publicGuest(s,0,{name:'Elena Torres',email:'elena.torres@example.test',phone:'+1 212 555 0137'}),
   publicGuest(s,1,{name:'Marcus Chen',email:'marcus.chen@example.test',phone:'+1 212 555 0184'})
  ],confirmations=[]
  for(const input of inputs){
   const response=await h.api('/api/public/book',input,{as:'',status:201})
   confirmations.push(response)
   assert.equal(response.result.startAt,s.startAt)
   assert.equal(response.result.partySize,input.partySize)
   assert.ok(response.result.id)
  }
  const privateNotes=['Private anniversary arrangements','Private accessibility conversation']
  const before=await h.api('/api/state')
  for(const [i,input] of inputs.entries()){
   const guest=before.guests.find(g=>g.email===input.email)
   await h.command('guest.update',{guestId:guest.id,notes:privateNotes[i]})
  }
  const staff=await h.api('/api/state')
  assert.equal(staff.guests.length,2)
  for(const [i,input] of inputs.entries()){
   const guest=staff.guests.find(g=>g.email===input.email)
   assert.equal(guest.notes,privateNotes[i])
   assert.ok(staff.state.bookings.some(b=>b.guestId===guest.id&&b.id===confirmations[i].result.id))
  }
  const availability=await h.api('/api/public/services',undefined,{as:''})
  assert.deepEqual(availability.services.map(v=>v.id),[s.id])
  assert.ok(!availability.services.some(v=>v.id===draft.id))
  const privateValues=[...inputs.flatMap(g=>[g.name,g.email,g.phone]),...privateNotes,...staff.guests.map(g=>g.id)]
  for(const response of [availability,...confirmations]){
   const serialized=JSON.stringify(response)
   for(const value of privateValues)assert.ok(!serialized.includes(value),'Public response must omit guest personal values')
   const inspect=value=>{
    if(!value||typeof value!=='object')return
    for(const [key,child] of Object.entries(value)){
     assert.ok(!['guests','bookings','guestId','name','email','phone','notes','history'].includes(key)||value===availability.venue||availability.services.includes(value),'Public response must omit guest records and visit history')
     inspect(child)
    }
   }
   inspect(response)
  }
  for(const [i,response] of confirmations.entries())assert.ok(!JSON.stringify(response).includes(confirmations[1-i].result.id))
  await h.api('/api/state',undefined,{as:'',status:401})
 }finally{await h.close()}
})

test('Privacy requests export only one guest, record corrections and processor follow-up, and restore retained money without erased text',async()=>{
 const {paymentEdge}=await import('./payment-fixture.mjs'),edge=paymentEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),empty=await installation(),old=await installation()
 try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0,{requests:{dietaryNotes:'No dairy please'}}),{as:'',status:201})).result
  await h.api('/api/public/book',publicGuest(s,1,{name:'Private Other Guest',email:'other-private@example.test'}),{as:'',status:201})
  const before=await h.api('/api/state'),guest=before.guests.find(g=>g.email==='guest0@example.test'),member=await h.signIn('privacy-reader@example.test'),admin=await h.signIn('privacy-manager@example.test','admin')
  await h.api('/api/privacy',undefined,{as:'',status:401});await h.api('/api/privacy',undefined,{as:member,status:403});await h.api('/api/privacy',undefined,{as:admin,status:403})
  await h.api('/api/privacy/access',{guestId:guest.id},{headers:{origin:'https://other.example.test'},status:403})
  let access=await h.api('/api/privacy/access',{guestId:guest.id});assert.equal(access.guest.name,guest.name);assert.equal(access.bookings.length,1);assert.equal(access.bookings[0].needs[0].value,'No dairy please');assert.ok(!JSON.stringify(access).includes('Private Other Guest'))
  const correction={guestId:guest.id,bookingId:booking.id,revision:access.bookings[0].revision,field:'dietary',value:'Lactose-free requested',reason:'Guest clarified directly',guestConfirmed:true}
  await h.api('/api/privacy/correction',{...correction,guestConfirmed:false},{status:400});await h.api('/api/privacy/correction',correction);await h.api('/api/privacy/correction',correction,{status:409})
  access=await h.api('/api/privacy/access',{guestId:guest.id});assert.equal(access.bookings[0].needs[0].value,correction.value);assert.equal(access.bookings[0].needs[0].history[0].actor,before.actor.id);assert.ok(access.bookings[0].needs[0].history[0].at)
  await h.api('/api/privacy/erase',{guestId:guest.id,confirm:'ERASE'},{status:409})
  const rules=Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:365,ground:k==='financialEvidence'?'Owner-recorded accounting obligation pending legal review':'Owner-recorded service purpose'}]))
  await h.api('/api/privacy/policy',{version:0,rules});await h.api('/api/privacy/policy',{version:0,rules},{status:409})
  const payment=await h.command('payment.request',{bookingId:booking.id,amountCents:10000,dueAt:new Date(Date.now()+2*3600000).toISOString(),followupOwnerId:before.actor.id,reason:'Private payment explanation'})
  await h.command('payment.link',{requestId:payment.requestId});edge.completeCheckout([...edge.sessions.keys()][0]);await h.command('payment.sync',{requestId:payment.requestId})
  const archive=await h.api('/api/backup'),result=await h.api('/api/privacy/erase',{guestId:guest.id,confirm:'ERASE'});assert.ok(result.processorTasks>0)
  let privacy=await h.api('/api/privacy'),task=privacy.tasks.find(t=>t.request_id===result.requestId);assert.equal(task.state,'open')
  await h.api('/api/privacy/processors',{id:task.id,requestId:result.requestId,state:'submitted',ground:'Manual provider request receipt synthetic-placemat-2'})
  await h.api('/api/privacy/processors',{id:task.id,requestId:result.requestId,state:'retained',ground:'Provider confirms finance reference retention until reviewed accounting expiry'})
  await h.api('/api/privacy/processors',{id:task.id,requestId:result.requestId,state:'confirmed',ground:'Overwriting a decision'},{status:409})
  await h.api('/api/privacy/processors',{requestId:result.requestId,provider:'Guest message provider',reference:'synthetic-placemat-3'})
  const later=await h.api('/api/backup'),serialized=JSON.stringify(later)
  for(const text of [guest.email,guest.name,'No dairy please',correction.value,correction.reason,'Private payment explanation'])assert.ok(!serialized.includes(text),'Erased guest text does not survive an archive')
  await old.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400});await empty.api('/api/restore',{archive:later,confirm:'RESTORE'})
  const restored=await empty.api('/api/privacy');assert.equal(restored.tasks.find(t=>t.id===task.id).state,'retained');assert.equal(restored.policy.rules.financialEvidence.ground,rules.financialEvidence.ground)
  const restoredAccess=await empty.api('/api/privacy/access',{guestId:guest.id});assert.equal(restoredAccess.guest.erased,true);assert.equal(restoredAccess.financial.payments[0].amount_cents,10000);assert.equal(restoredAccess.financial.payments[0].state,'paid')
  assert.ok(!JSON.stringify(restoredAccess).includes(correction.value));assert.ok((await empty.api('/api/state')).guests.some(g=>g.name==='Private Other Guest'))
 }finally{await h.close();await empty.close();await old.close()}
})

test('Retention requires an exact owner review and erases only selected inactive eligible guests including imported custody',async()=>{
 const h=await installation(),empty=await installation();try{
  const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\nsynthetic-placemat-1,River Lopez,river@example.test,,Imported private note,2025-01-01,2,completed\nsynthetic-placemat-2,Jordan Kim,jordan@example.test,,Other private note,2025-01-01,2,completed\n'
  const dry=(await h.api('/api/import/dry-run',{csv})).result;await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
  const guest=(await h.api('/api/state')).guests.find(g=>g.email==='river@example.test')
  await h.command('guest.update',{guestId:guest.id,notes:'Current dated note for retention'})
  const {service:s}=await service(h);await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})
  const rules=Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:k==='financialEvidence'?365:0,ground:'Owner explicitly requests immediate disposal after service work ends'}]))
  await h.api('/api/privacy/policy',{version:0,rules})
  const preview=await h.api('/api/privacy/retention-preview',{});assert.ok(preview.guests.find(g=>g.id===guest.id).eligible);assert.ok(!preview.guests.find(g=>g.name==='Alex Rowan').eligible)
  const archive=await h.api('/api/backup')
  await h.command('guest.update',{guestId:guest.id,notes:'Changed since review'})
  await h.api('/api/privacy/retention-run',{guestIds:[guest.id],fingerprint:preview.fingerprint,confirm:'ERASE'},{status:409})
  const fresh=await h.api('/api/privacy/retention-preview',{})
  await h.api('/api/privacy/retention-run',{guestIds:[guest.id],fingerprint:fresh.fingerprint,confirm:'wrong'},{status:400})
  const result=await h.api('/api/privacy/retention-run',{guestIds:[guest.id],fingerprint:fresh.fingerprint,confirm:'ERASE'});assert.equal(result.completed.length,1)
  const people=(await h.api('/api/state')).guests;assert.equal(people.find(g=>g.id===guest.id).erased,true);assert.ok(people.some(g=>g.email==='jordan@example.test'));assert.ok(people.some(g=>g.name==='Alex Rowan'))
  const later=await h.api('/api/backup');for(const value of ['river@example.test','River Lopez','Imported private note','Changed since review'])assert.ok(!JSON.stringify(later).includes(value))
  assert.equal((await h.api('/api/import/dry-run',{csv})).result.canApply,false)
  await empty.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})
  assert.equal((await h.api('/api/privacy')).requests.filter(r=>r.kind==='retention').length,1)
 }finally{await h.close();await empty.close()}
})

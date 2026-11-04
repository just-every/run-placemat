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
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0,{requests:{dietaryNotes:'No dairy please'},requestsAcknowledged:true}),{as:'',status:201})).result
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

test('Owner-reviewed native note expiry uses original category dates, preserves identity and money, refuses unsafe reviews and fences old backups',async()=>{
 const {paymentEdge}=await import('./payment-fixture.mjs'),edge=paymentEdge();let now=Date.parse('2030-01-01T12:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now,stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),copy=await installation(),old=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now})
 const contact=n=>['synthetic-placemat-'+n,'example.test'].join('@'),preview=guestId=>h.api('/api/privacy/note-retention-preview',{guestId}),run=async(r,noteKeys=r.notes.filter(n=>n.eligible).map(n=>n.key),opts={})=>{
  const before=opts.status>=400?{state:await h.api('/api/state'),privacy:await h.api('/api/privacy')}:null
  const result=await h.api('/api/privacy/note-retention-run',{guestId:r.guestId,fingerprint:r.fingerprint,noteKeys,confirm:'EXPIRE'},opts)
  if(before){assert.deepEqual(await h.api('/api/state'),before.state,'Refusal changes no guest, consent, service or money facts');assert.deepEqual(await h.api('/api/privacy'),before.privacy,'Refusal records no expiry or processor work')}
  return result
 }

 try{
  await h.command('table.save',{label:'T1',seats:2,x:20,y:30})
  const s=await h.command('service.save',{name:'Dated dinner',startAt:'2030-01-02T18:00:00Z',endAt:'2030-01-02T22:00:00Z',turnMinutes:90,coverLimit:20})
  const publish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Owner reviewed dated service'});await h.command('proposal.approve',{proposalId:publish.id})
  const people=[],bookings=[]
  for(let i=0;i<4;i++){
   const b=(await h.api('/api/public/book',publicGuest(s,i,{name:i>1?'Shared Native Name':'Native Guest '+i,email:contact(i),phone:i>1?'+1 202 555 0197':'+1 202 555 019'+i,requests:{dietaryNotes:'Retained dietary category'},requestsAcknowledged:true}),{as:'',status:201})).result
   const g=(await h.api('/api/state')).guests.find(g=>g.email===contact(i));people.push(g);bookings.push(b)
   await h.command('guest.profile',{guestId:g.id,notes:'Expired private note '+i,tags:['Retained preference'],vipLevel:'regular'})
   if(i===0){
    const owner=(await h.api('/api/state')).actor.id,payment=await h.command('payment.request',{bookingId:b.id,amountCents:10000,dueAt:'2030-01-01T18:00:00Z',followupOwnerId:owner,reason:'Retained financial reason'})
    await h.command('payment.link',{requestId:payment.requestId});edge.completeCheckout([...edge.sessions.keys()][0]);await h.command('payment.sync',{requestId:payment.requestId})
   }
   if(i!==3)await h.command('booking.status',{bookingId:b.id,status:'cancelled'})
  }
  const rules=Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:k==='guestNotes'?2:730,ground:'Owner recorded category purpose and review ground'}]))
  await h.api('/api/privacy/policy',{version:0,rules})
  now=Date.parse('2030-01-01T18:00:00Z');await h.command('guest.update',{guestId:people[0].id,notes:'Unselected dated old note'})
  now=Date.parse('2030-01-03T12:00:00Z');await h.command('guest.update',{guestId:people[0].id,notes:'Unexpired private note'})
  now=Date.parse('2030-01-04T00:00:00Z')
  let r=await preview(people[0].id);assert.equal(r.days,2);assert.deepEqual(r.notes.map(n=>n.eligible),[true,true,false]);assert.equal((await h.api('/api/privacy/retention-preview',{})).guests.find(g=>g.id===people[0].id).eligible,false,'Unrelated category periods do not control note expiry')
  const beforeRefusals=await h.api('/api/state')
  await run(r,[r.notes[2].key],{status:409});await run(r,['unknown'],{status:409});await run(r,[r.notes[0].key,r.notes[0].key],{status:400})
  await h.api('/api/privacy/note-retention-run',{guestId:r.guestId,fingerprint:r.fingerprint,noteKeys:[r.notes[0].key],confirm:'ERASE'},{status:400})
  const active=await preview(people[3].id);assert.ok(active.notes.every(n=>!n.eligible&&n.reason==='Active service work'));await run(active,[active.notes[0].key],{status:409})
  const member=await h.signIn(contact(100)),manager=await h.signIn(contact(101),'admin'),operators=await h.api('/auth/operators'),hostId=operators.find(o=>o.email===contact(100)).id
  await h.command('team.host',{operatorId:hostId,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Native privacy preparation'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  for(const opts of [{as:'',status:401},{as:member,status:403},{as:manager,status:403},{...agent,status:403}]){
   await h.api('/api/privacy/note-retention-preview',{guestId:people[0].id},opts);await run(r,[r.notes[0].key],opts)
  }
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'});await run(r,[r.notes[0].key],{...agent,status:401})
  await run(r,[r.notes[0].key],{headers:{origin:'https://foreign.invalid'},status:403})
  // The permission setup changed floor version; prove every stale snapshot is refused without expiry.
  await run(r,[r.notes[0].key],{status:409});r=await preview(people[0].id)
  await h.api('/api/privacy/policy',{version:1,rules});await run(r,[r.notes[0].key],{status:409});r=await preview(people[0].id)
  await h.command('guest.profile',{guestId:people[0].id,seatingPreference:'Window retained'});await run(r,[r.notes[0].key],{status:409});r=await preview(people[0].id)
  now+=86400000;await run(r,[r.notes[0].key],{status:409});r=await preview(people[0].id)
  assert.equal((await h.api('/api/privacy')).events.filter(e=>e.action==='notes.expired').length,0)
  assert.deepEqual((await h.api('/api/state')).guests.map(g=>g.notes),beforeRefusals.guests.map(g=>g.notes))
  const nextService=await h.command('service.save',{name:'Returning service',startAt:'2030-01-06T18:00:00Z',endAt:'2030-01-06T22:00:00Z',turnMinutes:90,coverLimit:8}),nextPublish=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:nextService.id},reason:'Owner reviewed return service'});await h.command('proposal.approve',{proposalId:nextPublish.id})
  r=await preview(people[0].id)
  const returning=(await h.api('/api/public/book',publicGuest(nextService,0,{name:people[0].name,email:people[0].email}),{as:'',status:201})).result
  await run(r,[r.notes[0].key],{status:409});const busy=await preview(people[0].id);assert.ok(busy.notes.every(n=>!n.eligible));await run(busy,[busy.notes[0].key],{status:409})
  await h.command('booking.status',{bookingId:returning.id,status:'cancelled'});r=await preview(people[0].id)
  const archive=await h.api('/api/backup'),before=await h.api('/api/state'),calls=[...edge.calls],messages=h.messages.length
  const body={guestId:r.guestId,fingerprint:r.fingerprint,noteKeys:[r.notes[0].key],confirm:'EXPIRE'}
  const responses=await Promise.all([h.request('/api/privacy/note-retention-run',{method:'POST',body}),h.request('/api/privacy/note-retention-run',{method:'POST',body})])
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);await run(r,[r.notes[0].key],{status:409})
  assert.deepEqual((await h.db.prepare("SELECT name FROM sqlite_master WHERE name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*'").all()).results,[],'Prior transfer snapshots were invalidated')
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM rer_portability_parts').first()).n,0)
  const after=await h.api('/api/state'),g=after.guests.find(g=>g.id===people[0].id),original=before.guests.find(g=>g.id===people[0].id)
  assert.equal(g.notes,'Unexpired private note');assert.deepEqual(g.notesHistory.map(n=>n.notes),['Unselected dated old note','Unexpired private note'])
  assert.deepEqual({...g,notesHistory:original.notesHistory},original,'Only selected note history changed')
  assert.deepEqual(after.state.bookings,before.state.bookings);assert.deepEqual(after.paymentRequests,before.paymentRequests);assert.deepEqual(after.refunds,before.refunds)
  assert.deepEqual(after.guests.filter(g=>g.id!==people[0].id),before.guests.filter(g=>g.id!==people[0].id))
  const history=(await h.api('/api/audit')).rows,expiry=history.find(e=>e.action==='privacy.notes-expired')
  assert.equal(expiry.actor,after.actor.id);assert.equal(expiry.source,'person');assert.equal(expiry.subject,g.id);assert.equal(expiry.at,new Date(now).toISOString());assert.ok(!JSON.stringify(history).includes('Expired private note 0'));assert.ok(JSON.stringify(history).includes('Unexpired private note'))
  let access=await h.api('/api/privacy/access',{guestId:g.id});assert.deepEqual(access.guest,g);assert.equal(access.noteExpiries.length,1);assert.ok(!JSON.stringify(access.noteExpiries).includes('Expired private note'))
  assert.equal(access.financial.payments[0].amount_cents,10000);assert.equal(access.financial.payments[0].state,'paid');assert.equal(access.bookings[0].requests.dietaryNotes,'Retained dietary category')
  const current=await preview(people[1].id);assert.equal(current.notes[0].current,true);await run(current)
  const blank=(await h.api('/api/state')).guests.find(g=>g.id===people[1].id);assert.equal(blank.notes,'');assert.deepEqual(blank.notesHistory,[]);assert.equal(blank.email,people[1].email);assert.equal(blank.erased,undefined)
  const later=await h.api('/api/backup'),serialized=JSON.stringify(later)
  for(const text of ['Expired private note 0','Expired private note 1'])assert.ok(!serialized.includes(text),'Expired text is absent from every new archive row')
  for(const text of ['Unexpired private note','Unselected dated old note',people[0].email,'Retained dietary category','Retained financial reason'])assert.ok(serialized.includes(text),'Unselected content and identity remain portable')
  for(const kind of ['guests','audit']){
   const csv=await (await h.request('/api/business-export/'+kind+'.csv')).text();assert.ok(!csv.includes('Expired private note 0'));assert.ok(!csv.includes('Expired private note 1'));assert.ok(csv.includes('Unexpired private note'))
  }
  await old.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400});assert.equal((await old.api('/api/state')).guests.length,0)
  // Model a legacy native archive with unrecorded original note dates. The public restore door
  // accepts legacy provenance but must never manufacture expiry authority for it.
  const undated=structuredClone(later),legacyGuest=undated.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_guests'&&i.row.id===people[2].id),legacy=JSON.parse(legacyGuest.row.data)
  legacy.provenance.notes.at=null;for(const n of legacy.notesHistory)n.provenance.at=null;legacyGuest.row.data=JSON.stringify(legacy)
  const {makePart,ContentVerifier,ArchiveVerifier}=await import('../../src/modules/portability/format.mjs'),content=new ContentVerifier(undated[0]),integrity=new ArchiveVerifier(undated[0])
  for(let i=1;i<undated.length-1;i++){undated[i]=await makePart(undated[i].index,undated[i].items);integrity.add(undated[i]);for(const item of undated[i].items)content.add(item)}
  undated.at(-1).contentHash=content.digest();undated.at(-1).archiveHash=integrity.digest()
  await old.api('/api/restore',{archive:undated,confirm:'RESTORE'});const unknown=await old.api('/api/privacy/note-retention-preview',{guestId:people[2].id}),legacyBefore=await old.api('/api/state')
  assert.ok(unknown.notes.every(n=>!n.eligible&&n.reason==='Original native date not recorded'))
  await old.api('/api/privacy/note-retention-run',{guestId:unknown.guestId,fingerprint:unknown.fingerprint,noteKeys:[unknown.notes[0].key],confirm:'EXPIRE'},{status:409});assert.deepEqual(await old.api('/api/state'),legacyBefore)
  await copy.api('/api/restore',{archive:later,confirm:'RESTORE'})
  access=await copy.api('/api/privacy/access',{guestId:g.id});assert.equal(access.guest.erased,undefined);assert.deepEqual(access.guest,g);assert.equal(access.financial.payments[0].amount_cents,10000);assert.equal(access.noteExpiries.length,1)
  assert.deepEqual(edge.calls,calls);assert.equal(h.messages.length,messages)
  // Imported unknown original dates cannot acquire expiry authority from a newer native edit.
  const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\nsynthetic-placemat-500,Imported Guest,,,Unknown original note,2025-01-01,2,completed\n',dry=(await h.api('/api/import/dry-run',{csv})).result;await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
  const imported=(await h.api('/api/state')).guests.find(g=>g.name==='Imported Guest');let refused=await preview(imported.id);assert.equal(refused.notes[0].provenance.at,null);await run(refused,[refused.notes[0].key],{status:409})
  await h.command('guest.update',{guestId:imported.id,notes:'Dated edit keeps import lineage'});now+=3*86400000;refused=await preview(imported.id);assert.ok(refused.notes.every(n=>!n.eligible));await run(refused,[refused.notes.at(-1).key],{status:409})
  await h.command('booking.status',{bookingId:bookings[3].id,status:'cancelled'})
  const path='/api/guests/merge-preview?guestId='+people[2].id+'&duplicateId='+people[3].id,merge=await h.api(path),merged=await h.command('guest.merge',{guestId:people[2].id,duplicateId:people[3].id,review:merge.review,confirm:'MERGE'})
  refused=await preview(people[2].id);assert.ok(refused.notes.every(n=>!n.eligible));await run(refused,[refused.notes[0].key],{status:409})
  const undo=await h.api('/api/guests/unmerge-preview?mergeId='+merged.id);await h.command('guest.unmerge',{mergeId:merged.id,review:undo.review,confirm:'UNMERGE'})
  refused=await preview(people[2].id);assert.ok(refused.notes.every(n=>!n.eligible));await run(refused,[refused.notes[0].key],{status:409})
  assert.equal((await h.api('/api/privacy')).events.filter(e=>e.action==='notes.expired').length,2)
 }finally{await h.close();await copy.close();await old.close()}
})

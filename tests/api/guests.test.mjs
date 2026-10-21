import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'

test('GUEST-002: normalized search, explicit profile facts, dated sources and returning visit history respect existing guest authority',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h),manager=await h.signIn('profile-manager@example.test','admin'),member=await h.signIn('profile-reader@example.test')
  const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\nprofile-1,Álex Rivera,alex.rivera@example.test,+1 (415) 555-0123,Prefers a quiet table,2026-08-10,2,completed\n'
  const dry=(await h.api('/api/import/dry-run',{csv})).result
  const repeated=(await h.api('/api/import/dry-run',{csv})).result
  assert.equal(dry.fingerprint,repeated.fingerprint,'Import provenance cannot change its reviewed fingerprint')
  await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
  const imported=(await h.api('/api/guests?search=4155550123')).guests[0]
  assert.equal(imported.name,'Álex Rivera');assert.equal(imported.provenance.notes.source,'imported');assert.equal(imported.provenance.notes.at,null)
  assert.ok(imported.provenance.notes.reference)
  for(const search of ['(415) 555-0123','+1 415 555 0123','0123','ALEX RIVERA','ALEX.RIVERA@EXAMPLE.TEST'])assert.deepEqual((await h.api('/api/guests?search='+encodeURIComponent(search))).guests.map(g=>g.id),[imported.id],search)
  const first=(await h.api('/api/public/book',publicGuest(s,0,{name:'Álex Rivera',email:'alex.rivera@example.test',phone:'4155550123'}),{as:'',status:201})).result
  await h.command('booking.status',{bookingId:first.id,status:'seated'})
  await h.command('booking.status',{bookingId:first.id,status:'completed'})
  await h.command('booking.stage',{bookingId:first.id,stage:'ready'})
  const profile={guestId:imported.id,tags:['VIP','Anniversary patio'],vipLevel:'vip',seatingPreference:'Window by the cedar planter',notes:'Staff observed: celebrating a tenth anniversary'}
  await h.api('/api/guests?search=Alex',undefined,{as:'',status:401})
  await h.command('guest.profile',profile,{as:'',status:401})
  await h.command('guest.profile',profile,{as:member,status:403})
  await h.api('/api/commands',{command:'guest.profile',payload:profile},{as:manager,headers:{origin:'https://foreign.example'},status:403})
  const key=(await h.api('/api/agent-keys',{name:'Guest preparation assistant'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  await h.command('guest.profile',profile,{...agent,status:403})
  const updated=await h.command('guest.profile',profile,{as:manager})
  for(const field of ['tags','vipLevel','seatingPreference']){
   const origin=updated.profile.provenance[field]
   assert.equal(origin.source,'staff-observed');assert.ok(origin.actor);assert.ok(Number.isFinite(Date.parse(origin.at)))
  }
  assert.equal(updated.provenance.name.source,'imported');assert.equal(updated.provenance.notes.source,'staff-observed')
  assert.equal(updated.notesHistory.at(-1).notes,profile.notes)
  const unchanged=await h.command('guest.profile',{guestId:imported.id,vipLevel:'vip'},{as:manager})
  assert.deepEqual(unchanged.profile.provenance.vipLevel,updated.profile.provenance.vipLevel,'Saving the same fact preserves its actual source')
  const second=(await h.api('/api/public/book',publicGuest(s,0,{name:'Álex Rivera',email:'ALEX.RIVERA@example.test',startAt:new Date(Date.parse(s.startAt)+90*60000).toISOString()}),{as:'',status:201})).result
  await h.command('booking.status',{bookingId:second.id,status:'seated'})
  const state=await h.api('/api/state'),guest=state.guests.find(g=>g.id===imported.id)
  assert.equal(state.guests.length,1);assert.equal(guest.history.length,1)
  assert.equal(state.state.bookings.filter(b=>b.guestId===guest.id).length,2)
  assert.deepEqual(guest.profile.tags,profile.tags);assert.equal(guest.profile.seatingPreference,profile.seatingPreference)
  assert.equal(state.names[guest.profile.provenance.tags.actor],'Floor manager')
  for(const opts of [{as:member},agent])assert.equal((await h.api('/api/guests?search=0123',undefined,opts)).guests[0].profile.vipLevel,'vip')
  // Only explicit staff changes create private facts; booking input cannot overwrite them.
  const publicRead=JSON.stringify(await h.api('/api/public/services',undefined,{as:''}))
  assert.ok(!publicRead.includes(profile.seatingPreference));assert.ok(!publicRead.includes(profile.notes))
  assert.ok(!JSON.stringify(second).includes('Anniversary patio'))
  const supplied=(await h.api('/api/public/book',publicGuest(s,1,{name:'Sam Ford',phone:'+1 212 555 0188',profile:{tags:['Unreviewed']} }),{as:'',status:201})).result
  const sam=(await h.api('/api/guests?search=2125550188')).guests[0]
  assert.equal(sam.provenance.name.source,'guest-supplied');assert.equal(sam.profile,undefined)
  // Search normalization never turns a shared US phone into an identity merge.
  await h.command('waitlist.add',publicGuest(s,4,{name:'Morgan Ford',email:'morgan@example.test',phone:'1 (212) 555-0188'}),{as:manager})
  const shared=(await h.api('/api/guests?search=2125550188')).guests
  assert.equal(shared.length,2);assert.notEqual(shared[0].id,shared[1].id)
  assert.equal(shared.find(g=>g.name==='Morgan Ford').provenance.name.source,'staff-observed')
  for(const bad of [{tags:['VIP','vip']},{tags:'VIP'},{vipLevel:'inferred'},{seatingPreference:'x'.repeat(501)}])await h.command('guest.profile',{guestId:guest.id,...bad},{status:400})
  await h.command('guest.update',{guestId:guest.id,notes:'Manager corrected the anniversary note'},{as:manager})
  const corrected=(await h.api('/api/guests?search=0123')).guests[0]
  assert.equal(corrected.notesHistory.length,2);assert.equal(corrected.notesHistory[0].notes,profile.notes)
  assert.ok(corrected.notesHistory.every(n=>n.provenance.actor===guest.profile.provenance.tags.actor))
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  assert.deepEqual((await h.api('/api/guests?search=0123')).guests,[])
  const archive=JSON.stringify(await h.api('/api/backup'))
  for(const privateValue of ['Window by the cedar planter','Anniversary patio',profile.notes,'Manager corrected the anniversary note'])assert.ok(!archive.includes(privateValue),privateValue)
  await h.command('guest.profile',{guestId:guest.id,tags:['Revive']},{status:409})
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  await h.api('/api/guests',undefined,{...agent,status:401})
 }finally{await h.close()}
})

test('GUEST-004: exact identity suggestions separate households; reviewed manager merge and reversal preserve visits and restrictive contact permissions',async()=>{
 const {guestReviewFixture}=await import('./guest-review-fixture.mjs')
 const h=await installation();try{
  const f=await guestReviewFixture(h),member=await h.signIn('duplicate-reader@example.test'),manager=await h.signIn('duplicate-manager@example.test','admin')
  const key=(await h.api('/api/agent-keys',{name:'Existing guest read authority'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const before=await h.api('/api/state'),review=(await h.api('/api/guests?review='+f.a.id)).review
  assert.deepEqual(review.candidates.map(c=>c.guest.id),[f.b.id]);assert.deepEqual(review.households.map(c=>c.guest.id),[f.guest.id])
  const alias=review.candidates[0];assert.ok(alias.conflicts.some(c=>c.field==='email'&&c.selected===f.a.email&&c.candidate===f.b.email))
  assert.ok(alias.conflicts.some(c=>c.field==='notes'&&c.candidate==='<script>conflicting note</script>'))
  assert.deepEqual(alias.importedVisits,f.b.history);assert.equal(review.selected.bookings[0].id,f.booking.id)
  assert.equal(alias.marketingPermission,'Not recorded');assert.equal(alias.queueContactPermissions[0].contactConsent,false)
  for(const opts of [{as:member},agent])assert.deepEqual((await h.api('/api/guests?review='+f.a.id,undefined,opts)).review,review)
  await h.api('/api/guests?review='+f.a.id,undefined,{as:'',status:401});await h.api('/api/guests?review=unknown',undefined,{status:404})
  assert.deepEqual(await h.api('/api/state'),before,'Preview never writes identity or permission')
  const path='/api/guests/merge-preview?guestId='+f.a.id+'&duplicateId='+f.b.id
  for(const opts of [{as:member},agent])await h.api(path,undefined,{...opts,status:403})
  await h.api(path,undefined,{as:'',status:401})
  await h.api('/api/guests/merge-preview?guestId='+f.a.id+'&duplicateId='+f.guest.id,undefined,{status:409})
  const preview=await h.api(path),payload={guestId:f.a.id,duplicateId:f.b.id,review:preview.review,confirm:'MERGE'}
  for(const opts of [{as:member},agent])await h.command('guest.merge',payload,{...opts,status:403})
  await h.command('guest.merge',payload,{as:'',status:401})
  await h.command('guest.merge',payload,{as:manager,headers:{origin:'https://foreign.example'},status:403})
  await h.command('guest.merge',{...payload,confirm:''},{status:400})
  await h.command('guest.profile',{guestId:f.b.id,notes:'Reviewed original duplicate note'})
  await h.command('guest.merge',payload,{status:409})
  const ready=await h.api(path),merged=await h.command('guest.merge',{...payload,review:ready.review},{as:manager})
  const combined=await h.api('/api/state'),survivor=combined.guests.find(g=>g.id===f.a.id)
  assert.ok(!combined.guests.some(g=>g.id===f.b.id));assert.equal(survivor.history.length,2)
  assert.ok(survivor.contacts.some(c=>c.value===f.b.email&&c.sourceGuestId===f.b.id))
  assert.equal(combined.state.waitlist.find(w=>w.id===f.first.entry.id).guestId,f.a.id)
  assert.equal((await h.api('/api/public/queue/status',{token:f.first.token},{as:''})).entry.contactConsent,false)
  assert.equal((await h.api('/api/public/queue/status',{token:f.family.token},{as:''})).entry.contactConsent,true,'Unmerged household permission is unchanged')
  await h.command('guest.profile',{guestId:f.b.id,notes:'Hidden alias write'},{status:409})
  const journalPath='/api/guests/merges?guestId='+f.a.id,journal=(await h.api(journalPath)).merges[0]
  assert.equal(journal.id,merged.id);assert.equal(journal.createdBy,combined.state.audit.find(e=>e.action==='guest.merge').actor)
  assert.equal(journal.snapshots.guests.duplicate.before.notes,'Reviewed original duplicate note')
  for(const opts of [{as:member},agent]){
   await h.api(journalPath,undefined,{...opts,status:403})
   assert.ok(!(await h.api('/api/audit',undefined,opts)).rows.some(e=>e.action==='guest.merge'))
   assert.ok(!(await h.api('/api/state',undefined,opts)).state.audit.some(e=>e.action==='guest.merge'))
  }
  // A booking with the absorbed email resolves the existing survivor, not a new identity.
  const returning=(await h.api('/api/public/book',publicGuest(f.s,0,{email:f.b.email,name:f.b.name,startAt:new Date(Date.parse(f.s.startAt)+90*60000).toISOString()}),{as:'',status:201})).result
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===returning.id).guestId,f.a.id)
  const undoPath='/api/guests/unmerge-preview?mergeId='+merged.id,undo=await h.api(undoPath)
  assert.ok(undo.laterRecords.some(r=>r.kind==='bookings'&&r.id===returning.id&&r.reason==='created'))
  await h.command('waitlist.party',{waitlistId:f.first.entry.id,partySize:3})
  await h.command('guest.unmerge',{mergeId:merged.id,review:undo.review,confirm:'UNMERGE'},{status:409})
  const current=await h.api(undoPath)
  assert.ok(current.laterRecords.some(r=>r.kind==='waitlist'&&r.id===f.first.entry.id&&r.reason==='edited'))
  for(const opts of [{as:member},agent])await h.command('guest.unmerge',{mergeId:merged.id,review:current.review,confirm:'UNMERGE'},{...opts,status:403})
  await h.command('guest.unmerge',{mergeId:merged.id,review:current.review,confirm:'UNMERGE'},{as:manager})
  const after=await h.api('/api/state')
  assert.deepEqual(after.guests.find(g=>g.id===f.a.id).history,f.a.history);assert.deepEqual(after.guests.find(g=>g.id===f.b.id).history,f.b.history)
  assert.equal(after.state.bookings.find(b=>b.id===f.booking.id).guestId,f.a.id)
  assert.equal(after.state.bookings.find(b=>b.id===returning.id).guestId,f.a.id)
  assert.equal(after.state.waitlist.find(w=>w.id===f.first.entry.id).partySize,3)
  assert.equal(after.state.waitlist.find(w=>w.id===f.first.entry.id).contactConsent,false)
  assert.ok((await h.api(journalPath)).merges[0].pendingAssignment.some(r=>r.id===returning.id))
  await h.api(undoPath,undefined,{status:409})
  // Name alone, phone suffixes and email dot/plus rewrites are never duplicate evidence.
  const onlyName=await h.command('waitlist.add',publicGuest(f.s,3,{name:'Alex Rivera',phone:'+1 650 555 0199',email:'alex.one+different@example.test'}))
  assert.ok(!(await h.api('/api/guests?review='+f.a.id)).review.candidates.some(c=>c.guest.id===onlyName.guestId))
  const third=await h.command('waitlist.add',publicGuest(f.s,4,{name:'Alex Rivera',phone:f.a.phone,email:'alex.three@example.test'}))
  const again=await h.api(path),firstMerge=await h.command('guest.merge',{...payload,review:again.review})
  const thirdPath='/api/guests/merge-preview?guestId='+f.a.id+'&duplicateId='+third.guestId,thirdPreview=await h.api(thirdPath)
  const laterMerge=await h.command('guest.merge',{guestId:f.a.id,duplicateId:third.guestId,review:thirdPreview.review,confirm:'MERGE'})
  await h.api('/api/guests/unmerge-preview?mergeId='+firstMerge.id,undefined,{status:409})
  const lastUndo=await h.api('/api/guests/unmerge-preview?mergeId='+laterMerge.id)
  await h.command('guest.unmerge',{mergeId:laterMerge.id,review:lastUndo.review,confirm:'UNMERGE'})
  await h.command('guest.profile',{guestId:f.a.id,notes:'Later person-entered correction'})
  const firstUndo=await h.api('/api/guests/unmerge-preview?mergeId='+firstMerge.id)
  assert.ok(firstUndo.laterRecords.some(r=>r.kind==='guests'&&r.id===f.a.id))
  await h.command('guest.unmerge',{mergeId:firstMerge.id,review:firstUndo.review,confirm:'UNMERGE'})
  assert.equal((await h.api('/api/guests?search=alex.one')).guests.find(g=>g.id===f.a.id).notes,'Later person-entered correction')
  // Pending combined identities remain in scope for erasure after a later edit.
  await h.command('guest.erase',{guestId:f.b.id,confirm:'ERASE'})
  assert.deepEqual((await h.api('/api/guests?search=alex.one')).guests.map(g=>g.id),[onlyName.guestId],'Unrelated plus-address identity remains separate')
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes(f.b.email))
 }finally{await h.close()}
})

test('GUEST-004: merge journal exports and validated restore reconcile; erasure purges snapshots, aliases and all restore paths',async()=>{
 const {guestReviewFixture}=await import('./guest-review-fixture.mjs'),{csvRecords}=await import('./business-fixture.mjs')
 const {makePart,ContentVerifier,ArchiveVerifier}=await import('../../src/modules/portability/format.mjs')
 const h=await installation(),restored=await installation(),erased=await installation()
 try{
  const f=await guestReviewFixture(h)
  // Shared contact true versus false reconciles downward; a missing grant stays missing.
  const own=await h.command('waitlist.add',publicGuest(f.s,0,{email:f.a.email,phone:f.a.phone,contactConsent:true}))
  await h.command('waitlist.party',{waitlistId:own.id,contactConsent:true})
  const previewPath='/api/guests/merge-preview?guestId='+f.a.id+'&duplicateId='+f.b.id,preview=await h.api(previewPath)
  const payload={guestId:f.a.id,duplicateId:f.b.id,review:preview.review,confirm:'MERGE'}
  const responses=await Promise.all([h.request('/api/commands',{method:'POST',body:{command:'guest.merge',payload}}),h.request('/api/commands',{method:'POST',body:{command:'guest.merge',payload}})])
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409],'Concurrent confirmations commit one merge only')
  const journalPath='/api/guests/merges?guestId='+f.a.id,merges=(await h.api(journalPath)).merges
  assert.equal(merges.length,1)
  const state=await h.api('/api/state')
  for(const id of [own.id,f.first.entry.id]){
   const row=state.state.waitlist.find(w=>w.id===id);assert.equal(row.contactConsent,false);assert.equal(row.contactPhone,f.a.phone===row.contactPhone?f.a.phone:f.b.phone)
  }
  const exported=csvRecords(await (await h.request('/api/business-export/guest-merges.csv')).text())
  const csvExpected=structuredClone(merges);for(const merge of csvExpected)for(const record of merge.snapshots.records)for(const side of ['before','after'])delete record[side].managementTokenHash
  assert.deepEqual(exported.map(row=>JSON.parse(row.data_json)),csvExpected);assert.ok(!JSON.stringify(exported).includes('managementTokenHash'),'CSV excludes live private-link digests')
  const archive=await h.api('/api/backup')
  const invalid=structuredClone(archive),entry=invalid.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_guest_merges'),broken=JSON.parse(entry.row.data)
  broken.duplicateId='synthetic-placemat-404';entry.row.data=JSON.stringify(broken)
  const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0])
  for(let i=1;i<invalid.length-1;i++){invalid[i]=await makePart(invalid[i].index,invalid[i].items);integrity.add(invalid[i]);for(const item of invalid[i].items)content.add(item)}
  invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest()
  await restored.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400})
  assert.equal((await restored.api('/api/state')).state.bookings.length,0)
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  assert.deepEqual((await restored.api(journalPath)).merges,merges);assert.deepEqual((await restored.api('/api/state')).state,state.state)
  await h.command('guest.erase',{guestId:f.b.id,confirm:'ERASE'})
  const purged=(await h.api(journalPath)).merges[0];assert.equal(purged.status,'erased');assert.equal(purged.snapshots,undefined)
  await h.api('/api/guests/unmerge-preview?mergeId='+purged.id,undefined,{status:409})
  await h.command('guest.unmerge',{mergeId:purged.id,review:preview.review,confirm:'UNMERGE'},{status:409})
  const later=await h.api('/api/backup');await erased.api('/api/restore',{archive:later,confirm:'RESTORE'})
  for(const source of [h,erased]){
   assert.deepEqual((await source.api('/api/guests?search=alex.')).guests,[])
   const output=JSON.stringify([await source.api('/api/state'),await source.api(journalPath),await source.api('/api/backup')])
   for(const value of [f.a.email,f.b.email,'Quiet table','conflicting note'])assert.ok(!output.includes(value),'Erased personal value absent: '+value)
   const csv=await (await source.request('/api/business-export/guest-merges.csv')).text();assert.ok(csvRecords(csv).every(row=>!JSON.parse(row.data_json).snapshots))
   await source.api('/api/public/book',publicGuest(f.s,0,{email:f.b.email,name:f.b.name}),{as:'',status:409})
  }
  const old=await h.api('/api/restore',{archive,confirm:'RESTORE'},{status:400});assert.match(old.error,/before a guest was erased/)
 }finally{await h.close();await restored.close();await erased.close()}
})

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

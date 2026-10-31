import assert from 'node:assert/strict'
import {groupGuests} from './group-guest-fixture.mjs'
import {call} from './diner-client.mjs'
import {installation} from './harness.mjs'
export async function groupGuestJourney(){
 const f=await groupGuests()
 try{
  const [a,b]=f.records
  for(const r of f.records){
   const initial=await call(r.h,'group',{token:r.session.token})
   assert.deepEqual(initial.purposes,{preferences:false,visits:false,rebooking:false})
   await call(r.h,'preferences',{token:r.session.token,acknowledged:true,favorite:true,preferences:'synthetic-placemat-quiet-'+r.input.name})
   await r.h.command('guest.update',{guestId:r.b.guestId,notes:'synthetic-placemat-private',name:r.input.name,email:r.input.email})
  }
  await f.read(f.home,403)
  const consent=await f.consent(0);f.profileId=consent.profileId
  let local=await f.read();assert.equal(local.visits.length,1,'Matching unverified bookings do not become shared history')
  assert.equal(local.preferences,'synthetic-placemat-quiet-'+a.input.name);assert.equal(local.rebookUrl,'/book')
  await f.read(f.tap,403)
  const paired=await f.link({preferences:true,visits:true,rebooking:false});assert.equal(paired.profileId,f.profileId)
  await call(f.tap,'group-link',{token:b.session.token,acknowledged:true,code:paired.code,preferences:true,visits:true,rebooking:true},{status:403})
  const remote=await f.read(f.tap);assert.equal(remote.visits.length,1);assert.equal(remote.rebookUrl,null)
  assert.equal(remote.preferences,'synthetic-placemat-quiet-'+b.input.name)
  const directory=await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})
  assert.equal(directory.profiles.length,1);assert.equal(directory.profiles[0].venues.length,2)
  assert.equal(directory.profiles[0].venues[1].rebookUrl,null)
  const homeOnlyId=await f.addGuest(10,{linked:false})
  const mixed=await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})
  assert.equal(mixed.profiles.find(p=>p.profileId===f.profileId).venues.length,2,'A home-only diner must not hide an independently authorized guest')
  assert.deepEqual(mixed.profiles.find(p=>p.profileId===homeOnlyId).venues.map(v=>v.venue),['Home Bistro'],'An unlinked diner shares no sister-venue history')
  await f.tap.api('/api/group/guestbook?profileId='+homeOnlyId,undefined,{...f.bearer,status:403})
  console.log('PROBE GUEST-006 A1: home-only second guest -> directory 200; original guest retains both venues; second guest has home history only')
  for(const value of [local,remote,directory])for(const restricted of ['synthetic-placemat-private',a.input.email,b.input.email,a.unverified.id,b.unverified.id])assert.ok(!JSON.stringify(value).includes(restricted),restricted)
  assert.equal((await f.home.request('/book',{as:''})).status,200)
  const before=(await f.home.api('/api/state')).state.bookings.length,messages=f.home.messages.length
  await f.read();assert.equal((await f.home.api('/api/state')).state.bookings.length,before);assert.equal(f.home.messages.length,messages,'Suggestions never send or book automatically')
  const host=await f.tap.signIn('synthetic-placemat-host'+String.fromCharCode(64)+'example.test')
  await f.tap.api('/api/group/guestbook?profileId='+f.profileId,undefined,{as:host,status:401})
  await f.tap.api('/api/group/guest-directory',undefined,{as:host,status:403})
  await f.tap.api('/api/guests?search=synthetic',undefined,{...f.bearer,status:401})
  await f.consent(0,{preferences:false,visits:true,rebooking:false})
  const masked=await f.read(f.tap);assert.equal(masked.preferences,null);assert.equal(masked.rebookUrl,null);assert.equal(masked.visits.length,1)
  await f.consent(0,{preferences:false,visits:false,rebooking:false});await f.read(f.tap,403)
  await f.consent(0);await f.consent(1)
  assert.equal((await f.read(f.tap)).rebookUrl,'/book','The separately chosen rebooking purpose enables only the public booking door')
  const rebook=(await f.tap.api('/api/public/book',{...b.input,startAt:new Date(Date.parse(b.s.startAt)+60*60000).toISOString()},{as:'',status:201})).result
  const saved=(await f.tap.api('/api/state')).state.bookings.find(row=>row.id===rebook.id)
  assert.equal(saved.requests?.seatingPreference??'','');assert.equal(saved.requests?.allergyNotes??'','');assert.ok(!JSON.stringify(saved).includes('synthetic-placemat-private'))
  assert.ok(!(await f.read(f.tap)).visits.some(row=>row.startAt===saved.startAt),'Rebooking neither proves a new visit nor copies restricted notes')
  f.available=false;await f.read(f.tap,403);f.available=true
  await f.home.api('/api/group/admin',{operatorId:f.readerId,venues:{home:['guestbook.read']}});await f.read(f.tap,403)
  await f.home.api('/api/group/admin',{operatorId:f.readerId,venues:f.grants});assert.equal((await f.read(f.tap)).visits.length,1)
  await f.consent(1,{preferences:false,visits:false,rebooking:false});await f.read(f.tap,403)
  await f.consent(1)
  await call(f.tap,'forget',{token:b.session.token,acknowledged:true})
  await f.read(f.tap,403)
  console.log('PROBE GUEST-006 native privacy: independently proved visits, separate purpose masks, scoped rebooking, host refusal, replay refusal, live grant revocation and account forgetting, opt-out and unavailable introspection passed')
 }finally{await f.close()}
 await groupGuestContactJourney()
 await groupGuestDirectoryJourney()
}
export async function groupGuestCustodyJourney(){
 const f=await groupGuests(),restored=await installation(),stale=await installation()
 try{
  f.profileId=(await f.consent(0)).profileId;await f.link()
  const code=(await call(f.home,'group-code',{token:f.records[0].session.token,acknowledged:true,venueId:f.linkId})).code
  const archive=await f.home.api('/api/backup'),serialized=JSON.stringify(archive)
  for(const credential of [code,f.records[0].session.token,f.token])assert.ok(!serialized.includes(credential))
  // Inspect the real portable records after restore, rather than relying on archive encoding.
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  const row=await restored.db.prepare('SELECT * FROM pm_group_guests').first();assert.ok(row);assert.equal(row.profile_id,f.profileId)
  assert.equal(row.preferences,0);assert.equal(row.visits,0);assert.equal(row.rebooking,0)
  await restored.api('/api/group/guestbook?profileId='+f.profileId,undefined,{...f.bearer,status:403})
  const csv=await(await f.home.request('/api/business-export/group-guest-consent.csv')).text();assert.ok(csv.includes(f.profileId));assert.ok(csv.includes('preferences'));assert.ok(!csv.includes(code))
  const guest=f.records[0].b.guestId
  await f.home.command('guest.erase',{guestId:guest,confirm:'ERASE'})
  await f.read(f.home,403);await f.read(f.tap,403)
  assert.equal((await f.home.db.prepare('SELECT count(*) AS n FROM pm_group_guests').first()).n,0)
  assert.equal((await f.home.db.prepare('SELECT count(*) AS n FROM pm_group_guest_codes').first()).n,0)
  const erased=await f.home.api('/api/backup'),erasedCsv=await(await f.home.request('/api/business-export/group-guest-consent.csv')).text()
  assert.ok(!JSON.stringify(erased).includes(f.profileId));assert.ok(!erasedCsv.includes(f.profileId))
  await stale.api('/api/restore',{archive,journal:erased,confirm:'RESTORE'},{status:400})
  assert.equal((await stale.db.prepare('SELECT count(*) AS n FROM pm_group_guests').first()).n,0,'Old portable consent cannot resurrect an erased account')
  console.log('PROBE GUEST-006 custody: owner CSV, inert archive restore, excluded codes, immediate erasure refusal and stale restore fence passed')
 }finally{await f.close();await restored.close();await stale.close()}
}

async function groupGuestContactJourney(){
 const f=await groupGuests({attended:false})
 try{
  f.profileId=(await f.consent(0)).profileId
  const code=(await call(f.home,'group-code',{token:f.records[0].session.token,acknowledged:true,venueId:f.linkId})).code
  const payload={token:f.records[1].session.token,code,acknowledged:true,preferences:true,visits:true,rebooking:true}
  const outcomes=await Promise.all([0,1].map(()=>f.tap.request('/api/public/diner/group-link',{method:'POST',as:'',body:payload})))
  assert.equal(outcomes.filter(r=>r.status===200).length,1,'Concurrent link redemption grants one native relationship')
  assert.ok(outcomes.every(r=>[200,403,409].includes(r.status)))
  assert.equal((await f.read(f.tap)).visits.length,0,'An upcoming reservation is never an attended visit')
  const b=f.records[1],changed='synthetic-placemat-changed'+String.fromCharCode(64)+'example.test'
  const preview=await call(f.tap,'management/preview',{token:b.session.token,bookingId:b.b.id,action:'change',contact:{email:changed}})
  await call(f.tap,'management/commit',{token:b.session.token,bookingId:b.b.id,previewId:preview.previewId,acknowledged:true})
  await f.read(f.tap,403)
  assert.equal((await f.tap.db.prepare('SELECT count(*) AS n FROM pm_group_guests').first()).n,1,'Stale booking proof denies reads without rewriting recorded consent')
  console.log('PROBE GUEST-006 contact and concurrency: one concurrent link succeeds; upcoming visits excluded; real guest contact change immediately denies old group proof')
 }finally{await f.close()}
}

export async function groupGuestDirectoryJourney(){
 const f=await groupGuests()
 try{
  f.profileId=(await f.consent(0)).profileId;await f.link()
  const ids=[f.profileId]
  for(let n=10;n<40;n++)ids.push(await f.addGuest(n))
  const directory=await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})
  assert.equal(directory.profiles.length,ids.length)
  for(const id of ids){
   const profile=directory.profiles.find(p=>p.profileId===id)
   assert.ok(profile,'Every consented diner remains readable')
   assert.deepEqual(profile.venues.map(v=>v.venue),['Home Bistro','Tap Room'])
   for(const venue of profile.venues){assert.equal(venue.visits.length,1);assert.ok(venue.purposes.preferences&&venue.purposes.visits)}
  }
  // A second ordinary refresh must also fit the unchanged limiter.
  assert.equal((await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})).profiles.length,ids.length)
  f.available=false
  await f.home.api('/api/group/guest-directory',undefined,{as:f.reader,status:403})
  f.available=true
  await f.home.api('/api/group/admin',{operatorId:f.readerId,venues:{home:['guestbook.read']}})
  const reduced=await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})
  assert.ok(reduced.profiles.every(p=>p.venues.length===1),'Revoked venue rights never retain a remote projection')
  await f.home.api('/api/group/admin/revoke',{operatorId:f.readerId})
  await f.home.api('/api/group/guest-directory',undefined,{as:f.reader,status:403})
  console.log('PROBE GUEST-006 A2: 31 fully linked consented diners -> two directory refreshes 200 with both histories; unavailable introspection and revoked reader refused')
 }finally{await f.close()}
}

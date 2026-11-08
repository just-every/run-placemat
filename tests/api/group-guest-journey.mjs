import assert from 'node:assert/strict'
import {groupGuests} from './group-guest-fixture.mjs'
import {call,verify} from './diner-client.mjs'
import {installation,publicGuest} from './harness.mjs'
import {address} from './group-guest-fixture.mjs'
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

async function groupGuestDirectoryJourney(){
 const f=await groupGuests({serviceOptions:{covers:100}})
 try{
  f.profileId=(await f.consent(0)).profileId;await f.link()
  for(const h of [f.home,f.tap])for(let n=4;n<32;n++)await h.command('table.save',{label:'Directory '+n,seats:2,x:10+(n%8)*10,y:10+Math.floor(n/8)*15})
  const profileIds=[f.profileId],sessionsByProfile=new Map()
  const add=async(n,linked)=>{
   const sessions=[]
   for(const [i,h] of [f.home,f.tap].entries()){
    if(i&&!linked)break
    // Distinct diners use distinct edge addresses; the group reader keeps one address.
    const client={...h,api:(path,body,options={})=>h.api(path,body,{...options,headers:{...options.headers,'CF-Connecting-IP':'192.0.2.'+n}})}
    const s=f.records[i].s,input=publicGuest(s,0,{email:address(100+n),name:'Synthetic directory guest '+n})
    const b=await h.command('booking.walkin',{...input,tableIds:[(await h.api('/api/state')).state.tables[n-3].id]})
    await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,stage:'ready'})
    sessions.push({client,token:(await verify(client,b,input.email)).token})
   }
   const consent=await call(sessions[0].client,'group-consent',{token:sessions[0].token,acknowledged:true,preferences:true,visits:true,rebooking:false})
   if(linked){
    const {code}=await call(sessions[0].client,'group-code',{token:sessions[0].token,acknowledged:true,venueId:f.linkId})
    await call(sessions[1].client,'group-link',{token:sessions[1].token,acknowledged:true,code,preferences:true,visits:true,rebooking:false})
   }
   sessionsByProfile.set(consent.profileId,sessions)
   return consent.profileId
  }
  const homeOnly=await add(4,false)
  const mixed=await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})
  assert.equal(mixed.profiles.length,2)
  assert.equal(mixed.profiles.find(p=>p.profileId===f.profileId).venues.length,2,'An unrelated unlinked diner cannot hide permitted sister-venue history')
  assert.equal(mixed.profiles.find(p=>p.profileId===homeOnly).venues.length,1,'Home-only consent does not expose a sister-venue projection')
  console.log('PROBE GUEST-006 finding-1: GET /api/group/guest-directory with one linked and one home-only diner -> 200; linked history retained at both venues; home-only profile contains home alone')
  // Remove only this guest's consent through its diner door, leaving a fully linked directory.
  const homeOnlySession=sessionsByProfile.get(homeOnly)[0]
  await call(homeOnlySession.client,'group-consent',{token:homeOnlySession.token,acknowledged:true,preferences:false,visits:false,rebooking:false})
  for(let n=5;n<35;n++)profileIds.push(await add(n,true))
  const directory=await f.home.api('/api/group/guest-directory',undefined,{as:f.reader})
  assert.deepEqual(new Set(directory.profiles.map(p=>p.profileId)),new Set(profileIds))
  assert.ok(directory.profiles.every(p=>p.venues.length===2&&p.venues.every(v=>v.visits.length===1)))
  console.log('PROBE GUEST-006 finding-2: GET /api/group/guest-directory with 31 independently verified linked diners -> 200; all 31 profiles show both attended venues')
  f.available=false
  await f.home.api('/api/group/guest-directory',undefined,{as:f.reader,status:403})
  f.available=true
  await f.home.api('/api/group/admin/revoke',{operatorId:f.readerId})
  await f.home.api('/api/group/guest-directory',undefined,{as:f.reader,status:403})
 }finally{await f.close()}
}

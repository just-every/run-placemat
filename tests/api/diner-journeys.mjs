import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'

const door='/api/public/diner/'
const call=(h,action,body,options={})=>h.api(door+action,body,{as:'',...options})
const code=h=>h.messages.findLast(m=>m.subject==='Verify your diner account').text.match(/\b[a-f0-9]{64}\b/)[0]
async function issue(h,b,email){
 await call(h,'request',{bookingId:b.id,email,acknowledged:true},{status:202})
 return code(h)
}
async function verify(h,b,email){return call(h,'verify',{code:await issue(h,b,email),acknowledged:true})}

export async function verifiedDinerJourney(){
 const h=await installation(),other=await installation()
 try{
  const {service:s}=await service(h,{tables:5,covers:20}),input=publicGuest(s,0,{phone:'+1 212 555 0100'})
  const b=(await h.api('/api/public/book',input,{as:'',status:201})).result
  const sibling=(await h.api('/api/public/book',publicGuest(s,1,{phone:input.phone}),{as:'',status:201})).result
  const same=(await h.api('/api/public/book',{...input,startAt:new Date(Date.parse(s.startAt)+2*3600000).toISOString()},{as:'',status:201})).result
  await call(h,'account',{token:'synthetic-placemat-1'},{status:404})
  const wrong=await call(h,'request',{bookingId:b.id,email:'wrong@example.test',acknowledged:true},{status:202})
  assert.equal(h.messages.filter(m=>m.subject==='Verify your diner account').length,0)
  const correct=await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  assert.deepEqual(correct,wrong,'Responses do not reveal a matching booking')
  const oldCode=code(h),currentCode=await issue(h,b,input.email)
  await call(h,'verify',{code:oldCode,acknowledged:true},{status:404})
  await call(h,'verify',{code:currentCode,acknowledged:false},{status:400})
  const attempts=await Promise.all([0,1].map(()=>h.request(door+'verify',{method:'POST',as:'',body:{code:currentCode,acknowledged:true}})))
  assert.equal(attempts.filter(r=>r.status===200).length,1,'Concurrent replay creates one session')
  assert.ok(attempts.every(r=>[200,404,409].includes(r.status)))
  const first=await attempts.find(r=>r.status===200).json()
  await call(h,'verify',{code:currentCode,acknowledged:true},{status:404})
  let account=await call(h,'account',{token:first.token})
  assert.deepEqual(account.bookings.map(b=>b.id),[b.id])
  assert.ok(!JSON.stringify(account).includes(sibling.id));assert.ok(!JSON.stringify(account).includes(same.id),'Same email never attaches unverified bookings')
  assert.equal((await h.api('/api/state')).guests.length,2,'A shared phone never merges guests')
  const before=(await h.api('/api/state')).state
  await call(h,'preferences',{token:first.token,favorite:true,preferences:'Quiet table requested',acknowledged:true})
  const second=await verify(h,b,input.email)
  account=await call(h,'account',{token:second.token})
  assert.equal(account.favorite,true);assert.equal(account.preferences,'Quiet table requested')
  assert.equal(account.rebookUrl,'/book');assert.equal((await h.request('/book',{as:''})).status,200)
  const nextInput={...input,startAt:new Date(Date.parse(s.startAt)+30*60000).toISOString()}
  const rebook=(await h.api('/api/public/book',nextInput,{as:'',status:201})).result
  assert.ok(rebook.id);assert.equal((await call(h,'account',{token:second.token})).bookings.length,1,'Rebooking stays guest checkout until separately verified')
  await call(other,'account',{token:second.token},{status:404})
  await call(h,'preferences',{token:second.token,favorite:false,preferences:'',acknowledged:true})
  assert.equal((await call(h,'account',{token:first.token})).preferences,'')
  assert.deepEqual((await h.api('/api/state')).state.bookings.slice(0,before.bookings.length),before.bookings,'Account changes do not mutate restaurant reservations')
  await call(h,'logout',{token:first.token})
  await call(h,'account',{token:first.token},{status:404})
  assert.equal((await call(h,'account',{token:second.token})).bookings[0].id,b.id)
  await call(h,'forget',{token:second.token,acknowledged:true})
  await call(h,'account',{token:second.token},{status:404})
  assert.equal((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id).status,'booked')
 }finally{await h.close();await other.close()}
}

export async function dinerCustodyJourney(){
 let now=Date.parse('2026-10-26T10:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now}),restored=await installation(),old=await installation()
 try{
  const {service:s}=await service(h),input=publicGuest(s,0)
  const b=(await h.api('/api/public/book',input,{as:'',status:201})).result
  const expiredCode=await issue(h,b,input.email);now+=15*60000
  await call(h,'verify',{code:expiredCode,acknowledged:true},{status:404})
  let session=await verify(h,b,input.email)
  await call(h,'preferences',{token:session.token,favorite:true,preferences:'synthetic-placemat-1',acknowledged:true})
  const archive=await h.api('/api/backup')
  const text=JSON.stringify(archive)
  assert.ok(!text.includes(session.token));assert.ok(!text.includes(expiredCode))
  assert.ok(archive[0].excludedTables.includes('pm_diner_sessions'));assert.ok(text.includes('synthetic-placemat-1'))
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  await call(restored,'account',{token:session.token},{status:404})
  const fresh=await verify(restored,b,input.email)
  assert.equal((await call(restored,'account',{token:fresh.token})).preferences,'synthetic-placemat-1')
  const access=await h.api('/api/privacy/access',{guestId:(await h.api('/api/state')).guests.find(g=>g.email===input.email).id})
  assert.equal(access.dinerAccounts[0].preferences,'synthetic-placemat-1')
  const csv=await (await h.request('/api/business-export/diner-accounts.csv')).text()
  assert.ok(csv.includes(input.email));assert.ok(csv.includes('synthetic-placemat-1'));assert.ok(!csv.includes(session.token))
  now+=86400000
  await call(h,'account',{token:session.token},{status:404})
  session=await verify(h,b,input.email)
  const pending=await issue(h,b,input.email)
  const guest=(await h.api('/api/state')).guests.find(g=>g.email===input.email)
  await h.command('booking.management.send',{bookingId:b.id,acknowledged:true})
  const managementToken=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
  const preview=await h.api('/api/public/booking-management/preview',{token:managementToken,action:'change',contact:{email:'changed@example.test'}},{as:''})
  await h.api('/api/public/booking-management/commit',{token:managementToken,previewId:preview.previewId,acknowledged:true},{as:''})
  await call(h,'verify',{code:pending,acknowledged:true},{status:404})
  await call(h,'account',{token:session.token},{status:404})
  const last=await verify(h,b,'changed@example.test')
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  await call(h,'account',{token:last.token},{status:404})
  const later=await h.api('/api/backup')
  assert.ok(!JSON.stringify(later).includes('synthetic-placemat-1'))
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_accounts').first()).n,0)
  await old.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})
  const blocked=await h.request(door+'request',{method:'POST',body:{bookingId:b.id,email:input.email,acknowledged:true},headers:{origin:'https://other.example.test'}})
  assert.equal(blocked.status,403)
 }finally{await h.close();await restored.close();await old.close()}
}

export async function failedDinerMailJourney(){
 let message,sends=0
 const h=await installation({mailEdge:async request=>{sends++;message=await request.json();return new Response('Unavailable',{status:503})}})
 try{
  const {service:s}=await service(h),input=publicGuest(s,0)
  const b=(await h.api('/api/public/book',input,{as:'',status:201})).result
  await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  for(let i=0;i<5;i++)await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  assert.equal(sends,5,'Failed delivery attempts still consume the daily mail allowance')
  const token=message.text.match(/\b[a-f0-9]{64}\b/)[0]
  await call(h,'verify',{code:token,acknowledged:true},{status:404})
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_accounts').first()).n,0)
  assert.equal((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id).status,'booked')
 }finally{await h.close()}
}

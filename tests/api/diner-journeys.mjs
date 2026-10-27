import assert from 'node:assert/strict'
import {installation} from './harness.mjs'

import {door,call,code,issue,verify,assertCustody} from './diner-client.mjs'
export {dinerCustodyJourney} from './diner-custody-journey.mjs'
export {dinerManagementJourney} from './diner-management-journey.mjs'

export async function verifiedDinerJourney(){
 let now=Date.parse('2026-10-26T10:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now}),other=await installation()
 try{
  const {dinerFixture}=await import('./diner-fixture.mjs'),f=await dinerFixture(h),s=f.service,input=f.input,b=f.same,sibling=f.sibling
  const same=(await h.api('/api/public/book',{...input,startAt:new Date(Date.parse(s.startAt)+2*3600000).toISOString()},{as:'',status:201})).result
  await call(h,'account',{token:'synthetic-placemat-1'},{status:404})
  const initial=await h.api('/api/state'),guest=initial.guests.find(g=>g.email===input.email)
  const consentBefore=(await h.api('/api/guests?review='+guest.id)).review.selected
  assert.equal(consentBefore.marketingPermission,'Not recorded')
  for(const acknowledged of [false,undefined])await call(h,'request',{bookingId:b.id,email:input.email,acknowledged},{status:400})
  assert.equal(h.messages.length,0,'Unconfirmed sends never reach the mail edge')
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_challenges').first()).n,0)
  assert.deepEqual((await h.api('/api/state')).state.audit,initial.state.audit,'Refused sends create no apparent committed request')
  const wrong=await call(h,'request',{bookingId:b.id,email:'wrong@example.test',acknowledged:true},{status:202})
  assert.equal(h.messages.filter(m=>m.subject==='Verify your diner account').length,0)
  const correct=await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  assert.deepEqual(correct,wrong,'Responses do not reveal a matching booking')
  for(const table of ['pm_diner_accounts','pm_diner_bookings','pm_diner_sessions'])assert.equal((await h.db.prepare('SELECT count(*) AS n FROM '+table).first()).n,0,'Requesting a code creates no account or booking authority before proof')
  const oldCode=code(h),currentCode=await issue(h,b,input.email)
  await assertCustody(h,currentCode,'pm_diner_challenges')
  await call(h,'verify',{code:oldCode,acknowledged:true},{status:404})
  await call(h,'verify',{code:currentCode,acknowledged:false},{status:400})
  const attempts=await Promise.all([0,1].map(()=>h.request(door+'verify',{method:'POST',as:'',body:{code:currentCode,acknowledged:true}})))
  assert.equal(attempts.filter(r=>r.status===200).length,1,'Concurrent replay creates one session')
  assert.ok(attempts.every(r=>[200,404,409].includes(r.status)))
  const first=await attempts.find(r=>r.status===200).json()
  assert.match(first.token,/^[a-f0-9]{64}$/,'A device bearer contains thirty-two random bytes')
  assert.equal(first.expiresAt,new Date(now+86400000).toISOString())
  await assertCustody(h,first.token,'pm_diner_sessions')
  await call(h,'verify',{code:currentCode,acknowledged:true},{status:404})
  let account=await call(h,'account',{token:first.token})
  assert.deepEqual(account.bookings.map(b=>b.id),[b.id])
  const consentAfter=(await h.api('/api/guests?review='+guest.id)).review.selected
  assert.equal(consentAfter.marketingPermission,'Not recorded')
  assert.deepEqual(consentAfter.guest,consentBefore.guest,'Verification never changes profile or consent provenance')
  assert.deepEqual(consentAfter.queueContactPermissions,consentBefore.queueContactPermissions)
  assert.ok(!JSON.stringify(account).includes(sibling.id));assert.ok(!JSON.stringify(account).includes(same.id),'Same email never attaches unverified bookings')
  assert.equal((await h.api('/api/state')).guests.length,2,'A shared phone never merges guests')
  const before=(await h.api('/api/state')).state
  await call(h,'preferences',{token:first.token,favorite:true,preferences:'Quiet table requested',acknowledged:true})
  now+=60000
  const second=await verify(h,b,input.email)
  account=await call(h,'account',{token:second.token})
  assert.equal(account.favorite,true);assert.equal(account.preferences,'Quiet table requested')
  assert.equal(account.rebookUrl,'/book');assert.equal((await h.request('/book',{as:''})).status,200)
  const nextInput={...input,startAt:new Date(Date.parse(s.startAt)+30*60000).toISOString()}
  const rebook=(await h.api('/api/public/book',nextInput,{as:'',status:201})).result
  const savedRebook=(await h.api('/api/state')).state.bookings.find(b=>b.id===rebook.id)
  assert.equal(savedRebook.requests?.seatingPreference??'','')
  assert.ok(!JSON.stringify(savedRebook).includes('Quiet table requested'),'Saved account preferences never apply to a new booking automatically')
  assert.ok(rebook.id);assert.equal((await call(h,'account',{token:second.token})).bookings.length,1,'Rebooking stays guest checkout until separately verified')
  await call(other,'account',{token:second.token},{status:404})
  await call(h,'preferences',{token:second.token,favorite:false,preferences:'',acknowledged:true})
  assert.equal((await call(h,'account',{token:first.token})).preferences,'')
  assert.deepEqual((await h.api('/api/state')).state.bookings.slice(0,before.bookings.length),before.bookings,'Account changes do not mutate restaurant reservations')
  await call(h,'logout',{token:first.token})
  await call(h,'account',{token:first.token},{status:404})
  assert.equal((await call(h,'account',{token:second.token})).bookings[0].id,b.id)
  now+=60000
  const third=await verify(h,b,input.email)
  const events=(await h.api('/api/state')).state.audit.filter(e=>e.action.startsWith('diner.'))
  assert.deepEqual(events.map(e=>e.action),['diner.verification.requested','diner.verification.requested','diner.booking.verified','diner.preferences.saved','diner.verification.requested','diner.booking.verified','diner.preferences.revoked','diner.verification.requested','diner.booking.verified'])
  for(const event of events){assert.equal(event.actor,'guest');assert.equal(event.source,'guest-supplied');assert.ok(event.id);assert.ok(Number.isFinite(Date.parse(event.at)));assert.ok(event.changes.length)}
  assert.deepEqual(events[0].changes[0],{kind:'dinerVerification',id:b.id,before:{requested:false},after:{requested:true}})
  assert.deepEqual(events[2].changes[0].after,{verified:true})
  assert.deepEqual(events[3].changes[0].before,{bookingIds:[b.id],favorite:false,preferences:''})
  assert.deepEqual(events[3].changes[0].after,{bookingIds:[b.id],favorite:true,preferences:'Quiet table requested'})
  assert.deepEqual(events[6].changes[0].after,{bookingIds:[b.id],favorite:false,preferences:''})
  const preForget=await h.api('/api/backup')
  await call(h,'forget',{token:second.token,acknowledged:true})
  await call(h,'account',{token:second.token},{status:404})
  await call(h,'account',{token:third.token},{status:404})
  const forgotten=(await h.api('/api/state')).state.audit.findLast(e=>e.action==='diner.account.forgotten')
  assert.equal(forgotten.actor,'guest');assert.equal(forgotten.source,'guest-supplied');assert.ok(Number.isFinite(Date.parse(forgotten.at)))
  assert.deepEqual(forgotten.changes[0].before,{present:true});assert.equal(forgotten.changes[0].after,null)
  const postForget=await h.api('/api/backup')
  assert.ok(!JSON.stringify(postForget).includes('Quiet table requested'),'Forget removes copied preferences from audit history')
  await other.api('/api/restore',{archive:preForget,journal:postForget,confirm:'RESTORE'},{status:400})
  assert.equal((await other.db.prepare('SELECT count(*) AS n FROM pm_diner_accounts').first()).n,0,'Trusted later forget journal prevents old-account resurrection')
  assert.equal((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id).status,'booked')
 }finally{await h.close();await other.close()}
}

export async function failedDinerMailJourney(){
 for(const outcome of ['rejected','unavailable','uncertain'])await failedMail(outcome)
}
export async function failedMail(outcome){
 let message,sends=0
 let now=Date.parse('2026-10-26T10:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now,mailEdge:async request=>{sends++;message=await request.json();if(outcome==='uncertain')throw Error('Network outcome unknown');return new Response('Unavailable',{status:outcome==='unavailable'?503:400})}})
 try{
  const {dinerFixture}=await import('./diner-fixture.mjs'),f=await dinerFixture(h),input=f.input,b=f.same
  await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  for(let i=0;i<5;i++)await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_challenges').first()).n,0,'Rejected and uncertain sends both revoke pending proof')
  assert.equal(sends,5,'Failed delivery attempts still consume the daily mail allowance')
  const budget={headers:{'CF-Connecting-IP':'192.0.2.44'}}
  for(let i=0;i<30;i++)await call(h,'request',{email:'invalid',acknowledged:true},{...budget,status:202})
  await call(h,'request',{email:'invalid',acknowledged:true},{...budget,status:429})
  now+=60000
  await call(h,'request',{email:'invalid',acknowledged:true},{...budget,status:202})
  assert.equal(sends,5,'Rate-budget probes do not create outbound mail')
  const token=message.text.match(/\b[a-f0-9]{64}\b/)[0]
  await call(h,'verify',{code:token,acknowledged:true},{status:404})
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_accounts').first()).n,0)
  assert.equal((await h.api('/api/state')).state.bookings.find(row=>row.id===b.id).status,'booked')
 }finally{await h.close()}
}

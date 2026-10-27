import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {installation,service,publicGuest} from './harness.mjs'

const door='/api/public/diner/'
const call=(h,action,body,options={})=>h.api(action.startsWith('/')?action:door+action,body,{as:'',...options})
async function assertCustody(h,secret,table){
 const digest=createHash('sha256').update(secret).digest('hex')
 assert.ok(await h.db.prepare(`SELECT digest FROM ${table} WHERE digest=?`).bind(digest).first(),'Only the credential digest grants lookup')
 const tables=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results
 for(const {name} of tables){
  const rows=await h.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()
  assert.ok(!JSON.stringify(rows.results).includes(secret),'Raw diner credential never persists in '+name)
 }
}
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
  await assertCustody(h,currentCode,'pm_diner_challenges')
  await call(h,'verify',{code:oldCode,acknowledged:true},{status:404})
  await call(h,'verify',{code:currentCode,acknowledged:false},{status:400})
  const attempts=await Promise.all([0,1].map(()=>h.request(door+'verify',{method:'POST',as:'',body:{code:currentCode,acknowledged:true}})))
  assert.equal(attempts.filter(r=>r.status===200).length,1,'Concurrent replay creates one session')
  assert.ok(attempts.every(r=>[200,404,409].includes(r.status)))
  const first=await attempts.find(r=>r.status===200).json()
  await assertCustody(h,first.token,'pm_diner_sessions')
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
 let now=Date.parse('2026-10-26T10:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now,mailEdge:async request=>{sends++;message=await request.json();return new Response('Unavailable',{status:503})}})
 try{
  const {service:s}=await service(h),input=publicGuest(s,0)
  const b=(await h.api('/api/public/book',input,{as:'',status:201})).result
  await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
  for(let i=0;i<5;i++)await call(h,'request',{bookingId:b.id,email:input.email,acknowledged:true},{status:202})
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

export async function dinerManagementJourney(){
 const {dinerFixture,dinerNow}=await import('./diner-fixture.mjs')
 let now=dinerNow
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now})
 try{
  const f=await dinerFixture(h),first=await verify(h,f.same,f.input.email),second=await verify(h,f.same,f.input.email)
  const manage=(action,p={},status)=>call(h,'/api/public/diner/management/'+action,{token:first.token,bookingId:f.same.id,...p},status?{status}:{})
  await manage('status',{bookingId:f.sibling.id},404)
  await manage('status',{token:'synthetic-placemat-1'},404)
  const view=await manage('status')
  assert.equal(view.booking.id,f.same.id);assert.equal(view.guest.email,f.input.email)
  const before=(await h.api('/api/state')).state
  const preview=await manage('preview',{action:'change',partySize:3})
  assert.equal(preview.booking.partySize,3);assert.equal(preview.consequences.feeCents,0);assert.equal(preview.consequences.refundCents,0)
  assert.deepEqual((await h.api('/api/state')).state,before,'Preview never changes a restaurant reservation')
  await manage('commit',{previewId:preview.previewId,acknowledged:false},400)
  await manage('commit',{token:second.token,previewId:preview.previewId,acknowledged:true},404)
  await manage('commit',{bookingId:f.sibling.id,previewId:preview.previewId,acknowledged:true},404)
  const committed=await manage('commit',{previewId:preview.previewId,acknowledged:true})
  assert.equal(committed.booking.partySize,3)
  const audit=(await h.api('/api/state')).state.audit.findLast(e=>e.action==='booking.management.change')
  assert.equal(audit.actor,'guest');assert.equal(audit.source,'guest-supplied');assert.equal(audit.subject,f.same.id);assert.ok(audit.id);assert.equal(audit.at,new Date(now).toISOString())
  const bookingChange=audit.changes.find(c=>c.kind==='bookings'&&c.id===f.same.id)
  assert.equal(bookingChange.before.partySize,2);assert.equal(bookingChange.after.partySize,3)
  const consent=audit.changes.find(c=>c.kind==='managementConsent').after
  assert.equal(consent.action,'change');assert.equal(consent.acknowledged,true)
  assert.equal(consent.consequences.currency,'USD');assert.equal(consent.consequences.feeCents,0);assert.equal(consent.consequences.refundCents,0)
  await manage('commit',{previewId:preview.previewId,acknowledged:true},404)
  assert.equal((await call(h,'account',{token:second.token})).bookings[0].partySize,3)
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===f.sibling.id),before.bookings.find(b=>b.id===f.sibling.id))
  // A failed capacity check leaves the existing reservation and device session usable.
  await manage('preview',{action:'change',partySize:100},409)
  assert.equal((await manage('status')).booking.partySize,3)
  const stale=await manage('preview',{action:'cancel'})
  await h.command('booking.lock',{bookingId:f.same.id,locked:true,version:(await h.api('/api/state')).version})
  await manage('commit',{previewId:stale.previewId,acknowledged:true},404)
  const cancel=await manage('preview',{action:'cancel'})
  const archive=await h.api('/api/backup')
  assert.ok(!JSON.stringify(archive).includes(cancel.previewId),'Diner consent previews never enter archives')
  await call(h,'logout',{token:first.token})
  await manage('commit',{previewId:cancel.previewId,acknowledged:true},404)
  const fromSecond=await call(h,'/api/public/diner/management/preview',{token:second.token,bookingId:f.same.id,action:'reconfirm'})
  const reconfirmed=await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:f.same.id,previewId:fromSecond.previewId,acknowledged:true})
  assert.equal(reconfirmed.booking.serviceStatus,'reconfirmed')
  // Paid bookings require the existing manager review, including money added after preview.
  const pending=await call(h,'/api/public/diner/management/preview',{token:second.token,bookingId:f.same.id,action:'cancel'})
  const owner=(await h.api('/auth/operators')).find(o=>o.role==='owner')
  await h.command('payment.request',{bookingId:f.same.id,amountCents:100,dueAt:'2026-10-29T10:00:00Z',followupOwnerId:owner.id,reason:'Guest agreed deposit requires manager review'})
  assert.equal((await call(h,'/api/public/diner/management/status',{token:second.token,bookingId:f.same.id})).managerReviewRequired,true)
  await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:f.same.id,previewId:pending.previewId,acknowledged:true},{status:409})
  assert.equal((await call(h,'account',{token:second.token})).bookings[0].status,'booked')
  now+=60000
  const repeat=(await h.api('/api/public/book',{...f.input,startAt:'2026-10-30T09:00:00Z'},{as:'',status:201})).result
  await verify(h,repeat,f.input.email)
  const review=await call(h,'/api/public/diner/management/preview',{token:second.token,bookingId:repeat.id,action:'cancel'})
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===repeat.id).status,'booked')
  const cancelled=await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:repeat.id,previewId:review.previewId,acknowledged:true})
  assert.equal(cancelled.booking.status,'cancelled')
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===f.same.id).status,'booked','Cancelling another verified booking leaves the paid reservation intact')
  await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:repeat.id,previewId:review.previewId,acknowledged:true},{status:404})

 }finally{await h.close()}
}

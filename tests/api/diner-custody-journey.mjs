import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {dinerFixture} from './diner-fixture.mjs'
import {door,call,issue,verify,assertCustody} from './diner-client.mjs'
import {assertDinerPortability,assertDinerAudit} from './diner-portability.mjs'

export async function dinerCustodyJourney(){
 let now=Date.parse('2026-10-24T10:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now}),restored=await installation(),old=await installation()
 try{
  const f=await dinerFixture(h),input=f.input,b=f.same
  const extra=(await h.api('/api/public/book',{...input,startAt:'2026-10-30T10:00:00Z'},{as:'',status:201})).result
  const expiredCode=await issue(h,b,input.email);now+=15*60000
  await call(h,'verify',{code:expiredCode,acknowledged:true},{status:404})
  let session=await verify(h,b,input.email)
  await verify(h,extra,input.email)
  await call(h,'preferences',{token:session.token,favorite:true,preferences:'synthetic-placemat-1',acknowledged:true})
  const pendingAtExport=await issue(h,b,input.email)
  await assertCustody(h,pendingAtExport,'pm_diner_challenges')
  const challenges=(await h.db.prepare('SELECT * FROM pm_diner_challenges').all()).results
  assert.equal(challenges.length,1);assert.ok(challenges[0].expires_at>now)
  const before=(await h.api('/api/state')),guest=before.guests.find(g=>g.email===input.email),otherGuest=before.guests.find(g=>g.email==='guest1@example.test')
  const access=await h.api('/api/privacy/access',{guestId:guest.id})
  assert.equal(access.dinerAccounts.length,1)
  const events=before.state.audit.filter(e=>e.action.startsWith('diner.'))
  await assertDinerAudit(h,{bookingId:extra.id,events})
  const archive=await h.api('/api/backup')
  const text=JSON.stringify(archive)
  assert.ok(!text.includes(session.token));assert.ok(!text.includes(expiredCode))
  assert.ok(archive[0].excludedTables.includes('pm_diner_sessions'));assert.ok(text.includes('synthetic-placemat-1'))
  await assertDinerPortability(h,restored,archive,{account:access.dinerAccounts[0],bookings:[b.id,extra.id],guestId:guest.id,otherGuestId:otherGuest.id,at:new Date(now).toISOString(),secrets:[pendingAtExport,challenges[0].digest,session.token]})
  await call(restored,'account',{token:session.token},{status:404})
  const fresh=await verify(restored,b,input.email)
  assert.equal((await call(restored,'account',{token:fresh.token})).preferences,'synthetic-placemat-1')
  assert.equal(access.dinerAccounts[0].preferences,'synthetic-placemat-1')
  const csv=await (await h.request('/api/business-export/diner-accounts.csv')).text()
  assert.ok(csv.includes(input.email));assert.ok(csv.includes('synthetic-placemat-1'));assert.ok(!csv.includes(session.token))
  now+=86400000
  await call(h,'account',{token:session.token},{status:404})
  session=await verify(h,b,input.email)
  const pending=await issue(h,b,input.email)
  await h.command('booking.management.send',{bookingId:b.id,acknowledged:true})
  const managementToken=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
  const preview=await h.api('/api/public/booking-management/preview',{token:managementToken,action:'change',contact:{email:'changed@example.test'}},{as:''})
  await h.api('/api/public/booking-management/commit',{token:managementToken,previewId:preview.previewId,acknowledged:true},{as:''})
  await call(h,'verify',{code:pending,acknowledged:true},{status:404})
  assert.deepEqual((await call(h,'account',{token:session.token})).bookings.map(b=>b.id),[extra.id],'Changed contact removes only that booking from the existing account')
  await call(h,'/api/public/diner/management/status',{token:session.token,bookingId:b.id},{status:404})
  now+=60000
  const last=await verify(h,b,'changed@example.test')
  const pendingAtErase=await issue(h,b,'changed@example.test')
  await assertCustody(h,pendingAtErase,'pm_diner_challenges')
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_challenges WHERE expires_at>?').bind(now).first()).n,1)
  const beforeErase=(await h.api('/api/state')).state.audit.filter(e=>e.action.startsWith('diner.'))
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  await call(h,'account',{token:last.token},{status:404})
  await call(h,'verify',{code:pendingAtErase,acknowledged:true},{status:404})
  for(const table of ['pm_diner_challenges','pm_diner_sessions','pm_diner_accounts','pm_diner_bookings'])assert.equal((await h.db.prepare('SELECT count(*) AS n FROM '+table).first()).n,0,'Erasure removes live diner custody and portable records')
  await assertDinerAudit(h,{bookingId:extra.id,events:beforeErase,erased:true})
  const later=await h.api('/api/backup')
  assert.ok(!JSON.stringify(later).includes('synthetic-placemat-1'))
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_accounts').first()).n,0)
  await old.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})
  const blocked=await h.request(door+'request',{method:'POST',body:{bookingId:b.id,email:input.email,acknowledged:true},headers:{origin:'https://other.example.test'}})
  assert.equal(blocked.status,403)
 }finally{await h.close();await restored.close();await old.close()}
}

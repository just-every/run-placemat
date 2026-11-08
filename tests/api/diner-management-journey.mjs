import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {call,verify} from './diner-client.mjs'
import {csvRecords} from './business-fixture.mjs'

export async function dinerManagementJourney(){
 const {dinerFixture,dinerNow}=await import('./diner-fixture.mjs')
 let now=dinerNow
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now})
 try{
  const financialKinds=['payment-requests','refund-charges','refunds','refund-events','refund-notices','fee-consents','fee-assessments','fee-events','fee-disputes','card-guarantees','money-items','money-receipts','money-payouts','money-adjustments']
  const finances=async()=>Object.fromEntries(await Promise.all(financialKinds.map(async kind=>[kind,csvRecords(await (await h.request('/api/business-export/'+kind+'.csv')).text()).map(row=>JSON.parse(row.data_json))])))
  const f=await dinerFixture(h),first=await verify(h,f.same,f.input.email),second=await verify(h,f.same,f.input.email)
  const manage=(action,p={},status)=>call(h,'/api/public/diner/management/'+action,{token:first.token,bookingId:f.same.id,...p},status?{status}:{})
  await manage('status',{bookingId:f.sibling.id},404)
  await manage('status',{token:'synthetic-placemat-1'},404)
  const view=await manage('status')
  assert.equal(view.booking.id,f.same.id);assert.equal(view.guest.email,f.input.email)
  const before=(await h.api('/api/state')).state,financialBefore=await finances(),messagesBefore=h.messages.length
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
  assert.deepEqual(await finances(),financialBefore,'Changes and reconfirmation never create or alter financial records')
  assert.equal(h.messages.length,messagesBefore,'Diner management never sends an automatic message')
  // Paid bookings require the existing manager review, including money added after preview.
  const pending=await call(h,'/api/public/diner/management/preview',{token:second.token,bookingId:f.same.id,action:'cancel'})
  const owner=(await h.api('/auth/operators')).find(o=>o.role==='owner')
  await h.command('payment.request',{bookingId:f.same.id,amountCents:100,dueAt:'2026-10-29T10:00:00Z',followupOwnerId:owner.id,reason:'Guest agreed deposit requires manager review'})
  const obligations=await finances(),mailBeforeRefusal=h.messages.length
  assert.equal(obligations['payment-requests'].length,1)
  assert.equal(obligations['payment-requests'][0].bookingId,f.same.id)
  assert.equal(obligations['payment-requests'][0].amountCents,100)
  assert.equal(obligations['payment-requests'][0].currency,'usd')
  assert.equal(obligations['payment-requests'][0].state,'unpaid')
  assert.equal((await call(h,'/api/public/diner/management/status',{token:second.token,bookingId:f.same.id})).managerReviewRequired,true)
  await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:f.same.id,previewId:pending.previewId,acknowledged:true},{status:409})
  assert.equal((await call(h,'account',{token:second.token})).bookings[0].status,'booked')
  assert.deepEqual(await finances(),obligations,'A refused paid cancellation preserves the complete recorded obligation')
  assert.equal(h.messages.length,mailBeforeRefusal,'Paid manager review grants no automatic message authority')
  now+=60000
  const repeat=(await h.api('/api/public/book',{...f.input,startAt:'2026-10-30T09:00:00Z'},{as:'',status:201})).result
  await verify(h,repeat,f.input.email)
  const mailBeforeCancel=h.messages.length
  const review=await call(h,'/api/public/diner/management/preview',{token:second.token,bookingId:repeat.id,action:'cancel'})
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===repeat.id).status,'booked')
  const cancelled=await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:repeat.id,previewId:review.previewId,acknowledged:true})
  assert.equal(cancelled.booking.status,'cancelled')
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===f.same.id).status,'booked','Cancelling another verified booking leaves the paid reservation intact')
  await call(h,'/api/public/diner/management/commit',{token:second.token,bookingId:repeat.id,previewId:review.previewId,acknowledged:true},{status:404})

  assert.deepEqual(await finances(),obligations,'Cancelling a different verified reservation neither waives nor mutates recorded obligations')
  assert.equal(h.messages.length,mailBeforeCancel,'Confirmed cancellation sends no automatic message')
 }finally{await h.close()}
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,service} from './harness.mjs'
import {paymentEdge} from './payment-fixture.mjs'

const reviewed=(refund,email)=>({refundId:refund.id,outcome:refund.status,expectedContactEmail:email,acknowledged:true})
async function refundable(h,edge,booking,requestId){
 const chargeId=edge.charge(booking.id)
 await h.command('payment.charge-sync',{bookingId:booking.id,chargeId})
 return h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:1000,requestId,reason:'Synthetic guest refund request.'})
}
const tasks=(view,bookingId)=>view.state.bookings.find(b=>b.id===bookingId).handover??[]

test('Refund notices reserve one sender-owned delivery callback per attempt, including uncertain acceptance, and preserve human completion on replay and restore',async()=>{
 const edge=paymentEdge(),sent=[];let accept=true
 const h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},mailEdge:async request=>{
  sent.push(await request.json())
  return accept?Response.json({id:'synthetic-placemat-'+sent.length}):new Response(null,{status:503})
 }})
 let copy
 try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result,first=await refundable(h,edge,booking,'synthetic-placemat-2')
  const payload=reviewed(first,'guest0@example.test'),[notice,duplicate]=await Promise.all([h.command('payment.refund-notice',payload),h.command('payment.refund-notice',payload)])
  assert.equal(notice.id,duplicate.id);assert.equal(sent.length,1);assert.equal(notice.state,'accepted');assert.equal(notice.mailboxDelivery,'unconfirmed')
  let view=await h.api('/api/state'),held=tasks(view,booking.id)
  assert.equal(held.length,1);assert.equal(held[0].id,notice.followupTaskId);assert.equal(held[0].ownerId,view.actor.id);assert.equal(held[0].dueAt,notice.requestedAt)
  assert.match(held[0].text,/Venue owner/);assert.match(held[0].text,/Due now.*unconfirmed.*bounce/);assert.match(held[0].text,/Contact the guest directly.*record the human outcome/)
  assert.deepEqual(sent[0].to,['guest0@example.test']);assert.match(sent[0].text,/refund of \$10\.00 USD succeeded/)
  await h.command('booking.handover.complete',{bookingId:booking.id,taskId:held[0].id,outcome:'Guest confirmed receipt during a direct conversation.'})
  await h.command('payment.refund-notice',payload)
  view=await h.api('/api/state');held=tasks(view,booking.id);assert.equal(held.length,1);assert.equal(held[0].history.filter(e=>e.action==='completed').length,1);assert.equal(sent.length,1)

  accept=false
  const second=await refundable(h,edge,booking,'synthetic-placemat-3'),uncertain=await h.command('payment.refund-notice',reviewed(second,'guest0@example.test'))
  assert.equal(uncertain.state,'unconfirmed');assert.equal(sent.length,2)
  await h.command('payment.refund-notice',reviewed(second,'guest0@example.test'))
  view=await h.api('/api/state');held=tasks(view,booking.id);assert.equal(held.length,2);assert.equal(held.filter(t=>t.id===uncertain.followupTaskId).length,1);assert.equal(held[1].ownerId,view.actor.id);assert.equal(sent.length,2)
  assert.equal(edge.calls.filter(c=>c.path==='/v1/refunds'&&c.method==='POST').length,2,'Delivery follow-up never retries a processor refund')
  const archive=await h.api('/api/backup');copy=await installation()
  await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=await copy.api('/api/state');assert.deepEqual(tasks(restored,booking.id),held);assert.equal(restored.refundNotices.find(n=>n.id===uncertain.id).state,'unconfirmed')
  await h.command('guest.erase',{guestId:view.state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'})
  assert.equal(tasks(await h.api('/api/state'),booking.id).length,0,'Existing handover privacy removes guest delivery work on erasure')
  await h.command('payment.refund-notice',payload)
  assert.equal(tasks(await h.api('/api/state'),booking.id).length,0,'An idempotent receipt cannot resurrect erased follow-up');assert.equal(sent.length,2)
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('guest0@example.test'))
 }finally{if(copy)await copy.close();await h.close()}
})

test('Refund notices refuse changed or erased reservation contacts and send only to the freshly reviewed recorded email',async()=>{
 const edge=paymentEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result
  await h.command('booking.management.send',{bookingId:booking.id,acknowledged:true})
  const link=h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0],token=new URLSearchParams(new URL(link).hash.slice(1)).get('token')
  const preview=await h.api('/api/public/booking-management/preview',{token,action:'change',contact:{email:'synthetic-refund-contact@example.test'}},{as:''})
  await h.api('/api/public/booking-management/commit',{token,previewId:preview.previewId,acknowledged:true},{as:''})
  const first=await refundable(h,edge,booking,'synthetic-placemat-4'),before=h.messages.length
  const stale=await h.api('/api/commands',{command:'payment.refund-notice',payload:reviewed(first,'guest0@example.test')},{status:409})
  assert.match(stale.error,/contact changed/);assert.equal(h.messages.length,before);assert.equal((await h.api('/api/state')).refundNotices.length,0)
  await h.command('payment.refund-notice',{...reviewed(first,'synthetic-refund-contact@example.test'),channel:'sms'},{status:400})
  await h.command('payment.refund-notice',{...reviewed(first,'synthetic-refund-contact@example.test'),acknowledged:false},{status:400})
  assert.equal(h.messages.length,before)
  await h.command('payment.refund-notice',reviewed(first,'synthetic-refund-contact@example.test'))
  assert.deepEqual(h.messages.at(-1).to,['synthetic-refund-contact@example.test'])
  const second=await refundable(h,edge,booking,'synthetic-placemat-5'),view=await h.api('/api/state')
  await h.command('guest.erase',{guestId:view.state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'})
  const erased=await h.api('/api/commands',{command:'payment.refund-notice',payload:reviewed(second,'synthetic-refund-contact@example.test')},{status:409})
  assert.match(erased.error,/contact was erased/);assert.equal(h.messages.length,before+1);assert.equal((await h.api('/api/state')).refundNotices.length,1)
 }finally{await h.close()}
})

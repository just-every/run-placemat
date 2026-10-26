import test from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {merchantEdge} from './merchant-fixture.mjs'
import {feeApi,feeService,feeBooking,feePolicyInput,feeDecision} from './fee-fixture.mjs'

test('A hosted card authorization preserves exact consent, role-scoped held amounts, release, renewal and one permitted capture',async()=>{
 let now=Date.parse('2030-10-20T12:00:00Z')
 const edge=merchantEdge(),options={entry:'tests/api/clock-worker.mjs',clock:()=>now,stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}},h=await installation(options),copy=await installation(options)
 try{
  const {service}=await feeService(h,{startAt:'2030-10-21T18:00:00Z'}),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput({cancellation:{mode:'fixed',amountCents:2500},noShow:{mode:'fixed',amountCents:4000}})),manager=await h.signIn('synthetic-placemat-2@example.test','admin'),cost=(await h.api('/api/payments/merchant')).costDisclosure
  await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})
  const issue=async(extra={})=>(await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id,collectionMode:'authorization',authorizationCents:4000,...extra})).result
  await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id,collectionMode:'authorization',authorizationCents:4001},{status:400})
  await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id,collectionMode:'authorization',authorizationCents:4000},{as:manager,status:403})
  await h.command('booking.management.send',{bookingId:booking.id,acknowledged:true});const managementUrl=h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0],managementToken=new URLSearchParams(new URL(managementUrl).hash.slice(1)).get('token'),managementPreview=await h.api('/api/public/booking-management/preview',{token:managementToken,action:'cancel'},{as:''})
  const original=await issue(),token=new URL(original.guestUrl).hash.slice(6),guest=(action,body={},opts={})=>h.api('/api/public/card-guarantee/'+action,{token,...body},{as:'',...opts}),terms=await guest('status')
  assert.equal((await h.api('/api/public/booking-management/status',{token:managementToken},{as:''})).managerReviewRequired,true);await h.api('/api/public/booking-management/commit',{token:managementToken,previewId:managementPreview.previewId,acknowledged:true},{as:'',status:409});assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).status,'booked')
  assert.equal(terms.protection,'unprotected');assert.ok(terms.reviewText.includes('temporary card authorization of USD 40.00'));assert.equal(terms.collectionMode,'authorization')
  await guest('accept',{accept:true,reviewedText:policy.reviewText},{status:409})
  const hosted=await guest('accept',{accept:true,reviewedText:terms.reviewText}),session=edge.complete(hosted),intent=edge.fees.intents.get(session.payment_intent)
  intent.latest_charge.payment_method_details.card.capture_before=(now+3600000)/1000
  intent.amount_capturable++;await guest('sync',{}, {status:502});assert.equal((await guest('status')).protection,'unprotected');intent.amount_capturable--
  const held=await guest('sync');assert.equal(held.protection,'card-authorization');assert.equal(held.fundsHeldCents,4000);assert.ok(held.heldVerifiedAt);assert.ok(Date.parse(held.expiresAt)<=Date.parse(service.endAt))
  assert.equal((await h.api('/api/payments/merchant')).collections[0].fundsHeldCents,4000)
  intent.amount_capturable++;await guest('sync',{}, {status:502});assert.equal((await guest('status')).protection,'unprotected');intent.amount_capturable--;await guest('sync')
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:policy.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt))
  assert.equal((await h.api('/api/preshift?date='+date)).services[0].bookings[0].cardGuarantees[0].fundsHeldCents,4000)
  for(const door of ['/preshift?date='+date,'/api/preshift.pdf?date='+date]){
   const body=await (await h.request(door)).text();assert.ok(body.includes('Held guarantee amount: USD 40.00'));assert.ok(body.includes('Card authorization confirmed.'));assert.ok(!body.includes(intent.payment_method))
   assert.ok(!(await (await h.request(door,{as:manager})).text()).includes('Held guarantee amount'))
  }
  now+=3600000
  const expired=await guest('status');assert.equal(expired.protection,'unprotected');assert.equal(expired.authorizationState,'expired');assert.equal(expired.heldState,'release-unconfirmed')
  assert.equal((await h.api('/api/preshift?date='+date)).services[0].bookings[0].cardGuarantees[0].protection,'unprotected')
  await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id,collectionMode:'authorization',authorizationCents:4000},{status:409})
  const released=(await h.api('/api/payments/guarantees/end',{id:original.id})).result
  assert.equal(released.authorizationState,'expired');assert.equal(released.protection,'unprotected');assert.equal(released.fundsHeldCents,0);assert.equal(released.heldState,'released');assert.equal(intent.status,'canceled')
  assert.equal((await guest('status')).fundsHeldCents,0);const cancels=edge.calls.filter(c=>c.path.endsWith('/cancel')).length
  await h.api('/api/payments/guarantees/end',{id:original.id});assert.equal(edge.calls.filter(c=>c.path.endsWith('/cancel')).length,cancels)
  const renewed=await issue(),renewedToken=new URL(renewed.guestUrl).hash.slice(6);await guest('status',{}, {status:404})
  const renewedTerms=await h.api('/api/public/card-guarantee/status',{token:renewedToken},{as:''}),renewedHosted=await h.api('/api/public/card-guarantee/accept',{token:renewedToken,accept:true,reviewedText:renewedTerms.reviewText},{as:''}),renewedSession=edge.complete(renewedHosted)
  edge.fees.intents.get(renewedSession.payment_intent).latest_charge.payment_method_details.card.capture_before=(now+2*86400000)/1000
  await h.api('/api/public/card-guarantee/sync',{token:renewedToken},{as:''})
  const archive=await h.api('/api/backup');await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=(await copy.api('/api/payments/guarantees')).guarantees.find(g=>g.id===renewed.id)
  assert.equal(restored.protection,'unprotected');assert.equal(restored.fundsHeldCents,4000)
  const csv=await (await h.request('/api/business-export/card-guarantees.csv')).text();assert.ok(csv.includes(renewed.id)&&csv.includes('4000'));assert.ok(csv.includes(renewedSession.payment_intent))
  assert.ok(!JSON.stringify(archive).includes('synthetic-placemat-held-method-'))
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Guest cancelled under the accepted policy.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'});assert.equal(preview.chargeAllowed,true);assert.equal(preview.amountCents,2500)
  const decision=feeDecision(preview),renewedIntent=edge.fees.intents.get(renewedSession.payment_intent);renewedIntent.amount_capturable++;await feeApi(h,'fees',decision,{status:502});assert.equal(edge.calls.filter(c=>c.path.endsWith('/capture')).length,0);renewedIntent.amount_capturable--;edge.loseNextCapture();await feeApi(h,'fees',decision,{status:502})
  assert.equal(edge.calls.filter(c=>c.path.endsWith('/capture')).length,1)
  await h.api('/api/payments/guarantees/end',{id:renewed.id},{status:409})
  const charged=await feeApi(h,'fees',decision);assert.equal(charged.status,'succeeded');assert.equal(charged.amountCents,2500);assert.equal(charged.processorId,renewedSession.payment_intent)
  assert.equal((await feeApi(h,'fees',decision)).id,charged.id);assert.equal(edge.calls.filter(c=>c.path.endsWith('/capture')).length,1)
  assert.equal(edge.calls.filter(c=>c.path==='/v1/payment_intents'&&c.method==='POST').length,0)
  await h.api('/api/payments/merchant/sync',{requestId:renewed.id})
  const final=(await h.api('/api/payments/guarantees')).guarantees.find(g=>g.id===renewed.id)
  assert.equal(final.authorizationState,'expired');assert.equal(final.fundsHeldCents,0);assert.equal(final.heldState,'captured')
  await h.command('guest.erase',{guestId:booking.guestId,confirm:'ERASE'})
  const retained=await h.api('/api/backup'),guarantees=retained.filter(p=>p.kind==='part').flatMap(p=>p.items).filter(i=>i.table==='pm_card_guarantees').map(i=>i.row)
  assert.ok(guarantees.every(g=>g.review_text===''&&g.booking_snapshot==='{}'));assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM pm_stripe_collection_custody').first()).n,0)
  assert.equal(h.messages.length,2)
 }finally{await Promise.all([h.close(),copy.close()])}
})

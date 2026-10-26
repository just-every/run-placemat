import test from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {feePolicyInput,feeApi,feeService,feeBooking,consentBooking,feeDecision} from './fee-fixture.mjs'
const configured=edge=>installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})

test('Shortening a reviewed service permanently restricts both attested and guest-captured fee authority',async()=>{
 const {merchantEdge}=await import('./merchant-fixture.mjs'),edge=merchantEdge(),h=await configured(edge)
 try{
  const {service}=await feeService(h),attested=await feeBooking(h,service),captured=await feeBooking(h,service,2),policy=await feeApi(h,'fee-policy',feePolicyInput())
  await consentBooking(h,edge.fees,attested,policy)
  const cost=(await h.api('/api/payments/merchant')).costDisclosure
  await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})
  const issued=(await h.api('/api/payments/guarantees/issue',{bookingId:captured.id,policyId:policy.id})).result,token=new URL(issued.guestUrl).hash.slice(6)
  const collection=await h.api('/api/public/card-guarantee/accept',{token,accept:true,reviewedText:policy.reviewText},{as:''});edge.complete(collection)
  await h.api('/api/public/card-guarantee/sync',{token},{as:''})
  const shorter=new Date(Date.parse(service.endAt)-3600000).toISOString(),amend=async endAt=>{
   const proposal=await h.command('proposal.prepare',{kind:'service.amend',plan:{serviceId:service.id,changes:{endAt}},reason:'Preserve the agreed earlier fee deadline.'})
   await h.command('proposal.approve',{proposalId:proposal.id})
  }
  await amend(shorter)
  const restricted=(await h.api('/api/state')).feeWork
  assert.equal(restricted.consents[0].expiresAt,shorter);assert.equal(restricted.guarantees[0].expiresAt,shorter)
  assert.equal((await h.api('/api/public/card-guarantee/status',{token},{as:''})).expiresAt,shorter)
  await amend(service.endAt)
  const extended=(await h.api('/api/state')).feeWork
  assert.equal(extended.consents[0].expiresAt,shorter);assert.equal(extended.guarantees[0].expiresAt,shorter)
  assert.equal((await h.api('/api/public/card-guarantee/status',{token},{as:''})).expiresAt,shorter)
  const history=(await h.api('/api/audit')).rows.filter(e=>e.action==='payment.authority-shortened')
  assert.equal(history.length,2);assert.ok(history.every(e=>e.actor===extended.consents[0].actorId&&e.changes[0].before.expiresAt===service.endAt&&e.changes[0].after.expiresAt===shorter))
  const csv=await (await h.request('/api/business-export/card-guarantees.csv')).text();assert.ok(csv.includes(shorter))
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:policy.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt))
  for(const door of ['/preshift?date='+date,'/api/preshift.pdf?date='+date])assert.ok((await (await h.request(door)).text()).includes('No funds held'))
 }finally{await h.close()}
})

test('An already submitted guest-consented fee reconciles after expiry without a new processor operation',async()=>{
 const {merchantEdge}=await import('./merchant-fixture.mjs'),edge=merchantEdge();let pending=true
 const h=await installation({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:async request=>{
  const response=await edge.edge(request)
  if(pending&&request.method==='POST'&&new URL(request.url).pathname==='/v1/payment_intents'){
   pending=false;return Response.json({...await response.json(),status:'processing',latest_charge:null})
  }
  return response
 }})
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),cost=(await h.api('/api/payments/merchant')).costDisclosure
  await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})
  const issued=(await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id})).result,token=new URL(issued.guestUrl).hash.slice(6),collection=await h.api('/api/public/card-guarantee/accept',{token,accept:true,reviewedText:policy.reviewText},{as:''})
  edge.complete(collection);await h.api('/api/public/card-guarantee/sync',{token},{as:''})
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Guest cancellation under the original accepted terms.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'}),decision=feeDecision(preview),submitted=await feeApi(h,'fees',decision)
  assert.equal(submitted.status,'pending');assert.ok(submitted.processorId)
  await h.api('/api/payments/guarantees/end',{id:issued.id})
  const posts=edge.calls.filter(c=>c.method==='POST').length,reconciled=await feeApi(h,'fees',decision)
  assert.equal(reconciled.status,'succeeded');assert.equal(reconciled.id,submitted.id);assert.equal(reconciled.processorId,submitted.processorId)
  assert.equal(edge.calls.filter(c=>c.method==='POST').length,posts);assert.equal(edge.fees.intents.size,1)
  assert.equal((await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'})).chargeAllowed,false)
  assert.equal((await feeApi(h,'fees',decision)).chargeId,reconciled.chargeId)
 }finally{await h.close()}
})


test('The saved service-end boundary expires a guarantee and requires owned recollection without extending authority',async()=>{
 const {merchantEdge}=await import('./merchant-fixture.mjs'),edge=merchantEdge();let now=Date.parse('2030-10-20T12:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now,stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 try{
  const {service}=await feeService(h,{startAt:'2030-10-21T18:00:00Z'}),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),cost=(await h.api('/api/payments/merchant')).costDisclosure
  await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})
  const issued=(await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id})).result,token=new URL(issued.guestUrl).hash.slice(6),collection=await h.api('/api/public/card-guarantee/accept',{token,accept:true,reviewedText:policy.reviewText},{as:''})
  edge.complete(collection);await h.api('/api/public/card-guarantee/sync',{token},{as:''})
  now=Date.parse(service.endAt)-1
  const current=(await h.api('/api/payments/guarantees')).guarantees[0]
  assert.equal(current.protection,'tokenized-card-guarantee');assert.equal(current.expiresAt,service.endAt)
  now=Date.parse(service.endAt)
  const expired=(await h.api('/api/payments/guarantees')).guarantees[0]
  assert.equal(expired.authorizationState,'expired');assert.equal(expired.protection,'unprotected');assert.equal(expired.expiresAt,current.expiresAt)
  assert.equal(expired.recollection.ownerId,current.actorId);assert.equal(expired.recollection.requestedAt,null)
  await h.api('/api/public/card-guarantee/status',{token},{as:'',status:404})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'no_show',occurredAt:new Date(now-1000).toISOString()})
  assert.equal(preview.authorizationCurrent,false);assert.equal(preview.chargeAllowed,false)
  await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id},{status:409})
  const sheet=await h.api('/api/preshift?date=2030-10-21'),g=sheet.services[0].bookings[0].cardGuarantees[0]
  assert.equal(g.authorizationState,'expired');assert.equal(g.protection,'unprotected');assert.equal(g.fundsHeldCents,0)
  assert.equal(h.messages.length,0);assert.equal(edge.fees.intents.size,0)
 }finally{await h.close()}
})

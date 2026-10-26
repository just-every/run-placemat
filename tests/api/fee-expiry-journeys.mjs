import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {unstable_splitSqlQuery} from 'wrangler'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
import {installation} from './harness.mjs'
import {feeEdge,feePolicyInput,feeApi,feeService,feeBooking,consentBooking,feeDecision} from './fee-fixture.mjs'
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


test('Legacy unbounded fee consent expires on upgrade and an archive missing its deadline cannot restore charging authority',async()=>{
 const edge=feeEdge(),h=await configured(edge),copy=await configured(edge)
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),{consent}=await consentBooking(h,edge,booking,policy)
  assert.equal((await h.api('/api/state')).feeWork.consents[0].authorizationState,'current')
  // A real prior-schema fixture: all business facts were created through HTTP;
  // removing the two later columns leaves the pre-expiry consent table.
  await h.db.prepare('ALTER TABLE pm_fee_consents DROP COLUMN expires_at').run()
  await h.db.prepare('ALTER TABLE pm_fee_consents DROP COLUMN recollection_requested_at').run()
  await h.db.prepare("UPDATE pm_fee_events SET after_data=json_remove(after_data,'$.expiresAt','$.authorizationState','$.recollection') WHERE subject_id=?").bind(consent.id).run()
  const migration=await readFile('migrations/core/0041_fee_expiry.sql','utf8')
  await h.db.batch(unstable_splitSqlQuery(migration).map(sql=>h.db.prepare(sql)))
  const upgraded=(await h.api('/api/state')).feeWork.consents[0]
  assert.equal(upgraded.authorizationState,'expired');assert.equal(upgraded.expiresAt,upgraded.recordedAt);assert.equal(upgraded.protection,'unproved')
  const recollection=await feeApi(h,'fee-recollection',{bookingId:booking.id});assert.equal(recollection.recollection.ownerId,consent.actorId);assert.ok(recollection.recollection.requestedAt)
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Recorded cancellation cannot revive unbounded legacy authority.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'});assert.equal(preview.authorizationCurrent,false);assert.equal(preview.chargeAllowed,false)
  await feeApi(h,'fees',feeDecision(preview),{status:409});assert.equal(edge.intents.size,0)
  const archive=await h.api('/api/backup'),missing=structuredClone(archive),row=missing.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_fee_consents'&&i.row.id===consent.id)
  delete row.row.expires_at
  const content=new ContentVerifier(missing[0]),integrity=new ArchiveVerifier(missing[0])
  for(let i=1;i<missing.length-1;i++){missing[i]=await makePart(missing[i].index,missing[i].items);integrity.add(missing[i]);for(const item of missing[i].items)content.add(item)}
  missing.at(-1).contentHash=content.digest();missing.at(-1).archiveHash=integrity.digest()
  await copy.api('/api/restore',{archive:missing,confirm:'RESTORE'},{status:400});assert.equal((await copy.api('/api/state')).state.bookings.length,0)
  await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=(await copy.api('/api/state')).feeWork.consents[0];assert.equal(restored.authorizationState,'expired');assert.equal(restored.expiresAt,upgraded.expiresAt)
  assert.equal((await feeApi(copy,'fee-preview',{bookingId:booking.id,kind:'late_cancel'})).executionReady,false);assert.equal(edge.intents.size,0);assert.equal(h.messages.length,0)
 }finally{await Promise.all([h.close(),copy.close()])}
})

import './card-hold-journey.mjs'
import './fee-expiry-journeys.mjs'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {feeEdge,feePolicyInput,feeApi,feeService,feeBooking,consentBooking,feeDecision} from './fee-fixture.mjs'

function csvRecords(csv) {
 const rows=[],row=[];let value='',quoted=false
 for(let i=0;i<csv.length;i++) {
  const char=csv[i]
  if(char==='"'){if(quoted&&csv[i+1]==='"'){value+='"';i++}else quoted=!quoted}
  else if(char===','&&!quoted){row.push(value);value=''}
  else if(char==='\r'&&!quoted&&csv[i+1]==='\n'){row.push(value);rows.push([...row]);row.length=0;value='';i++}
  else value+=char
 }
 const [header,...data]=rows
 return data.map(values=>Object.fromEntries(header.map((name,index)=>[name,values[index]])))
}

const configured=edge=>installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})

test('Fee consent records the owner attestation to exact immutable terms and a verified off-session setup; other actors cannot decide fees',async()=>{
 const edge=feeEdge(),h=await configured(edge)
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),manager=await h.signIn('synthetic-fee-manager@example.test','admin')
  for(const path of ['fee-policy','fee-consent','fee-preview','fees']){
   await feeApi(h,path,{}, {as:'',status:401});await feeApi(h,path,{}, {as:manager,status:403})
  }
  const payload={bookingId:booking.id,policyId:policy.id,reviewedPolicyVersion:policy.version,reviewedPolicyText:policy.reviewText,acceptedAt:new Date().toISOString(),attest:true,evidence:'Synthetic recorded call agrees the displayed policy.',setupIntentId:edge.setup(booking.id,policy.id)}
  await feeApi(h,'fee-consent',{...payload,reviewedPolicyText:policy.reviewText+' changed'},{status:409})
  await feeApi(h,'fee-consent',{...payload,attest:false},{status:409})
  const badSetup=edge.setup(booking.id,policy.id,{usage:'on_session'})
  await feeApi(h,'fee-consent',{...payload,setupIntentId:badSetup},{status:409})
  await h.command('booking.management.send',{bookingId:booking.id,acknowledged:true});const link=h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0],token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');const guestPreview=await h.api('/api/public/booking-management/preview',{token,action:'cancel'},{as:''});
  const consent=await feeApi(h,'fee-consent',payload)
  assert.equal((await h.api('/api/public/booking-management/status',{token},{as:''})).managerReviewRequired,true);await h.api('/api/public/booking-management/commit',{token,previewId:guestPreview.previewId,acknowledged:true},{as:'',status:409});assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).status,'booked');
  assert.equal(consent.source,'owner-attested');assert.equal(consent.reviewText,policy.reviewText);assert.equal(consent.bookingSnapshot.partySize,booking.partySize)
  const newer=await feeApi(h,'fee-policy',feePolicyInput({cancellation:{mode:'fixed',amountCents:9900}}))
  const work=(await h.api('/api/state')).feeWork
  assert.equal(work.policies.length,2);assert.equal(work.consents[0].policyId,policy.id);assert.ok(newer.version>policy.version)
  assert.ok(!JSON.stringify(work).includes('synthetic-placemat-method-'));assert.ok(!JSON.stringify(work).includes('synthetic-placemat-customer-'))
  await feeApi(h,'fee-consent',payload,{status:409})
  const hypothetical=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'})
  assert.equal(hypothetical.policyId,policy.id);assert.equal(hypothetical.actionable,false)
  await feeApi(h,'fees',feeDecision(hypothetical),{status:409});assert.equal(edge.intents.size,0)
  assert.equal((await h.api('/api/state',undefined,{as:manager})).feeWork,undefined)
 }finally{await h.close()}
})

test('Venue-local cancellation previews cross DST by calendar date, preserve exact-cutoff grace, and refuse unresolved gaps or repeated times',async()=>{
 const edge=feeEdge(),h=await configured(edge)
 try{
  let year=new Date().getUTCFullYear();const spring=y=>{const first=new Date(Date.UTC(y,2,1)).getUTCDay();return 1+(7-first)%7+7}
  if(Date.now()>=Date.UTC(year,2,spring(year)))year++
  const day=String(spring(year)).padStart(2,'0'),before=String(spring(year)-1).padStart(2,'0'),startAt=`${year}-03-${day}T22:00:00.000Z`,{service}=await feeService(h,{startAt}),booking=await feeBooking(h,service)
  const policy=await feeApi(h,'fee-policy',feePolicyInput({cutoffDaysBefore:1,cutoffLocalTime:'18:00',graceMinutes:15}))
  await consentBooking(h,edge,booking,policy)
  const cutoff=`${year}-03-${before}T23:00:00.000Z`
  const at=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel',occurredAt:cutoff})
  assert.equal(at.cutoffAt,cutoff);assert.equal(Date.parse(startAt)-Date.parse(at.cutoffAt),23*3600000);assert.equal(at.amountCents,0)
  const after=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel',occurredAt:new Date(Date.parse(cutoff)+1).toISOString()})
  assert.equal(after.amountCents,4000);assert.equal(after.actionable,false);assert.equal(after.chargeAllowed,false)
  const exempt=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel',occurredAt:startAt,exemptionCode:'venue-cancelled'})
  assert.equal(exempt.amountCents,0);assert.equal(exempt.exemption.code,'venue-cancelled')
  const grace=new Date(Date.parse(startAt)+15*60000).toISOString()
  assert.equal((await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'no_show',occurredAt:grace})).amountCents,0)
  assert.equal((await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'no_show',occurredAt:new Date(Date.parse(grace)+1).toISOString()})).amountCents,3500)
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Guest cancelled before the agreed venue-local cutoff.'})
  const onTime=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'})
  assert.equal(onTime.actionable,true);assert.equal(onTime.amountCents,0);assert.equal(onTime.chargeAllowed,false)
  await feeApi(h,'fees',feeDecision(onTime),{status:409})
  assert.equal((await feeApi(h,'fees',feeDecision(onTime,'waive'))).amountCents,0)
  // A separate unbound reservation reviews new policy candidates; its existing agreement is never replaced.
  const another=await feeBooking(h,service,2)
  await feeApi(h,'fee-policy',feePolicyInput({cutoffDaysBefore:0,cutoffLocalTime:'02:30'}))
  await feeApi(h,'fee-preview',{bookingId:another.id,kind:'late_cancel',occurredAt:startAt},{status:400})
  const fallFirst=new Date(Date.UTC(year,10,1)).getUTCDay(),fallDay=1+(7-fallFirst)%7,fallStart=`${year}-11-${String(fallDay).padStart(2,'0')}T23:00:00.000Z`
  const fallService=(await feeService(h,{startAt:fallStart})).service,fallBooking=await feeBooking(h,fallService,3)
  await feeApi(h,'fee-policy',feePolicyInput({cutoffDaysBefore:0,cutoffLocalTime:'01:30'}))
  await feeApi(h,'fee-preview',{bookingId:fallBooking.id,kind:'late_cancel',occurredAt:fallStart},{status:400})
  await feeApi(h,'fee-policy',feePolicyInput({cutoffDaysBefore:0,cutoffLocalTime:'01:30',cutoffOffset:'-04:00'}))
  const repeated=await feeApi(h,'fee-preview',{bookingId:fallBooking.id,kind:'late_cancel',occurredAt:fallStart})
  assert.equal(repeated.cutoffAt,`${year}-11-${String(fallDay).padStart(2,'0')}T05:30:00.000Z`)
  const winterService=(await feeService(h,{startAt:`${year}-12-01T23:00:00.000Z`})).service,winterBooking=await feeBooking(h,winterService,4)
  const ordinary=await feeApi(h,'fee-preview',{bookingId:winterBooking.id,kind:'late_cancel',occurredAt:winterService.startAt})
  assert.equal(ordinary.cutoffAt,`${year}-12-01T06:30:00.000Z`)
  assert.equal(edge.intents.size,0)
 }finally{await h.close()}
})

test('Recorded cancellation and no-show decisions capture each violation once, waive another, and reconcile fixed close CSV/PDF including fee refunds',async()=>{
 const edge=feeEdge(),h=await configured(edge)
 try{
  const {service}=await feeService(h,{startAt:new Date(Date.now()+12000).toISOString()}),policy=await feeApi(h,'fee-policy',feePolicyInput()),bookings=[]
  for(let i=0;i<3;i++){const b=await feeBooking(h,service,i);await consentBooking(h,edge,b,policy);bookings.push(b)}
  const unconsented=await feeBooking(h,service,4);bookings.push(unconsented);await h.command('booking.stage',{bookingId:unconsented.id,stage:'cancelled',reason:'Guest canceled without an agreed fee policy.'});const noAgreementPreview=await feeApi(h,'fee-preview',{bookingId:unconsented.id,kind:'late_cancel'});assert.equal(noAgreementPreview.chargeAllowed,false);const noAgreementWaiver=await feeApi(h,'fees',feeDecision(noAgreementPreview,'waive'));assert.equal(noAgreementWaiver.amountCents,0,'Without an agreed obligation, a waiver must not invent revenue forgone');
  await h.command('booking.stage',{bookingId:bookings[0].id,stage:'cancelled',reason:'Guest cancelled after the agreed cutoff.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:bookings[0].id,kind:'late_cancel'});assert.equal(preview.chargeAllowed,true)
  const decision=feeDecision(preview)
  edge.loseNextConfirmation();await feeApi(h,'fees',decision,{status:502});assert.equal(edge.intents.size,1)
  const charged=await feeApi(h,'fees',decision),again=await feeApi(h,'fees',decision)
  assert.equal(charged.status,'succeeded');assert.equal(charged.amountCents,4000);assert.equal(charged.chargeId,again.chargeId);assert.equal(edge.intents.size,1)
  await feeApi(h,'fees',{...decision,requestId:'synthetic-new-request-same-violation'},{status:409});assert.equal(edge.intents.size,1)
  await feeApi(h,'fees',{...decision,reason:'Changed replay'},{status:409})
  await h.command('booking.stage',{bookingId:bookings[1].id,stage:'cancelled',reason:'Guest cancellation documented for an owner waiver.'})
  const waiverPreview=await feeApi(h,'fee-preview',{bookingId:bookings[1].id,kind:'late_cancel'}),waived=await feeApi(h,'fees',feeDecision(waiverPreview,'waive'))
  assert.equal(waived.status,'waived');assert.equal(waived.amountCents,4000);assert.equal(edge.intents.size,1)
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(service.startAt)-Date.now()+30)))
  await h.command('booking.stage',{bookingId:bookings[2].id,stage:'no-show',reason:'The host observed no arrival after the recorded grace.'})
  const noShowPreview=await feeApi(h,'fee-preview',{bookingId:bookings[2].id,kind:'no_show'}),noShow=await feeApi(h,'fees',feeDecision(noShowPreview))
  assert.equal(noShow.status,'succeeded');assert.equal(noShow.amountCents,3500);assert.equal(edge.intents.size,2)
  const dispute=await feeApi(h,'fees',{action:'dispute',assessmentId:charged.id,reason:'Guest queried the recorded cancellation time.',evidence:'Retained guest correspondence.'})
  assert.equal(dispute.status,'recorded');assert.equal(edge.intents.size,2)
  edge.charges.get(noShow.chargeId).amount_refunded=500; // A processor-confirmed prior refund is already known when the fee is synchronized.
  await h.command('payment.charge-sync',{bookingId:bookings[2].id,chargeId:noShow.chargeId})
  await h.command('payment.refund',{bookingId:bookings[2].id,chargeId:noShow.chargeId,amountCents:1000,requestId:'synthetic-fee-refund-1',reason:'Owner approved a partial goodwill fee refund.'})
  await h.command('service.close',{serviceId:service.id,reason:'All attendance and fees reviewed.'})
  const url='/api/reports/closed?serviceId='+service.id,report=await h.api(url),fees=report.original.fees
  assert.equal(fees.chargedCents,7500);assert.equal(fees.waivedCents,4000);assert.equal(fees.refundedCents,1500);assert.equal(fees.pendingCents,0)
  assert.equal(fees.rows.find(row=>row.assessmentId===charged.id).bookingId,bookings[0].id)
  const csv=await (await h.request('/api/reports/closed.csv?serviceId='+service.id)).text()
  const rows=csvRecords(csv);assert.deepEqual(rows.map(r=>r.bookingId).sort(),bookings.map(b=>b.id).sort());for(const [column,total]of [['chargedFeeCents',7500],['waivedFeeCents',4000],['refundedFeeCents',1500],['pendingFeeCents',0]])assert.equal(rows.reduce((n,r)=>n+Number(r[column]),0),total)
  for(const b of bookings)assert.ok(csv.includes(b.id))
  const pdf=await h.request('/api/reports/closed.pdf?serviceId='+service.id);assert.equal(pdf.status,200);const pdfText=await pdf.text();assert.match(pdfText,/Charged \$75.00 USD/);assert.match(pdfText,/waived \$40.00 USD/);assert.match(pdfText,/refunded \$15.00 USD/)
  const state=await h.api('/api/state'),ownerId=state.actor.id
  assert.equal(state.feeWork.assessments.find(row=>row.id===charged.id).actorId,ownerId);assert.equal(charged.policyId,policy.id)
  const audit=await h.api('/api/audit'),auditText=JSON.stringify(audit);assert.ok(auditText.includes(charged.id));assert.ok(auditText.includes(policy.id));assert.ok(auditText.includes(ownerId))
  await h.command('payment.refund',{bookingId:bookings[2].id,chargeId:noShow.chargeId,amountCents:500,requestId:'synthetic-fee-refund-2',reason:'A later adjustment remains outside the fixed close snapshot.'})
  assert.deepEqual((await h.api(url)).original,report.original)
 }finally{await h.close()}
})

test('Fee archives preserve auditable decisions without payment authority, and guest erasure clears retained fee evidence',async()=>{
 const edge=feeEdge(),h=await configured(edge),copy=await configured(edge)
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),{payload}=await consentBooking(h,edge,booking,policy,{evidence:'Synthetic private consent evidence to erase.'})
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Recorded late cancellation.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'}),decision=feeDecision(preview,'charge',{reason:'Synthetic private reason to erase.',evidence:'Synthetic private evidence to erase.'})
  edge.loseNextConfirmation();await feeApi(h,'fees',decision,{status:502})
  const archive=await h.api('/api/backup'),serialized=JSON.stringify(archive)
  assert.ok(!serialized.includes(payload.setupIntentId));assert.ok(!serialized.includes('synthetic-placemat-customer-'));assert.ok(!serialized.includes('synthetic-placemat-method-'))
  const invalid=structuredClone(archive),policyRow=invalid.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_fee_policies');assert.ok(policyRow);const corrupt=JSON.parse(policyRow.row.data);corrupt.cancellation.amountCents=-1;policyRow.row.data=JSON.stringify(corrupt);
  const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0]);for(let i=1;i<invalid.length-1;i++){invalid[i]=await makePart(invalid[i].index,invalid[i].items);integrity.add(invalid[i]);for(const item of invalid[i].items)content.add(item)}invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest();
  await copy.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400});assert.equal((await copy.api('/api/state')).feeWork.policies.length,0);
  for(const kind of ['fee-policies','fee-consents','fee-assessments','fee-events','fee-disputes']){const csv=await (await h.request('/api/business-export/'+kind+'.csv')).text();assert.ok(!csv.includes(payload.setupIntentId)&&!csv.includes('synthetic-placemat-method-'));}
  await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  assert.equal((await copy.api('/api/state')).feeWork.consents[0].reviewText,policy.reviewText)
  await feeApi(copy,'fees',decision,{status:409});assert.equal(edge.intents.size,1)
  await h.command('guest.erase',{guestId:booking.guestId,confirm:'ERASE'})
  const retained=JSON.stringify(await h.api('/api/backup'))+JSON.stringify((await h.api('/api/state')).feeWork)+JSON.stringify(await h.api('/api/audit'))
  for(const privateText of ['Synthetic private consent evidence to erase.','Synthetic private reason to erase.','Synthetic private evidence to erase.'])assert.ok(!retained.includes(privateText))
  await feeApi(h,'fees',decision,{status:409});assert.equal(edge.intents.size,1)
 }finally{await Promise.all([h.close(),copy.close()])}
})


test('Finite fee authority expires without claiming held funds, assigns renewed collection once, and cannot revive through previews or restore',async()=>{
 const edge=feeEdge(),h=await configured(edge),copy=await configured(edge)
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),manager=await h.signIn('synthetic-placemat-manager@example.test','admin')
  const {consent,payload}=await consentBooking(h,edge,booking,policy,{evidence:'synthetic-placemat-authorization-evidence-1'})
  assert.equal(consent.expiresAt,service.endAt);assert.equal(consent.protection,'unproved');assert.equal(consent.fundsHeldCents,0)
  for(const path of ['fee-expiry','fee-recollection']){
   await feeApi(h,path,{bookingId:booking.id},{as:'',status:401})
   await feeApi(h,path,{bookingId:booking.id},{as:manager,status:403})
   await h.command('payment.'+path,{bookingId:booking.id},{as:manager,status:403})
  }
  await feeApi(h,'fee-recollection',{bookingId:booking.id},{status:409})
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:(await h.api('/api/state')).state.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt)),sheet='/api/preshift?date='+date
  const ownerSheet=await h.api(sheet),authorization=ownerSheet.services[0].bookings[0].feeAuthorizations[0]
  assert.equal(authorization.protection,'unproved');assert.equal(authorization.authorizationState,'current')
  assert.deepEqual((await h.api(sheet,undefined,{as:manager})).services[0].bookings[0].feeAuthorizations,[])
  const expired=await feeApi(h,'fee-expiry',{bookingId:booking.id})
  assert.equal(expired.authorizationState,'expired');assert.equal(expired.recollection.ownerId,consent.actorId)
  const [requested,again]=await Promise.all([feeApi(h,'fee-recollection',{bookingId:booking.id}),feeApi(h,'fee-recollection',{bookingId:booking.id})])
  assert.equal(requested.recollection.requestedAt,again.recollection.requestedAt)
  assert.equal(requested.expiresAt,expired.expiresAt);assert.equal(requested.protection,'unproved');assert.equal(edge.intents.size,0)
  for(const door of ['/preshift?date='+date,'/api/preshift.pdf?date='+date]){
   const text=await (await h.request(door)).text();assert.ok(text.includes('expired'));assert.ok(text.includes('No funds held'));assert.ok(text.includes('Renewed collection: requested'))
   const denied=await (await h.request(door,{as:manager})).text();assert.ok(!denied.includes('Fee authorization:')&&!denied.includes(consent.id))
  }
  const audit=await h.api('/api/audit');assert.equal(audit.rows.filter(e=>e.action==='payment.fee-recollection').length,1)
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Guest cancellation after authorization ended.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'})
  assert.equal(preview.authorizationCurrent,false);assert.equal(preview.chargeAllowed,false);assert.equal(preview.executionReady,false)
  await feeApi(h,'fees',feeDecision(preview),{status:409});assert.equal(edge.intents.size,0)
  const pendingBooking=await feeBooking(h,service,2);await consentBooking(h,edge,pendingBooking,policy)
  await h.command('booking.stage',{bookingId:pendingBooking.id,stage:'cancelled',reason:'Recorded cancellation before the finite authority expired.'})
  const pendingPreview=await feeApi(h,'fee-preview',{bookingId:pendingBooking.id,kind:'late_cancel'}),pendingDecision=feeDecision(pendingPreview)
  edge.loseNextConfirmation();await feeApi(h,'fees',pendingDecision,{status:502});assert.equal(edge.intents.size,1)
  await feeApi(h,'fee-expiry',{bookingId:pendingBooking.id});const posts=edge.calls.filter(c=>c.method==='POST').length
  await feeApi(h,'fees',pendingDecision,{status:409});assert.equal(edge.calls.filter(c=>c.method==='POST').length,posts,'Expiry prevents a saved pending decision from making another processor attempt')
  const archive=await h.api('/api/backup');await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=(await copy.api('/api/state')).feeWork.consents[0];assert.equal(restored.authorizationState,'expired');assert.equal(restored.expiresAt,expired.expiresAt)
  assert.ok((await (await h.request('/api/business-export/fee-consents.csv')).text()).includes('recollection_requested_at'))
  assert.ok(!JSON.stringify(archive).includes(payload.setupIntentId))
  await h.command('guest.erase',{guestId:booking.guestId,confirm:'ERASE'})
  assert.ok(!(await (await h.request('/preshift?date='+date)).text()).includes('Fee authorization:'))
  await feeApi(h,'fee-recollection',{bookingId:booking.id},{status:409})
  const retained=JSON.stringify(await h.api('/api/backup'))+JSON.stringify(await h.api('/api/audit'))
  assert.ok(!retained.includes(payload.evidence));assert.equal(h.messages.length,1,'Only the explicit manager invitation sent mail; recollection never sends')
 }finally{await Promise.all([h.close(),copy.close()])}
})


test('Merchant hosted collection keeps card custody private and disconnect blocks collection without hiding obligations',async()=>{
 const sessions=new Map(),setups=new Map(),calls=[],account={object:'account',id:'synthetic-placemat-merchant-1',country:'US',default_currency:'usd',charges_enabled:true,payouts_enabled:true,details_submitted:true,livemode:false}
 const edge=async request=>{
  const u=new URL(request.url);calls.push({path:u.pathname,method:request.method})
  if(u.pathname==='/v1/country_specs/US')return Response.json({object:'country_spec',id:'US',supported_payment_currencies:['usd']})
  if(u.pathname==='/v1/account')return Response.json(account)
  if(request.method==='POST'&&u.pathname==='/v1/checkout/sessions'){
   const body=new URLSearchParams(await request.text()),requestId=body.get('client_reference_id'),session={object:'checkout.session',id:'synthetic-placemat-session-'+sessions.size,mode:body.get('mode'),client_reference_id:requestId,metadata:{placemat_booking_id:body.get('metadata[placemat_booking_id]'),placemat_collection_id:body.get('metadata[placemat_collection_id]')},status:'open',url:'https://checkout.stripe.com/c/synthetic-placemat-'+sessions.size}
   assert.equal(body.get('mode'),'setup');assert.equal(body.get('payment_method_types[0]'),'card');assert.equal(request.headers.get('idempotency-key'),'placemat-card-'+requestId)
   sessions.set(session.id,session);return Response.json(session)
  }
  if(u.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(u.pathname.split('/').at(-1)))
  if(u.pathname.startsWith('/v1/setup_intents/'))return Response.json(setups.get(u.pathname.split('/').at(-1)))
  throw Error('Unexpected Stripe edge '+u.pathname)
 }
 const h=await installation({stripeEdge:edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),copy=await installation({stripeEdge:edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),manager=await h.signIn('synthetic-placemat-merchant-manager@example.test','admin')
  const read=()=>h.api('/api/payments/merchant'),post=(action,p={},opts={})=>h.api('/api/payments/merchant/'+action,p,opts)
  const cost=(await read()).costDisclosure,payload={bookingId:booking.id,requestId:'synthetic-placemat-collection-1'}
  await post('collect',payload,{status:409});await post('connect',{acceptCosts:true,reviewedCosts:'Unreviewed'},{status:409})
  for(const as of ['',manager]){await h.api('/api/payments/merchant',undefined,{as,status:as?403:401});await post('connect',{acceptCosts:true,reviewedCosts:cost},{as,status:as?403:401})}
  account.details_submitted=false;assert.equal((await post('connect',{acceptCosts:true,reviewedCosts:cost})).result.state,'restricted');await post('collect',payload,{status:409});account.details_submitted=true
  assert.equal((await post('connect',{acceptCosts:true,reviewedCosts:cost})).result.state,'connected')
  const first=(await post('collect',payload)).result,replay=(await post('collect',payload)).result;assert.equal(first.hostedUrl,replay.hostedUrl);assert.equal(sessions.size,1)
  const session=sessions.get(first.providerReference);session.status='complete';session.setup_intent='synthetic-placemat-setup-1';setups.set(session.setup_intent,{object:'setup_intent',id:session.setup_intent,status:'succeeded',usage:'off_session',customer:'synthetic-placemat-customer-1',payment_method:'synthetic-placemat-method-1',metadata:session.metadata})
  assert.equal((await post('sync',{requestId:payload.requestId})).result.state,'collected')
  const redacted=JSON.stringify(await read());for(const value of [first.hostedUrl,session.setup_intent,'synthetic-placemat-customer-1','synthetic-placemat-method-1'])assert.ok(!redacted.includes(value));assert.equal((await read()).collections[0].fundsHeldCents,0)
  const archive=await h.api('/api/backup'),serialized=JSON.stringify(archive),csv=await (await h.request('/api/business-export/card-collections.csv')).text()
  for(const value of [first.hostedUrl,session.setup_intent,'synthetic-placemat-customer-1','synthetic-placemat-method-1'])assert.ok(!serialized.includes(value)&&!csv.includes(value));assert.ok(csv.includes(payload.requestId))
  await copy.api('/api/restore',{archive,confirm:'RESTORE'});const restored=await copy.api('/api/payments/merchant');assert.equal(restored.merchant,null);assert.equal(restored.collections[0].state,'collected');await copy.api('/api/payments/merchant/collect',{bookingId:booking.id,requestId:'synthetic-placemat-restore'},{status:409})
  const owner=(await h.api('/api/state')).actor,payment=await h.command('payment.request',{bookingId:booking.id,amountCents:5000,dueAt:new Date(Date.now()+7200000).toISOString(),followupOwnerId:owner.id,reason:'Synthetic obligation retained after disconnect.'})
  await post('disconnect');const count=calls.filter(c=>c.method==='POST').length
  await post('collect',{...payload,requestId:'synthetic-placemat-collection-2'},{status:409});await h.command('payment.link',{requestId:payment.requestId},{status:409});assert.equal(calls.filter(c=>c.method==='POST').length,count)
  assert.equal((await read()).collections[0].state,'collected');assert.ok((await h.api('/api/state')).paymentRequests.some(p=>p.requestId===payment.requestId))
  assert.ok((await h.api('/api/audit')).rows.some(e=>e.action==='payment.merchant-disconnect'))
  await post('connect',{acceptCosts:true,reviewedCosts:cost});account.id='synthetic-placemat-merchant-2';await post('collect',{...payload,requestId:'synthetic-placemat-collection-2'},{status:409});account.id='synthetic-placemat-merchant-1'
  await h.command('guest.erase',{guestId:booking.guestId,confirm:'ERASE'});await post('sync',{requestId:payload.requestId},{status:409});assert.equal((await h.db.prepare('SELECT COUNT(*) AS count FROM pm_stripe_collection_custody').first()).count,0)
 }finally{await Promise.all([h.close(),copy.close()])}
})

test('Guest exact-fee acceptance and hosted card renewal preserve finite authority across guest, owner, sheet and archive doors',async()=>{
 const {merchantEdge}=await import('./merchant-fixture.mjs'),edge=merchantEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),copy=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await feeApi(h,'fee-policy',feePolicyInput()),manager=await h.signIn('synthetic-placemat-guarantee-manager@example.test','admin'),cost=(await h.api('/api/payments/merchant')).costDisclosure
  await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})
  const issue=async()=> (await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id})).result,first=await issue(),token=new URL(first.guestUrl).hash.slice(6),guest=(action,p={},opts={})=>h.api('/api/public/card-guarantee/'+action,{token,...p},{as:'',...opts})
  await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id},{as:manager,status:403});await h.api('/api/payments/guarantees',undefined,{as:manager,status:200}).then(v=>assert.deepEqual(v.guarantees,[]))
  const custody=await h.db.prepare('SELECT return_url,token_hash FROM pm_stripe_collection_custody WHERE collection_id=?').bind(first.id).first();assert.ok(!custody.return_url.includes(token));assert.notEqual(custody.token_hash,token);assert.match(custody.token_hash,/^[a-f0-9]{64}$/);
  assert.equal((await guest('status')).protection,'unprotected');await guest('accept',{accept:false,reviewedText:policy.reviewText},{status:409});await guest('accept',{accept:true,reviewedText:'Changed terms'},{status:409});assert.equal(edge.sessions.size,0)
  const collection=await guest('accept',{accept:true,reviewedText:policy.reviewText});assert.equal(collection.delivery,'copy-required');assert.equal((await guest('status')).protection,'unprotected');edge.complete(collection)
  const current=await guest('sync');assert.equal(current.source,'guest-captured');assert.equal(current.protection,'tokenized-card-guarantee');assert.equal(current.fundsHeldCents,0);assert.equal(current.maxFeeCents,4000);assert.equal(current.reviewText,policy.reviewText);assert.ok(current.acceptedAt)
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:policy.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt)),sheet='/api/preshift?date='+date
  assert.equal((await h.api(sheet)).services[0].bookings[0].cardGuarantees[0].protection,'tokenized-card-guarantee');assert.deepEqual((await h.api(sheet,undefined,{as:manager})).services[0].bookings[0].cardGuarantees,[])
  for(const door of ['/preshift?date='+date,'/api/preshift.pdf?date='+date]){
   const body=await (await h.request(door)).text();assert.ok(body.includes('Held guarantee amount: USD 0.00'));assert.ok(body.includes('Maximum agreed fee: USD 40.00'));assert.ok(!body.includes('synthetic-placemat-method-'))
   assert.ok(!(await (await h.request(door,{as:manager})).text()).includes('Held guarantee amount'))
  }
  const ended=(await h.api('/api/payments/guarantees/end',{id:first.id})).result;assert.equal(ended.authorizationState,'expired');assert.equal((await guest('status')).protection,'unprotected');assert.equal((await h.api(sheet)).services[0].bookings[0].cardGuarantees[0].authorizationState,'expired');await guest('sync',{}, {status:409})
  const expired=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'});assert.equal(expired.chargeAllowed,false)
  const renewed=await issue(),renewedToken=new URL(renewed.guestUrl).hash.slice(6);await guest('status',{}, {status:404})
  const second=await h.api('/api/public/card-guarantee/accept',{token:renewedToken,accept:true,reviewedText:policy.reviewText},{as:''});edge.complete(second);const renewedState=await h.api('/api/public/card-guarantee/sync',{token:renewedToken},{as:''});assert.equal(renewedState.protection,'tokenized-card-guarantee');assert.notEqual(renewedState.id,current.id)
  assert.equal((await h.api('/api/payments/guarantees')).guarantees.length,2)
  await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Guest canceled after accepting the renewed fee terms.'})
  const preview=await feeApi(h,'fee-preview',{bookingId:booking.id,kind:'late_cancel'});assert.equal(preview.guestConsentId,renewed.id);assert.equal(preview.chargeAllowed,true);const fee=await feeApi(h,'fees',feeDecision(preview));assert.equal(fee.status,'succeeded');assert.equal(fee.amountCents,4000);assert.equal(fee.guestConsentId,renewed.id);assert.equal(edge.fees.intents.size,1)
  const expiredBooking=await feeBooking(h,service,2),expiredIssue=(await h.api('/api/payments/guarantees/issue',{bookingId:expiredBooking.id,policyId:policy.id})).result,expiredToken=new URL(expiredIssue.guestUrl).hash.slice(6),expiredCollection=await h.api('/api/public/card-guarantee/accept',{token:expiredToken,accept:true,reviewedText:policy.reviewText},{as:''});edge.complete(expiredCollection);await h.api('/api/public/card-guarantee/sync',{token:expiredToken},{as:''});await h.api('/api/payments/guarantees/end',{id:expiredIssue.id});await h.command('booking.stage',{bookingId:expiredBooking.id,stage:'cancelled',reason:'Recorded cancellation after guest fee authority expired.'});const expiredDecision=await feeApi(h,'fee-preview',{bookingId:expiredBooking.id,kind:'late_cancel'});assert.equal(expiredDecision.chargeAllowed,false);const posts=edge.calls.filter(c=>c.method==='POST').length;await feeApi(h,'fees',feeDecision(expiredDecision),{status:409});assert.equal(edge.calls.filter(c=>c.method==='POST').length,posts)
  const archive=await h.api('/api/backup'),serialized=JSON.stringify(archive);for(const value of [token,renewedToken,collection.hostedUrl,'synthetic-placemat-method-','synthetic-placemat-customer-'])assert.ok(!serialized.includes(value))
  const invalidGuaranteeArchive=structuredClone(archive),badGuarantee=invalidGuaranteeArchive.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_card_guarantees'&&i.row.id===current.id);badGuarantee.row.booking_id=expiredBooking.id;const badSnapshot=JSON.parse(badGuarantee.row.booking_snapshot);badSnapshot.bookingId=expiredBooking.id;badGuarantee.row.booking_snapshot=JSON.stringify(badSnapshot);const contentVerifier=new ContentVerifier(invalidGuaranteeArchive[0]),archiveVerifier=new ArchiveVerifier(invalidGuaranteeArchive[0]);for(let i=1;i<invalidGuaranteeArchive.length-1;i++){invalidGuaranteeArchive[i]=await makePart(invalidGuaranteeArchive[i].index,invalidGuaranteeArchive[i].items);archiveVerifier.add(invalidGuaranteeArchive[i]);for(const item of invalidGuaranteeArchive[i].items)contentVerifier.add(item)}invalidGuaranteeArchive.at(-1).contentHash=contentVerifier.digest();invalidGuaranteeArchive.at(-1).archiveHash=archiveVerifier.digest();await copy.api('/api/restore',{archive:invalidGuaranteeArchive,confirm:'RESTORE'},{status:400});assert.equal((await copy.api('/api/state')).state.bookings.length,0)
  await copy.api('/api/restore',{archive,confirm:'RESTORE'});assert.equal((await copy.api('/api/payments/guarantees')).guarantees.at(-1).protection,'unprotected');const restoredPreview=await feeApi(copy,'fee-preview',{bookingId:booking.id,kind:'late_cancel'});assert.equal(restoredPreview.chargeAllowed,false);assert.equal(restoredPreview.executionReady,false);assert.equal(edge.fees.intents.size,1)
  const csv=await (await h.request('/api/business-export/card-guarantees.csv')).text();assert.ok(csv.includes(renewed.id)&&csv.includes(policy.id)&&csv.includes('accepted_at'))
  await h.command('guest.erase',{guestId:booking.guestId,confirm:'ERASE'});const erasedArchive=await h.api('/api/backup'),retainedGuarantees=erasedArchive.filter(p=>p.kind==='part').flatMap(p=>p.items).filter(i=>i.table==='pm_card_guarantees').map(i=>i.row);assert.ok(retainedGuarantees.filter(g=>g.booking_id===booking.id).every(g=>g.review_text===''&&g.booking_snapshot==='{}'));assert.equal(retainedGuarantees.find(g=>g.booking_id===expiredBooking.id).review_text,policy.reviewText);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM pm_stripe_collection_custody WHERE collection_id IN (SELECT id FROM pm_card_guarantees WHERE booking_id=?)').bind(booking.id).first()).n,0)
  assert.equal(h.messages.length,1,'Only the explicit manager invitation sent mail; guarantees never send automatically')
 }finally{await Promise.all([h.close(),copy.close()])}
})

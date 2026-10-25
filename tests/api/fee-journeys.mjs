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
  const {consent,payload}=await consentBooking(h,edge,booking,policy)
  assert.equal(consent.expiresAt,service.endAt);assert.equal(consent.protection,'unproved');assert.equal(consent.fundsHeldCents,0)
  for(const path of ['fee-expiry','fee-recollection']){
   await feeApi(h,path,{bookingId:booking.id},{as:'',status:401})
   await feeApi(h,path,{bookingId:booking.id},{as:manager,status:403})
   await h.command('payment.'+path,{bookingId:booking.id},{as:manager,status:403})
  }
  await feeApi(h,'fee-recollection',{bookingId:booking.id},{status:409})
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt)),sheet='/api/preshift?date='+date
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

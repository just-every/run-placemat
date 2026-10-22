// Opt-in test-mode Stripe proof. No card fields or credentials enter Placemat's portable records.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation} from '../tests/api/harness.mjs'
import {feeService} from '../tests/api/fee-fixture.mjs'
const secret=process.env.STRIPE_SECRET_KEY;assert.ok(secret?.startsWith('sk_test_'),'Only a held Stripe test secret may run this proof')
const run='sx-placemat-c39-fees-'+randomUUID(),ownedCharges=new Set();let customer,h
const stripe=async(path,body)=>{
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,'stripe-version':'2026-09-30.endive',...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)});
 const result=await response.json();if(!response.ok)console.error('Stripe test refusal',{status:response.status,type:/^[a-z_]{1,80}$/.test(result.error?.type)?result.error.type:'unknown',code:/^[a-z_]{1,80}$/.test(result.error?.code)?result.error.code:'unknown',parameter:/^[a-z_\[\]]{1,80}$/.test(result.error?.param)?result.error.param:'unknown'});assert.ok(response.ok,`Stripe test API status ${response.status}`);assert.notEqual(result.livemode,true);return result;
}
try{
 h=await installation({bindings:{STRIPE_SECRET_KEY:secret},stripeEdge:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.match(url.pathname,/^\/v1\/(setup_intents|payment_intents|charges|refunds)(\/[^/]+)?$/);
  const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'stripe-version':request.headers.get('stripe-version'),'content-type':request.headers.get('content-type')??'application/x-www-form-urlencoded',...(request.headers.get('idempotency-key')?{'idempotency-key':request.headers.get('idempotency-key')}:{})},body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,`Stripe test transport status ${response.status}`);const body=await response.json();assert.notEqual(body.livemode,true);
  if(body.object==='payment_intent'&&body.status==='succeeded'){const charge=typeof body.latest_charge==='string'?body.latest_charge:body.latest_charge?.id;if(charge)ownedCharges.add(charge)}
  return Response.json(body,{status:response.status});
 }});
 const f=await feeService(h,{startAt:new Date(Date.now()+90000).toISOString()}),bookings=[];
 for(let i=0;i<3;i++)bookings.push(await h.command('booking.phone',{serviceId:f.service.id,startAt:f.service.startAt,partySize:2,name:['Maya Ortiz','Oliver Brooks','Nina Patel'][i],email:`synthetic-placemat-${i}@example.test`,phone:''}));
 const policy=await h.command('payment.fee-policy',{cutoffDaysBefore:365,cutoffLocalTime:'12:00',graceMinutes:0,cancellation:{mode:'per_person',amountCents:2000},noShow:{mode:'fixed',amountCents:8000},exemptions:[{code:'venue','label':'Venue-caused cancellation'}],terms:'Controlled sandbox: guest agrees to the displayed cancellation fee; an owner reviews every decision.'});
 customer=await stripe('customers',new URLSearchParams({'metadata[placemat_proof_run]':run}));
 for(const b of bookings){
  const setup=await stripe('setup_intents',new URLSearchParams({customer:customer.id,payment_method:'pm_card_visa',confirm:'true',usage:'off_session','allowed_payment_method_types[0]':'card',return_url:'https://example.test/fee-setup-return','metadata[placemat_booking_id]':b.id,'metadata[placemat_policy_id]':policy.id,'metadata[placemat_proof_run]':run}));assert.equal(setup.status,'succeeded');
  await h.command('payment.fee-consent',{bookingId:b.id,policyId:policy.id,reviewedPolicyVersion:policy.version,reviewedPolicyText:policy.reviewText,acceptedAt:new Date().toISOString(),evidence:'Controlled sandbox agreement to the exact displayed policy and saved-card setup',setupIntentId:setup.id,attest:true});
  if(b!==bookings[2])await h.command('booking.status',{bookingId:b.id,status:'cancelled',reason:'Guest explicitly canceled the controlled sandbox reservation'});
 }
 const chargedPreview=await h.command('payment.fee-preview',{bookingId:bookings[0].id,kind:'late_cancel'});assert.equal(chargedPreview.amountCents,4000);assert.equal(chargedPreview.chargeAllowed,true);
 const payload={previewId:chargedPreview.id,requestId:randomUUID(),action:'charge',reason:'Guest canceled after the agreed cutoff',evidence:'Recorded cancellation event and prior exact-policy consent'};
 const charged=await h.command('payment.fee',payload);assert.equal(charged.status,'succeeded');ownedCharges.add(charged.chargeId);assert.equal((await h.command('payment.fee',payload)).id,charged.id);
 await h.command('payment.fee',{...payload,requestId:randomUUID()},{status:409});
 const waivedPreview=await h.command('payment.fee-preview',{bookingId:bookings[1].id,kind:'late_cancel'}),waived=await h.command('payment.fee',{previewId:waivedPreview.id,requestId:randomUUID(),action:'waive',reason:'Owner waived the fee for the controlled test guest',evidence:'Explicit recorded owner exception'});assert.equal(waived.status,'waived');assert.equal(waived.amountCents,4000);
 await h.command('payment.charge-sync',{bookingId:bookings[0].id,chargeId:charged.chargeId});
 const refund=await h.command('payment.refund',{bookingId:bookings[0].id,chargeId:charged.chargeId,amountCents:4000,requestId:randomUUID(),reason:'Controlled sandbox fee refund'});assert.equal(refund.status,'succeeded');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(f.service.startAt)-Date.now()+100)));
 await h.command('booking.stage',{bookingId:bookings[2].id,stage:'no-show',reason:'No guest arrived after the agreed grace in the controlled test service.'});
 const noShowPreview=await h.command('payment.fee-preview',{bookingId:bookings[2].id,kind:'no_show'}),noShow=await h.command('payment.fee',{previewId:noShowPreview.id,requestId:randomUUID(),action:'charge',reason:'Owner verified the no-show after grace.',evidence:'Recorded service observation and prior exact-policy consent.'});assert.equal(noShow.status,'succeeded');assert.equal(noShow.amountCents,8000);ownedCharges.add(noShow.chargeId);
 await h.command('payment.charge-sync',{bookingId:bookings[2].id,chargeId:noShow.chargeId});const noShowRefund=await h.command('payment.refund',{bookingId:bookings[2].id,chargeId:noShow.chargeId,amountCents:8000,requestId:randomUUID(),reason:'Controlled sandbox full no-show fee refund'});assert.equal(noShowRefund.status,'succeeded');
 await h.command('service.close',{serviceId:f.service.id,reason:'Controlled fee-report reconciliation'});
 const query='?serviceId='+f.service.id,report=await h.api('/api/reports/closed'+query);assert.deepEqual([report.original.fees.chargedCents,report.original.fees.waivedCents,report.original.fees.refundedCents],[12000,4000,12000]);
 const csv=await (await h.request('/api/reports/closed.csv'+query)).text(),pdf=await (await h.request('/api/reports/closed.pdf'+query)).text();assert.ok(csv.includes('chargedFeeCents')&&csv.includes(charged.bookingId));assert.ok(pdf.includes('Charged $120.00 USD')&&pdf.includes('waived $40.00 USD')&&pdf.includes('refunded $120.00 USD'));
 console.log(JSON.stringify({proof:'PAY-004 live explicit cancellation and no-show fees, waiver, replay refusal, refunds and fixed close report',mode:'Stripe test',policyVersion:policy.version,paymentIntent:charged.processorId,charge:charged.chargeId,refund:refund.processorId,noShowCharge:noShow.chargeId,noShowRefund:noShowRefund.processorId,chargedCents:12000,waivedCents:4000,refundedCents:12000,replaySafe:true,at:new Date().toISOString()}));
}finally{
 try{for(const id of ownedCharges){const charge=await stripe('charges/'+id),remaining=charge.amount_captured-charge.amount_refunded;if(remaining>0)await stripe('refunds',new URLSearchParams({charge:id,amount:String(remaining),'metadata[placemat_proof_run]':run}));}}
 finally{if(h)await h.close();}
}

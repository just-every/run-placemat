// Opt-in test-mode Stripe proof. No card fields or credentials enter Placemat's portable records.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
const secret=process.env.STRIPE_SECRET_KEY;assert.ok(secret?.startsWith('sk_test_'),'Only a held Stripe test secret may run this proof')
const run='sx-placemat-c39-fees-'+randomUUID(),ownedCharges=new Set();let customer,h
const stripe=async(path,body)=>{
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)});
 assert.ok(response.ok,`Stripe test API status ${response.status}`);const result=await response.json();assert.notEqual(result.livemode,true);return result;
}
try{
 h=await installation({bindings:{STRIPE_SECRET_KEY:secret},stripeEdge:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.match(url.pathname,/^\/v1\/(setup_intents|payment_intents|charges|refunds)(\/[^/]+)?$/);
  const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':request.headers.get('content-type')??'application/x-www-form-urlencoded',...(request.headers.get('idempotency-key')?{'idempotency-key':request.headers.get('idempotency-key')}:{})},body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,`Stripe test transport status ${response.status}`);const body=await response.json();assert.notEqual(body.livemode,true);
  if(body.object==='payment_intent'&&body.status==='succeeded'){const charge=typeof body.latest_charge==='string'?body.latest_charge:body.latest_charge?.id;if(charge)ownedCharges.add(charge)}
  return Response.json(body,{status:response.status});
 }});
 const f=await service(h),bookings=[];
 for(let i=0;i<2;i++)bookings.push((await h.api('/api/public/book',publicGuest(f.service,i),{as:'',status:201})).result);
 const policy=await h.command('payment.fee-policy',{cutoffDaysBefore:365,cutoffLocalTime:'12:00',graceMinutes:0,cancellation:{mode:'per_person',amountCents:2000},noShow:{mode:'fixed',amountCents:8000},exemptions:[{code:'venue','label':'Venue-caused cancellation'}],terms:'Controlled sandbox: guest agrees to the displayed cancellation fee; an owner reviews every decision.'});
 customer=await stripe('customers',new URLSearchParams({'metadata[placemat_proof_run]':run}));
 for(const b of bookings){
  const setup=await stripe('setup_intents',new URLSearchParams({customer:customer.id,payment_method:'pm_card_visa',confirm:'true',usage:'off_session','payment_method_types[0]':'card','metadata[placemat_booking_id]':b.id,'metadata[placemat_policy_id]':policy.id,'metadata[placemat_proof_run]':run}));assert.equal(setup.status,'succeeded');
  await h.command('payment.fee-consent',{bookingId:b.id,policyId:policy.id,reviewedPolicyVersion:policy.version,reviewedPolicyText:policy.reviewText,acceptedAt:new Date().toISOString(),evidence:'Controlled sandbox agreement to the exact displayed policy and saved-card setup',setupIntentId:setup.id,attest:true});
  await h.command('booking.status',{bookingId:b.id,status:'cancelled',reason:'Guest explicitly canceled the controlled sandbox reservation'});
 }
 const chargedPreview=await h.command('payment.fee-preview',{bookingId:bookings[0].id,kind:'late_cancel'});assert.equal(chargedPreview.amountCents,4000);assert.equal(chargedPreview.chargeAllowed,true);
 const payload={previewId:chargedPreview.id,requestId:randomUUID(),action:'charge',reason:'Guest canceled after the agreed cutoff',evidence:'Recorded cancellation event and prior exact-policy consent'};
 const charged=await h.command('payment.fee',payload);assert.equal(charged.status,'succeeded');ownedCharges.add(charged.chargeId);assert.equal((await h.command('payment.fee',payload)).id,charged.id);
 await h.command('payment.fee',{...payload,requestId:randomUUID()},{status:409});
 const waivedPreview=await h.command('payment.fee-preview',{bookingId:bookings[1].id,kind:'late_cancel'}),waived=await h.command('payment.fee',{previewId:waivedPreview.id,requestId:randomUUID(),action:'waive',reason:'Owner waived the fee for the controlled test guest',evidence:'Explicit recorded owner exception'});assert.equal(waived.status,'waived');assert.equal(waived.amountCents,4000);
 await h.command('payment.charge-sync',{bookingId:bookings[0].id,chargeId:charged.chargeId});
 const refund=await h.command('payment.refund',{bookingId:bookings[0].id,chargeId:charged.chargeId,amountCents:4000,requestId:randomUUID(),reason:'Controlled sandbox fee refund'});assert.equal(refund.status,'succeeded');
 await h.command('service.close',{serviceId:f.service.id,reason:'Controlled fee-report reconciliation'});
 const query='?serviceId='+f.service.id,report=await h.api('/api/reports/closed'+query);assert.deepEqual([report.original.fees.chargedCents,report.original.fees.waivedCents,report.original.fees.refundedCents],[4000,4000,4000]);
 const csv=await (await h.request('/api/reports/closed.csv'+query)).text(),pdf=await (await h.request('/api/reports/closed.pdf'+query)).text();assert.ok(csv.includes('chargedFeeCents')&&csv.includes(charged.bookingId));assert.ok(pdf.includes('Charged $40.00 USD')&&pdf.includes('waived $40.00 USD')&&pdf.includes('refunded $40.00 USD'));
 console.log(JSON.stringify({proof:'PAY-004 live explicit late-cancellation fee, waiver, replay refusal, fee refund and fixed close report',mode:'Stripe test',policyVersion:policy.version,paymentIntent:charged.processorId,charge:charged.chargeId,refund:refund.processorId,chargedCents:4000,waivedCents:4000,refundedCents:4000,replaySafe:true,at:new Date().toISOString()}));
}finally{
 try{for(const id of ownedCharges){const charge=await stripe('charges/'+id),remaining=charge.amount_captured-charge.amount_refunded;if(remaining>0)await stripe('refunds',new URLSearchParams({charge:id,amount:String(remaining),'metadata[placemat_proof_run]':run}));}}
 finally{if(h)await h.close();}
}

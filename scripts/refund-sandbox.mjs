// Opt-in held-key proof. Only Stripe test mode and the controlled QA mailbox are allowed.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
for(const key of ['STRIPE_SECRET_KEY','MAIL_API_KEY','MAIL_FROM','QA_INBOX_RECEIPT_TOKEN','QA_MAIL_TO'])assert.ok(process.env[key],`Missing ${key}`)
assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'),'Only a Stripe test secret may run this proof')
const secret=process.env.STRIPE_SECRET_KEY,recipient=process.env.QA_MAIL_TO,since=new Date().toISOString(),proofRun='sx-placemat-c39-'+randomUUID();let createdCharge
const stripe=async(path,body)=>{
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.ok(response.ok,`Stripe test API status ${response.status}`);const data=await response.json();assert.notEqual(data.livemode,true);return data
}
const h=await installation({bindings:{STRIPE_SECRET_KEY:secret,MAIL_PROVIDER:'sendgrid',MAIL_FROM:process.env.MAIL_FROM,MAIL_API_KEY:process.env.MAIL_API_KEY},stripeEdge:async request=>{
 const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.match(url.pathname,/^\/v1\/(charges|refunds)(\/[^/]+)?$/)
 const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':request.headers.get('content-type')??'application/x-www-form-urlencoded',...(request.headers.get('idempotency-key')?{'idempotency-key':request.headers.get('idempotency-key')}:{})},body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});if(!response.ok){const error=await response.clone().json().catch(()=>({}));console.error('Stripe test transport refused',{status:response.status,type:/^[a-z_]{1,80}$/.test(error.error?.type)?error.error.type:'unknown',code:/^[a-z_]{1,80}$/.test(error.error?.code)?error.error.code:'unknown'})}assert.ok(response.ok,`Stripe test transport status ${response.status}`);const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(await response.arrayBuffer(),{status:response.status,headers})
},mailEdge:async request=>{
 assert.equal(new URL(request.url).hostname,'api.sendgrid.com');const wire=await request.text(),body=JSON.parse(wire)
 assert.equal(body.personalizations.length,1);assert.equal(body.personalizations[0].to.length,1);assert.equal(body.personalizations[0].to[0].email,recipient)
 return fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:request.headers.get('authorization'),'content-type':request.headers.get('content-type')},body:wire,redirect:'manual',signal:AbortSignal.timeout(20000)})
}})
try{
 const f=await service(h),booking=(await h.api('/api/public/book',publicGuest(f.service,1,{name:'Jordan Rivera',email:recipient}),{as:'',status:201})).result
 // Stripe supplies this documented tokenized test payment method; no card fields enter Placemat.
 const payment=await stripe('payment_intents',new URLSearchParams({amount:'10000',currency:'usd',payment_method:'pm_card_visa',confirm:'true','automatic_payment_methods[enabled]':'true','automatic_payment_methods[allow_redirects]':'never','metadata[placemat_booking_id]':booking.id,'metadata[placemat_proof_run]':proofRun}))
 assert.equal(payment.status,'succeeded');assert.equal(typeof payment.latest_charge,'string');createdCharge=payment.latest_charge;console.log(JSON.stringify({proofRun,chargeReference:createdCharge,mode:'Stripe test'}))
 await h.command('payment.charge-sync',{bookingId:booking.id,chargeId:payment.latest_charge})
 const outcomes=[]
 for(const amountCents of [4000,6000]){
  const payload={bookingId:booking.id,chargeId:payment.latest_charge,amountCents,requestId:randomUUID(),reason:'Controlled sandbox partial refund'}
  const refund=await h.command('payment.refund',payload);assert.equal(refund.status,'succeeded');assert.equal(refund.amountCents,amountCents)
  assert.equal((await h.command('payment.refund',payload)).id,refund.id)
  const notice=await h.command('payment.refund-notice',{refundId:refund.id,outcome:refund.status,acknowledged:true});assert.equal(notice.state,'accepted');assert.equal((await h.command('payment.refund-notice',{refundId:refund.id,outcome:refund.status,acknowledged:true})).id,notice.id)
  const headers={authorization:'Bearer '+process.env.QA_INBOX_RECEIPT_TOKEN},query=new URLSearchParams({to:recipient,subject:refund.id,since,limit:'1'});let receipt
  for(let i=0;i<18;i++){const response=await fetch('https://rer-qa-inbox.runeditrun.workers.dev/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);receipt=(await response.json()).receipts?.[0];if(receipt)break;await new Promise(resolve=>setTimeout(resolve,5000))}
  assert.ok(receipt,'The controlled receiver must confirm actual delivery');assert.equal(receipt.auth?.dmarc,'pass')
  assert.match(receipt.rawUrl,/^\/receipts\/[a-zA-Z0-9_-]+\/raw$/)
  const raw=await fetch('https://rer-qa-inbox.runeditrun.workers.dev'+receipt.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(raw.status,200);const bytes=new Uint8Array(await raw.arrayBuffer())
  const mail=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:receipt.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{maxRawBytes:1048576,maxBodyBytes:262144,maxAttachments:10,maxAttachmentBytes:1048576,maxTotalAttachmentBytes:1048576})
  assert.ok(mail.text.includes('$'+(amountCents/100).toFixed(2))&&mail.text.includes('$'+(notice.remainingCents/100).toFixed(2))&&mail.text.includes('succeeded'))
  outcomes.push({refundId:refund.id,processorReference:refund.processorId,amountCents,remainingCents:notice.remainingCents,receiptId:receipt.id,receivedAt:receipt.receivedAt,authentication:'DMARC pass'})
 }
 await h.command('payment.refund',{bookingId:booking.id,chargeId:payment.latest_charge,amountCents:1,requestId:randomUUID(),reason:'Refused excess'},{status:409})
 const charge=await stripe('charges/'+payment.latest_charge);assert.equal(charge.amount_refunded,10000)
 console.log(JSON.stringify({proof:'PAY-005 live USD partial refunds and explicit delivered outcome notices',chargeReference:payment.latest_charge,chargedCents:10000,refundedCents:10000,outcomes,replaySafe:true,furtherCentRefused:true}))
}finally{try{if(createdCharge){const charge=await stripe('charges/'+createdCharge),remaining=charge.amount_captured-charge.amount_refunded;if(remaining>0){await stripe('refunds',new URLSearchParams({charge:createdCharge,amount:String(remaining),'metadata[placemat_proof_run]':proofRun}));console.log('Cleaned up the remaining owned Stripe test charge.')}}}finally{await h.close()}}

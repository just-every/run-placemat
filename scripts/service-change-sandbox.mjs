// Opt-in held-key proof. Only Stripe test mode and the controlled QA mailbox are allowed.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
for(const key of ['STRIPE_SECRET_KEY','MAIL_API_KEY','MAIL_FROM','QA_INBOX_RECEIPT_TOKEN','QA_MAIL_TO'])assert.ok(process.env[key],`Missing ${key}`)
assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'),'Only a Stripe test secret may run this proof')
const secret=process.env.STRIPE_SECRET_KEY,recipient=process.env.QA_MAIL_TO,since=new Date().toISOString(),proofRun='sx-placemat-c-i871-'+randomUUID();let createdCharge
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
 const f=await service(h,{tables:4,covers:30});await h.command('table.save',{...f.floor[3],area:'Patio'})
 const bookings=[];for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(f.service,i,{...(i===0?{email:recipient}:{}),closureEmailConsent:i!==2}),{as:'',status:201})).result)
 const original=(await h.api('/api/state')).state.bookings
 const closure=await h.command('proposal.prepare',{kind:'service.closure',plan:{serviceId:f.service.id,scope:'room',area:'Dining room'},reason:'Controlled room closure proof'})
 assert.equal(closure.plan.bookingIds.length,3);await h.command('proposal.approve',{proposalId:closure.id})
 const change=(await h.api('/api/state')).state.serviceChanges[0],task=i=>({changeId:change.id,taskId:change.tasks[i].id})
 await h.command('service.relocation',{...task(0),serviceId:f.service.id,startAt:f.service.startAt,tableIds:[f.floor[3].id],area:'Patio',reason:'Controlled guest-accepted relocation'})
 const attempt=await h.command('service.outreach',{...task(0),acknowledged:true});assert.equal(attempt.state,'accepted');assert.equal(attempt.mailboxDelivery,'unconfirmed')
 const headers={authorization:'Bearer '+process.env.QA_INBOX_RECEIPT_TOKEN},query=new URLSearchParams({to:recipient,subject:bookings[0].id,since,limit:'1'});let receipt
 for(let i=0;i<18;i++){const response=await fetch('https://rer-qa-inbox.runeditrun.workers.dev/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);receipt=(await response.json()).receipts?.[0];if(receipt)break;await new Promise(resolve=>setTimeout(resolve,5000))}
 assert.ok(receipt,'Controlled receiver must confirm actual outreach delivery');assert.equal(receipt.auth?.dmarc,'pass');assert.equal(receipt.to,recipient)
 assert.match(receipt.rawUrl,/^\/receipts\/[a-zA-Z0-9_-]+\/raw$/)
 const raw=await fetch('https://rer-qa-inbox.runeditrun.workers.dev'+receipt.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(raw.status,200);const bytes=new Uint8Array(await raw.arrayBuffer())
 const mail=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:receipt.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{maxRawBytes:1048576,maxBodyBytes:262144,maxAttachments:10,maxAttachmentBytes:1048576,maxTotalAttachmentBytes:1048576})
 assert.ok(!mail.text.includes(bookings[1].id)&&!mail.text.includes(bookings[2].id))
 const link=new URL(mail.text.match(/https:\/\/[^\s]+\/relocation#[^\s]+/)[0]),token=new URLSearchParams(link.hash.slice(1)).get('token')
 const guest=(action,p={},status=200)=>h.api('/api/public/relocation/'+action,{token,...p},{as:'',status})
 assert.equal((await guest('status')).booking.id,bookings[0].id);assert.deepEqual((await h.api('/api/state')).state.bookings,original)
 assert.equal((await guest('accept',{acknowledged:true})).decision,'accepted');await guest('accept',{acknowledged:true},404)
 const payment=await stripe('payment_intents',new URLSearchParams({amount:'4001',currency:'usd',payment_method:'pm_card_visa',confirm:'true','automatic_payment_methods[enabled]':'true','automatic_payment_methods[allow_redirects]':'never','metadata[placemat_booking_id]':bookings[1].id,'metadata[placemat_proof_run]':proofRun}))
 assert.equal(payment.status,'succeeded');createdCharge=payment.latest_charge
 await h.command('payment.charge-sync',{bookingId:bookings[1].id,chargeId:createdCharge})
 await h.command('service.cancel',{...task(1),amountCents:0,reason:'Controlled closure',acknowledged:true},{status:409})
 const refund=await h.command('payment.refund',{bookingId:bookings[1].id,chargeId:createdCharge,amountCents:4001,requestId:randomUUID(),reason:'Controlled service closure full refund'})
 assert.equal(refund.status,'succeeded');assert.equal(refund.amountCents,4001)
 await h.command('service.cancel',{...task(1),refundId:refund.id,amountCents:4001,reason:'Controlled closure with confirmed full refund',acknowledged:true})
 await h.command('service.relocation',{...task(2),serviceId:f.service.id,startAt:new Date(Date.parse(f.service.startAt)+120*60000).toISOString(),tableIds:[f.floor[3].id],area:'Patio',reason:'Controlled unanswered offer'})
 await h.command('service.outreach',{...task(2),acknowledged:true},{status:409})
 await h.command('service.followup',{...task(2),status:'failed-contact',outcome:'No recorded email permission; manager owns personal follow-up'})
 const final=await h.api('/api/state');assert.deepEqual(final.state.bookings[0].tableIds,[f.floor[3].id]);assert.equal(final.state.bookings[1].status,'cancelled');assert.deepEqual(final.state.bookings[2],original[2]);assert.equal(final.state.serviceChanges[0].tasks[2].ownerId,final.actor.id)
 const charge=await stripe('charges/'+createdCharge);assert.equal(charge.amount_refunded,4001)
 console.log(JSON.stringify({proof:'SERVICE-003 delivered relocation and provider-confirmed exact-cent cancellation',proofRun,receiptId:receipt.id,receivedAt:receipt.receivedAt,authentication:'DMARC pass',chargeReference:createdCharge,refundReference:refund.processorId,refundedCents:4001,guestAccepted:true,replayRefused:true,unansweredUnchanged:true,failedContactOwned:true}))
}finally{try{if(createdCharge){const charge=await stripe('charges/'+createdCharge),remaining=charge.amount_captured-charge.amount_refunded;if(remaining>0){await stripe('refunds',new URLSearchParams({charge:createdCharge,amount:String(remaining),'metadata[placemat_proof_run]':proofRun}));console.log('Cleaned up the remaining owned Stripe test charge.')}}}finally{await h.close()}}

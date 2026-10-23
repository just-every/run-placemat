// Opt-in Stripe test proof: inventory recovery, a real hosted Checkout and exactly one captured charge.
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
for(const name of ['STRIPE_SECRET_KEY','QA_MAIL_TO'])assert.ok(process.env[name],`Missing ${name}`)
assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'),'Only Stripe test mode is authorized')
const secret=process.env.STRIPE_SECRET_KEY,proofRun='sx-placemat-c40b-'+randomUUID()
async function stripe(path,body){
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.ok(response.ok,`Stripe test request failed with HTTP ${response.status}`);const value=await response.json();assert.notEqual(value.livemode,true);return value
}
let sessionId,chargeId,browser,phase='hold',loseCheckout=true
const h=await installation({bindings:{STRIPE_SECRET_KEY:secret},stripeEdge:async request=>{
 const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.match(url.pathname,/^\/v1\/(checkout\/sessions|charges)(\/[^/]+)?(\/expire)?$/)
 const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':request.headers.get('content-type')??'application/x-www-form-urlencoded',...(request.headers.get('idempotency-key')?{'idempotency-key':request.headers.get('idempotency-key')}:{})},body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(20000)})
 if(loseCheckout&&request.method==='POST'&&url.pathname==='/v1/checkout/sessions'&&response.ok){loseCheckout=false;sessionId=(await response.clone().json()).id;return new Response(null,{status:503})}
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(await response.arrayBuffer(),{status:response.status,headers})
}})
try{
 const f=await service(h,{tables:1,seats:4,covers:40}),booking=publicGuest(f.service,1,{name:'Elena Torres',email:process.env.QA_MAIL_TO,partySize:4}),checkout={requestId:randomUUID(),token:randomBytes(32).toString('hex')}
 await h.api('/api/public/booking-holds',{...checkout,booking,ttlSeconds:300},{as:''})
 const committed=(await h.api('/api/public/book',{...booking,checkout},{as:'',status:201})).result
 assert.equal((await h.api('/api/public/book',{...booking,checkout},{as:'',status:201})).result.id,committed.id)
 const owner=(await h.api('/api/state')).actor,request=await h.command('payment.request',{bookingId:committed.id,amountCents:10000,dueAt:new Date(Date.now()+7200000).toISOString(),followupOwnerId:owner.id,reason:'Controlled Stripe test deposit for checkout recovery'})
 await h.command('payment.link',{requestId:request.requestId},{status:502});const interruptedSession=sessionId
 const link=await h.command('payment.link',{requestId:request.requestId});sessionId=(await h.api('/api/backup')).filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_payment_requests'&&i.row.id===request.requestId).row.provider_session_id
 assert.equal(sessionId,interruptedSession,'A real lost create response recovers the original Stripe session')
 const duplicate=await h.command('payment.link',{requestId:request.requestId});assert.equal(duplicate.providerUrl,link.providerUrl)
 phase='hosted-checkout';browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),page=await context.newPage()
 await page.goto(link.providerUrl,{waitUntil:'domcontentloaded'})
 // Stripe-hosted inputs: credentials and card values never enter Placemat.
 phase='hosted-fields';await page.locator('input[type=email]').fill(process.env.QA_MAIL_TO)
 const fill=async(selectors,value)=>{await page.locator(selectors.join(',')).first().fill(value)}
 phase='hosted-card-number';await fill(['input[name=cardNumber]','input[autocomplete=cc-number]'],'4242424242424242')
 phase='hosted-card-expiry';await fill(['input[name=cardExpiry]','input[autocomplete=cc-exp]'],'12/35')
 phase='hosted-card-security';await fill(['input[name=cardCvc]','input[autocomplete=cc-csc]'],'123')
 phase='hosted-billing-name';await fill(['input[name=billingName]','input[autocomplete=cc-name]'],'Elena Torres')
 const country=page.locator('select[name=billingCountry]');if(await country.count())await country.selectOption('US')
 const postal=page.locator('input[name=billingPostalCode],input[autocomplete=postal-code]');if(await postal.count())await postal.first().fill('10001')
 phase='hosted-submit';await page.getByTestId('hosted-payment-submit-button').click()
 phase='provider-reconciliation'
 let session
 for(let i=0;i<18;i++){session=await stripe('checkout/sessions/'+sessionId+'?expand[]=payment_intent.latest_charge');if(session.payment_status==='paid'&&session.status==='complete')break;await new Promise(resolve=>setTimeout(resolve,5000))}
 assert.equal(session.payment_status,'paid');assert.equal(session.status,'complete');assert.equal(session.amount_total,10000)
 chargeId=typeof session.payment_intent.latest_charge==='string'?session.payment_intent.latest_charge:session.payment_intent.latest_charge.id
 await h.command('payment.sync',{requestId:request.requestId});await h.command('payment.sync',{requestId:request.requestId});await h.command('payment.charge-sync',{bookingId:committed.id,chargeId})
 const recovered=(await h.api('/api/public/book',{...booking,checkout},{as:'',status:201})).result;assert.equal(recovered.id,committed.id)
 const view=await h.api('/api/state');assert.equal(view.state.bookings.length,1);assert.equal(view.paymentRequests.length,1);assert.equal(view.paymentRequests[0].state,'paid');assert.equal(view.refundCharges.length,1);assert.equal(view.refundCharges[0].amountCents,10000)
 const charge=await stripe('charges/'+chargeId);assert.equal(charge.captured,true);assert.equal(charge.amount_captured,10000);assert.equal(charge.metadata.placemat_booking_id,committed.id)
 console.log(JSON.stringify({proof:'BOOK-006 real held-checkout replay, one reservation and one Stripe-hosted captured test deposit',proofRun,at:new Date().toISOString(),bookingId:committed.id,processorSession:sessionId,processorCharge:chargeId,amountCents:10000,replaySafe:true}))
 await context.close()
}catch{if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)console.error(JSON.stringify({fieldMetadata:await page.locator('input').evaluateAll(nodes=>nodes.map(n=>({name:n.name,type:n.type,autocomplete:n.autocomplete,visible:!!n.getClientRects().length}))).catch(()=>[]),frameCount:page.frames().length}))}console.error(JSON.stringify({proof:'BOOK-006 live checkout',phase,passed:false,detail:'No credentials or private payment URL logged; owned session is closed or refunded below.'}));process.exitCode=1
}finally{
 if(browser)await browser.close()
 try{
  if(chargeId){const charge=await stripe('charges/'+chargeId),remaining=charge.amount_captured-charge.amount_refunded;if(remaining>0)await stripe('refunds',new URLSearchParams({charge:chargeId,amount:String(remaining),'metadata[placemat_proof_run]':proofRun}));console.log('Owned Stripe test charge fully refunded.')}
  else if(sessionId){const session=await stripe('checkout/sessions/'+sessionId+'?expand[]=payment_intent.latest_charge');if(session.payment_status==='paid'){const charge=session.payment_intent.latest_charge;await stripe('refunds',new URLSearchParams({charge:typeof charge==='string'?charge:charge.id,'metadata[placemat_proof_run]':proofRun}));console.log('Owned Stripe test charge fully refunded.')}else if(session.status==='open')await stripe('checkout/sessions/'+sessionId+'/expire',new URLSearchParams())}
 }finally{await h.close()}
}

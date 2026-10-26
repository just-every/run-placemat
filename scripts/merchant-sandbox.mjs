// Opt-in held-key proof: card entry stays on real Stripe Checkout. No charges or mail.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {installation} from '../tests/api/harness.mjs'
import {feeService,feeBooking,feePolicyInput} from '../tests/api/fee-fixture.mjs'

const secret=process.env.STRIPE_SECRET_KEY
assert.ok(secret?.startsWith('sk_test_'),'Only a held Stripe test credential may run this proof')
const run='synthetic-placemat-'+randomUUID(),ownedCustomers=new Set(),sessions=new Set(),authorizations=new Set(),privateValues=new Set([secret,'4242'.repeat(4)])
let h,browser,context,stage='installation',failed=false
function remember(value){
 if(value.object==='customer')ownedCustomers.add(value.id)
 if(value.object==='checkout.session'){sessions.add(value.id);if(value.url)privateValues.add(value.url)}
 if(value.object==='setup_intent')for(const key of ['id','customer','payment_method','client_secret'])if(typeof value[key]==='string')privateValues.add(value[key])
 if(value.object==='customer')privateValues.add(value.id)
 if(value.object==='payment_intent'){authorizations.add(value.id);if(value.client_secret)privateValues.add(value.client_secret);for(const key of ['customer','payment_method'])if(typeof value[key]==='string')privateValues.add(value[key])}
 assert.notEqual(value.livemode,true,'Provider object must be in test mode')
 return value
}
async function stripe(path,body,method=body?'POST':'GET'){
 const response=await fetch('https://api.stripe.com/v1'+path,{method,headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)}),value=await response.json()
 assert.ok(response.ok,'Stripe sandbox request failed (HTTP '+response.status+')')
 return remember(value)
}
// Resolve actual visible controls in Checkout's document or Stripe-owned frames.
async function field(page,selector,required=true){
 const deadline=Date.now()+(required?20000:0)
 do{
  for(const frame of page.frames())for(const control of await frame.locator(selector).all())if(await control.isVisible())return control
  if(!required)return null
  await page.waitForTimeout(100)
 }while(Date.now()<deadline)
 throw new Error('Hosted field unavailable: '+selector)
}
async function hostedSetup(collection,token,maximum,mode='setup'){
 const page=await context.newPage()
 try{
  const hosted=new URL(collection.hostedUrl);assert.equal(hosted.protocol,'https:');assert.equal(hosted.hostname,'checkout.stripe.com')
  await page.goto(hosted.href,{waitUntil:'domcontentloaded',timeout:60000})
  const number=await field(page,'#cardNumber,input[name="cardnumber"],input[name="number"],input[autocomplete="cc-number"],input[data-elements-stable-field-name="cardNumber"]')
  const email=await field(page,'#email,input[type="email"]',false);if(email)await email.fill('synthetic-placemat-1@example.test')
  await number.fill('4242'.repeat(4))
  await (await field(page,'#cardExpiry,input[name="exp-date"],input[name="expiry"],input[autocomplete="cc-exp"],input[data-elements-stable-field-name="cardExpiry"]')).fill('12/30')
  await (await field(page,'#cardCvc,input[name="cvc"],input[autocomplete="cc-csc"],input[data-elements-stable-field-name="cardCvc"]')).fill('123')
  const name=await field(page,'#billingName,input[autocomplete="cc-name"],input[name="billingName"]',false);if(name)await name.fill('synthetic-placemat-1')
  const country=await field(page,'select#billingCountry,select[name="billingCountry"],select[autocomplete="country"]',false);if(country)await country.selectOption('US')
  const reuse=await field(page,'#enableStripePass',false);if(reuse&&await reuse.isChecked())await reuse.uncheck()
  const postal=await field(page,'#billingPostalCode,input[autocomplete="postal-code"],input[name="postal"]',false);if(postal)await postal.fill('10001')
  // Observe one real submit; never resubmit on a timeout. A provider GET proves
  // success even when the synthetic venue cannot receive Checkout's return.
  const confirmation=page.waitForResponse(response=>{const url=new URL(response.url());return url.hostname==='api.stripe.com'&&url.pathname.endsWith('/confirm')&&response.request().method()==='POST'},{timeout:60000}).then(async response=>{await response.finished();return {observed:true}},error=>({observed:false,errorType:error.name}))
  const submit=await field(page,'[data-testid="hosted-payment-submit-button"],button[type="submit"]')
  await submit.click()
  const observation=await confirmation,browserConfirmationObserved=observation.observed,session=await stripe('/checkout/sessions/'+encodeURIComponent(collection.providerReference))
  console.log(JSON.stringify({stage,providerStatus:session.status,browserConfirmationObserved,...observation.errorType?{browserWaitError:observation.errorType}:{}}))
  assert.ok(browserConfirmationObserved||observation.errorType==='TimeoutError','Browser confirmation observation failed')
  assert.equal(session.status,'complete','Stripe did not complete hosted setup')
  assert.equal(session.mode,mode==='authorization'?'payment':'setup')
  if(mode==='authorization'){
   const held=await stripe('/payment_intents/'+encodeURIComponent(session.payment_intent));assert.equal(held.status,'requires_capture');assert.equal(held.capture_method,'manual');assert.equal(held.amount_capturable,maximum);assert.equal(held.amount_received,0)
  }else{
   assert.equal(session.payment_intent,null);assert.ok(session.amount_total===null||session.amount_total===0)
   const setup=await stripe('/setup_intents/'+encodeURIComponent(session.setup_intent));assert.equal(setup.status,'succeeded');assert.equal(setup.usage,'off_session')
  }
  const verified=await h.api('/api/public/card-guarantee/sync',{token},{as:''})
  assert.equal(verified.protection,mode==='authorization'?'card-authorization':'tokenized-card-guarantee');assert.equal(verified.authorizationState,'current');assert.equal(verified.fundsHeldCents,mode==='authorization'?maximum:0);assert.equal(verified.maxFeeCents,maximum)
  assert.ok(Date.parse(verified.expiresAt)>Date.now());assert.ok(verified.acceptedAt)
  console.log(JSON.stringify({proof:'Stripe hosted setup confirmed by provider and public sync',browserConfirmationObserved,confirmationWaitTimedOut:!browserConfirmationObserved,fundsHeld:{currency:'USD',amountCents:verified.fundsHeldCents},maximumAgreedFee:{currency:'USD',amountCents:verified.maxFeeCents}}))
  return verified
 }catch(error){
  // Structural diagnostics only: never URLs, values, response bodies or screenshots.
  try{console.error(JSON.stringify({stage,frames:page.frames().length,alerts:(await page.locator('[role=alert],[class*=Error],[class*=error]').allTextContents()).map(text=>{for(const value of privateValues)text=text.replaceAll(value,'[private]');return text.replace(/https?:\/\/[^\s]+/g,'[private URL]').slice(0,240)}),controls:await Promise.all(page.frames().map(frame=>frame.locator('input,select').evaluateAll(nodes=>nodes.map(n=>({id:n.id,name:n.name,autocomplete:n.autocomplete,visible:!!n.getClientRects().length,invalid:!n.validity.valid})))))}))}catch{console.error(JSON.stringify({stage,diagnostics:'Document unavailable'}))}
  throw error
 }finally{await page.close()}
}
async function redactedCustody(){
 const responses=await Promise.all(['/api/payments/merchant','/api/payments/guarantees','/api/audit','/api/backup'].map(path=>h.api(path))),records=JSON.stringify(responses)
 for(const value of privateValues)assert.ok(!records.includes(value),'Private card custody leaked into a public or portable projection')
}
try{
 h=await installation({bindings:{STRIPE_SECRET_KEY:secret},mailEdge:async()=>{throw new Error('Sandbox proof must never send mail')},stripeEdge:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.ok(['GET','POST'].includes(request.method))
  const allowed=request.method==='GET'?/^\/v1\/(account|country_specs\/[^/]+|checkout\/sessions\/[^/]+|setup_intents\/[^/]+|payment_intents\/[^/]+)$/:/^\/v1\/(customers|checkout\/sessions|checkout\/sessions\/[^/]+\/expire|payment_intents\/[^/]+\/cancel)$/
  assert.ok(allowed.test(url.pathname),'Sandbox edge forbids charge and unrelated provider requests')
  const body=request.method==='POST'?await request.text():undefined
  if(url.pathname==='/v1/checkout/sessions'){const params=new URLSearchParams(body);assert.ok(['setup','payment'].includes(params.get('mode')));if(params.get('mode')==='payment')assert.equal(params.get('payment_intent_data[capture_method]'),'manual');assert.equal(params.get('payment_method_types[0]'),'card')}
  const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':'application/x-www-form-urlencoded',...(request.headers.has('idempotency-key')?{'idempotency-key':request.headers.get('idempotency-key')}:{})},body,redirect:'manual',signal:AbortSignal.timeout(20000)}),value=await response.json()
  remember(value);if(!response.ok)console.error(JSON.stringify({stage,providerStatus:response.status,providerErrorType:value.error?.type,providerParameter:value.error?.param}));assert.ok(response.ok,'Stripe sandbox edge request failed (HTTP '+response.status+')');return Response.json(value,{status:response.status})
 }})
 const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await h.command('payment.fee-policy',feePolicyInput()),cost=(await h.api('/api/payments/merchant')).costDisclosure
 const maximum=Math.max(...[policy.cancellation,policy.noShow].map(rule=>rule.amountCents*(rule.mode==='per_person'?booking.partySize:1)))
 stage='merchant connection'
 const merchant=(await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})).result;assert.equal(merchant.state,'connected');assert.equal(merchant.mode,'test')
 async function issue(mode='setup'){
  const issued=(await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id,collectionMode:mode,...mode==='authorization'?{authorizationCents:maximum}:{}})).result,token=new URL(issued.guestUrl).hash.slice(6)
  privateValues.add(token);privateValues.add(issued.guestUrl);assert.equal(issued.delivery,'copy-required')
  const terms=await h.api('/api/public/card-guarantee/status',{token},{as:''}),collection=await h.api('/api/public/card-guarantee/accept',{token,accept:true,reviewedText:terms.reviewText},{as:''})
  return {issued,token,collection}
 }
 stage='initial collection';const original=await issue()
 if(process.env.PLACEMAT_SANDBOX_HOSTED!=='1'){
  console.log(JSON.stringify({proof:'Merchant capability and hosted setup creation only',hostedCompletion:'NOT RUN',optIn:'PLACEMAT_SANDBOX_HOSTED=1',chargesMade:0}))
 }else{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});context=await browser.newContext()
  await hostedSetup(original.collection,original.token,maximum);await redactedCustody()
  stage='authorization expiry'
  const expired=(await h.api('/api/payments/guarantees/end',{id:original.issued.id})).result
  assert.equal(expired.authorizationState,'expired');assert.equal(expired.protection,'unprotected');assert.equal(expired.fundsHeldCents,0);assert.equal(expired.maxFeeCents,maximum);assert.ok(expired.recollection.ownerId);assert.ok(expired.recollection.requestedAt)
  assert.equal((await h.api('/api/public/card-guarantee/status',{token:original.token},{as:''})).authorizationState,'expired')
  await h.api('/api/public/card-guarantee/accept',{token:original.token,accept:true,reviewedText:policy.reviewText},{as:'',status:409})
  stage='renewed collection';const renewed=await issue();assert.notEqual(renewed.issued.id,original.issued.id);assert.notEqual(renewed.token,original.token)
  for(const action of ['status','accept','sync'])await h.api('/api/public/card-guarantee/'+action,{token:original.token,accept:true,reviewedText:policy.reviewText},{as:'',status:404})
  await hostedSetup(renewed.collection,renewed.token,maximum)
  const guarantees=(await h.api('/api/payments/guarantees')).guarantees
  assert.equal(guarantees.find(g=>g.id===original.issued.id).authorizationState,'expired');assert.equal(guarantees.find(g=>g.id===renewed.issued.id).authorizationState,'current')
  await redactedCustody()
  await h.api('/api/payments/guarantees/end',{id:renewed.issued.id})
  stage='nonzero authorization';const held=await issue('authorization');await hostedSetup(held.collection,held.token,maximum,'authorization')
  stage='authorization release';const released=(await h.api('/api/payments/guarantees/end',{id:held.issued.id})).result;assert.equal(released.heldState,'released');assert.equal(released.fundsHeldCents,0);assert.equal(released.protection,'unprotected')
  const holdSession=await stripe('/checkout/sessions/'+encodeURIComponent(held.collection.providerReference)),voided=await stripe('/payment_intents/'+encodeURIComponent(holdSession.payment_intent));assert.equal(voided.status,'canceled');assert.equal(voided.amount_received,0)
  console.log(JSON.stringify({proof:'PAY-003 real hosted nonzero card authorization and explicit release',collectionReference:held.collection.providerReference,authorizationReference:holdSession.payment_intent,heldCents:maximum,releaseState:voided.status,chargesMade:0,at:new Date().toISOString()}));await redactedCustody()
  stage='merchant disconnect';await h.api('/api/payments/merchant/disconnect',{});await h.api('/api/payments/merchant/collect',{bookingId:booking.id,requestId:run},{status:409})
  assert.equal((await h.api('/api/public/card-guarantee/status',{token:held.token},{as:''})).protection,'unprotected')
  console.log(JSON.stringify({proof:'PAY-001 and PAY-003 real hosted setup, expiry, renewed collection and redacted custody',authorizationExpired:true,renewedCollectionConfirmed:true,originalTokenInvalidated:true,disconnectBlocksCollection:true,collectionReferences:[original.collection.providerReference,renewed.collection.providerReference],guaranteeIds:[original.issued.id,renewed.issued.id],fundsHeld:{currency:'USD',amountCents:0},maximumAgreedFee:{currency:'USD',amountCents:maximum},chargesMade:0,messagesSent:0,at:new Date().toISOString()}))
 }
}catch(error){
 // Browser and API assertion errors can contain token URLs or raw response values.
 failed=true;console.error(JSON.stringify({proof:'Sandbox proof failed',stage,errorType:error.name}));process.exitCode=1
}finally{
 const cleanup=[]
 for(const [name,close] of [['context',()=>context?.close()],['browser',()=>browser?.close()],['installation',()=>h?.close()]])try{await close()}catch{cleanup.push(name)}
 for(const id of sessions)try{const session=await stripe('/checkout/sessions/'+encodeURIComponent(id));if(session.status==='open')await stripe('/checkout/sessions/'+encodeURIComponent(id)+'/expire',new URLSearchParams())}catch{cleanup.push('owned-session')}
 for(const id of authorizations)try{const intent=await stripe('/payment_intents/'+encodeURIComponent(id));if(intent.status==='requires_capture')await stripe('/payment_intents/'+encodeURIComponent(id)+'/cancel',new URLSearchParams())}catch{cleanup.push('owned-authorization')}
 for(const id of ownedCustomers)try{await stripe('/customers/'+encodeURIComponent(id),undefined,'DELETE')}catch{cleanup.push('owned-customer')}
 if(cleanup.length){console.error(JSON.stringify({proof:'Sandbox cleanup incomplete',resources:cleanup}));process.exitCode=1}
 if(failed)console.error('The overall sandbox journey is incomplete. Inspect its stage diagnostics before another run.')
}

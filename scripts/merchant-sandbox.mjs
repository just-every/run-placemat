// Opt-in held-key proof: all card entry stays on Stripe Checkout. No charges are made.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {installation} from '../tests/api/harness.mjs'
import {feeService,feeBooking,feePolicyInput} from '../tests/api/fee-fixture.mjs'
const secret=process.env.STRIPE_SECRET_KEY;assert.ok(secret?.startsWith('sk_test_'),'Only a held Stripe test credential may run this proof')
const run='synthetic-placemat-'+randomUUID(),ownedCustomers=new Set(),sessions=new Set();let h,browser,context
async function stripe(path,body){
 const response=await fetch('https://api.stripe.com/v1'+(path.startsWith('/')?path:'/'+path),{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)}),value=await response.json()
 if(!response.ok)console.error('Stripe sandbox refusal',{status:response.status,type:value.error?.type,parameter:value.error?.param})
 assert.ok(response.ok,'Stripe sandbox request failed');assert.notEqual(value.livemode,true);return value
}
try{
 h=await installation({bindings:{STRIPE_SECRET_KEY:secret},stripeEdge:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.match(url.pathname,/^\/v1\/(account|country_specs|customers|checkout\/sessions|setup_intents)(\/[^/]+)?$/)
  const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':request.headers.get('content-type')??'application/x-www-form-urlencoded',...(request.headers.has('idempotency-key')?{'idempotency-key':request.headers.get('idempotency-key')}:{})},body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(20000)}),value=await response.json()
  if(!response.ok)console.error('Stripe sandbox edge refusal',{status:response.status,type:value.error?.type,parameter:value.error?.param})
  if(value.object==='customer')ownedCustomers.add(value.id);if(value.object==='checkout.session')sessions.add(value.id);assert.notEqual(value.livemode,true);return Response.json(value,{status:response.status})
 }})
 const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await h.command('payment.fee-policy',feePolicyInput()),cost=(await h.api('/api/payments/merchant')).costDisclosure
 const merchant=(await h.api('/api/payments/merchant/connect',{acceptCosts:true,reviewedCosts:cost})).result;assert.equal(merchant.state,'connected')
 const issued=(await h.api('/api/payments/guarantees/issue',{bookingId:booking.id,policyId:policy.id})).result,token=new URL(issued.guestUrl).hash.slice(6),collection=await h.api('/api/public/card-guarantee/accept',{token,accept:true,reviewedText:policy.reviewText},{as:''})
 console.log(JSON.stringify({proof:'PAY-001 merchant capability verification and Stripe-hosted collection creation',merchant:merchant.accountId,mode:merchant.mode,collectionReference:collection.providerReference,chargesMade:0,at:new Date().toISOString()}))
 if(process.env.PLACEMAT_SANDBOX_HOSTED!=='1'){
  console.log('Hosted card completion NOT RUN; set PLACEMAT_SANDBOX_HOSTED=1 for the Stripe test browser journey.')
 }else{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});context=await browser.newContext();const page=await context.newPage();await page.goto(collection.hostedUrl,{waitUntil:'domcontentloaded',timeout:60000})
  await page.locator('#email').fill('synthetic-placemat@example.test');await page.locator('#cardNumber').fill('4242'.repeat(4));await page.locator('#cardExpiry').fill('12/30');await page.locator('#cardCvc').fill('123');await page.locator('#billingName').fill('Synthetic Placemat Guest');
  const country=page.locator('#billingCountry');if(await country.isVisible())await country.selectOption('US')
  const postal=page.locator('#billingPostalCode');if(await postal.isVisible())await postal.fill('10001')
  await page.getByTestId('hosted-payment-submit-button').click();await page.waitForURL(url=>url.hostname!=='checkout.stripe.com',{timeout:60000}).catch(()=>{})
  const verified=await h.api('/api/public/card-guarantee/sync',{token},{as:''});if(verified.protection!=='tokenized-card-guarantee')console.error('Hosted collection remains incomplete',{providerStatus:(await stripe('/checkout/sessions/'+collection.providerReference)).status,validation:await page.locator('input,select').evaluateAll(nodes=>nodes.map(n=>({id:n.id,message:n.validationMessage})).filter(n=>n.message)),alerts:await page.locator('[role=alert],.FieldError,.InputError,.PaymentMethodFormError').allTextContents(),frameTitles:await page.locator('iframe').evaluateAll(nodes=>nodes.map(n=>n.title)),buttonText:await page.getByTestId('hosted-payment-submit-button').textContent()});assert.equal(verified.protection,'tokenized-card-guarantee');assert.equal(verified.fundsHeldCents,0)
  const records=JSON.stringify(await h.api('/api/payments/merchant'))+JSON.stringify(await h.api('/api/backup'));assert.ok(!records.includes('4242'.repeat(4)));assert.ok(!records.includes(collection.hostedUrl));assert.ok(!records.includes(token));
  await h.api('/api/payments/guarantees/end',{id:issued.id});assert.equal((await h.api('/api/public/card-guarantee/status',{token},{as:''})).protection,'unprotected')
  await h.api('/api/payments/merchant/disconnect');await h.api('/api/payments/merchant/collect',{bookingId:booking.id,requestId:run},{status:409});
  console.log(JSON.stringify({proof:'PAY-001 Stripe-hosted test card completed; PAY-003 exact fee agreement, finite expiry and redacted custody',merchant:merchant.accountId,collectionReference:collection.providerReference,guaranteeId:issued.id,authorizationExpired:true,disconnectBlocksCollection:true,chargesMade:0,at:new Date().toISOString()}))
 }
}finally{
 if(context)await context.close();if(browser)await browser.close();if(h)await h.close()
 for(const id of sessions){const session=await stripe('/checkout/sessions/'+encodeURIComponent(id));if(session.status==='open')await stripe('/checkout/sessions/'+encodeURIComponent(id)+'/expire',new URLSearchParams())}
 for(const id of ownedCustomers){const response=await fetch('https://api.stripe.com/v1/customers/'+encodeURIComponent(id),{method:'DELETE',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000)});assert.ok(response.ok,'Owned sandbox customer cleanup failed')}
}

// PAY-005: reviewed current contacts and owned human delivery recovery, through the real page.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from './api/harness.mjs'
import {paymentEdge} from './api/payment-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const payments=paymentEdge(),sent=[]
 const h=await installation({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:payments.edge,mailEdge:async request=>{sent.push(await request.json());return new Response(null,{status:503})}})
 const transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await service(h),booking=(await h.api('/api/public/book',publicGuest(f.service,0,{name:'Elena Torres'}),{as:'',status:201})).result,chargeId=payments.charge(booking.id)
  await h.command('payment.charge-sync',{bookingId:booking.id,chargeId})
  const refund=await h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:4000,requestId:'synthetic-placemat-2',reason:'Guest requested a partial deposit refund'})
  const cookies=h.cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  await context.addCookies(cookies);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.locator('.app-main[aria-busy=false]').waitFor()
  const shot=async(name,locator)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await locator.screenshot({path:resolve(shots,`PAY-005-${name}-${width}.png`)})}
  const region=page.getByRole('region',{name:'Refunds',exact:true}),notice=region.locator('[data-command="payment.refund-notice"]').first()
  await notice.locator('[name=acknowledged]').check();await shot('review-current-contact',notice)
  await notice.locator('[name=expectedContactEmail]').evaluate(el=>el.value='stale-contact@example.test')
  await notice.getByRole('button',{name:'Send refund outcome email',exact:true}).click();await page.getByRole('alert').filter({hasText:'reservation contact changed'}).waitFor();assert.equal(sent.length,0);await shot('changed-contact-refused',page.locator('#notice'))
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();await notice.locator('[name=acknowledged]').check();await notice.getByRole('button',{name:'Send refund outcome email',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
  assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['guest0@example.test']);assert.match(await region.innerText(),/Acceptance unconfirmed/);await shot('unconfirmed-notice',region)
  let view=await h.api('/api/state');const receipt=view.refundNotices.find(n=>n.refundId===refund.id),task=page.locator(`[data-handover-task="${receipt.followupTaskId}"]`)
  await task.waitFor();assert.match(await task.innerText(),/Venue owner.*confirm the guest.*Due now.*unconfirmed.*bounce/s);assert.match(await task.innerText(),/Overdue.*Venue owner/s);await shot('sender-owned-delivery-callback',task)
  await task.getByLabel('Recorded outcome',{exact:true}).fill('Called the guest and confirmed the saved refund outcome directly.');await task.getByRole('button',{name:'Complete guest follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();assert.match(await task.innerText(),/Completed.*Called the guest/s);await shot('human-followup-completed',task)
  await h.command('payment.refund-notice',{refundId:refund.id,outcome:refund.status,expectedContactEmail:'guest0@example.test',acknowledged:true});assert.equal(sent.length,1)
  await h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:1000,requestId:'synthetic-placemat-3',reason:'Second guest refund'})
  view=await h.api('/api/state');await h.command('guest.erase',{guestId:view.state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'})
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();assert.equal(await region.locator('[data-command="payment.refund-notice"]').count(),0);assert.match(await region.innerText(),/guest contact was erased/);assert.equal(await page.locator('[data-handover-task]').count(),0);await shot('erased-contact-refused',region)
  assert.deepEqual(errors,[]);console.log(`PAY-005 current-contact refusal, uncertain delivery ownership, human completion and erased end state passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

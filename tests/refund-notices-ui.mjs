// PAY-005: native signed SendGrid receipts and owned human recovery through the real page.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from './api/harness.mjs'
import {paymentEdge} from './api/payment-fixture.mjs'
import {refundMailFixture} from './api/refund-mail-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const payments=paymentEdge(),sent=[],mail=refundMailFixture();let acceptMail=false
 const providerId='synthetic-placemat-4',contactEmail=['guest0','example.test'].join('@')
 const h=await installation({bindings:{...mail.bindings,STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:payments.edge,mailEdge:async request=>{assert.equal(new URL(request.url).hostname,'api.sendgrid.com');sent.push(await request.json());return acceptMail?new Response(null,{status:202,headers:{'x-message-id':providerId}}):new Response(null,{status:503})}})
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
  await notice.locator('[name=expectedContactEmail]').evaluate(el=>el.value=['stale-contact','example.test'].join('@'))
  await notice.getByRole('button',{name:'Send refund outcome email',exact:true}).click();await page.getByRole('alert').filter({hasText:'reservation contact changed'}).waitFor();assert.equal(sent.length,0);await shot('changed-contact-refused',page.locator('#notice'))
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();await notice.locator('[name=acknowledged]').check();await notice.getByRole('button',{name:'Send refund outcome email',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
  assert.equal(sent.length,1);assert.deepEqual(sent[0].personalizations[0].to.map(v=>v.email),[contactEmail]);assert.match(await region.innerText(),/Acceptance unconfirmed/);await shot('unconfirmed-notice',region)
  let view=await h.api('/api/state');const receipt=view.refundNotices.find(n=>n.refundId===refund.id),task=page.locator(`[data-handover-task="${receipt.followupTaskId}"]`)
  await task.waitFor();assert.match(await task.innerText(),/Venue owner.*confirm the guest.*Due now.*unconfirmed.*bounce/s);assert.match(await task.innerText(),/Overdue.*Venue owner/s);await shot('sender-owned-delivery-callback',task)
  await task.getByLabel('Recorded outcome',{exact:true}).fill('Called the guest and confirmed the saved refund outcome directly.');await task.getByRole('button',{name:'Complete guest follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();assert.match(await task.innerText(),/Completed.*Called the guest/s);assert.match(await region.innerText(),/Delivery follow-up completed.*Human outcome: Called the guest/s);await shot('human-followup-completed',task);await shot('completed-notice-record',region)
  await h.command('payment.refund-notice',{refundId:refund.id,outcome:refund.status,expectedContactEmail:['guest0','example.test'].join('@'),acknowledged:true});assert.equal(sent.length,1)
  const second=await h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:1000,requestId:'synthetic-placemat-3',reason:'Second guest refund'})
  acceptMail=true
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
  const secondCard=region.locator(`[data-refund-id="${second.id}"]`),secondNotice=secondCard.locator('[data-command="payment.refund-notice"]')
  await secondNotice.locator('[name=acknowledged]').check();await secondNotice.getByRole('button',{name:'Send refund outcome email',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
  assert.equal(sent.length,2);assert.deepEqual(sent[1].personalizations[0].to.map(v=>v.email),[contactEmail]);assert.match(await secondCard.innerText(),/Provider accepted/);assert.equal(await secondCard.locator('[data-refund-mailbox="unconfirmed"]').count(),1)
  view=await h.api('/api/state');const accepted=view.refundNotices.find(n=>n.refundId===second.id),humanBefore=structuredClone(view.state.bookings.find(b=>b.id===booking.id).handover),refundsBefore=structuredClone(view.refunds),secondTask=page.locator(`[data-handover-task="${accepted.followupTaskId}"]`)
  assert.equal(accepted.state,'accepted');assert.equal(accepted.mailboxDelivery,'unconfirmed');await secondTask.getByRole('button',{name:'Complete guest follow-up',exact:true}).waitFor();await shot('provider-accepted',secondCard)
  const observed=Math.floor(Date.now()/1000),event={sg_message_id:providerId+'.synthetic-placemat-5',email:contactEmail,rer_product:sent[1].custom_args.rer_product,rer_delivery_id:sent[1].custom_args.rer_delivery_id}
  const observe=async(eventType,mailboxDelivery,offset)=>{
   const response=await mail.signedRequest(h,[{...event,sg_event_id:`synthetic-placemat-${6+offset}`,event:eventType,timestamp:observed+offset}]);assert.ok(response.ok,await response.text())
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
   const current=await h.api('/api/state'),record=current.refundNotices.find(n=>n.id===accepted.id)
   assert.equal(record.mailboxDelivery,mailboxDelivery);assert.equal(record.state,'accepted');assert.equal(record.deliveryObservedAt,new Date((observed+offset)*1000).toISOString());assert.equal(record.deliveryObservationCount,offset+1)
   assert.deepEqual(current.state.bookings.find(b=>b.id===booking.id).handover,humanBefore,'Provider receipts preserve assigned and completed human tasks');assert.deepEqual(current.refunds,refundsBefore,'Delivery observations do not change processor refund outcomes');assert.equal(sent.length,2)
   assert.equal(await secondCard.locator(`[data-refund-mailbox="${mailboxDelivery}"]`).count(),1);assert.match(await secondCard.innerText(),/Provider observed/);assert.equal(await secondTask.getByRole('button',{name:'Complete guest follow-up',exact:true}).count(),1);assert.match(await task.innerText(),/Completed.*Called the guest/s)
   await shot(`provider-${mailboxDelivery}`,secondCard);await shot(`human-task-after-${mailboxDelivery}`,secondTask)
  }
  await observe('delivered','delivered',0);assert.match(await secondCard.innerText(),/Mailbox delivery: Delivered/)
  await observe('bounce','bounced',1);assert.match(await secondCard.innerText(),/Mailbox delivery: Bounced/)
  await h.command('payment.refund-notice',{refundId:second.id,outcome:second.status,expectedContactEmail:contactEmail,acknowledged:true});assert.equal(sent.length,2)
  await h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:500,requestId:'synthetic-placemat-9',reason:'Guest refund before contact erasure'})
  view=await h.api('/api/state');await h.command('guest.erase',{guestId:view.state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'})
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();assert.equal(await region.locator('[data-command="payment.refund-notice"]').count(),0);assert.match(await region.innerText(),/guest contact was erased/);assert.equal(await page.locator('[data-handover-task]').count(),0);assert.match(await region.innerText(),/Delivery follow-up removed with guest erasure/);await shot('erased-contact-refused',region)
  assert.deepEqual(errors,[]);console.log(`PAY-005 native signed SendGrid delivery and bounce, unchanged human tasks, current-contact refusal, uncertain delivery ownership, human completion and erased end state passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

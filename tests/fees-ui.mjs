import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {feeEdge,feeService} from './api/fee-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS;if(shots)await mkdir(shots,{recursive:true});
for(const width of [1440,390]){
 const edge=feeEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});
 try{
  const {service}=await feeService(h);await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'});
  const bookings=[];for(const [i,name]of ['Maya Ortiz','Oliver Brooks'].entries())bookings.push(await h.command('booking.phone',{serviceId:service.id,startAt:service.startAt,partySize:2,name,email:`synthetic-placemat-${i}@example.test`,phone:''}));
  await context.addCookies(h.cookie.split('; ').map(value=>{const i=value.indexOf('=');return {name:value.slice(0,i),value:value.slice(i+1),url:transport.origin,secure:true,sameSite:'Lax'}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.locator('.app-main[aria-busy=false]').waitFor();
  const root=page.getByRole('region',{name:'Reservation fees',exact:true});
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await root.screenshot({path:resolve(shots,`PAY-004-${name}-${width}.png`)})};
  // Publish using the real owner form; no policy facts are seeded directly into storage.
  await root.getByText('Publish fee policy',{exact:true}).click();const policyForm=root.locator('[data-command="payment.fee-policy"]');
  for(const [name,value]of Object.entries({cutoffDaysBefore:'30',cutoffLocalTime:'18:00',graceMinutes:'0',cancellationCents:'2000',noShowCents:'8000',terms:'A late cancellation is $20 per guest; every fee is reviewed by the owner.'}))await policyForm.locator(`[name="${name}"]`).fill(value);
  await policyForm.locator('[name=cancellationMode]').selectOption('per_person');await shot('policy-review');
  await policyForm.getByRole('button',{name:'Publish new fee policy',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();
  const policy=(await h.api('/api/state')).feeWork.policies[0];
  for(const booking of bookings){
   await root.getByText('Record agreed fee policy',{exact:true}).click();const consent=root.locator('[data-command="payment.fee-consent"]');await consent.locator('[name=bookingId]').selectOption(booking.id);await consent.locator('[name=acceptedAt]').fill(new Date().toISOString().slice(0,-1));await consent.locator('[name=evidence]').fill('Guest agreed to this exact policy during the recorded reservation call.');await consent.locator('[name=setupIntentId]').fill(edge.setup(booking.id,policy.id));await consent.locator('[name=attest]').check();await shot('recorded-agreement-review');await consent.getByRole('button',{name:'Record fee consent',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();
   await h.command('booking.stage',{bookingId:booking.id,stage:'cancelled',reason:'Guest canceled after the agreed deadline.'});
  }
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();
  for(const [i,booking]of bookings.entries()){
   await root.getByText('Review reservation fee',{exact:true}).click();const preview=root.locator('[data-command="payment.fee-preview"]');await preview.locator('[name=bookingId]').selectOption(booking.id);await preview.getByRole('button',{name:'Preview fee',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();
   const decision=root.locator('[data-command="payment.fee"]').last();await decision.locator('[name=action]').selectOption(i?'waive':'charge');await decision.locator('[name=reason]').fill(i?'Owner waived the cancellation fee after reviewing the guest request.':'The recorded cancellation was after the agreed cutoff.');await decision.locator('[name=evidence]').fill('Prior policy agreement and recorded cancellation reviewed.');await shot(i?'waiver-preview':'charge-preview');if(!i)edge.loseNextConfirmation();await decision.getByRole('button',{name:'Confirm fee decision',exact:true}).click();if(!i){await page.getByRole('alert').filter({hasText:'Stripe did not confirm the fee'}).waitFor();await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();await shot('pending-owned-fee');await root.getByRole('button',{name:'Reconcile saved fee',exact:true}).click();}await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();await shot(i?'waived':'charged');
  }
  assert.equal(edge.intents.size,1);const work=(await h.api('/api/state')).feeWork,charge=work.assessments.find(f=>f.status==='succeeded');assert.ok(charge&&work.assessments.some(f=>f.status==='waived'));
  await root.locator(`[data-fee-assessment="${charge.id}"]`).getByRole('button',{name:'Synchronize fee for refunds',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();const refundable=page.locator(`[data-refund-charge="${charge.chargeId}"]`);await refundable.getByText('Refund this charge',{exact:true}).click();const refund=refundable.locator('[data-command="payment.refund"]');await refund.locator('[name=amountCents]').fill('1000');await refund.locator('[name=reason]').fill('Owner approved a partial goodwill fee refund.');await refund.getByRole('button',{name:'Submit refund',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();await h.command('service.close',{serviceId:service.id,reason:'Owner checked attendance and financial outcomes.'});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();await page.getByRole('link',{name:'Reservation reports',exact:true}).click();const report=page.locator('[data-original-close]');await report.waitFor();await expect(report.locator('[data-close-fees]')).toContainText('Charged $40.00 · waived $40.00 · refunded $10.00 USD');await report.locator('[data-close-fees] details').first().click();assert.ok(await report.locator('[data-close-fees]').innerText().then(t=>t.includes('Policy')));if(shots)await report.screenshot({path:resolve(shots,`PAY-004-fixed-close-${width}.png`)});
  assert.deepEqual(errors,[]);console.log(`PAY-004 owner policy, consent, charge, waiver and fixed fee report passed at ${width}`);
 }finally{await context.close();await browser.close();await transport.close();await h.close();}
}

import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {merchantEdge} from './api/merchant-fixture.mjs'
import {feeService,feeBooking,feePolicyInput} from './api/fee-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS;if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const edge=merchantEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),owner=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),guest=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const {service}=await feeService(h),booking=await feeBooking(h,service),policy=await h.command('payment.fee-policy',feePolicyInput()),date=new Intl.DateTimeFormat('en-CA',{timeZone:policy.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt))
  await owner.addCookies(h.cookie.split('; ').map(value=>{const i=value.indexOf('=');return {name:value.slice(0,i),value:value.slice(i+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await owner.newPage(),guestPage=await guest.newPage(),errors=[];for(const p of [page,guestPage])p.on('pageerror',e=>errors.push(e.message))
  const shot=async(p,name,locator)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await (locator??p).screenshot({path:resolve(shots,`PAY-${name}-${width}.png`),...locator?{}:{fullPage:true}})}
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.locator('.app-main[aria-busy=false]').waitFor()
  await page.getByRole('link',{name:'Settings',exact:true}).click();const settings=page.locator('[data-stripe-settings]');await settings.locator('summary').click();await settings.getByRole('checkbox').check();await settings.getByRole('button',{name:'Verify and connect Stripe',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();await settings.locator('summary').click();await expect(settings).toContainText('connected');await shot(page,'001-merchant-connected',settings)
  await page.getByRole('link',{name:'Floor & bookings',exact:true}).click();const fees=page.getByRole('region',{name:'Reservation fees',exact:true})
  const issue=async()=>{await fees.getByText('Collect guest card guarantee',{exact:true}).click();const form=fees.locator('[data-command="payment.guarantee-issue"]');await form.locator('[name=bookingId]').selectOption(booking.id);await form.getByRole('button',{name:'Create private collection link',exact:true}).click();const input=fees.getByLabel('Private guest collection link');await input.waitFor();return input.inputValue()}
  const firstUrl=await issue(),first=(await h.api('/api/payments/guarantees')).guarantees[0]
  await guestPage.route('https://checkout.stripe.com/**',async route=>{const reference=[...edge.sessions.values()].find(s=>s.url===route.request().url())?.id;assert.ok(reference);edge.complete({providerReference:reference});await route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic Stripe edge</title><p>Hosted test card setup confirmed.</p>'})})
  const collect=async url=>{
   await guestPage.goto(transport.origin+'/manage-booking'+new URL(url).hash);await guestPage.getByRole('heading',{name:'Card guarantee',exact:true}).waitFor();await expect(guestPage.locator('#management-content')).toContainText(policy.reviewText);await expect(guestPage.locator('#management-content')).toContainText('This reservation is unprotected.');await shot(guestPage,'003-guest-consent')
   await guestPage.getByRole('checkbox').check();await guestPage.getByRole('button',{name:'Continue to Stripe',exact:true}).click();await guestPage.waitForURL('https://checkout.stripe.com/**');
   await guestPage.goto(transport.origin+'/manage-booking'+new URL(url).hash);await guestPage.getByRole('button',{name:'Check collection status',exact:true}).click();await expect(guestPage.locator('#management-content')).toContainText('Tokenized card guarantee confirmed.');await shot(guestPage,'003-guest-collected')
  }
  await collect(firstUrl)
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();const guarantee=fees.locator(`[data-card-guarantee="${first.id}"]`);await guarantee.locator('summary').click();await expect(guarantee).toContainText('Tokenized card guarantee confirmed.');await shot(page,'003-owner-current',guarantee)
  await guarantee.getByRole('button',{name:'End card guarantee',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
  await guestPage.goto(transport.origin+'/manage-booking'+new URL(firstUrl).hash);await expect(guestPage.locator('#management-content')).toContainText('Authorization expired');await expect(guestPage.getByRole('button',{name:'Continue to Stripe'})).toHaveCount(0);await shot(guestPage,'003-guest-expired')
  await page.goto(transport.origin+'/preshift?date='+date);await expect(page.getByRole('article',{name:'Pre-shift sheet'})).toContainText('Card guarantee: expired');await shot(page,'003-sheet-expired');await page.goto(transport.origin+'/app#floor');await page.locator('.app-main[aria-busy=false]').waitFor();
  const renewedUrl=await issue();await collect(renewedUrl);assert.equal(edge.sessions.size,2)
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
  await page.goto(transport.origin+'/preshift?date='+date);const sheet=page.getByRole('article',{name:'Pre-shift sheet'});await expect(sheet).toContainText('Card guarantee: current');await expect(sheet).not.toContainText('Card guarantee: expired');await expect(sheet).toContainText('Held guarantee amount: USD 0.00');await expect(sheet).toContainText('Maximum agreed fee: USD 40.00');await shot(page,'003-sheet');await page.emulateMedia({media:'print'});await expect(sheet).toContainText('No funds held');await shot(page,'003-print');await page.emulateMedia({media:'screen'})
  const pdf=await (await h.request('/api/preshift.pdf?date='+date)).text();assert.ok(pdf.includes('Held guarantee amount: USD 0.00')&&pdf.includes('Maximum agreed fee: USD 40.00'))
  const manager=await h.signIn('synthetic-placemat-guarantee-ui@example.test','admin'),denied=await (await h.request('/preshift?date='+date,{as:manager})).text();assert.ok(!denied.includes('Held guarantee amount'))
  await page.goto(transport.origin+'/app#settings');await page.locator('.app-main[aria-busy=false]').waitFor();await settings.locator('summary').click();await settings.getByRole('button',{name:'Disconnect Stripe collection',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();await settings.locator('summary').click();await expect(settings).toContainText('disconnected');await shot(page,'001-disconnected',settings)
  // These existing shells use visible words on all controls; the new form adds no icon-only action.
  for(const p of [page,guestPage])assert.deepEqual(await p.locator('button,a[href]').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height&&!n.textContent.trim()).map(n=>n.outerHTML)),[])
  assert.deepEqual(errors,[]);console.log(`PAY-001 merchant settings and PAY-003 guest consent, renewal, owner-only sheets, print and PDF passed at ${width}`)
 }finally{await guest.close();await owner.close();await browser.close();await transport.close();await h.close()}
}

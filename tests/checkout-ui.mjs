// BOOK-006: held inventory, tab recovery, uncertain booking responses and explicit Checkout closure.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,service} from './api/harness.mjs'
import {paymentEdge} from './api/payment-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const edge=paymentEdge(),h=await installation({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:async request=>{
  const path=new URL(request.url).pathname
  if(request.method==='POST'&&path.endsWith('/expire')){const session=edge.sessions.get(path.split('/').at(-2));assert.ok(session);session.status='expired';return Response.json(session)}
  return edge.edge(request)
 }})
 const transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await service(h,{tables:1,seats:4,covers:40}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  const shot=async(name,locator=page)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await locator.screenshot({path:resolve(shots,`BOOK-006-${name}-${width}.png`),...(locator===page?{fullPage:true}:{})})}
  const choose=async()=>{
   await page.locator('[data-public-command=search] [name=date]').fill(f.service.startAt.slice(0,10));await page.locator('[name=partySize]').fill('4');await page.getByRole('button',{name:'Find available times',exact:true}).click();await page.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   await page.locator('[name=public-result]').selectOption({index:1});await page.locator('[data-public-command=book] [name=name]').fill('Elena Torres');await page.locator('[data-public-command=book] [name=email]').fill('elena-torres@example.test');await page.locator('[name=requestsAcknowledged]').check()
  }
  await page.goto(transport.origin+'/book');await page.locator('[name=date]').waitFor();await choose();await page.getByRole('button',{name:'Hold and review',exact:true}).click();await page.getByRole('heading',{name:'Table held for you',exact:true}).waitFor();await shot('held-expiry')
  assert.equal((await h.api('/api/state')).state.bookings.length,0)
  await page.reload();await page.getByRole('heading',{name:'Table held for you',exact:true}).waitFor();assert.match(await page.locator('#public-content').innerText(),/recovered the hold/);await shot('recovered-hold')
  await page.getByRole('button',{name:'Release hold',exact:true}).click();await page.getByRole('status').filter({hasText:'Hold released. Choose an available time.'}).waitFor();await choose()
  let interrupted,original
  await page.route('**/api/public/book',async route=>{original=route.request().postDataJSON();const response=await route.fetch();assert.equal(response.status(),201);interrupted=true;await route.abort()},{times:1})
  await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(interrupted,true);assert.equal((await h.api('/api/state')).state.bookings.length,1);await shot('uncertain-response',page.locator('#notice'))
  await page.reload();await page.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();await shot('recovered-one-booking')
  const recovered=(await h.api('/api/public/book',original,{as:'',status:201})).result,view=await h.api('/api/state');assert.equal(view.state.bookings.length,1);assert.equal(view.state.bookings[0].id,recovered.id)
  const request=await h.command('payment.request',{bookingId:recovered.id,amountCents:10000,dueAt:new Date(Date.now()+7200000).toISOString(),followupOwnerId:view.actor.id,reason:'Guest agreed to the reservation deposit'})
  await h.command('payment.link',{requestId:request.requestId});assert.equal(edge.sessions.size,1)
  const cookies=h.cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:transport.origin,secure:true,sameSite:'Lax'}});await context.addCookies(cookies)
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.locator('.app-main[aria-busy=false]').waitFor()
  const payment=page.locator(`[data-payment-request="${request.requestId}"]`);await shot('protected-checkout',payment)
  await payment.getByRole('button',{name:'Close unpaid Checkout',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();assert.equal((await h.api('/api/state')).paymentRequests.find(r=>r.requestId===request.requestId).state,'expired');await shot('confirmed-checkout-closed',payment)
  await h.command('booking.status',{bookingId:recovered.id,status:'cancelled'});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();await shot('released-after-closure',page.locator('#bookings-list'))
  assert.deepEqual(errors,[]);console.log(`BOOK-006 held expiry, release, interrupted-response recovery, one booking and explicit collection closure passed at ${width}`)
 }finally{await context.unrouteAll({behavior:'wait'});await context.close();await browser.close();await transport.close();await h.close()}
}

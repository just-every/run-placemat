import {localTime} from '../public/placemat-local-time.js'
// BOOK-005 first slice: a granted host identifies a returning concierge guest and books a future visit.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await service(h,{tables:3,seats:4,covers:40});await h.api('/api/public/book',publicGuest(f.service,0,{name:'Elena Torres',phone:'+14155550101'}),{as:'',status:201})
  const guest=(await h.api('/api/guests?search=Elena')).guests[0],cookie=await h.signIn('synthetic-placemat-host@example.test','member','Priya Shah'),operator=(await h.api('/auth/operators')).find(p=>p.email==='synthetic-placemat-host@example.test')
  await h.command('team.host',{operatorId:operator.id,enabled:true});await context.addCookies(cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(transport.origin+'/app');await page.locator('.app-main[aria-busy=false]').waitFor();await page.getByText('Future phone or concierge reservation',{exact:true}).click()
  const form=page.locator('[data-command="booking.phone"]');await form.locator('[name=guestId]').selectOption(guest.id);assert.equal(await form.locator('[name=name]').isDisabled(),true);await form.locator('[name=staffSource]').selectOption('concierge');await form.locator('[name=contactPreference]').selectOption('sms');await form.locator('[name=confirmationConsent]').check();await form.locator('[name=startAt]').fill(localTime(new Date(Date.parse(f.service.startAt)+90*60000).toISOString(),'Australia/Brisbane'));await form.locator('[name=requestsAcknowledged]').check()
  const shot=async(name,locator)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await locator.screenshot({path:resolve(shots,`BOOK-005-${name}-${width}.png`)})};await shot('returning-concierge-review',form)
  const before=h.messages.length;await form.getByRole('button',{name:'Create phone booking',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
  const view=await h.api('/api/state'),booking=view.state.bookings.find(b=>b.staffIntake?.source==='concierge');assert.ok(booking);assert.equal(booking.guestId,guest.id);assert.equal(booking.staffIntake.contactPreference,'sms');assert.equal(h.messages.length,before,'Intake records the preference without pretending a confirmation was sent')
  assert.match(await page.locator('#bookings-list').innerText(),/concierge.*sms contact preference/);await shot('same-live-floor-schedule',page.locator('#bookings-list'));assert.deepEqual(errors,[])
  console.log(`BOOK-005 host returning-guest concierge intake and floor schedule passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

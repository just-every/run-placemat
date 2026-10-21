// SETUP-001: actual owner forms, real D1 and the shipped browser application at both widths.
import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {restaurant,floor72,nextService} from './api/onboarding-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const cookies=h.cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  await context.addCookies(cookies)
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  const shot=async(name,locator)=>{if(locator)await locator.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'SETUP-001 fits viewport');if(shots)await page.screenshot({path:resolve(shots,`SETUP-001-${name}-${width}.png`)})}
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Placemat',exact:true}).waitFor()
  await page.getByRole('link',{name:'Settings',exact:true}).click()
  const setup=page.getByRole('article',{name:'Restaurant setup'}),form=setup.locator('form')
  for(const [label,value] of [['Trading name',restaurant.name],['Legal name',restaurant.legalName],['US street address',restaurant.address],['US phone',restaurant.phone],['Contact email',restaurant.email],['Contact website (optional)',restaurant.website],['IANA venue timezone',restaurant.timezone]])await form.getByLabel(label,{exact:true}).fill(value)
  await form.locator('[name="logoFile"]').setInputFiles({name:'cedar-icon.png',mimeType:'image/png',buffer:await readFile('public/brand/icon-192.png')})
  const online=form.locator('details').filter({has:page.locator('summary',{hasText:'online booking rules'})});await online.locator('summary').click()
  await online.getByLabel('Maximum party',{exact:true}).fill('10');await online.getByLabel('Route parties above this size to inquiries',{exact:true}).fill('10')
  const acknowledge=form.getByRole('checkbox',{name:'I acknowledge this booking policy summary.'});await acknowledge.check()
  await online.getByLabel('Advance horizon (local calendar days)',{exact:true}).fill('180');assert.equal(await acknowledge.isChecked(),false,'policy changes require renewed acknowledgment')
  assert.match(await form.locator('[data-policy-summary]').innerText(),/180 venue-local days/)
  await shot('setup-details',form.getByLabel('Trading name',{exact:true}));await shot('policy-summary',form.locator('[data-policy-summary]'))
  await acknowledge.check();await form.getByRole('button',{name:'Save restaurant setup',exact:true}).click();await page.getByRole('status').filter({hasText:'Restaurant setup and policy acknowledgment saved.'}).waitFor();assert.match(await setup.innerText(),/Policy version.*acknowledged by Venue owner/);await shot('acknowledged',setup)
  await floor72(h);await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed.'}).waitFor()
  await page.getByRole('link',{name:'Services & tables',exact:true}).click()
  const service=page.locator('#service-editor form[data-command="service.save"]'),settings=nextService()
  for(const [name,value] of Object.entries(settings))await service.locator(`[name="${name}"]`).fill(String(value))
  const before=(await h.api('/api/state')).state
  await page.getByRole('button',{name:'Preview booking page',exact:true}).click();await page.getByRole('article',{name:'Booking page preview'}).waitFor();const preview=page.getByRole('article',{name:'Booking page preview'})
  assert.match(await preview.innerText(),/72 physical seats/);assert.ok(await preview.locator('option').count()>0);assert.deepEqual((await h.api('/api/state')).state,before,'preview writes no production records');assert.deepEqual((await h.api('/api/state')).guests,[]);await shot('booking-preview',preview)
  await service.getByRole('button',{name:'Save service',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();assert.equal((await h.api('/api/state')).state.services.length,1)
  const draft=(await h.api('/api/state')).state.services[0],proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Review first dinner'});await h.command('proposal.approve',{proposalId:proposal.id})
  await page.goto(transport.origin+'/book');await page.getByLabel('Arrival date',{exact:true}).fill(settings.startAt.slice(0,10));await page.getByRole('button',{name:'Find available times',exact:true}).click();await page.getByRole('status').filter({hasText:'Availability updated'}).waitFor();assert.match(await page.locator('#restaurant-contact').innerText(),/125 Pacific Avenue/);await shot('public-booking',page.locator('#venue-line'))
  // Each timezone gets an independent real installation; service instants prevent changing its zone.
  await context.close();await browser.close();await transport.close();await h.close()
  for(const [zone,first,second] of [['America/Los_Angeles','-07:00','-08:00'],['America/New_York','-04:00','-05:00']]){
   const dst=await installation(),server=await browserServer(dst),b=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${server.certificateSpki}`]}),c=await b.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   try{
    await dst.command('venue.update',{name:'Cedar & Salt',timezone:zone});await dst.command('table.save',{label:'Dining six',seats:6,x:30,y:30})
    await c.addCookies(dst.cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:server.origin,secure:true,sameSite:'Lax'}}))
    const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(server.origin+'/setup');await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Finish setup',exact:true}).click();await p.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await p.getByRole('link',{name:'Services & tables',exact:true}).click()
    const f=p.locator('#service-editor form[data-command="service.save"]'),fill=async(startAt,endAt,offset='')=>{await f.locator('[name="name"]').fill('DST dinner');await f.locator('[name="turnMinutes"]').fill('60');await f.locator('[name="coverLimit"]').fill('72');await f.locator('[name="startAt"]').fill(startAt);await f.locator('[name="endAt"]').fill(endAt);await f.locator('[name="startOffset"]').fill(offset)}
    const capture=async(name)=>{await f.scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await p.screenshot({path:resolve(shots,`SETUP-001-${zone.split('/')[1]}-${name}-${width}.png`)})}
    await fill('2027-03-14T02:30','2027-03-14T05:00');await f.getByRole('button',{name:'Save service',exact:true}).click();await p.getByRole('alert').filter({hasText:'next valid local time is 2027-03-14 03:00'}).waitFor();assert.equal((await dst.api('/api/state')).state.services.length,0);await capture('gap-refused')
    await fill('2027-03-14T01:30','2027-03-14T04:00');await f.getByRole('button',{name:'Save service',exact:true}).click();await p.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();assert.equal((await dst.api('/api/state')).state.services.length,1);await capture('spring-created')
    // Saving closes the create editor when a service exists; reopen it for the repeated-hour service.
    await p.locator('#service-editor > details > summary').click()
    await fill('2027-11-07T01:30','2027-11-07T04:00');await f.getByRole('button',{name:'Save service',exact:true}).click();await p.getByRole('alert').filter({hasText:'occurs twice'}).waitFor();assert.equal((await dst.api('/api/state')).state.services.length,1);await capture('fold-choice-required')
    await f.locator('[name="startOffset"]').fill(first);await f.getByRole('button',{name:'Save service',exact:true}).click();await p.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();const early=(await dst.api('/api/state')).state.services[1];await capture('first-offset-created')
    await p.locator('#service-editor > details > summary').click();await fill('2027-11-07T01:30','2027-11-07T04:00',second);await f.getByRole('button',{name:'Save service',exact:true}).click();await p.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();const late=(await dst.api('/api/state')).state.services[2];assert.equal(Date.parse(late.startAt)-Date.parse(early.startAt),3600000);await capture('second-offset-created')
   }finally{await c.close();await b.close();await server.close();await dst.close()}
  }
  assert.deepEqual(errors,[]);console.log(`SETUP-001 owner onboarding, policy acknowledgment, no-write preview, public booking, LA/NY gaps and both repeated offsets passed at ${width}`)
 }finally{
  // The initial session closes before the two independent timezone journeys.
  if(browser.isConnected()){await context.close();await browser.close();await transport.close();await h.close()}
 }
}

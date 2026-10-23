import {operationsBrowserJourney} from './operations-ui-journey.mjs'
// WAIT-002: scan the real QR into the public queue, then manage and host intake.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {chromium} from '@playwright/test'
import jsQR from 'jsqr'
import {installation} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
async function transport(context,h,cookie=''){
 if(cookie)await context.addCookies(cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:h.origin,secure:true,sameSite:'Lax'}}))
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==h.origin){await route.abort();return}
  const file=resolve('public','.'+url.pathname)
  if(file.startsWith(resolve('public')+'/')&&extname(file))try{await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body:await readFile(file)});return}catch{}
  const response=await h.mf.dispatchFetch(request.url(),{method:request.method(),headers:{...request.headers(),host:url.host},...(request.postDataBuffer()?{body:request.postDataBuffer()}:{})})
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
 })
}
try{
 for(const width of [1440,390]){
  const h=await installation(),ownerContext=await browser.newContext({viewport:{width,height:1000}}),guestContext=await browser.newContext({viewport:{width,height:1000}}),hostContext=await browser.newContext({viewport:{width,height:1000}})
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   await h.command('table.save',{label:'Dining 4',seats:4,area:'Dining',accessTags:['step-free'],x:20,y:40})
   const day=new Date(Date.now()+86400000).toISOString().slice(0,10),service=await h.command('service.save',{name:'Dinner',startAt:day+'T21:00:00Z',endAt:day+'T23:00:00Z',turnMinutes:90,coverLimit:40})
   const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Public queue ready'});await h.command('proposal.approve',{proposalId:plan.id})
   const hostCookie=await h.signIn('queue-host@example.test'),host=(await h.api('/auth/operators')).find(p=>p.email==='queue-host@example.test');await h.command('team.host',{operatorId:host.id,enabled:true})
   await transport(ownerContext,h,h.cookie);await transport(guestContext,h);await transport(hostContext,h,hostCookie)
   const owner=await ownerContext.newPage(),guest=await guestContext.newPage(),hostPage=await hostContext.newPage(),errors=[]
   for(const page of [owner,guest,hostPage])page.on('pageerror',error=>errors.push(error.message))
   await owner.goto(h.origin+'/setup');await owner.getByRole('checkbox').check();await owner.getByRole('button',{name:'Finish setup'}).click();await owner.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await owner.locator('#waitlist-content summary').filter({hasText:'Public queue joining'}).click()
   const qr=owner.getByRole('img',{name:'QR code for Dinner queue joining'});await qr.waitFor();await qr.evaluate(image=>image.decode())
   const pixels=await qr.evaluate(image=>{const c=document.createElement('canvas');c.width=c.height=800;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,800);x.drawImage(image,0,0,800,800);return Array.from(x.getImageData(0,0,800,800).data)})
   const decoded=jsQR(new Uint8ClampedArray(pixels),800,800);assert.ok(decoded,'The displayed QR decodes');assert.equal(new URL(decoded.data).searchParams.get('serviceId'),service.id)
   await guest.goto(h.origin+'/queue');await guest.locator('[name=serviceId]').waitFor();assert.equal(await guest.locator('[name=serviceId]').inputValue(),service.id)
   await guest.goto(decoded.data);await guest.getByRole('heading',{name:'Join the queue',exact:true}).waitFor();await guest.locator('[name=name]').fill('Isla Chen');await guest.locator('[name=email]').fill('isla@example.test');await guest.locator('[name=partySize]').fill('3');await guest.locator('[name=preferredArea]').selectOption('Dining');await guest.locator('[name=preferredAt]').fill(`${day}T17:00`);await guest.locator('[name=requiredAccessTags]').fill('step-free');await guest.locator('[name=contactConsent]').check()
   if(shots)await guest.screenshot({path:resolve(shots,`WAIT-002-join-${width}.png`),fullPage:true})
   await guest.getByRole('button',{name:'Join queue',exact:true}).click();await guest.getByRole('heading',{name:'Your party',exact:true}).waitFor();assert.match(guest.url(),/#.{64}$/)
   assert.equal((await h.api('/api/public/queue/status',{token:new URL(guest.url()).hash.slice(1)},{as:''})).entry.preferredAt,service.startAt)
   const firstLink=guest.url();assert.equal(await guest.locator('#queue-private-link').inputValue(),firstLink)
   await guest.getByText('Update your party',{exact:true}).click();await guest.locator('form[data-queue-command=update] [name=partySize]').fill('4');await guest.getByRole('button',{name:'Save party',exact:true}).click();await guest.getByRole('status').filter({hasText:'Your party was updated'}).waitFor();assert.match(await guest.locator('.booking-confirmation').innerText(),/Party size\s+4/)
   await guest.getByText('Replace private link',{exact:true}).first().click();await guest.getByRole('button',{name:'Replace private link',exact:true}).click();await guest.getByRole('status').filter({hasText:'Private link replaced'}).waitFor();assert.notEqual(guest.url(),firstLink)
   await h.api('/api/public/queue/status',{token:new URL(firstLink).hash.slice(1)},{as:'',status:404})
   if(shots)await guest.screenshot({path:resolve(shots,`WAIT-002-managed-${width}.png`),fullPage:true})
   await owner.locator('#waitlist-content form[data-command="waitlist.intake-pause"] button').click();await owner.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await owner.locator('#waitlist-content summary').filter({hasText:'Public queue joining'}).click();assert.match(await owner.locator('#waitlist-content').innerText(),/Online joining is paused/)
   if(shots)await owner.locator('#waitlist-content').screenshot({path:resolve(shots,`WAIT-002-paused-${width}.png`)})
   const paused=await guestContext.newPage();await paused.goto(decoded.data);await paused.getByRole('button',{name:'Join queue',exact:true}).waitFor();assert.equal(await paused.getByRole('button',{name:'Join queue',exact:true}).isDisabled(),true);if(shots)await paused.screenshot({path:resolve(shots,`WAIT-002-public-paused-${width}.png`),fullPage:true});await paused.close()
   await hostPage.goto(h.origin+'/app');await hostPage.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await hostPage.locator('#waitlist-content summary').filter({hasText:'Add a waiting party'}).click()
   const intake=hostPage.locator('#waitlist-content form[data-command="waitlist.add"]');await intake.locator('[name=name]').fill('Walk-up friends');await intake.locator('[name=email]').fill('friends@example.test');await intake.locator('[name=partySize]').fill('2');await intake.locator('[name=preferredAt]').fill(`${day}T17:00`);await intake.locator('[name=preferredArea]').fill('Dining');await intake.getByRole('button',{name:'Add to waitlist'}).click();await hostPage.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();assert.ok(await hostPage.locator('#queue-management-link input').inputValue());assert.equal((await h.api('/api/state')).state.waitlist.find(row=>row.source==='staff').preferredAt,service.startAt)
   if(shots)await hostPage.locator('#waitlist-content').screenshot({path:resolve(shots,`WAIT-002-host-intake-${width}.png`)})
   await hostPage.getByRole('button',{name:'Refresh',exact:true}).click();await hostPage.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();assert.equal(await hostPage.locator('#queue-management-link input').count(),0)
   await guest.getByRole('button',{name:'Leave queue',exact:true}).click();await guest.getByRole('status').filter({hasText:'Your party left the queue'}).waitFor();assert.match(await guest.locator('.booking-confirmation').innerText(),/declined/);assert.equal(await guest.getByRole('button',{name:'Replace private link',exact:true}).count(),0)
   if(shots)await guest.screenshot({path:resolve(shots,`WAIT-002-left-${width}.png`),fullPage:true})
   assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log(`WAIT-002 QR, guest management and host intake passed at ${width}`)
  }finally{for(const context of [ownerContext,guestContext,hostContext])await context.unrouteAll({behavior:'wait'});await ownerContext.close();await guestContext.close();await hostContext.close();await h.close()}
 }
 await operationsBrowserJourney(browser)
}finally{await browser.close()}

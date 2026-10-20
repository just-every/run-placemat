// BOOK-007: real guest and manager pages share durable inquiries, at desktop and phone widths.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {inquiryService} from './api/inquiries-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
async function client(h,width,staff=false){
 const context=await browser.newContext({viewport:{width,height:1000}})
 if(staff)await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
  const file=resolve('public','.'+url.pathname)
  if(file.startsWith(resolve('public')+'/')&&extname(file)){try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}}
  const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})})
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
 });return context
}
try{for(const width of [1440,390]){
 const h=await installation(),contexts=[];try{
  const {service}=await inquiryService(h),errors=[],guestContext=await client(h,width),staffContext=await client(h,width,true);contexts.push(guestContext,staffContext)
  const page=await guestContext.newPage(),staff=await staffContext.newPage();for(const p of [page,staff])p.on('pageerror',e=>errors.push(e.message))
  const shot=async(name,p,selector)=>{const target=p.locator(selector);await target.scrollIntoViewIfNeeded();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(shots)await target.screenshot({path:resolve(shots,`BOOK-007-${name}-${width}.png`)});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Inquiry surface fits viewport')}
  await page.goto(h.origin+'/book');await page.locator('[name=date]').waitFor()
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(service.startAt))
  await page.locator('[name=date]').fill(date);await page.locator('[name=partySize]').fill('4');await page.locator('[name=area]').selectOption('Dining room');await page.locator('[name=requiredAccessTags][value=step-free]').check();await page.getByRole('button',{name:'Find available times',exact:true}).click();await page.locator('[name=public-result] option[value="0"]').waitFor({state:'attached'});await page.locator('[name=public-result]').selectOption('0')
  await page.locator('[name=name]').fill('Nora Lane');await page.locator('[name=email]').fill('nora@example.test');await page.getByText('Occasion and special requests',{exact:true}).click();await page.locator('[name=occasion]').fill('Anniversary');await page.locator('[name=requestedArea]').fill('Patio');await page.locator('[name=allergyNotes]').fill('Shellfish allergy');await page.locator('[name=highchair]').check();await page.locator('[name=requestsAcknowledged]').check();await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor()
  assert.match(await page.locator('#public-content').innerText(),/Area guaranteed: Dining room/);assert.match(await page.locator('#public-content').innerText(),/Area requested, not guaranteed: Patio/);await shot('booking-confirmed',page,'#public-content')
  await page.goto(h.origin+'/inquiry');await page.locator('[data-inquiry=create]').waitFor();await page.locator('[name=name]').fill('Elena Morrison');await page.locator('[name=email]').fill('elena@example.test');await page.locator('[name=serviceId]').selectOption(service.id);await page.locator('[name=requiredArea]').fill('Dining room');await page.locator('[name=requiredAccessTags]').fill('step-free');await page.getByText('Occasion and special requests',{exact:true}).click();await page.locator('[name=occasion]').fill('Private anniversary dinner');await page.locator('[name=requestedArea]').fill('Patio');await page.locator('[name=requestsAcknowledged]').check();await page.getByRole('button',{name:'Submit inquiry',exact:true}).click();await page.getByRole('heading',{name:'Save your private inquiry link now',exact:true}).waitFor()
  const privateLink=await page.getByRole('link',{name:'Open this inquiry later',exact:true}).getAttribute('href')
  assert.ok(privateLink);await shot('inquiry-created',page,'#inquiry-content')
  await staff.goto(h.origin+'/setup');await staff.getByRole('checkbox').check();await staff.getByRole('button',{name:'Finish setup',exact:true}).click();await staff.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await staff.getByRole('link',{name:'Group inquiries',exact:true}).click()
  const root=staff.locator('#inquiries-content'),card=root.locator('[data-inquiry-id]').first();await card.waitFor();assert.match(await card.innerText(),/16 guests/);assert.match(await card.innerText(),/Owner:/)
  const offer=card.locator('[data-inquiry-command="inquiry.reply"]');await offer.locator('[name=message]').fill('Accessible dining-room space is offered. Patio remains a request.');await offer.getByRole('button',{name:'Post exact offer',exact:true}).click();await root.getByRole('heading',{name:'Exact offer 1',exact:true}).waitFor();await shot('manager-offer',staff,'#inquiries-content')
  assert.equal(await root.getByRole('button',{name:'Convert accepted offer',exact:true}).count(),0)
  await page.goto(h.origin+privateLink);await page.getByRole('heading',{name:'Exact reservation offer',exact:true}).waitFor();assert.match(await page.locator('#inquiry-content').innerText(),/step-free/);assert.match(await page.locator('#inquiry-content').innerText(),/Dining room/);await shot('guest-offer',page,'#inquiry-content');await page.locator('[name=accept]').check();await page.getByRole('button',{name:'Accept exact offer',exact:true}).click();await page.getByText('Offer accepted. Awaiting venue conversion; no reservation yet.',{exact:true}).waitFor();await shot('guest-accepted',page,'#inquiry-content')
  await staff.getByRole('button',{name:'Refresh',exact:true}).click();await root.getByRole('button',{name:'Convert accepted offer',exact:true}).waitFor();await root.getByRole('button',{name:'Convert accepted offer',exact:true}).click();await root.getByText(/Converted reservation:/).waitFor();await shot('manager-converted',staff,'#inquiries-content')
  const state=(await h.api('/api/state')).state,converted=state.inquiries[0];assert.equal(converted.status,'converted');const booking=state.bookings.find(b=>b.id===converted.bookingId);assert.equal(booking.partySize,16);assert.equal(booking.requiredArea,'Dining room');assert.deepEqual(booking.requiredAccessTags,['step-free']);assert.equal(booking.requests.requestedArea,'Patio')
  await page.getByRole('button',{name:'Refresh conversation',exact:true}).click();await page.getByRole('alert').filter({hasText:'Inquiry unavailable.'}).waitFor();await shot('expired',page,'.booking-shell');assert.deepEqual(errors,[])
  console.log(`BOOK-007 required/requested booking and owned inquiry offer, guest acceptance, conversion and expired link passed at ${width}`)
 }finally{for(const c of contexts){await c.unrouteAll({behavior:'wait'});await c.close()}await h.close()}
}}finally{await browser.close()}

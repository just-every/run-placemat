import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {retentionFixture,retentionTick,marketingMessages,linkToken} from './api/retention-fixture.mjs'
import {publicGuest} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const screenshots=process.env.PLACEMAT_SCREENSHOTS
if(screenshots)await mkdir(screenshots,{recursive:true})
async function layout(page,scope){
 const issues=await page.evaluate(scope=>{
  const issues=[]
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Horizontal overflow')
  for(const el of document.querySelectorAll(scope+' *')){
   if(!el.getClientRects().length)continue
   const s=getComputedStyle(el),sides=['Top','Right','Bottom','Left'].map(side=>parseFloat(s['border'+side+'Width']))
   if([...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(s.fontSize)<13)issues.push('Text below 13px')
   if(parseFloat(s.borderRadius)>0&&sides.some(n=>n>0)&&sides.some(n=>n===0))issues.push('Partial rounded border')
   if(el.matches('button')&&!el.textContent.trim())issues.push('Icon-only control needs tooltip')
  }
  return issues
 },scope);assert.deepEqual(issues,[])
}
for(const width of [1440,390]){
 const f=await retentionFixture(),{h}=f,transport=await browserServer(h)
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
 const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),guestContext=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const owner=await context.newPage(),guest=await guestContext.newPage(),errors=[],urls=[]
  for(const page of [owner,guest]){page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>urls.push(r.url()))}
  const cookies=()=>context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const shot=async(page,name,scope='main')=>{await layout(page,scope);if(screenshots)await page.screenshot({path:resolve(screenshots,`CRM-002-${name}-${width}.png`),fullPage:true})}
  await cookies();await owner.goto(transport.origin+'/setup');await owner.getByRole('checkbox').check();await owner.getByRole('button',{name:'Finish setup',exact:true}).click();await owner.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await owner.getByRole('link',{name:'Settings',exact:true}).click();await owner.locator('#settings').scrollIntoViewIfNeeded();await owner.getByRole('link',{name:'Guest retention workflows',exact:true}).waitFor();await shot(owner,'settings-entry','#settings')
  await owner.getByRole('link',{name:'Guest retention workflows',exact:true}).click();await owner.getByRole('heading',{name:'Guest retention',exact:true}).waitFor()
  await owner.getByText('Create workflow',{exact:true}).click()
  const form=owner.locator('form[data-action=draft]')
  await form.locator('[name=name]').fill('After your first visit');await form.locator('[name=trigger]').selectOption('first-to-second');await form.locator('[name=offer]').fill('Come back for our seasonal menu. Quote CEDAR with your next reservation.')
  await shot(owner,'workflow-draft')
  await form.getByRole('button',{name:'Create draft',exact:true}).click();await owner.getByRole('button',{name:'Preview recipients',exact:true}).click();await owner.getByRole('heading',{name:'Exact draft preview',exact:true}).waitFor()
  assert.equal(await owner.locator('#preview li').count(),3);await shot(owner,'exact-audience-preview')
  await owner.getByRole('button',{name:'Approve exact workflow',exact:true}).click();await owner.getByRole('button',{name:'Stop workflow',exact:true}).waitFor()
  await f.complete(f.bookings[0]);await f.complete(f.bookings[1]);await h.command('booking.status',{bookingId:f.bookings[2].id,status:'cancelled'})
  await retentionTick(h,f.tickAt);assert.equal(marketingMessages(h).length,2);await cookies();await owner.reload();await owner.locator('[data-delivery]').first().waitFor();await shot(owner,'accepted-messages')
  const token=linkToken(marketingMessages(h)[0]),person=(await h.api('/api/retention')).guests.find(g=>g.email===marketingMessages(h)[0].to[0])
  await guest.goto(transport.origin+'/retention#'+token);await guest.getByRole('heading',{name:'Your invitation',exact:true}).waitFor();await shot(guest,'guest-offer')
  const startAt=new Date(h.now()+86400000).toISOString(),endAt=new Date(Date.parse(startAt)+4*3600000).toISOString(),s=await h.command('service.save',{name:'Return dinner',startAt,endAt,turnMinutes:90,coverLimit:30}),p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Return visit service ready'})
  await h.command('proposal.approve',{proposalId:p.id})
  await guest.getByRole('link',{name:'Find a table',exact:true}).click();await guest.locator('[data-public-command=search]').waitFor();await guest.locator('#public-content[aria-busy]').waitFor({state:'detached'})
  const search=guest.locator('[data-public-command=search]')
  await search.locator('[name=date]').fill(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(startAt)))
  await search.getByRole('button',{name:'Find available times',exact:true}).click();await guest.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
  const choice=guest.locator('[name=public-result] option').filter({hasText:'Return dinner'}).first();await guest.locator('[name=public-result]').selectOption(await choice.getAttribute('value'))
  const booking=guest.locator('[data-public-command=book]');await booking.locator('[name=name]').fill(person.name);await booking.locator('[name=email]').fill(person.email);await booking.locator('[name=requestsAcknowledged]').check()
  const attributed=guest.waitForResponse(r=>r.url().endsWith('/api/public/retention/attribution')&&r.ok())
  await booking.getByRole('button',{name:'Confirm booking',exact:true}).click();await guest.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();await attributed;await shot(guest,'repeat-booking')
  const repeat=(await h.api('/api/state')).state.bookings.find(b=>b.serviceId===s.id);await f.complete(repeat)
  await owner.reload();await owner.getByText('1 repeat bookings',{exact:false}).waitFor();await shot(owner,'attributed-return-visit')
  await guest.goto(transport.origin+'/retention#'+token);await guest.getByRole('button',{name:'Unsubscribe from marketing',exact:true}).click();await guest.getByRole('heading',{name:'Unsubscribed',exact:true}).waitFor();await shot(guest,'unsubscribed')
  await owner.getByRole('button',{name:'Stop workflow',exact:true}).click();await owner.getByText('Workflow stopped.',{exact:true}).waitFor();await shot(owner,'workflow-stopped')
  // New guests request and confirm purpose-specific permission through the public page.
  const newGuest=publicGuest(s,4);await h.api('/api/public/book',newGuest,{as:'',status:201})
  await guest.goto(transport.origin+'/retention');await guest.locator('[name=email]').fill(newGuest.email);await guest.locator('[name=permission]').check();await shot(guest,'request-permission');await guest.getByRole('button',{name:'Send confirmation link',exact:true}).click();await guest.getByRole('heading',{name:'Check your email',exact:true}).waitFor()
  const confirm=linkToken(h.messages.findLast(m=>m.text?.includes('No marketing permission is active')))
  await guest.goto(transport.origin+'/retention#'+confirm);await guest.locator('[name=permission]').check();await shot(guest,'confirm-permission');await guest.getByRole('button',{name:'Confirm email opt-in',exact:true}).click();await guest.getByRole('heading',{name:'Marketing email enabled',exact:true}).waitFor();await shot(guest,'permission-enabled')
  await guest.getByRole('button',{name:'Unsubscribe from marketing',exact:true}).click();await guest.getByRole('heading',{name:'Unsubscribed',exact:true}).waitFor()
  assert.ok(urls.every(url=>!url.includes(token)&&!url.includes(confirm)),'Private campaign credentials stay out of HTTP URLs');assert.deepEqual(errors,[])
  console.log(`Retention Settings approval, delivered offer, attributed return visit and email consent passed at ${width}`)
 }finally{await guestContext.close();await context.close();await browser.close();await transport.close();await h.close()}
}

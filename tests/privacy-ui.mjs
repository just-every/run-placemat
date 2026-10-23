import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,acceptDownloads:true})
 try{
  const {service:s}=await service(h);await h.api('/api/public/book',publicGuest(s,0,{name:'Elena Torres',requests:{dietaryNotes:'No dairy please'},requestsAcknowledged:true}),{as:'',status:201})
  await h.api('/api/public/book',publicGuest(s,1,{name:'Marcus Chen'}),{as:'',status:201})
  const guest=(await h.api('/api/state')).guests.find(g=>g.name==='Elena Torres'),errors=[]
  await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(transport.origin+'/privacy')
  await page.locator('#privacy-guest option').first().waitFor({state:'attached'});await page.locator('#privacy-guest').selectOption(guest.id)
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await page.screenshot({path:resolve(shots,`DATA-004-${name}-${width}.png`),fullPage:true})}
  await page.getByText('Retention settings',{exact:true}).click()
  for(const key of ['guestNotes','messageContent','imports','financialEvidence']){await page.locator(`[name="${key}-days"]`).fill('365');await page.locator(`[name="${key}-ground"]`).fill(key==='financialEvidence'?'Accounting evidence retained under owner review':'Service purpose and guest consent review')}
  await page.locator('[name="financialEvidence-ground"]').press('Tab');await page.getByRole('status').filter({hasText:'Retention settings saved.'}).waitFor();await shot('retention-settings')
  await page.getByRole('button',{name:'Review access export',exact:true}).click();await page.getByRole('heading',{name:'Access export · Elena Torres'}).waitFor();await shot('guest-access')
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download guest data'}).click();assert.equal(await (await downloading).failure(),null)
  await page.locator('[data-correction] [name=value]').fill('Lactose-free requested');await page.locator('[data-correction] [name=reason]').fill('Guest clarified the request by phone');await page.locator('[name=guestConfirmed]').check();await page.getByRole('button',{name:'Record correction'}).click();await page.getByRole('status').filter({hasText:'Guest clarification recorded.'}).waitFor()
  await page.getByRole('button',{name:'Review access export',exact:true}).click();await page.locator('#guest-access-summary').filter({hasText:'Lactose-free requested'}).waitFor();await shot('corrected-need')
  await page.getByRole('button',{name:'Review erasure',exact:true}).click();await page.locator('#erase-guest [name=confirm]').fill('ERASE');await page.getByRole('button',{name:'Erase guest content',exact:true}).click();await page.getByRole('status').filter({hasText:'Guest content erased.'}).waitFor()
  await page.getByText('Add a processor record',{exact:true}).click();await page.locator('#processor-add [name=provider]').fill('Message provider');await page.locator('#processor-add [name=reference]').fill('synthetic-placemat-1');await page.getByRole('button',{name:'Add follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Processor follow-up recorded.'}).waitFor()
  await page.locator('[data-task] [name=state]').selectOption('confirmed');await page.locator('[data-task] [name=ground]').fill('Provider confirmed deletion in receipt synthetic-placemat-2');await page.getByRole('button',{name:'Record outcome',exact:true}).click();await page.getByRole('status').filter({hasText:'Processor outcome recorded.'}).waitFor();await shot('erased-and-processor-confirmed')
  await page.getByRole('button',{name:'Review eligible guests'}).click();await page.locator('#retention-review').getByText('Marcus Chen',{exact:false}).waitFor();await shot('retention-review')
  assert.equal((await h.api('/api/privacy/access',{guestId:guest.id})).guest.erased,true);assert.deepEqual(errors,[]);console.log(`Privacy access, correction, erasure and processor follow-up passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

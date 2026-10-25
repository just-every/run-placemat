// DATA-003: use shipped owner download controls with real native sessions and D1.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
import {businessService,csvRecords} from './api/business-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
  const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true})
  try{
   const fixture=await businessService(h),errors=[]
   const cookies=cookie=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
   await context.addCookies(cookies(h.cookie))
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   const open=async()=>{await page.getByRole('link',{name:'Settings',exact:true}).click();await page.locator('#business-exports > summary').click();await page.locator('#business-exports[open]').waitFor()}
   const reopen=async()=>{await page.reload();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await open()}
   const shot=async name=>{await page.getByRole('link',{name:'Settings',exact:true}).click();await page.locator('#settings').scrollIntoViewIfNeeded();await page.locator('#settings h2').waitFor({state:'visible'});if(shots)await page.locator('#settings').screenshot({path:resolve(shots,`DATA-003-${name}-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'DATA-003: Settings fits viewport')}
   await open();await shot('owner-downloads')
   const download=async kind=>{
    const pending=page.waitForEvent('download');await page.locator(`#business-exports a[href="/api/business-export/${kind}.csv"]`).click();const file=await pending
    assert.equal(await file.failure(),null,'DATA-003: CSV download completes')
    return csvRecords(await readFile(await file.path(),'utf8'))
   }
   for(const kind of ['money-items','money-receipts','money-payouts','money-adjustments'])assert.equal((await download(kind)).length,0,'Empty ledger exports are available through the owner download controls')
   const guests=await download('guests'),guest=guests.find(row=>row.id===fixture.guest)
   assert.equal(guest.name,'Alex "Cedar", Rowan');assert.match(guest.notes,/^'=SUM/)
   const bookings=await download('bookings');assert.ok(bookings.some(row=>row.id===fixture.online.id&&row.guestId===guest.id))
   const reports=await download('performance-reports');assert.equal(reports[0].id,fixture.publication.publication.id)
   const queue=await download('waitlist');assert.equal(queue[0].contactConsent,'true');assert.ok(!queue[0].data_json.includes('managementTokenHash'))
   await h.command('guest.update',{guestId:fixture.guest,notes:'Staff corrected the seating note'})
   await reopen()
   const updated=await download('guests');assert.equal(updated.find(row=>row.id===fixture.guest).notes,'Staff corrected the seating note','DATA-003: reopening download reflects latest change')
   await h.command('guest.erase',{guestId:fixture.guest,confirm:'ERASE'})
   await reopen()
   const redacted=await download('guests');assert.ok(!JSON.stringify(redacted).includes('Alex'));assert.ok(!JSON.stringify(redacted).includes('guest0@example.test'))
   assert.equal(redacted.find(row=>row.id===fixture.guest).erased,'true');await shot('erasure-complete')
   const member=await h.signIn('read-only@example.test');await context.clearCookies();await context.addCookies(cookies(member));await page.goto(transport.origin+'/app');await page.getByRole('link',{name:'Settings',exact:true}).click()
   await page.locator('#settings-content').getByText('Venue settings can be changed by an owner or admin.').waitFor();assert.equal(await page.locator('#business-exports').count(),0,'DATA-003: nonowner has no bulk export controls');await shot('member-settings')
   assert.deepEqual(errors,[]);console.log(`DATA-003 owner downloads, current changes, erasure and role controls passed at ${width}`)
  }finally{await context.close();await browser.close();await transport.close();await h.close()}
 }

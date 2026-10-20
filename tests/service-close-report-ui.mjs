// REPORT-007 partial: shipped manager UI, real Worker/session/D1, network-edge interception only.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {closeReportService} from './api/service-close-report-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try {
 for(const width of [1440,390]) {
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try {
   const fixture=await closeReportService(h),errors=[]
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
    const file=resolve('public','.'+url.pathname)
    if(file.startsWith(resolve('public')+'/')&&extname(file)) {
     try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}
    }
    const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Waitlist',exact:true}).click()
   await page.getByText('Close service and queue',{exact:true}).click()
   const closeForm=page.locator('form[data-command="service.close"]')
   await closeForm.locator('[name=reason]').fill('Dinner operations complete; unresolved follow-up assigned')
   const closeResponse=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='service.close')
   await closeForm.getByRole('button').click();const closed=await closeResponse;assert.ok(closed.ok(),await closed.text())
   await page.getByRole('link',{name:'Reservation reports',exact:true}).click()
   const root=page.locator('#close-report-content')
   await root.locator('[name=serviceId]').selectOption(fixture.service.id)
   await root.getByRole('button',{name:'Open close report',exact:true}).click()
   await root.locator('[data-original-close]').waitFor()
   const original=await h.api('/api/reports/closed?serviceId='+fixture.service.id)
   assert.equal(original.original.coverReport.summary.noShow.covers,4)
   assert.equal(original.original.coverReport.summary.attended.covers,6)
   const shot=async name=>{if(shots)await root.screenshot({path:resolve(shots,`REPORT-007-${name}-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Report fits viewport')}
   await root.getByText('No-show: 4 covers / 10 total covers · 2 parties',{exact:true}).click()
   await root.getByText('Walk-in and waitlist seating',{exact:true}).click()
   await root.getByText('Turn and wait observations',{exact:true}).click()
   await shot('fixed-close')
   await h.command('booking.stage',{bookingId:fixture.waitlistSeats[0].id,correctsEventId:fixture.correctionEventId,reason:'Ordering was recorded accidentally; correct the observed course'})
   await root.getByRole('button',{name:'Open close report',exact:true}).click()
   await root.getByRole('heading',{name:'Observations after close (1)',exact:true}).waitFor()
   const updated=await h.api('/api/reports/closed?serviceId='+fixture.service.id)
   assert.deepEqual(updated.original,original.original)
   assert.equal(updated.adjustments[0].actor,(await h.api('/api/state')).actor.id)
   assert.ok(updated.adjustments[0].at)
   const csv=await h.request('/api/reports/closed.csv?serviceId='+fixture.service.id);assert.equal(csv.status,200)
   const csvText=await csv.text();for(const b of fixture.bookings)assert.ok(csvText.includes(b.id))
   assert.ok(await root.getByRole('link',{name:'Download original close rows CSV'}).isVisible())
   await shot('attributed-adjustment')
   assert.deepEqual(errors,[])
   console.log(`REPORT-007 fixed operational close report, reconciled CSV and attributed later correction passed at ${width}`)
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
 }
}finally{await browser.close()}

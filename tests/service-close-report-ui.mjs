// REPORT-007: shipped manager UI, real Worker/session/D1, network-edge interception only.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {browserServer} from './browser-server.mjs'
import {installation} from './api/harness.mjs'
import {closeReportService} from './api/service-close-report-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try {
 for(const width of [1440,390]) {
  const h=await installation(),transport=await browserServer(h),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
  try {
   const fixture=await closeReportService(h),errors=[]
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
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
   // Recovered covers drill to each no-show and the seated waitlist party that refilled its table; fees are honestly not recorded.
   await root.getByText('Recovered covers: 4 / 4 freed covers · 2 seated replacement parties',{exact:true}).click()
   const recovery=root.locator('[data-close-recovery]');assert.match(await recovery.innerText(),/From cancellations: 0 covers · from no-shows: 4 covers/)
   assert.equal(await recovery.getByText('Seated replacements (staff-recorded):').count(),2)
   assert.match(await root.locator('[data-close-fees]').innerText(),/^Fees charged, waived and refunded: Not recorded: Placemat takes no payments yet/)
   const pdfHref=await root.getByRole('link',{name:'Download PDF',exact:true}).getAttribute('href'),pdf=await h.request(pdfHref)
   assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.match(await pdf.text(),/^%PDF-1\.4[\s\S]*Recovered from cancellations and no-shows: 4 \/ 4 freed covers/)
   await shot('fixed-close')
   // Print opens every drilldown and prints only the report.
   await page.evaluate(()=>{window.printed=0;window.print=()=>{window.printed++}})
   await root.getByRole('button',{name:'Print report',exact:true}).click()
   assert.equal(await page.evaluate(()=>window.printed),1);assert.ok(await root.locator('[data-original-close] details').evaluateAll(all=>all.every(d=>d.open)),'every drilldown is open for printing')
   await page.emulateMedia({media:'print'})
   assert.equal(await root.locator('[data-original-close]').evaluate(el=>getComputedStyle(el).visibility),'visible')
   assert.equal(await page.locator('.app-nav a',{hasText:'Waitlist'}).first().evaluate(el=>getComputedStyle(el).visibility),'hidden','staff navigation is left off the printout')
   if(shots)await page.screenshot({path:resolve(shots,`REPORT-007-print-${width}.png`),fullPage:true})
   await page.emulateMedia({media:'screen'})
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
   console.log(`REPORT-007 fixed close report with seated-only recovered covers, fee status, PDF, print view, reconciled CSV and attributed later correction passed at ${width}`)
  }finally{await context.close();await transport.close();await h.close()}
 }
}finally{await browser.close()}

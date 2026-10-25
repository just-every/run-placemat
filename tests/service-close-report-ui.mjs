// REPORT-007 and REPORT-001 (parties above 20): shipped manager UI, real Worker/session/D1, network-edge interception only.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {browserServer} from './browser-server.mjs'
import {installation,publicGuest} from './api/harness.mjs'
import {closeReportService} from './api/service-close-report-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try {
 for(const width of [1440,390]) {
  const h=await installation(),transport=await browserServer(h),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
  try {
   const fixture=await closeReportService(h),errors=[]
   // A banquet party of 24 is a supported booking; the report screen must list it by default and under the size filters.
   const banquetDay=new Date(Date.now()+30*86400000).toISOString().slice(0,10),banquetTables=[await h.command('table.save',{label:'B1',area:'Banquet',seats:12,x:10,y:80}),await h.command('table.save',{label:'B2',area:'Banquet',seats:12,x:40,y:80})]
   await h.command('combination.save',{tableIds:banquetTables.map(t=>t.id),capacity:24,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
   const banquet=await h.command('service.save',{name:'Banquet',startAt:banquetDay+'T18:00:00Z',endAt:banquetDay+'T23:00:00Z',turnMinutes:120,coverLimit:100,bookingRules:{'walk-in':{minParty:1,maxParty:40,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:40,blockedStarts:[]}}})
   await h.command('proposal.approve',{proposalId:(await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:banquet.id},reason:'Review banquet service'})).id})
   await h.command('booking.walkin',publicGuest(banquet,11,{startAt:banquet.startAt,partySize:24,tableIds:banquetTables.map(t=>t.id)}))
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Waitlist',exact:true}).click()
   await page.getByText('Close service and queue',{exact:true}).click()
   const closeForm=page.locator('form[data-command="service.close"]')
   await closeForm.locator('[name=reason]').fill('Dinner operations complete; unresolved follow-up assigned')
   const closeResponse=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='service.close')
   await closeForm.getByRole('button').click();const closed=await closeResponse;assert.ok(closed.ok(),await closed.text())
   // Closing also refreshes the staff page. Wait for the closed-service control
   // to disappear before using filters that that refresh replaces.
   await closeForm.waitFor({state:'detached'})
   await page.getByRole('link',{name:'Reservation reports',exact:true}).click()
   const reservations=page.locator('#reservation-result')
   await reservations.locator('details[open]').getByText('Banquet · 24 guests').waitFor()
   const filters=page.locator('#reservation-filters');await filters.locator('[name=partyMin]').fill('21');await filters.getByRole('button',{name:'Apply report filters',exact:true}).click()
   await reservations.locator('a[href^="/api/reports/reservations.csv"][href*="partyMin=21"]').waitFor();await reservations.getByText('All matching reservations (1)').waitFor();assert.match(await reservations.innerText(),/Booked: 24 covers · 1 reservations/)
   await filters.locator('[name=partyMin]').fill('');await filters.locator('[name=partyMax]').fill('20');await filters.getByRole('button',{name:'Apply report filters',exact:true}).click()
   await reservations.locator('a[href^="/api/reports/reservations.csv"][href*="partyMax=20"]').waitFor();assert.equal(await reservations.getByText(/Banquet · 24 guests/).count(),0);await filters.locator('[name=partyMax]').fill('')
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
   // Recovered covers drill to each no-show and the seated waitlist party that refilled its table; fees show recorded zeros.
   await root.getByText('Recovered covers: 4 / 4 freed covers · 2 seated replacement parties',{exact:true}).click()
   const recovery=root.locator('[data-close-recovery]');assert.match(await recovery.innerText(),/From cancellations: 0 covers · from no-shows: 4 covers/)
   assert.equal(await recovery.getByText('Seated replacements (staff-recorded):').count(),2)
   assert.match(await root.locator('[data-close-fees]').innerText(),/Charged \$0.00 · waived \$0.00 · refunded \$0.00 USD/)
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

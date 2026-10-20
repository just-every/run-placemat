// REPORT-002: a manager reads service facts, traces observations and retains a publication at both widths.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {performanceService} from './api/performance-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   const fixture=await performanceService(h),errors=[]
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
    const file=resolve('public','.'+url.pathname)
    if(file.startsWith(resolve('public')+'/')&&extname(file)){try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}}
    const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Reservation reports',exact:true}).click()
   await page.locator('#performance-result [data-performance-publish]').waitFor()
   const shot=async(name,locator=page.locator('#performance-content'))=>{
    if(shots)await locator.screenshot({path:resolve(shots,`REPORT-002-${name}-${width}.png`)})
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('#performance-content *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,text:el.textContent.slice(0,80),right:el.getBoundingClientRect().right})).slice(-12))
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Performance page fits the viewport: '+JSON.stringify(overflow))
   }
   await shot('live')
   const actual=page.locator('[data-performance-distribution=actualTurns]');await actual.locator('summary').click()
   assert.match(await actual.innerText(),/3 observations · 1 missing/)
   await actual.locator('[data-performance-trace]').first().click()
   const history=page.locator('#performance-history');await history.getByRole('heading',{name:'Booking history',exact:true}).waitFor()
   assert.match(await history.innerText(),/completed/);assert.match(await history.innerText(),/Ana Torres/);await shot('outlier-history',history)
   for(const selector of ['[data-performance-distribution=arrivalLateness]','[data-performance-distribution=actualWait]','[data-performance-distribution=quoteDeviation]'])await page.locator(selector+' summary').click()
   await shot('distributions',page.locator('#performance-distributions'))
   for(const name of ['Server covers','Section covers'])await page.locator('#performance-result').getByText(name,{exact:true}).click()
   assert.match(await page.locator('#performance-result').innerText(),/Attended: 4 covers/)
   for(const selector of ['#performance-utilization','#performance-queue','#performance-pacing','#performance-parties'])await page.locator(selector+' > summary').click()
   assert.match(await page.locator('#performance-queue').innerText(),/1 abandoned parties/)
   await page.locator('#performance-queue [data-performance-trace]').last().click();assert.match(await history.innerText(),/abandoned/)
   await shot('staffing-and-service')
   const published=page.waitForResponse(r=>r.url().endsWith('/api/reports/performance')&&r.request().method()==='POST')
   await page.locator('[data-performance-publish]').click();const saved=await (await published).json()
   assert.ok(saved.publication.id);await page.locator('#performance-result [role=status]').filter({hasText:'This report is fixed'}).waitFor();await shot('published')
   const completed=saved.report.rows.find(b=>b.bookingId===fixture.overruns[0].id).serviceHistory.at(-1)
   await h.command('booking.stage',{bookingId:fixture.overruns[0].id,correctsEventId:completed.id,reason:'Completion was tapped early'})
   // Reselecting a publication performs a fresh authorized read; it must still retain the original three turns.
   await page.locator('[data-performance-live]').click();await page.locator('[data-performance-distribution=actualTurns] summary').filter({hasText:'2 observations'}).waitFor()
   await page.locator('#performance-publications').selectOption(saved.publication.id)
   await page.locator('#performance-result [role=status]').filter({hasText:'The floor has changed'}).waitFor()
   assert.match(await page.locator('[data-performance-distribution=actualTurns] summary').innerText(),/3 observations/);await shot('retained-after-correction')
   await page.locator('[data-performance-live]').click();await page.locator('[data-performance-distribution=actualTurns] summary').filter({hasText:'2 observations'}).waitFor()
   await page.locator('#performance-parties > summary').click()
   await page.locator(`#performance-parties [data-performance-trace="${fixture.overruns[0].id}"]`).click()
   assert.ok((await history.innerText()).includes(completed.id));assert.match(await history.innerText(),/Corrects/);await shot('correction-history',history)
   assert.deepEqual(errors,[])
   console.log(`REPORT-002 distributions, service drilldowns, publication and traceable correction passed at ${width}`)
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
 }
}finally{await browser.close()}

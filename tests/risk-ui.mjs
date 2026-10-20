// AGENT-005: real native manager, public booking doors and shipped browser modules.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {riskService} from './api/risk-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   const {risky,unknown,service}=await riskService(h),original=(await h.api('/api/state')).state.bookings.find(b=>b.id===risky.id),errors=[]
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
   await page.locator('#risk-filters [name=serviceId]').selectOption(service.id);await page.getByRole('button',{name:'Open no-show review',exact:true}).click()
   const card=()=>page.locator(`[data-risk-booking="${risky.id}"]`)
   await card().waitFor();await card().getByText('Attendance and reconfirmation evidence',{exact:true}).click()
   assert.match(await card().innerText(),/prior no-show/);assert.match(await card().innerText(),/no-show/);assert.match(await card().innerText(),/Event/);assert.match(await card().innerText(),/lead time/i)
   assert.match(await page.locator(`[data-risk-booking="${unknown.id}"]`).innerText(),/missing history is unknown/)
   const shot=async name=>{if(shots)await page.locator('#risk-content').screenshot({path:resolve(shots,`AGENT-005-${name}-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Review fits the viewport')}
   await shot('facts')
   await card().getByText('Review contact or policy suggestion',{exact:true}).click()
   let form=card().locator('form[data-risk-decide]')
   await form.locator('[name=reason]').fill('Confirm plans personally; table and terms stay unchanged')
   await form.locator('[name=dueAt]').fill(new Date(Date.now()+3600000).toISOString().slice(0,16))
   let response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='risk.decide')
   await form.getByRole('button',{name:'Record manager decision'}).click();const accepted=(await (await response).json()).result
   await page.locator('[data-risk-message]').filter({hasText:'Manager decision recorded'}).waitFor()
   await page.locator(`[data-risk-decision="${accepted.id}"] form[data-risk-complete]`).waitFor()
   await shot('owned-task')
   await card().getByText('Review contact or policy suggestion',{exact:true}).click();form=card().locator('form[data-risk-decide]')
   await form.locator('[name=kind]').selectOption('policy-review');await form.locator('[name=decision]').selectOption('declined');await form.locator('[name=reason]').fill('Keep original policy; uncertain flag is no reason for a fee')
   response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='risk.decide')
   await form.getByRole('button',{name:'Record manager decision'}).click();assert.ok((await response).ok())
   await page.locator('#risk-result > details > summary').filter({hasText:'Decision history (2)'}).waitFor();await page.locator('#risk-result > details > summary').click()
   assert.match(await page.locator('#risk-result > details').innerText(),/Policy review · declined/)
   assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===risky.id),original)
   const completion=page.locator(`[data-risk-decision="${accepted.id}"] form[data-risk-complete]`)
   await completion.locator('[name=outcome]').fill('Venue called guest; plans confirmed, staff-recorded')
   response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='risk.complete')
   await completion.getByRole('button',{name:'Mark task complete'}).click();assert.ok((await response).ok())
   await page.getByRole('heading',{name:'Manager-owned due tasks (0)',exact:true}).waitFor();await shot('decisions-complete')
   await h.command('booking.stage',{bookingId:risky.id,stage:'seated'})
   await page.getByRole('button',{name:'Open no-show review',exact:true}).click()
   await page.locator('#risk-result').getByText(/Reviewed with flags: 1 · Attended: 1 · No-show: 0 · Pending: 0/).waitFor();await shot('attended-review')
   assert.deepEqual(errors,[]);console.log(`AGENT-005 manager review, declined policy, completed task, preserved commitment and attended outcome passed at ${width}`)
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
 }
}finally{await browser.close()}

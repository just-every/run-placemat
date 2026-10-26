import './payment-operations-ui.mjs'
// ROLE-004: the owner grants finance access and the finance identity reconciles charges and downloads a finance CSV, seeing no guest values.
import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest,service} from './api/harness.mjs'
import {paymentEdge} from './api/payment-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const edge=paymentEdge(),h=await installation({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:edge.edge}),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true})
 try{
  const f=await service(h,{tables:3,seats:4,covers:80}),booking=(await h.api('/api/public/book',publicGuest(f.service,0,{requestsAcknowledged:true,requests:{allergyNotes:'Shellfish'}}),{as:'',status:201})).result
  const chargeId=edge.charge(booking.id);await h.command('payment.charge-sync',{bookingId:booking.id,chargeId});await h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:4000,requestId:'ui-refund',reason:'Guest-requested deposit refund'})
  const finance=await h.signIn('synthetic-placemat-finance-ui@example.test'),errors=[]
  const cookies=cookie=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ROLE-004 fits viewport');if(shots)await page.screenshot({path:resolve(shots,`ROLE-004-${name}-${width}.png`),fullPage:true})}
  await context.addCookies(cookies(h.cookie));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.locator('.app-main[aria-busy=false]').waitFor()
  await page.getByRole('link',{name:'Settings',exact:true}).click();await page.locator('details:has(> summary:text-is("People & invitations"))').evaluate(el=>el.open=true)
  const card=page.locator('article.card').filter({hasText:'synthetic-placemat-finance-ui@example.test'}),granted=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='team.finance')
  await card.getByRole('button',{name:'Grant finance access',exact:true}).click();assert.ok((await granted).ok())
  await context.clearCookies();await context.addCookies(cookies(finance));await page.goto(transport.origin+'/app')
  const article=page.getByRole('article',{name:'Finance reconciliation'});await article.waitFor();const body=await article.innerText()
  for(const value of ['$150.00','$40.00','$110.00','succeeded','refund-charges.csv'])assert.ok(body.includes(value),value)
  for(const value of ['Alex Rowan','Shellfish','guest0@example.test'])assert.ok(!body.includes(value),value)
  await shot('finance')
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'refund-charges.csv',exact:true}).click();const file=await pending;assert.equal(await file.failure(),null);const csv=await readFile(await file.path(),'utf8');assert.ok(csv.includes(chargeId)&&!/Shellfish|guest0@example\.test/.test(csv))
  assert.equal((await page.goto(transport.origin+'/api/state')).status(),403)
  assert.deepEqual(errors,[])
  console.log(`ROLE-004 finance grant, reconciliation page and finance CSV passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

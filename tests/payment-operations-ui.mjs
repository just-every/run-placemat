import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {operationClock,operationEdge,operationBooking,operationBindings,operationAccounts} from './api/payment-operations-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const edge=operationEdge(),h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>operationClock,bindings:operationBindings,stripeEdge:edge.stripe,accountingEdge:edge.accounting}),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-placemat-test-clock':String(operationClock)}})
 try{
  const {booking,disputeId}=await operationBooking(h,edge)
  await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Payment operations fits the viewport');if(shots)await page.screenshot({path:resolve(shots,`PAY-009-${name}-${width}.png`),fullPage:name!=='service-entry'})}
  const submit=async(form,label)=>{const result=page.waitForResponse(r=>r.url().includes('/api/payments/operations/')&&r.request().method()==='POST');await form.getByRole('button',{name:label,exact:true}).click();assert.ok((await result).ok());await page.waitForLoadState('load');await page.getByRole('heading',{name:'Payment operations',exact:true}).waitFor()}
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.locator('.app-main[aria-busy=false]').waitFor()
  const entry=page.getByRole('link',{name:'Open disputes and accounting work',exact:true});await entry.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true});await entry.scrollIntoViewIfNeeded();await shot('service-entry');await entry.click();await page.getByRole('heading',{name:'Payment operations',exact:true}).waitFor();await page.getByText('Open a Stripe dispute',{exact:true}).click()
  const open=page.locator('form[data-operation=open]');await open.getByLabel('Reservation reference').fill(booking.id);await open.getByLabel('Stripe dispute reference').fill(disputeId);await submit(open,'Open dispute')
  const article=page.getByRole('article',{name:'Dispute '+disputeId});await article.waitFor();assert.ok((await article.innerText()).includes('$90.00'));await shot('opened')
  await submit(article.locator('form[data-operation=assemble]'),'Assemble current evidence')
  await page.getByText('Booking, policy and messages',{exact:true}).click();assert.ok((await article.innerText()).includes('We accept this exact table offer.'));await shot('evidence')
  const approve=article.locator('form[data-operation=approve]');assert.ok(await approve.getByLabel('Response to approve').evaluate(el=>el.getBoundingClientRect().width>=el.closest('form').getBoundingClientRect().width*0.9),'The response field uses the available review width');await approve.getByLabel('Response to approve').fill('The agreed reservation terms and guest conversation are attached for review.');await approve.getByRole('checkbox').check();await submit(approve,'Approve response')
  assert.ok((await article.innerText()).includes('Response has not been sent.'))
  const bundlePending=page.waitForEvent('download');await page.getByRole('link',{name:'Download approved response and evidence',exact:true}).click();const bundle=await bundlePending;assert.equal(await bundle.failure(),null);assert.ok(JSON.parse(await readFile(await bundle.path(),'utf8')).review.approved_at)
  await page.getByText('Export ledger to QuickBooks sandbox',{exact:true}).click();const send=article.locator('form[data-operation=export]')
  for(const [label,key] of [['Clearing account ID','clearing'],['Revenue account ID','revenue'],['Disputed receivable account ID','disputes']])await send.getByLabel(label,{exact:true}).fill(operationAccounts[key])
  await shot('approved');await send.getByRole('checkbox').check();await submit(send,'Send ledger to accounting')
  const result=article.getByRole('region',{name:'Accounting result'});assert.ok((await result.innerText()).includes('rejected'));assert.ok((await article.innerText()).includes('Venue owner'));assert.ok((await article.innerText()).includes('accounting-'))
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download ledger and journal',exact:true}).click();const download=await pending;assert.equal(await download.failure(),null);assert.equal(JSON.parse(await readFile(await download.path(),'utf8')).state,'rejected');await shot('rejected')
  assert.equal(edge.accountingCalls.length,1);assert.deepEqual(errors,[])
  await h.command('guest.erase',{guestId:(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'});await page.reload();assert.ok((await article.innerText()).includes('No retained follow-up after guest erasure.'));await shot('erased')
  console.log(`PAY-009 dispute, evidence, approved response, rejected accounting task and erasure passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

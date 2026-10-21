// FLOOR-012: use the shipped navigation, date form, native PDF download and print controls.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {preshiftFixture} from './api/preshift-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true})
 try{
  const f=await preshiftFixture(h),errors=[]
  const cookies=cookie=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  await context.addCookies(cookies(h.cookie));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'FLOOR-012 fits viewport');if(shots)await page.screenshot({path:resolve(shots,`FLOOR-012-${name}-${width}.png`),fullPage:name!=='operations-link'})}
  const entry=page.getByRole('link',{name:'Pre-shift sheet',exact:true});await entry.scrollIntoViewIfNeeded();await shot('operations-link');await entry.click()
  await page.getByLabel('Service date').fill(f.date);await page.getByRole('button',{name:'Open sheet',exact:true}).click()
  const article=page.getByRole('article',{name:'Pre-shift sheet'}),body=await article.innerText()
  for(const value of ['Elena Torres','Anniversary','Shellfish','No dairy','Wheelchair','regular','1 recorded visits','Window','Ana','10 expected covers','Private anniversary planning','Private celebration','elena@example.test'])assert.ok(body.includes(value),value)
  await shot('manager')
  const download=async()=>{const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();const file=await pending;assert.equal(await file.failure(),null);return readFile(await file.path(),'utf8')}
  const pdf=await download();assert.match(pdf,/^%PDF-1.4/);assert.ok(pdf.includes('Shellfish'));assert.ok(pdf.includes('Private anniversary planning'))
  await page.evaluate(()=>{window.printed=0;window.print=()=>window.printed++});await page.getByRole('button',{name:'Print sheet',exact:true}).click();assert.equal(await page.evaluate(()=>window.printed),1)
  await page.emulateMedia({media:'print'});assert.equal(await page.getByRole('navigation',{name:'Sheet actions',includeHidden:true}).evaluate(e=>getComputedStyle(e).display),'none');await shot('print');await page.emulateMedia({media:'screen'})
  const generated=(await article.innerText()).match(/Generated ([^\n]+)/)[1]
  await h.command('booking.status',{bookingId:f.large.id,status:'cancelled'});await h.command('guest.profile',{guestId:f.guest.id,vipLevel:'vip'})
  await page.getByRole('button',{name:'Open sheet',exact:true}).click();assert.ok(!(await article.innerText()).includes('Marcus Chen'));assert.ok((await article.innerText()).includes('2 expected covers'));assert.ok((await article.innerText()).includes('vip'));assert.notEqual((await article.innerText()).match(/Generated ([^\n]+)/)[1],generated);await shot('updated')
  const host=await h.signIn('preshift-host@example.test'),hostId=(await h.api('/auth/operators')).find(p=>p.email==='preshift-host@example.test').id;await h.command('team.host',{operatorId:hostId,enabled:true})
  await context.clearCookies();await context.addCookies(cookies(host));await page.reload()
  assert.ok((await article.innerText()).includes('Host view'));assert.ok((await article.innerText()).includes('Shellfish'))
  const hostPdf=await download()
  for(const value of ['Private anniversary planning','Private celebration','elena@example.test','+1 415 555 0191']){assert.ok(!(await page.content()).includes(value));assert.ok(!hostPdf.includes(value))}
  await shot('host')
  await h.command('guest.erase',{guestId:f.guest.id,confirm:'ERASE'});await page.reload();assert.ok((await article.innerText()).includes('Erased guest'))
  const erasedPdf=await download();for(const value of ['Elena Torres','Shellfish','Anniversary','Wheelchair','elena@example.test']){assert.ok(!(await page.content()).includes(value));assert.ok(!erasedPdf.includes(value))}
  await shot('erased');assert.deepEqual(errors,[])
  console.log(`FLOOR-012 navigation, date selection, manager/host filtering, PDF download, print, live reopen and erased end state passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

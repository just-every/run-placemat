import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS;if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  await context.addCookies(h.cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(transport.origin+'/costs');await page.getByRole('heading',{name:'Operating costs',exact:true}).waitFor()
  await page.getByRole('button',{name:'Create cost preview',exact:true}).click();await page.getByRole('status').filter({hasText:'Cost preview saved.'}).waitFor();assert.match(await page.locator('#forecast').innerText(),/\$8.30/);assert.match(await page.locator('#forecast').innerText(),/Distribution quote/)
  await page.getByLabel('Monthly budget (USD cents)',{exact:true}).fill('100');await page.getByLabel('Monthly budget (USD cents)',{exact:true}).blur();await page.getByRole('status').filter({hasText:'Budget alert saved.'}).waitFor();assert.match(await page.locator('#budget-status').innerText(),/Forecast budget exceeded/)
  const snap=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await page.screenshot({path:resolve(shots,`COST-001-${name}-${width}.png`)})};await snap('forecast')
  for(const [label,value]of [['Provider','Test provider'],['Unique invoice reference','test-invoice-'+width],['Statement or invoice evidence','Test statement'],['Invoice usage units','1000'],['Usage unit description','SMS segments'],['Provider costs excluding processor fees (USD cents)','1330'],['Actual processor fees (USD cents)','0']])await page.getByLabel(label,{exact:true}).fill(value)
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Record reconciliation',exact:true}).click();await page.getByRole('status').filter({hasText:'Owner-entered reconciliation recorded.'}).waitFor();assert.match(await page.locator('#invoices').innerText(),/13.30/);assert.match(await page.locator('#invoices').innerText(),/not independently provider-verified/)
  await page.locator('#invoices').scrollIntoViewIfNeeded();await snap('reconciliation');assert.deepEqual(errors,[])
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

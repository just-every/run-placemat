import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {enrichmentFixture} from './api/guest-enrichment-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 let clock=Date.parse('2026-10-20T08:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>clock}),transport=await browserServer(h)
 const browser=await chromium.launch({headless:true,...process.env.PLACEMAT_CHROMIUM?{executablePath:process.env.PLACEMAT_CHROMIUM}:{},args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
 const context=await browser.newContext({viewport:{width,height:1100},ignoreHTTPSErrors:true})
 try{
  const f=await enrichmentFixture(h,value=>clock=value)
  await context.setExtraHTTPHeaders({'x-placemat-test-clock':String(clock)})
  await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()
  await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await page.getByRole('link',{name:'Guests',exact:true}).click()
  await page.locator('.app-main[aria-busy=false]').waitFor()
  await page.locator('#guest-search').fill('Synthetic Placemat Guest')
  let card=page.locator('#guest-results > details');await card.locator(':scope > summary').click()
  await card.locator('[data-action=guest-enrichment]').click()
  await card.getByRole('button',{name:'Prepare enrichment',exact:true}).click()
  const pending=card.locator('[data-enrichment-id]').last()
  await expect(pending).toContainText('Repeat visitor')
  const capture=async state=>{
   if(width===1440){
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guest enrichment fits desktop')
    const small=await card.locator('[data-enrichment-review]').evaluate(el=>[...el.querySelectorAll('p,li,label,button,h4,input')].some(node=>parseFloat(getComputedStyle(node).fontSize)<13));assert.equal(small,false,'Touched review text is at least 13px')
   }
   if(shots)await card.locator('[data-enrichment]').screenshot({path:resolve(shots,`AGENT-007-${state}-${width}.png`)})
  }
  if(width===1440){
   await expect(pending).toContainText('Confidence: high')
   await expect(pending).toContainText('Free notes are ambiguous')
   await expect(pending).toContainText(f.visits[0].id)
   await expect(pending).toContainText('Spend and refunded spend are unknown')
   await expect(pending.getByLabel('Type APPROVE for these exact tags')).toHaveValue('')
   const guest=(await h.api('/api/guests?search=Synthetic')).guests[0];assert.deepEqual(guest.profile.tags,['Existing fact'])
  }
  await capture('review')
  await pending.getByRole('button',{name:'Reject proposal',exact:true}).click()
  await expect(card.locator('[data-enrichment-list]')).toContainText('rejected proposal')
  await card.getByRole('button',{name:'Prepare enrichment',exact:true}).click()
  const next=card.locator('[data-enrichment-id]').first()
  await next.getByLabel('Type APPROVE for these exact tags').fill('APPROVE')
  await next.getByRole('button',{name:'Approve exact enrichment',exact:true}).click()
  await expect(card.locator('[data-enrichment-list]')).toContainText('approved proposal')
  await capture('approved')
  await h.command('guest.profile',{guestId:f.guestId,seatingPreference:'patio',notes:'synthetic-placemat-later-note'})
  const approved=card.locator('[data-enrichment-id]').first()
  await approved.getByLabel('Type UNDO to remove unchanged enrichment tags').fill('UNDO')
  await approved.getByRole('button',{name:'Undo enrichment',exact:true}).click()
  await expect(card.locator('[data-enrichment-list]')).toContainText('undone proposal')
  if(width===1440){
   const guest=(await h.api('/api/guests?search=Synthetic')).guests[0];assert.deepEqual(guest.profile.tags,['Existing fact']);assert.equal(guest.profile.seatingPreference,'patio')
   await expect(card.locator('[data-enrichment-list]')).toContainText('Undone by')
   assert.deepEqual(errors,[])
  }
  await capture('undone')
  if(width===390)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guest enrichment phone smoke fits viewport')
  console.log(`PROBE AGENT-007 browser ${width}: guest profile -> fact-cited review, reject, exact approval and attributed undo shown`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

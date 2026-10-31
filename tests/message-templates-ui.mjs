import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {reminderFixture} from './api/message-template-fixture.mjs'
import {browserServer} from './browser-server.mjs'

const h=await installation(),transport=await browserServer(h)
const browser=await chromium.launch({headless:true,...process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{},args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true}),shots=process.env.PLACEMAT_SCREENSHOTS
try{
 const f=await reminderFixture(h),mailCount=h.messages.length
 await context.addCookies(h.cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt <Dining>',exact:true}).waitFor()
 const settings=async()=>{await page.getByRole('link',{name:'Settings',exact:true}).click();const panel=page.locator('#message-template-settings');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();return panel}
 let panel=await settings()
 const en='Hello {{guest_name}}, {{venue_name}} · {{date_time}} · {{party_size}} · {{guest_phone}}. {{cancellation_terms}}'
 const es='Hola {{guest_name}}, {{venue_name}} · {{date_time}} · {{party_size}} · {{guest_phone}}. {{cancellation_terms}}'
 await panel.getByLabel('English reminder template',{exact:true}).fill(en)
 await panel.getByRole('button',{name:'Save English template',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor()
 panel=await settings();await panel.getByLabel('Spanish reminder template',{exact:true}).fill(es)
 await panel.getByRole('button',{name:'Save Spanish template',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor()
 const approvals=()=>page.getByRole('link',{name:'Approvals & reminders',exact:true}).click()
 await approvals();await page.getByLabel('Reminder language',{exact:true}).selectOption('en');await page.getByRole('button',{name:'Prepare reminder batch',exact:true}).click();await page.getByRole('status').filter({hasText:'Plan prepared.'}).waitFor()
 let previews=page.locator('[data-reminder-preview]')
 assert.ok((await previews.first().innerText()).includes('Hello '+f.people[0].name))
 assert.ok((await previews.first().innerText()).includes('Jan 16, 2032, 7:30 PM (America/New_York)'))
 assert.ok((await previews.first().innerText()).includes('(202) 555-0123'))
 assert.ok((await previews.nth(1).innerText()).includes(f.people[1].name))
 assert.equal(await page.evaluate(()=>window.templateLeak),undefined,'Preview values never execute as markup')
 await page.getByLabel('Reminder language',{exact:true}).selectOption('es');await page.getByRole('button',{name:'Prepare reminder batch',exact:true}).click();await page.getByRole('status').filter({hasText:'Plan prepared.'}).waitFor()
 const spanish=page.locator('article.card').filter({has:page.locator('[data-reminder-preview][lang="es"]')}).first()
 assert.ok((await spanish.locator('[data-reminder-preview]').first().innerText()).includes('Hola '+f.people[0].name))
 await spanish.getByRole('button',{name:'Approve plan',exact:true}).click();await page.getByRole('status').filter({hasText:'Plan approved and applied.'}).waitFor()
 const approved=(await h.api('/api/state')).state.reminders
 assert.equal(approved.length,2);assert.equal(approved[0].language,'es')
 panel=await settings();await panel.getByLabel('Spanish reminder template',{exact:true}).fill(es+' Gracias por venir.')
 await panel.getByRole('button',{name:'Save Spanish template',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor()
 await approvals();await page.getByText('Reminder messages',{exact:true}).click()
 const saved=page.locator('#approvals-content details').filter({has:page.getByText('Reminder messages',{exact:true})})
 assert.ok((await saved.innerText()).includes(approved[0].message))
 assert.ok(!(await saved.innerText()).includes('Gracias por venir.'))
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download reminders CSV',exact:true}).click()])
 const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk)
 const csv=Buffer.concat(chunks).toString();assert.ok(csv.includes('template_version'));assert.ok(csv.includes('Hola'));assert.ok(!csv.includes('Gracias por venir.'))
 assert.equal((await h.api('/api/state')).state.reminders[0].message,approved[0].message)
 assert.equal(h.messages.length,mailCount,'The browser journey sends no outbound reminder')
 assert.deepEqual(errors,[])
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Reminder screen fits the desktop')
 // The journey asserts at 1440; the same populated screens provide phone proof.
 if(shots){
  await mkdir(shots,{recursive:true})
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await settings();await page.locator('#message-template-settings').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(shots,`MSG-009-settings-${width}.png`)})
   await approvals();await page.locator('[data-reminder-preview][lang="es"]').first().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(shots,`MSG-009-previews-${width}.png`)})
  }
 }
 console.log('MSG-009: edited bilingual templates, exact escaped previews, approval, frozen CSV and no send passed at 1440; screen proof at 1440 and 390 when requested.')
}finally{await context.close();await browser.close();await transport.close();await h.close()}

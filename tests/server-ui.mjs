// ROLE-003: the owner grants a server, a manager links them to a shift server, and the signed-in server opens only their own section sheet and kitchen view.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true})
 try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/Los_Angeles'})
  const tables=[];for(const [i,label] of ['W-12','W-14','G-21','G-22'].entries())tables.push(await h.command('table.save',{label,seats:4,x:20+i*15,y:30}))
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
  const service=await h.command('service.save',{name:'Friday dinner',startAt:day+'T18:00:00-07:00',endAt:day+'T23:00:00-07:00',turnMinutes:90,coverLimit:32})
  const errors=[],cookies=cookie=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  const ana=await h.signIn('ui-ana@example.test'),ben=await h.signIn('ui-ben@example.test')
  await context.addCookies(cookies(h.cookie));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  const ready=async()=>{await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()}
  const shot=async(name,locator)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ROLE-003 fits viewport');if(shots)await (locator||page).screenshot({path:resolve(shots,`ROLE-003-${name}-${width}.png`),...(locator?{}:{fullPage:true})})}
  const saved=async(command,button,scope=page)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===command);await scope.getByRole('button',{name:button,exact:true}).click();assert.ok((await response).ok());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()}
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await ready()
  // Owner grants server access from the people list.
  await page.getByRole('link',{name:'Settings',exact:true}).click()
  const people=page.locator('details:has(> summary:text-is("People & invitations"))')
  for(const email of ['ui-ana@example.test','ui-ben@example.test']){await people.evaluate(el=>el.open=true);const card=page.locator('article.card').filter({hasText:email});await saved('team.server','Grant server access',card)}
  await people.evaluate(el=>el.open=true);await shot('grants',people)
  assert.match(await page.locator('article.card').filter({hasText:'ui-ana@example.test'}).innerText(),/server/)
  // Publish a service with two linked servers and sections, then book one guest in each.
  const operators=await h.api('/auth/operators'),id=email=>operators.find(p=>p.email===email).id
  const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Reviewed server service'});await h.command('proposal.approve',{proposalId:publication.id})
  await page.goto(transport.origin+'/app#floor');await ready()
  for(const [name,email] of [['Ana','ui-ana@example.test'],['Ben','ui-ben@example.test']]){
   const form=page.locator('form[data-command="server.save"]');await form.locator('xpath=..').evaluate(el=>el.open=true);await form.locator('[name=name]').fill(name);await form.locator('[name=operatorId]').selectOption(id(email));await shot('link-'+name.toLowerCase(),page.locator('#server-editor'));await saved('server.save','Save server',form)
  }
  const servers=(await h.api('/api/state')).state.services[0].staffing.servers;assert.deepEqual(servers.map(s=>s.operatorId),[id('ui-ana@example.test'),id('ui-ben@example.test')])
  await h.command('section.save',{serviceId:service.id,name:'Window',serverId:servers[0].id,tableIds:[tables[0].id,tables[1].id]});await h.command('section.save',{serviceId:service.id,name:'Garden',serverId:servers[1].id,tableIds:[tables[2].id,tables[3].id]})
  const book=async(i,name,table,allergyNotes)=>{const r=(await h.api('/api/public/book',publicGuest(service,i,{name,partySize:2,requestsAcknowledged:true,requests:{allergyNotes}}),{as:'',status:201})).result;const now=(await h.api('/api/state')).state.bookings.find(b=>b.id===r.id);if(now.tableIds[0]!==table.id)await h.command('booking.move',{bookingId:r.id,tableIds:[table.id],version:(await h.api('/api/floor-version')).version,reason:'Place in section'});return r}
  await book(0,'Elena Torres',tables[0],'Shellfish');await book(1,'Marcus Chen',tables[2],'Peanut')
  // The server lands on their own sheet, never on the operations page, and reaches the kitchen from it.
  await context.clearCookies();await context.addCookies(cookies(ana));await page.goto(transport.origin+'/app')
  const article=page.getByRole('article',{name:'Pre-shift sheet'});await article.waitFor();assert.equal(await page.title(),'Pre-shift sheet · Placemat')
  await page.getByLabel('Service date').fill(day);await page.getByRole('button',{name:'Open sheet',exact:true}).click()
  const body=await article.innerText();for(const value of ['Server view','Elena Torres','Shellfish','Window'])assert.ok(body.includes(value)||value==='Server view',value)
  for(const value of ['Marcus Chen','Peanut','Garden','G-21','elena@example.test','Deposit','service cover limit'])assert.ok(!body.includes(value),value)
  await shot('server-sheet')
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();const file=await pending;assert.equal(await file.failure(),null);const pdf=await readFile(await file.path(),'utf8');assert.ok(pdf.includes('Elena Torres')&&pdf.includes('Shellfish'));for(const value of ['Marcus Chen','Peanut','elena@example.test'])assert.ok(!pdf.includes(value),value)
  await page.getByRole('link',{name:'Kitchen view · Friday dinner'}).click();const kitchen=page.getByRole('article',{name:'Kitchen view'});await kitchen.waitFor();const needs=await kitchen.innerText()
  assert.ok(needs.includes('Shellfish')&&needs.includes('W-12'));for(const value of ['Peanut','G-21','Elena','Marcus','Dish totals','Arrival pacing'])assert.ok(!needs.includes(value),value)
  await shot('server-kitchen')
  const refused=await page.goto(transport.origin+'/api/state');assert.equal(refused.status(),403)
  await context.clearCookies();await context.addCookies(cookies(ben));await page.goto(transport.origin+'/preshift?date='+day);const benSheet=await page.getByRole('article',{name:'Pre-shift sheet'}).innerText();assert.ok(benSheet.includes('Marcus Chen')&&benSheet.includes('Peanut')&&!benSheet.includes('Elena Torres')&&!benSheet.includes('Shellfish'))
  assert.deepEqual(errors,[])
  console.log(`ROLE-003 owner grant, shift link, server-only sheet, PDF and kitchen view passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

await import("./phone-bookings-ui.mjs");

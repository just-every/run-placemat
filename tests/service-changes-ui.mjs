// SERVICE-003: shipped manager UI, real Worker/session/D1, network-edge interception only.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {browserServer} from './browser-server.mjs'
import {installation,service,publicGuest} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try {
 for(const width of [1440,390]) {
  const h=await installation(),transport=await browserServer(h),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
  try {
   const fixture=await service(h,{tables:3,covers:20})
   for(let i=0;i<3;i++)await h.api('/api/public/book',publicGuest(fixture.service,i),{as:'',status:201})
   const original=(await h.api('/api/state')).state.bookings,errors=[],sentBefore=h.messages.length
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Services & tables',exact:true}).click()
   const root=page.locator('#service-changes-content')
   await root.getByText('Review a closure or private hold',{exact:true}).click()
   const form=root.locator('[data-service-closure]')
   await form.locator('[name=serviceId]').selectOption(fixture.service.id)
   await form.locator('[name=scope]').selectOption('room')
   await form.locator('[name=area]').selectOption('Dining room')
   await form.locator('[name=reason]').fill('Dining room temporarily unavailable; manager to contact each party')
   const nextCommand=name=>page.waitForResponse(response=>response.url().endsWith('/api/commands')&&response.request().postDataJSON()?.command===name)
   let pending=nextCommand('proposal.prepare')
   await form.getByRole('button',{name:'Preview closure impacts',exact:true}).click()
   let response=await pending;assert.ok(response.ok(),await response.text());const proposal=(await response.json()).result
   const preview=root.locator(`[data-service-proposal="${proposal.id}"]`)
   await preview.getByRole('heading',{name:'Existing booking impacts (3)',exact:true}).waitFor()
   for(const name of ['Alex Rowan','Sam Patel','Morgan Lee'])assert.ok((await preview.innerText()).includes(name))
   assert.deepEqual((await h.api('/api/state')).state.bookings,original,'Preparing the plan preserves commitments')
   const shot=async name=>{
    if(shots)await root.screenshot({path:resolve(shots,`SERVICE-003-${name}-${width}.png`)})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Closure review fits the viewport')
   }
   await shot('exact-room-impacts')
   pending=nextCommand('proposal.approve')
   await preview.getByRole('button',{name:'Approve exact closure plan',exact:true}).click()
   response=await pending;assert.ok(response.ok(),await response.text())
   const changeId=proposal.id
   await root.locator(`[data-service-change="${changeId}"]`).waitFor()
   let data=await h.api('/api/state'),change=data.state.serviceChanges.find(change=>change.id===changeId)
   assert.equal(change.tasks.length,3)
   assert.ok(change.tasks.every(task=>task.ownerId===data.actor.id&&task.status==='open'),'All impacted bookings have manager-owned tasks')
   assert.deepEqual(data.state.bookings,original,'Approval preserves commitments')
   for(const task of change.tasks)assert.match(await root.locator(`[data-service-task="${task.id}"]`).innerText(),/Owner: Venue owner/)
   await shot('manager-impact-queue')
   const task=change.tasks[0],taskForm=root.locator(`[data-service-task="${task.id}"] form`)
   await taskForm.locator('[name=status]').selectOption('failed-contact')
   await taskForm.locator('[name=outcome]').fill('Staff called; no answer. Original reservation remains unchanged.')
   pending=nextCommand('service.followup')
   await taskForm.getByRole('button',{name:'Record follow-up',exact:true}).click()
   response=await pending;assert.ok(response.ok(),await response.text())
   await root.locator(`[data-service-task="${task.id}"]`).getByText('Staff-recorded outcome: Staff called; no answer. Original reservation remains unchanged.',{exact:true}).waitFor()
   data=await h.api('/api/state');change=data.state.serviceChanges.find(change=>change.id===changeId)
   const failed=change.tasks.find(value=>value.id===task.id)
   assert.equal(failed.status,'failed-contact');assert.equal(failed.ownerId,data.actor.id);assert.equal(failed.updatedBy,data.actor.id)
   assert.deepEqual(data.state.bookings,original,'Failed contact preserves commitments')
   assert.equal(h.messages.length,sentBefore,'The closure UI sends no guest messages')
   // The later arrival was free before closure; the approved room hold now prevents a new allocation.
   const denied=await h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(fixture.service,3,{startAt:new Date(Date.parse(fixture.service.startAt)+2*3600000).toISOString()})})
   assert.equal(denied.status,409,await denied.text())
   await shot('failed-contact-retained-booking')
   assert.deepEqual(errors,[])
   console.log(`SERVICE-003 exact room closure, three manager-owned impacts, failed contact and unchanged bookings passed at ${width}`)
  }finally{await context.close();await transport.close();await h.close()}
 }
}finally{await browser.close()}

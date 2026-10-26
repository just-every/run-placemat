// SERVICE-003: shipped manager UI, real Worker/session/D1, network-edge interception only.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {browserServer} from './browser-server.mjs'
import {paymentEdge} from './api/payment-fixture.mjs'
import {installation,service,publicGuest} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try {
 for(const width of [1440,390]) {
  const edge=paymentEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),transport=await browserServer(h),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
  try {
   const fixture=await service(h,{tables:4,covers:20})
   await h.command('table.save',{...fixture.floor[3],area:'Patio'})
   for(let i=0;i<3;i++)await h.api('/api/public/book',publicGuest(fixture.service,i,{closureEmailConsent:i!==2}),{as:'',status:201})
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
   const task=change.tasks[0],taskForm=root.locator(`[data-service-task="${task.id}"] [data-service-followup]`)
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
   const denied=await h.request('/api/public/book',{method:'POST',as:'',body:publicGuest(fixture.service,3,{area:'Dining room',startAt:new Date(Date.parse(fixture.service.startAt)+2*3600000).toISOString()})})
   assert.equal(denied.status,409,await denied.text())
   await shot('failed-contact-retained-booking')
   await page.getByRole('link',{name:'Floor & bookings',exact:true}).click()
   await page.locator(`#bookings-list [data-action="reassign"][data-id="${original[0].id}"]`).click()
   await page.locator('#reassignment select[name=tableIds]').selectOption([fixture.floor[3].id])
   pending=nextCommand('booking.move')
   await page.locator('#reassignment form[data-command="booking.move"] button[type=submit]').click()
   response=await pending;assert.equal(response.status(),409)
   await page.getByRole('alert').filter({hasText:'Guest acceptance is required'}).waitFor()
   assert.deepEqual((await h.api('/api/state')).state.bookings,original,'An existing direct move cannot bypass guest acceptance')
   if(shots){await page.locator('#reassignment').screenshot({path:resolve(shots,`SERVICE-003-blocked-assignment-${width}.png`)});await page.locator('#notice').screenshot({path:resolve(shots,`SERVICE-003-acceptance-required-${width}.png`)})}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   await page.getByRole('link',{name:'Services & tables',exact:true}).click()
   const decision=root.locator(`[data-service-task="${task.id}"]`)
   await decision.getByText('Review relocation offer',{exact:true}).click()
   const offerForm=decision.locator('[data-service-action="service.relocation"]')
   await offerForm.locator('[name=area]').selectOption('Patio');await offerForm.locator('[name=tableIds]').selectOption(fixture.floor[3].id)
   await offerForm.locator('[name=reason]').fill('Dining room closure; offer the same arrival on our patio')
   pending=nextCommand('service.relocation');await offerForm.getByRole('button',{name:'Review exact relocation',exact:true}).click();response=await pending;assert.ok(response.ok(),await response.text())
   await decision.getByText('Awaiting guest acceptance; original reservation retained',{exact:true}).waitFor()
   assert.deepEqual((await h.api('/api/state')).state.bookings,original)
   await shot('reviewed-relocation-awaiting-response')
   const outreach=decision.locator('[data-service-action="service.outreach"]');await outreach.getByRole('checkbox').check()
   pending=nextCommand('service.outreach');await outreach.getByRole('button',{name:'Send relocation email',exact:true}).click();response=await pending;assert.ok(response.ok(),await response.text())
   await decision.getByText('Outreach: Provider accepted; mailbox delivery unconfirmed',{exact:true}).waitFor()
   const sent=h.messages.at(-1).text.match(/https:\/\/[^\s]+\/relocation#[^\s]+/)[0],url=new URL(sent)
   const guestContext=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   try{
    const guestPage=await guestContext.newPage();await guestPage.goto(transport.origin+'/relocation'+url.hash)
    await guestPage.getByRole('heading',{name:'Proposed relocation',exact:true}).waitFor()
    assert.ok(!(await guestPage.locator('body').innerText()).includes('Sam Patel'))
    assert.deepEqual((await h.api('/api/state')).state.bookings,original)
    if(shots)await guestPage.screenshot({path:resolve(shots,`SERVICE-003-guest-offer-${width}.png`),fullPage:true})
    assert.ok(await guestPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
    await guestPage.getByRole('button',{name:'Accept relocation',exact:true}).click()
    await guestPage.getByRole('heading',{name:'Relocation accepted',exact:true}).waitFor()
    if(shots)await guestPage.screenshot({path:resolve(shots,`SERVICE-003-guest-accepted-${width}.png`),fullPage:true})
   }finally{await guestContext.close()}
   // Refund execution uses the existing public money command, then the closure page records its exact confirmed decision.
   const chargeId=edge.charge(original[1].id,4001);await h.command('payment.charge-sync',{bookingId:original[1].id,chargeId})
   await page.getByRole('link',{name:'Floor & bookings',exact:true}).click()
   const charge=page.locator(`[data-refund-charge="${chargeId}"]`);await charge.getByText('Refund this charge',{exact:true}).click()
   const refundForm=charge.locator('form');await refundForm.locator('[name=amountCents]').fill('4001');await refundForm.locator('[name=reason]').fill('Dining room closed; full deposit refund')
   pending=nextCommand('payment.refund');await refundForm.getByRole('button',{name:'Submit refund',exact:true}).click();response=await pending;assert.ok(response.ok(),await response.text());const refund=(await response.json()).result
   assert.equal(refund.status,'succeeded');assert.equal(refund.amountCents,4001)
   await page.getByRole('link',{name:'Services & tables',exact:true}).click()
   const cancelTask=root.locator(`[data-service-task="${change.tasks[1].id}"]`);await cancelTask.getByText('Cancel and record refund decision',{exact:true}).click()
   const cancel=cancelTask.locator('[data-service-action="service.cancel"]');await cancel.locator('[name=refundId]').selectOption(refund.id);await cancel.locator('[name=amountCents]').fill('4001');await cancel.locator('[name=reason]').fill('Full confirmed deposit refunded; guest cancellation requested');await cancel.getByRole('checkbox').check()
   pending=nextCommand('service.cancel');await cancel.getByRole('button',{name:'Confirm cancellation',exact:true}).click();response=await pending;assert.ok(response.ok(),await response.text())
   await cancelTask.getByText(/Cancelled · confirmed refund 40.01 USD/).waitFor()
   const unanswered=root.locator(`[data-service-task="${change.tasks[2].id}"] [data-service-followup]`);await unanswered.locator('[name=status]').selectOption('failed-contact');await unanswered.locator('[name=outcome]').fill('No email permission; manager owns personal follow-up')
   pending=nextCommand('service.followup');await unanswered.getByRole('button',{name:'Record follow-up',exact:true}).click();response=await pending;assert.ok(response.ok(),await response.text())
   await root.locator(`[data-service-task="${change.tasks[2].id}"]`).getByText('Staff-recorded outcome: No email permission; manager owns personal follow-up',{exact:true}).waitFor()
   await decision.getByText('Guest accepted relocation',{exact:true}).waitFor()
   await shot('accepted-cancelled-and-failed-contact')
   data=await h.api('/api/state');assert.deepEqual(data.state.bookings[0].tableIds,[fixture.floor[3].id]);assert.equal(data.state.bookings[1].status,'cancelled');assert.deepEqual(data.state.bookings[2],original[2]);assert.equal(data.state.serviceChanges[0].tasks[2].ownerId,data.actor.id)
   assert.deepEqual(errors,[])
   console.log(`SERVICE-003 exact room closure, three manager-owned impacts, failed contact and unchanged bookings passed at ${width}`)
  }finally{await context.close();await transport.close();await h.close()}
 }
}finally{await browser.close()}

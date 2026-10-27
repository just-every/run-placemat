// DIST-005 public screens against real Worker, D1 and independent browser devices.
// Only outbound verification mail is faked at the existing network edge.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {dinerFixture,dinerCode,dinerNow} from './api/diner-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>dinerNow}),transport=await browserServer(h)
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
 const contexts=[],errors=[]
 let bookingsMade=0
 const device=async()=>{
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-placemat-test-clock':String(dinerNow)}})
  contexts.push(context)
  context.setDefaultTimeout(10000)
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.clock.setFixedTime(new Date(dinerNow))
  return page
 }
 const shot=async(page,name)=>{
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits the viewport')
  // These screens use text controls throughout; there are no unlabeled icon actions.
  assert.deepEqual(await page.locator('button,a[href]').evaluateAll(controls=>controls.filter(el=>!el.textContent.trim()).map(el=>el.outerHTML)),[])
  if(shots)await page.screenshot({path:resolve(shots,`DIST-005-${name}-${width}.png`),fullPage:true})
 }
 const verify=async(page,booking,email)=>{
  const request=page.locator('[data-diner=request]')
  await request.getByLabel('Booking reference',{exact:true}).fill(booking)
  await request.getByLabel('Booking email',{exact:true}).fill(email)
  await request.getByRole('checkbox').check()
  await request.getByRole('button',{name:'Request verification code',exact:true}).click()
  await expect(page.locator('#notice')).toContainText('If these details match a booking')
  const form=page.locator('[data-diner=verify]')
  await form.getByLabel('Private verification code',{exact:true}).fill(dinerCode(h))
  await form.getByRole('checkbox').check()
  await form.getByRole('button',{name:'Verify booking',exact:true}).click()
  await expect(page.locator('#notice')).toHaveText('Booking verified. Only that booking was attached.')
 }
 const book=async(page,name)=>{
  await page.getByLabel('Arrival date',{exact:true}).fill('2026-10-30')
  await page.getByRole('button',{name:'Find available times',exact:true}).click()
  await expect(page.locator('#notice')).toContainText('Availability updated')
  await shot(page,'searched-availability')
  const choices=page.getByRole('combobox',{name:'Choose an available time',exact:true})
  await expect(choices).toBeVisible()
  await expect(choices.locator('option')).not.toHaveCount(1)
  await choices.selectOption(String(++bookingsMade))
  await page.getByLabel('Your name',{exact:true}).fill(name)
  await page.getByLabel('Email',{exact:true}).fill('guest0@example.test')
  await page.getByLabel('Phone (optional)',{exact:true}).fill('+1 212 555 0100')
  await page.locator('[name=requestsAcknowledged]').check()
  const count=(await h.api('/api/state')).state.bookings.length
  await page.getByRole('button',{name:'Confirm booking',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Booking confirmed',exact:true})).toBeVisible()
  assert.equal((await h.api('/api/state')).state.bookings.length,count+1)
  return page.locator('.booking-confirmation code').innerText()
 }
 try{
  const f=await dinerFixture(h),first=await device()
  await first.goto(transport.origin+'/book')
  await shot(first,'guest-search')
  const booking=await book(first,'Alex Rowan')
  await shot(first,'guest-confirmation')
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM pm_diner_accounts').first()).n,0,'Guest checkout never requires an account')
  await first.getByRole('link',{name:'Optionally verify this booking in your diner account'}).click()
  await expect(first.getByLabel('Booking reference',{exact:true})).toHaveValue(booking)
  await shot(first,'verification')
  await verify(first,booking,f.input.email)
  await expect(first.locator('[data-booking]')).toHaveCount(1)
  await expect(first.locator('[data-booking]')).toHaveAttribute('data-booking',booking)
  assert.ok(!(await first.locator('#diner-content').innerText()).includes(f.same.id),'A matching email does not expose an unverified booking')
  assert.ok(!(await first.locator('#diner-content').innerText()).includes(f.sibling.id),'A shared phone does not expose another diner')
  assert.equal((await contexts[0].request.get(transport.origin+'/api/state')).status(),401,'Diner access grants no staff authority')
  const settings=first.locator('[data-diner=preferences]')
  await settings.getByLabel('Save this restaurant as a favorite',{exact:true}).check()
  await settings.getByRole('textbox',{name:'Saved preferences',exact:true}).fill('<img src=x onerror=alert(1)> Quiet table requested')
  await settings.getByLabel('Save these choices for this restaurant.',{exact:true}).check()
  await settings.getByRole('button',{name:'Save restaurant preferences',exact:true}).click()
  await expect(first.locator('#notice')).toHaveText('Restaurant preferences saved.')
  await expect(first.locator('#diner-content img')).toHaveCount(0)
  await shot(first,'account-favorite-preferences')

  await first.getByText('Verify another booking',{exact:true}).click()
  const invalidCode=first.locator('[data-diner=verify]')
  await invalidCode.getByLabel('Private verification code',{exact:true}).fill('0'.repeat(64))
  await invalidCode.getByRole('checkbox').check()
  await invalidCode.getByRole('button',{name:'Verify booking',exact:true}).click()
  await expect(first.locator('#notice')).toContainText('Diner access not found')
  await expect(first.locator('[data-booking]')).toHaveCount(1)
  await expect(first.getByRole('textbox',{name:'Saved preferences',exact:true})).toHaveValue('<img src=x onerror=alert(1)> Quiet table requested')


  const second=await device();await second.goto(transport.origin+'/diner')
  await verify(second,booking,f.input.email)
  await expect(second.getByRole('textbox',{name:'Saved preferences',exact:true})).toHaveValue('<img src=x onerror=alert(1)> Quiet table requested')
  await expect(second.locator('[data-booking]')).toHaveCount(1)
  const rebookingPage=await contexts[1].newPage()
  await rebookingPage.clock.setFixedTime(new Date(dinerNow));rebookingPage.on('pageerror',e=>errors.push(e.message))
  await rebookingPage.goto(transport.origin+await second.getByRole('link',{name:'Book again at Cedar & Salt',exact:true}).getAttribute('href'))
  const rebook=await book(rebookingPage,'Alex Rowan')
  assert.notEqual(rebook,booking)
  const freshBooking=(await h.api('/api/state')).state.bookings.find(b=>b.id===rebook)
  assert.equal(freshBooking.requests?.seatingPreference??'','')
  assert.ok(!JSON.stringify(freshBooking).includes('Quiet table requested'),'Favorite-led rebooking does not auto-apply saved preferences')
  await shot(rebookingPage,'favorite-repeat-booking')
  // Rebooking is a fresh guest action and does not implicitly link the new reservation.
  await second.getByRole('button',{name:'Refresh account',exact:true}).click()
  await expect(second.locator('#notice')).toHaveText('Account refreshed.')
  await expect(second.locator('[data-booking]')).toHaveCount(1)

  await second.getByRole('link',{name:'Manage reservation',exact:true}).click()
  await expect(second.locator('#notice')).toContainText('Reservation opened.')
  await shot(second,'manage-upcoming')
  const change=second.locator('[data-management=change]')
  await change.getByLabel('Party size',{exact:true}).fill('3')
  await change.getByRole('button',{name:'Review changes',exact:true}).click()
  await expect(second.locator('#management-preview')).toContainText('3 guests')
  await expect(second.locator('#management-preview')).toContainText('Fee: $0.00 USD · Refund: $0.00 USD')
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===booking).partySize,2,'Review alone preserves the reservation')
  await shot(second,'management-preview')
  const commit=second.locator('[data-management=commit]')
  await commit.getByRole('checkbox').check();await commit.getByRole('button',{name:'Confirm changes',exact:true}).click()
  await expect(second.locator('#notice')).toHaveText('Your reservation has been updated.')
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===booking).partySize,3)
  await shot(second,'management-confirmed')
  await second.getByRole('link',{name:'Back to your diner account',exact:true}).click()
  await first.getByRole('button',{name:'Refresh account',exact:true}).click()
  await expect(first.locator('[data-booking]')).toContainText('3 guests')
  await second.getByRole('button',{name:'Revoke saved preferences',exact:true}).click()
  await expect(second.locator('#notice')).toHaveText('Saved preferences revoked at this restaurant.')
  await expect(second.getByRole('textbox',{name:'Saved preferences',exact:true})).toHaveValue('')
  await first.getByRole('button',{name:'Refresh account',exact:true}).click()
  await expect(first.getByRole('textbox',{name:'Saved preferences',exact:true})).toHaveValue('')
  await expect(first.getByRole('link',{name:'Book again at Cedar & Salt',exact:true})).toBeVisible()
  await shot(second,'preferences-revoked')
  const noMerge=(await h.api('/api/state')).guests
  assert.ok(noMerge.some(g=>g.email==='guest0@example.test'))
  assert.ok(noMerge.some(g=>g.email==='guest1@example.test'),'Shared phone preserves distinct people')
  await first.getByRole('button',{name:'Sign out this device',exact:true}).click()
  await expect(first.getByRole('heading',{name:'Verify one booking',exact:true})).toBeVisible()
  await second.getByRole('button',{name:'Refresh account',exact:true}).click()
  await expect(second.locator('[data-booking]')).toHaveCount(1)
  await second.getByText('Account settings',{exact:true}).click()
  const forget=second.locator('[data-diner=forget]')
  await forget.getByRole('checkbox').check()
  await forget.getByRole('button',{name:'Forget diner account',exact:true}).click()
  await expect(second.locator('#notice')).toHaveText('Account forgotten. Your reservations remain unchanged.')
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===booking).status,'booked')
  assert.deepEqual(errors,[])
  console.log(`DIST-005 guest checkout, one-booking email verification, independent devices, favorite rebooking, confirmed management, isolated identity and preference revocation passed at ${width}`)
 }finally{for(const context of contexts)await context.close();await browser.close();await transport.close();await h.close()}
}

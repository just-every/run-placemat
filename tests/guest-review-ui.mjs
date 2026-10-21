// GUEST-004 honest partial slice: real import, native session, Worker/D1 and guest screen.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {guestReviewFixture} from './api/guest-review-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await guestReviewFixture(h),cookie=await h.signIn('duplicate-reviewer@example.test')
  await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(transport.origin+'/app#guests')
  const search=page.locator('#guest-search');await search.fill('alex.one')
  const card=page.locator('#guest-results > details');await expect(card).toHaveCount(1)
  await card.locator(':scope > summary').click()
  const button=card.getByRole('button',{name:'Review possible duplicates',exact:true})
  await button.focus();await button.press('Enter')
  const review=card.locator('[data-guest-review]')
  await expect(review).toContainText('Suggestions only.')
  await expect(button).toHaveAttribute('aria-expanded','true')
  await expect(review).toContainText(f.booking.id)
  await expect(review).toContainText('1 imported visits · 1 linked bookings')
  await expect(review).toContainText('Marketing permission: Not recorded. Spend: not recorded.')
  const alias=review.locator('details.card').filter({hasText:'Possible duplicate: Alex Rivera'})
  await alias.locator('summary').click()
  for(const value of ['Same normalized name','alex.one@example.test','alex.two@example.test','<script>conflicting note</script>','2026-08-11','contact permission: no (this entry only)'])await expect(alias).toContainText(value)
  assert.equal(await review.locator('script,img').count(),0,'GUEST-004 imported conflict text is escaped')
  const family=review.locator('details.card').filter({hasText:'Possible duplicate: Morgan Rivera'})
  await family.locator('summary').click()
  await expect(family).toContainText('Shared phone; may be a household')
  await expect(family).toContainText('contact permission: yes (this entry only)')
  await expect(review).toContainText('Merge and reversal are not available.')
  assert.equal(await review.locator('form,button').count(),0,'GUEST-004 preview has no identity/permission mutation action')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guest review fits viewport')
  if(shots)await card.screenshot({path:resolve(shots,`GUEST-004-review-${width}.png`)})
  // A fresh review re-reads the real guest store after erasure.
  await h.command('guest.erase',{guestId:f.b.id,confirm:'ERASE'})
  await button.focus();await button.press('Enter');await expect(review.locator('details.card')).toHaveCount(1)
  await expect(review).not.toContainText('alex.two@example.test');await expect(review).not.toContainText('conflicting note')
  await h.command('guest.erase',{guestId:f.guest.id,confirm:'ERASE'})
  await button.focus();await button.press('Enter');await expect(review).toContainText('No possible duplicates found.')
  if(shots)await card.screenshot({path:resolve(shots,`GUEST-004-empty-${width}.png`)})
  await search.fill('unrelated@example.test');await expect(card).toHaveCount(1);await expect(card.locator(':scope > summary')).toContainText('Taylor Rivera');await card.locator(':scope > summary').click()
  await card.getByRole('button',{name:'Review possible duplicates'}).focus();await card.getByRole('button',{name:'Review possible duplicates'}).press('Enter');await expect(card).toContainText('No possible duplicates found.')
  assert.deepEqual(errors,[])
  console.log(`GUEST-004 read-only suggestions, conflicts, linked history, permission labels, keyboard, escaping and erasure passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

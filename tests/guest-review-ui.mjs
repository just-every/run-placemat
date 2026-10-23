// Real import, native sessions, Worker/D1 and the reviewed guest merge journey.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {guestReviewFixture} from './api/guest-review-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
async function signIn(context,cookie,origin){
 await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:origin,secure:true,sameSite:'Lax'}}))
}
async function openGuest(page,query){
 const search=page.locator('#guest-search');await search.waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();await search.fill(query)
 const card=page.locator('#guest-results > details');await expect(card).toHaveCount(1)
 if(!await card.evaluate(el=>el.open))await card.locator(':scope > summary').click()
 return card
}
async function reviewGuest(card){
 const button=card.getByRole('button',{name:'Review possible duplicates',exact:true})
 await button.focus();await button.press('Enter');await expect(button).toHaveAttribute('aria-expanded','true')
 const review=card.locator('[data-guest-review]');await expect(review).toContainText('Selected profile:')
 return review
}
async function screenshot(page,name,width){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guest review fits viewport')
 assert.ok(await page.locator('form:is([data-command="guest.merge"],[data-command="guest.unmerge"])').evaluateAll(forms=>forms.every(form=>{
  const panel=form.closest('article').getBoundingClientRect()
  return [...form.querySelectorAll('input:not([type=hidden]),button')].every(control=>{const rect=control.getBoundingClientRect();return rect.left>=panel.left&&rect.right<=panel.right})
 })),'Identity confirmation controls fit their review panel')
 if(shots)await page.locator('#guest-results').screenshot({path:resolve(shots,`GUEST-004-${name}-${width}.png`)})
}
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 let memberContext
 try{
  const f=await guestReviewFixture(h),memberCookie=await h.signIn('duplicate-reviewer@example.test')
  memberContext=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
  await signIn(memberContext,memberCookie,transport.origin)
  const memberPage=await memberContext.newPage();await memberPage.goto(transport.origin+'/app#guests')
  const memberCard=await openGuest(memberPage,'alex.one'),memberReview=await reviewGuest(memberCard)
  await expect(memberReview.locator('[data-duplicate]')).toHaveCount(1)
  await expect(memberReview.locator('[data-household]')).toHaveCount(1)
  assert.equal(await memberReview.locator('form,button').count(),0,'Members can read suggestions without mutation controls')
  await expect(memberCard.getByRole('button',{name:'Review merge journal'})).toHaveCount(0)
  await screenshot(memberPage,'member-review',width)
  await memberContext.close();memberContext=undefined

  await signIn(context,h.cookie,transport.origin)
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  if(process.env.PLACEMAT_BROWSER_CPU){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PLACEMAT_BROWSER_CPU)})}
  await page.goto(transport.origin+'/app#guests')
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await page.getByRole('link',{name:'Guests',exact:true}).click()
  const card=await openGuest(page,'alex.one'),review=await reviewGuest(card)
  await expect(review).toContainText(f.booking.id)
  await expect(review).toContainText('1 imported visits · 1 linked bookings')
  await expect(review).toContainText('Marketing permission: Not recorded. Spend: not recorded.')
  const alias=review.locator('[data-duplicate]');await alias.locator('summary').click()
  for(const value of ['alex.one@example.test','alex.two@example.test','<script>conflicting note</script>','2026-08-11','contact permission: no (this entry only)'])await expect(alias).toContainText(value)
  assert.equal(await review.locator('script,img').count(),0,'Imported conflict text is escaped')
  const family=review.locator('[data-household]');await family.locator('summary').click()
  await expect(family).toContainText('Morgan Rivera');await expect(family).toContainText('contact permission: yes (this entry only)')
  await expect(family.getByRole('button',{name:'Preview merge',exact:true})).toHaveCount(0)
  await screenshot(page,'review',width)
  await alias.getByRole('button',{name:'Preview merge',exact:true}).click()
  const mergeForm=alias.locator('form[data-command="guest.merge"]')
  await expect(mergeForm).toBeVisible()
  await expect(alias.locator('[data-merge-preview]')).toContainText('Field conflicts')
  await expect(alias.locator('[data-merge-preview]')).toContainText('unknown never becomes granted')
  await expect(mergeForm.locator('[name=confirm]')).toHaveValue('')
  // Opening the preview alone must leave both real records untouched.
  assert.equal((await h.api('/api/guests?search=alex.')).guests.length,2)
  await screenshot(page,'merge-preview',width)
  await mergeForm.getByLabel('Type MERGE to confirm this reviewed merge').fill('MERG')
  await mergeForm.getByRole('button',{name:'Merge reviewed profiles',exact:true}).click()
  assert.equal((await h.api('/api/guests?search=alex.')).guests.length,2,'Incomplete typed confirmation cannot merge')
  await mergeForm.getByLabel('Type MERGE to confirm this reviewed merge').fill('MERGE')
  await mergeForm.getByRole('button',{name:'Merge reviewed profiles',exact:true}).click()
  await expect(card.locator('[data-merge-journal]')).toContainText('merged')
  await expect(card.locator('.guest-visits')).toContainText('3 recorded visits')
  const mergedReview=await reviewGuest(card)
  await expect(mergedReview).toContainText('2 imported visits · 1 linked bookings')
  await expect(mergedReview).toContainText('Marketing permission: Not recorded.')
  await expect(mergedReview.locator('[data-duplicate]')).toHaveCount(0)
  await expect(mergedReview).toContainText('contact permission: no (this entry only)')
  const mergedFamily=mergedReview.locator('[data-household]');await mergedFamily.locator('summary').click()
  await expect(mergedFamily).toContainText('contact permission: yes (this entry only)')
  const mergeRow=card.locator('[data-merge-id]'),mergeId=await mergeRow.getAttribute('data-merge-id')
  await screenshot(page,'merged-journal',width)

  // A genuine staff edit after the merge must be visible and survive reversal.
  await h.command('waitlist.party',{waitlistId:f.first.entry.id,partySize:3,contactConsent:false})
  await mergeRow.getByRole('button',{name:'Preview unmerge',exact:true}).click()
  const undo=mergeRow.locator('[data-unmerge-preview]'),undoForm=undo.locator('form')
  await expect(undo).toContainText('Later records needing assignment')
  await expect(undo).toContainText(f.first.entry.id);await expect(undo).toContainText('edited')
  await expect(undoForm.locator('[name=confirm]')).toHaveValue('')
  await screenshot(page,'unmerge-preview',width)
  await undoForm.getByLabel('Type UNMERGE to confirm this reviewed reversal').fill('UNMERGE')
  await undoForm.getByRole('button',{name:'Unmerge unchanged records',exact:true}).click()
  await expect(card.locator('[data-merge-journal]')).toContainText('unmerged')
  await expect(card.locator('[data-merge-journal]')).toContainText(f.first.entry.id)
  const afterUndo=(await h.api('/api/state')).state,changed=afterUndo.waitlist.find(w=>w.id===f.first.entry.id)
  assert.equal(changed.guestId,f.a.id);assert.equal(changed.partySize,3);assert.equal(changed.contactConsent,false)
  assert.equal((await h.api('/api/guests?search=alex.')).guests.length,2)
  await screenshot(page,'unmerged-journal',width)

  const nextReview=await reviewGuest(card),nextAlias=nextReview.locator('[data-duplicate]');await nextAlias.locator('summary').click()
  await nextAlias.getByRole('button',{name:'Preview merge',exact:true}).click()
  const nextForm=nextAlias.locator('form[data-command="guest.merge"]')
  await nextForm.getByLabel('Type MERGE to confirm this reviewed merge').fill('MERGE')
  await nextForm.getByRole('button',{name:'Merge reviewed profiles',exact:true}).click()
  await expect(card.locator('[data-merge-journal] [data-merge-id]')).toHaveCount(2)
  await h.command('guest.erase',{guestId:f.b.id,confirm:'ERASE'})
  await page.locator('#guest-search').fill('alex.')
  await expect(page.locator('#guest-results')).toContainText('No guests match your search.')
  const journal=(await h.api('/api/guests/merges?guestId='+encodeURIComponent(f.a.id))).merges
  assert.ok(journal.length>=2);assert.ok(journal.every(m=>m.status==='erased'&&!('snapshots' in m)),'Erasure removes all connected journal snapshots')
  await h.api('/api/guests/unmerge-preview?mergeId='+encodeURIComponent(mergeId),undefined,{status:409})
  await screenshot(page,'erased',width)
  const unrelated=await openGuest(page,'unrelated@example.test');await reviewGuest(unrelated)
  await expect(unrelated).toContainText('No possible duplicates found.')
  assert.deepEqual(errors,[])
  console.log(`GUEST-004 reviewed merge, scoped permissions, households, journal, later edits, reversal, member access and erasure passed at ${width}`)
 }finally{if(memberContext)await memberContext.close();await context.close();await browser.close();await transport.close();await h.close()}
}

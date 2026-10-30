// Public review journey through the real Worker and shipped UI. Assertions run at 1440.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
import {feedbackFixture} from './api/feedback-fixture.mjs'
import {verify,code} from './api/diner-client.mjs'
import {browserServer} from './browser-server.mjs'
const h=await installation(),transport=await browserServer(h),shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{},args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true}),staff=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true})
const page=await context.newPage(),manager=await staff.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message));manager.on('pageerror',e=>errors.push(e.message))
const screenshot=async(p,name)=>{if(shots)await p.screenshot({path:resolve(shots,name+'.png'),fullPage:true})}
async function layout(p){
 const issues=await p.evaluate(()=>{
  const issues=[]
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Horizontal overflow')
  for(const el of document.querySelectorAll('main *')){
   if(!el.getClientRects().length)continue
   const s=getComputedStyle(el)
   if([...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(s.fontSize)<13)issues.push('Small text '+el.tagName)
   const borders=['Top','Right','Bottom','Left'].map(side=>parseFloat(s['border'+side+'Width']))
   if(parseFloat(s.borderRadius)>0&&borders.some(n=>n>0)&&borders.some(n=>n===0))issues.push('Partial rounded border '+el.tagName)
   if(el.matches('button')&&!el.textContent.trim())issues.push('Icon control needs a tooltip')
  }
  return issues
 });assert.deepEqual(issues,[])
}
try{
 const f=await feedbackFixture(h),b=f.bookings[0],second=f.bookings[1]
 await h.api('/api/public/feedback/submit',{token:f.tokens[0],rating:1,comment:'Private feedback must stay private'},{as:''})
 await page.goto(transport.origin+'/reviews#'+f.tokens[0]);await page.getByLabel('Current booking email').waitFor()
 assert.equal(await page.getByLabel('Booking reference').inputValue(),b.id)
 assert.ok(!(await page.locator('#review-list').innerText()).includes('Private feedback must stay private'))
 await page.getByLabel('Current booking email').fill(publicGuest(f.service,0).email)
 await page.getByLabel('Email me a private code for this booking.').check()
 await page.getByRole('button',{name:'Request booking code'}).click()
 await page.getByText('Code requested.',{exact:false}).waitFor()
 await page.getByLabel('Private verification code').fill(code(h))
 await page.getByLabel('Attach only this verified booking.').check()
 await page.getByRole('button',{name:'Verify review booking'}).click()
 await page.getByRole('button',{name:'Publish my review'}).waitFor()
 await page.getByLabel('Public rating').selectOption('4');await page.getByLabel('Public review',{exact:true}).fill('Our dinner was carefully prepared.')
 await page.getByLabel('I am not venue staff.').check();await page.getByLabel('Publish this rating, review and visit date publicly under these guidelines.').check()
 await screenshot(page,'reviews-confirm-1440');await layout(page)
 await page.setViewportSize({width:390,height:1000});await screenshot(page,'reviews-confirm-390');await page.setViewportSize({width:1440,height:1000})
 // All controls are textual, and the consent is reached by keyboard before publication.
 await page.getByRole('button',{name:'Publish my review'}).focus();await page.keyboard.press('Enter')
 await page.getByText('This visit already has a public review.').waitFor()
 assert.ok((await page.locator('#review-list').innerText()).includes('4 out of 5'))
 const s=await verify(h,second,publicGuest(f.service,1).email)
 await h.api('/api/public/reviews/submit',{token:s.token,bookingId:second.id,rating:1,comment:'Service took too long.',publish:true,notStaff:true},{as:''})
 await staff.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin}}))
 await manager.goto(transport.origin+'/reviews/manage');await manager.getByText('Service took too long.',{exact:true}).waitFor()
 const low=manager.locator('.review-card').filter({hasText:'Service took too long.'})
 await low.getByText('Reply as restaurant',{exact:true}).click();await low.getByLabel('Public reply').fill('We have reviewed this delay with our service team.');await low.getByRole('button',{name:'Publish reply'}).click()
 await manager.getByText('Restaurant reply published.',{exact:true}).waitFor()
 await low.getByText('Edit restaurant reply',{exact:true}).click();await low.getByLabel('Public reply').fill('Our manager has updated the service handover.');await low.getByRole('button',{name:'Publish reply'}).click()
 await manager.getByText('Restaurant reply published.',{exact:true}).waitFor()
 await low.getByText('Report abuse',{exact:true}).click();await low.getByLabel('Explain the concern').fill('Please assess using the same rules for every rating.');await low.getByRole('button',{name:'Send abuse report'}).click()
 await manager.getByText('Abuse report recorded:',{exact:false}).waitFor()
 await manager.getByLabel('Reason under the published guidelines').fill('No guideline breach. A one-star rating is allowed.');await manager.getByRole('button',{name:'Record moderation outcome'}).click()
 await manager.getByText('Moderation outcome recorded.',{exact:false}).waitFor()
 await layout(manager);await screenshot(manager,'reviews-manager-1440')
 await page.goto(transport.origin+'/reviews');await page.getByText('Service took too long.',{exact:true}).waitFor()
 assert.ok((await page.locator('#review-list').innerText()).includes('retained'));assert.ok((await page.locator('#review-list').innerText()).includes('Our manager has updated the service handover.'))
 assert.ok((await page.locator('#review-list').innerText()).includes('Average available after'))
 await screenshot(page,'reviews-venue-1440');await layout(page)
 await h.command('embed.origins',{origins:['https://restaurant.example.test']})
 const widget=await context.newPage();widget.on('pageerror',e=>errors.push(e.message))
 await widget.goto(transport.origin+'/book?embed=1&origin='+encodeURIComponent('https://restaurant.example.test'))
 await widget.locator('#public-reviews').getByText('Service took too long.',{exact:true}).waitFor()
 assert.ok((await widget.locator('#public-reviews').innerText()).includes('Our manager has updated the service handover.'))
 assert.ok((await widget.locator('#public-reviews').innerText()).includes('retained'))
 await screenshot(widget,'reviews-widget-1440')
 // Phone proof records these same changed screens once; assertions remain at the desktop width.
 for(const [p,name] of [[page,'venue'],[manager,'manager'],[widget,'widget']]){await p.setViewportSize({width:390,height:1000});await p.waitForTimeout(350);await screenshot(p,'reviews-'+name+'-390')}
 assert.deepEqual(errors,[])
 console.log('PROBE DIST-006 screens: booking email code, explicit four-star submission, manager reply edit and report outcome -> dated venue and widget publication at 1440; changed screens captured at 390')
}finally{await browser.close();await transport.close();await h.close()}

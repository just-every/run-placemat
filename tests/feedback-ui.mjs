// CRM-005: one public-to-manager journey against the real Worker, D1 and mail edge.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
import {feedbackFixture,feedbackReviewUrl,feedbackTick} from './api/feedback-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
async function checkLayout(page){
 const issues=await page.evaluate(()=>{
  const visible=el=>el.getClientRects().length>0
  const issues=[]
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Horizontal overflow')
  for(const el of document.querySelectorAll('main *')){
   if(!visible(el))continue
   const style=getComputedStyle(el)
   if([...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&Number.parseFloat(style.fontSize)<13)issues.push('Text below 13px: '+el.tagName)
   const sides=['Top','Right','Bottom','Left'].map(side=>Number.parseFloat(style['border'+side+'Width']))
   if(Number.parseFloat(style.borderRadius)>0&&sides.some(n=>n>0)&&sides.some(n=>n===0))issues.push('Partial border on rounded '+el.tagName)
   if(el.matches('button')&&!el.textContent.trim())issues.push('Unlabelled button')
  }
  return issues
 })
 assert.deepEqual(issues,[])
}
async function checkKeyboard(page){
 const expected=await page.evaluate(()=>{
  const fields=[...document.querySelectorAll('main input,main textarea,main select')].filter(el=>!el.disabled&&el.getClientRects().length)
  const key=el=>(el.form?.id||el.form?.dataset.feedbackAction||'')+':'+el.name
  document.querySelector('h1').tabIndex=-1;document.querySelector('h1').focus()
  return [...new Set(fields.map(key))]
 })
 const seen=new Set(),steps=await page.locator('main :is(a,button,input,textarea,select,summary)').count()+3
 for(let i=0;i<steps&&expected.some(key=>!seen.has(key));i++){
  await page.keyboard.press('Tab')
  const key=await page.evaluate(()=>{const el=document.activeElement;return el.matches('input,textarea,select')?(el.form?.id||el.form?.dataset.feedbackAction||'')+':'+el.name:null})
  if(key)seen.add(key)
 }
 assert.deepEqual(expected.filter(key=>!seen.has(key)),[],'Every visible field is reachable by Tab')
 await page.locator('h1').evaluate(el=>el.removeAttribute('tabindex'))
}
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h)
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
 const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),guests=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await feedbackFixture(h),errors=[],requests=[]
  await h.signIn(publicGuest(f.service,4).email,'admin','Floor manager')
  const state=await h.api('/api/feedback'),manager=state.staff.find(s=>s.role==='admin')
  await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const owner=await context.newPage(),guest=await guests.newPage(),positive=await guests.newPage()
  for(const page of [owner,guest,positive]){page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()))}
  const shot=async(page,name)=>{await checkLayout(page);await checkKeyboard(page);if(shots)await page.screenshot({path:resolve(shots,`CRM-005-${name}-${width}.png`),fullPage:true})}
  await owner.goto(transport.origin+'/setup');await owner.getByRole('checkbox').check();await owner.getByRole('button',{name:'Finish setup',exact:true}).click();await owner.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await owner.getByRole('link',{name:'Guests',exact:true}).click()
  await owner.locator('a[href="/feedback/manage"]').click()
  await owner.locator('[data-feedback-visit]').first().waitFor()
  await owner.getByRole('link',{name:'Feedback settings',exact:true}).click()
  await owner.locator('#settings-state').getByText('Saved',{exact:true}).waitFor()
  const settings=owner.locator('#feedback-settings'),newReviewUrl=feedbackReviewUrl+'/public'
  await settings.locator('[name=publicReviewUrl]').fill(newReviewUrl)
  const saved=owner.waitForResponse(r=>r.url().endsWith('/api/feedback/settings')&&r.ok())
  await settings.locator('[name=publicReviewUrl]').press('Tab');await saved
  await owner.locator('#settings-state').getByText('Saved',{exact:true}).waitFor()
  assert.equal((await h.api('/api/feedback')).settings.publicReviewUrl,newReviewUrl)
  await shot(owner,'settings')
  await owner.getByRole('link',{name:'Guest feedback',exact:true}).click()
  await guest.goto(transport.origin+'/feedback#'+f.tokens[0]);await positive.goto(transport.origin+'/feedback#'+f.tokens[1])
  const invitation=page=>page.locator('#public-review-invitation').evaluate(el=>el.outerHTML)
  await guest.locator('#feedback-survey').waitFor();await positive.locator('#feedback-survey').waitFor()
  const originalInvitation=await invitation(guest)
  assert.equal(await invitation(positive),originalInvitation)
  assert.equal(await guest.getByRole('link',{name:'Leave a public review',exact:true}).getAttribute('href'),newReviewUrl)
  assert.ok(!(await guest.locator('body').innerText()).includes(f.visits[1].guestName),'Guest link contains only its own visit')
  await shot(guest,'guest-before-rating')
  await guest.getByRole('radio',{name:'1 out of 5',exact:true}).check();await guest.locator('[name=comment]').fill('The food arrived cold and we could not get help.')
  await guest.getByRole('button',{name:'Send feedback',exact:true}).click();await guest.getByRole('heading',{name:'Your feedback',exact:true}).waitFor()
  assert.equal(await invitation(guest),originalInvitation)
  await positive.getByRole('radio',{name:'5 out of 5',exact:true}).check();await positive.locator('[name=comment]').fill('A lovely evening with attentive service.')
  await positive.getByRole('button',{name:'Send feedback',exact:true}).click();await positive.getByRole('heading',{name:'Your feedback',exact:true}).waitFor()
  assert.equal(await invitation(positive),originalInvitation)
  await shot(positive,'positive-same-invitation')
  const low=(await h.api('/api/feedback')).visits.find(v=>v.id===f.visits[0].id)
  assert.equal(low.case.state,'open');assert.ok(low.case.assigneeId);assert.ok(Number.isFinite(Date.parse(low.case.dueAt)))
  await h.api('/api/public/feedback/submit',{token:f.tokens[0],rating:1,comment:'The food arrived cold and we could not get help.'},{as:''})
  assert.equal((await h.api('/api/feedback')).visits.length,2,'Duplicate response preserves one record per visit')
  await feedbackTick(h);assert.equal(h.messages.filter(m=>m.text?.includes('/feedback#')).length,2,'Scheduler does not duplicate survey invitations')
  await guest.locator('#guest-reply [name=message]').fill('Please contact me about the cold main course.');await guest.getByRole('button',{name:'Send message',exact:true}).click();await guest.getByText('Message recorded for the restaurant.',{exact:true}).waitFor()
  await owner.getByRole('button',{name:'Refresh feedback',exact:true}).click()
  const row=owner.locator(`[data-feedback-visit="${low.id}"]`)
  await row.locator('summary').first().click();await row.getByText('Please contact me about the cold main course.',{exact:true}).waitFor()
  await row.getByText('Reassign follow-up',{exact:true}).click()
  const assignment=row.locator('[data-feedback-action=assign]')
  await assignment.locator('[name=assigneeId]').selectOption(manager.id)
  // A past due time exercises the visible SLA state without a browser clock fake.
  await assignment.locator('[name=dueAt]').fill('2020-01-01T12:00')
  await assignment.getByRole('button',{name:'Update assignment',exact:true}).click();await row.getByRole('heading',{name:'Follow-up overdue',exact:true}).waitFor()
  assert.equal((await h.api('/api/feedback')).visits.find(v=>v.id===low.id).case.assigneeId,manager.id)
  await shot(owner,'assigned-overdue-thread')
  const reply=row.locator('[data-feedback-action=reply]')
  await reply.locator('[name=message]').fill('Thank you for telling us. We have reviewed this with our kitchen and would like to make it right.')
  await reply.getByRole('button',{name:'Send reply',exact:true}).click();await owner.locator('#notice').getByText('Reply recorded. See provider status in the conversation.',{exact:true}).waitFor();await row.getByText('Provider accepted; mailbox delivery unconfirmed',{exact:false}).last().waitFor()
  const messages=(await h.api('/api/feedback')).visits.find(v=>v.id===low.id).messages
  assert.equal(messages.filter(m=>m.author==='manager').length,1);assert.equal(messages.find(m=>m.author==='manager').state,'accepted')
  await shot(owner,'provider-accepted-reply')
  await row.getByText('Close follow-up',{exact:true}).first().click()
  const closure=row.locator('[data-feedback-action=close]')
  await closure.locator('[name=outcome]').fill('Kitchen reviewed the service issue; personal follow-up sent to the guest.')
  await closure.getByRole('button',{name:'Close follow-up',exact:true}).click();await row.getByRole('heading',{name:'Follow-up closed',exact:true}).waitFor()
  await shot(owner,'closed-case')
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await guest.getByText('This follow-up is closed.',{exact:true}).waitFor()
  await guest.getByText('Thank you for telling us. We have reviewed this with our kitchen and would like to make it right.',{exact:true}).waitFor()
  assert.equal(await invitation(guest),originalInvitation)
  await shot(guest,'guest-reply-and-closure')
  await positive.getByText('Feedback consent',{exact:true}).click();await positive.getByRole('button',{name:'Withdraw feedback consent',exact:true}).click();await positive.getByRole('heading',{name:'Consent withdrawn',exact:true}).waitFor()
  assert.equal((await h.request('/api/public/feedback/status',{method:'POST',body:{token:f.tokens[1]},as:''})).status,404)
  for(const token of f.tokens){assert.ok(requests.every(url=>!url.includes(token)),'Token stays out of HTTP URLs');assert.equal(await guest.locator(`a[href*="${token}"]`).count(),0)}
  assert.deepEqual(errors,[])
  console.log(`CRM-005 feedback, identical public invitations, assigned SLA, reply and closure passed at ${width}`)
 }finally{await guests.close();await context.close();await browser.close();await transport.close();await h.close()}
}

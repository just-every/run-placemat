// FLOOR-007: real native host, Worker/D1 and shipped timeline forms at both widths.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {searchFixture} from './api/timeline-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await searchFixture(h),cookie=await h.signIn('timeline-search-host@example.test'),host=(await h.api('/auth/operators')).find(p=>p.email==='timeline-search-host@example.test')
  await h.command('team.host',{operatorId:host.id,enabled:true})
  const deposit=await h.command('payment.request',{bookingId:f.elena.id,amountCents:10000,dueAt:new Date(Date.now()+7200000).toISOString(),followupOwnerId:host.id,reason:'Deposit callback for arriving guest'});
  await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(transport.origin+'/app');await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
  const timeline=page.locator('#floor-timeline'),rows=timeline.locator('.timeline-table tbody tr')
  await timeline.getByRole('button',{name:'Apply timeline filters',exact:true}).waitFor()
  const apply=async({search='',source='',status='',serviceId=f.first.id}={},expected=[])=>{
   const form=timeline.locator('[data-timeline-filter]')
   await form.getByLabel('Day (venue date)',{exact:true}).fill(f.date)
   await form.locator('[name=serviceId]').selectOption(serviceId)
   await form.getByLabel('Search parties or tables',{exact:true}).fill(search)
   await form.locator('[name=source]').selectOption(source)
   await form.locator('[name=status]').selectOption(status)
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/timeline'&&new URL(r.url()).searchParams.get('search')===search&&new URL(r.url()).searchParams.get('source')===source&&new URL(r.url()).searchParams.get('status')===status&&new URL(r.url()).searchParams.get('serviceId')===serviceId)
   await form.getByRole('button',{name:'Apply timeline filters',exact:true}).click()
   assert.ok((await response).ok(),'FLOOR-007 search succeeds through the real HTTP door')
   const ids=expected.map(b=>b.id).sort()
   await expect.poll(async()=>rows.evaluateAll(nodes=>nodes.map(row=>row.dataset.bookingId).sort())).toEqual(ids)
   if(!ids.length)await expect(timeline.getByText('No reservations match this day and these filters.',{exact:true})).toBeVisible()
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'FLOOR-007 page fits viewport; table/time-bar scrolling stays contained')
  }
  const shot=async name=>{if(shots)await timeline.screenshot({path:resolve(shots,`FLOOR-007-${name}-${width}.png`)})}
  await apply({search:'0191',source:'online',status:'booked'},[f.elena])
  const guestRow=rows.filter({hasText:'Eléna García'})
  for(const text of ['VIP','Guest allergy notes: Shellfish <guest supplied>','wheelchair requested, not guaranteed','Required table access: step-free','Food safety is not certified by these notes.'])await expect(guestRow).toContainText(text)
  assert.equal(await guestRow.locator('guest,b,script').count(),0,'FLOOR-007 guest text remains escaped')
  assert.ok(!(await timeline.innerText()).includes('Private planning note'))
  await shot('phone-alerts')
  await expect(guestRow).toContainText('$100.00');await guestRow.locator('.timeline-alert').filter({hasText:'Deposit'}).scrollIntoViewIfNeeded();await shot('deposit-alert');await timeline.locator('.table-scroll').evaluate(el=>{el.scrollLeft=0})
  await apply({search:'+1 415 555 0191',serviceId:''},[f.elena,f.later])
  await shot('all-services')
  await apply({search:'elena garcia'},[f.elena])
  await apply({search:'ELENA@EXAMPLE.TEST'},[f.elena])
  await apply({search:f.jules.id},[f.jules])
  await apply({search:'pAtIo 14',source:'online',status:'cancelled'},[f.jules])
  await shot('table-cancelled')
  await apply({source:'walk-in',status:'seated'},[f.morgan]);await expect(rows).toContainText('Morgan Lee')
  await apply({source:'waitlist',status:'seated'},[f.taylor]);await expect(rows).toContainText('Taylor Quinn')
  await shot('waitlist-seated')
  await apply({search:'0191',source:'walk-in'},[]);await shot('no-match')
  await apply({search:'0191'},[f.elena])
  // Finding a party retains the existing assignment action and its real host authority.
  await rows.getByRole('button',{name:'Change assignment',exact:true}).click()
  await expect(page.locator('#reassignment')).toContainText('Eléna García')
  const selected=timeline.locator('[name=search]');await selected.focus();await selected.press('Tab');await expect(timeline.locator('[name=source]')).toBeFocused()
  // Existing host search feeds a manager-owned request and a real next-host callback handover.
  const nextCookie=await h.signIn('synthetic-placemat-next-ui@example.test','member','Blair Host'),managerCookie=await h.signIn('synthetic-placemat-manager-ui@example.test','admin','Morgan Manager'),nextId=(await h.api('/auth/operators')).find(p=>p.email==='synthetic-placemat-next-ui@example.test').id;
  await h.command('team.host',{operatorId:nextId,enabled:true});
  const signIn=async token=>{await context.clearCookies();await context.addCookies(token.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}));await page.reload();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor();};
  const follow=page.getByRole('region',{name:'Owned guest follow-up'}),followShot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await follow.screenshot({path:resolve(shots,`FLOOR-007-${name}-${width}.png`)})};
  await signIn(cookie);
  const create=async(kind,text,ownerId)=>{
   await follow.getByText('Assign guest follow-up',{exact:true}).click();const form=follow.locator('[data-command="booking.handover"]');await form.locator('[name=bookingId]').selectOption(f.elena.id);await form.locator('[name=kind]').selectOption(kind);if(kind==='callback')await form.locator('[name=paymentRequestId]').selectOption(deposit.requestId);await form.locator('[name=ownerId]').selectOption(ownerId);await form.getByLabel('Guest follow-up',{exact:true}).fill(text);assert.ok(await form.evaluate(el=>el.reportValidity()),'Handover form is valid');const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/commands'&&r.request().method()==='POST');await form.getByRole('button',{name:'Assign follow-up',exact:true}).click();const answer=await saved;assert.ok(answer.ok(),await answer.text());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();
   return (await h.api('/api/state')).state.bookings.find(b=>b.id===f.elena.id).handover.at(-1).id;
  };
  const requestId=await create('request','synthetic-placemat-access <guest supplied>',host.id),callbackId=await create('callback','synthetic-placemat-callback promised',host.id);
  const callbackCard=follow.locator(`[data-handover-task="${callbackId}"]`);await callbackCard.getByText('Hand over this follow-up',{exact:true}).click();const transfer=callbackCard.locator('[data-command="booking.handover.assign"]');await transfer.locator('[name=ownerId]').selectOption(nextId);await transfer.getByRole('button',{name:'Hand over follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await followShot('owned-callback');
  await signIn(cookie);assert.ok(!(await follow.innerText()).includes('synthetic-placemat-callback promised'),'Former host no longer sees reassigned follow-up');const requestCard=follow.locator(`[data-handover-task="${requestId}"]`);assert.equal(await follow.locator(`[data-handover-task="${callbackId}"] [data-command="booking.handover.complete"]`).count(),0);await requestCard.getByLabel('Recorded outcome',{exact:true}).fill('synthetic-placemat-access checked with guest');await requestCard.getByRole('button',{name:'Complete guest follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await followShot('request-resolved');
  await signIn(nextCookie);await callbackCard.getByLabel('Recorded outcome',{exact:true}).fill('synthetic-placemat-next-host completed callback');await callbackCard.getByRole('button',{name:'Complete guest follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await expect(callbackCard).toContainText('Completed');await expect(callbackCard).toContainText('Blair Host');await followShot('callback-completed');await signIn(cookie);
  // Live changes cannot resurrect personal alerts once the host explicitly refreshes.
  await h.command('guest.erase',{guestId:f.guest.id,confirm:'ERASE'})
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
  await timeline.getByRole('button',{name:'Apply timeline filters',exact:true}).waitFor()
  await apply({search:'0191'},[])
  await apply({search:f.elena.id},[f.elena]);await expect(rows).toContainText('Erased guest')
  for(const value of ['Eléna García','VIP','Shellfish','step-free','wheelchair requested'])assert.ok(!(await rows.innerText()).includes(value),'FLOOR-007 erasure removes '+value)
  await shot('erased');for(const value of ['synthetic-placemat-access','synthetic-placemat-callback','synthetic-placemat-next-host'])assert.ok(!(await follow.innerText()).includes(value));await followShot('followup-erased')
  assert.deepEqual(errors,[])
  console.log(`FLOOR-007 normalized guest/phone/ID/table search, combined filters, flags, host action, keyboard and erasure passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

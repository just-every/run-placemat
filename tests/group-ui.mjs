// ROLE-001: two owners connect their venues, grant a scoped group admin, who reads with a token until the grant is revoked.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest,service} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 let home,tap,homeTransport,tapTransport,browser,errors=[]
 home=await installation({origin:'https://home.example.test',peers:{'tap.example.test':()=>tap}});tap=await installation({origin:'https://tap.example.test',peers:{'home.example.test':()=>home}})
 homeTransport=await browserServer(home);tapTransport=await browserServer(tap)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${homeTransport.certificateSpki},${tapTransport.certificateSpki}`]})
 try{
  for(const [h,name] of [[home,'Home Bistro'],[tap,'Tap Room']]){const {service:s}=await service(h);await h.command('venue.update',{name,timezone:'Australia/Brisbane'});await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})}
  const ga=await home.signIn('ui-group-admin@example.test')
  const cookies=(cookie,origin)=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:origin,secure:true,sameSite:'Lax'}})
  const open=async(h,transport,cookie,setup)=>{
   const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});await context.addCookies(cookies(cookie,transport.origin));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   if(setup){await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}else await page.goto(transport.origin+'/app')
   await page.locator('.app-main[aria-busy=false]').waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click();return {context,page}
  }
  const group=page=>page.locator('details:has(> summary:text-is("Venue group")), details:has(> summary:text-is("Group access"))').first()
  const shot=async(page,name,locator)=>{const iconOnly=await (locator||page.locator('body')).locator('button,a,[role=button]').evaluateAll(items=>items.filter(el=>el.querySelector('svg')&&!el.textContent.trim()).map(el=>el.getAttribute('aria-label')));assert.deepEqual(iconOnly,[],'Touched report controls keep visible text labels');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ROLE-001 fits viewport');if(shots)await (locator||page).screenshot({path:resolve(shots,`ROLE-001-${name}-${width}.png`)})}
  const submit=async(page,kind,button,path,status='Group settings saved.')=>{
   await group(page).evaluate(el=>el.open=true);const panel=await group(page).evaluateHandle(el=>el.parentElement),response=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST')
   await group(page).locator(`form[data-group-form="${kind}"]`).getByRole('button',{name:button,exact:true}).click();assert.ok((await response).ok())
   if(!['invite','token'].includes(kind)){await page.waitForFunction(el=>!el.isConnected,panel);await group(page).locator('form').first().waitFor({state:'attached'})}
   else await page.getByRole('status').filter({hasText:status}).first().waitFor()
  }
  const homeOwner=await open(home,homeTransport,home.cookie,true),tapOwner=await open(tap,tapTransport,tap.cookie,true)
  // The home owner issues a one-use invitation; the other venue's owner joins and limits what group admins may read there.
  await group(homeOwner.page).evaluate(el=>el.open=true);await group(homeOwner.page).locator('form[data-group-form=invite] [name=label]').fill('Tap Room');await submit(homeOwner.page,'invite','Create one-use invitation','/api/group/invite','Invitation created.')
  const code=await homeOwner.page.locator('#group-code pre').innerText();assert.match(code,/^gi_[a-f0-9]{64}$/);await shot(homeOwner.page,'invitation',group(homeOwner.page))
  await group(tapOwner.page).evaluate(el=>el.open=true);const join=group(tapOwner.page).locator('form[data-group-form=join]')
  await join.locator('[name=homeOrigin]').fill('https://home.example.test');await join.locator('[name=code]').fill(code);await join.locator('[value="preshift.read"]').uncheck();await shot(tapOwner.page,'join',group(tapOwner.page))
  await submit(tapOwner.page,'join','Join group','/api/group/join');await group(tapOwner.page).evaluate(el=>el.open=true);assert.match(await group(tapOwner.page).innerText(),/Member of the group at https:\/\/home\.example\.test[\s\S]*Reservation report/);assert.ok(!(await group(tapOwner.page).innerText()).includes('Pre-shift sheet.'));await shot(tapOwner.page,'member',group(tapOwner.page))
  // The home owner sees the connected venue and grants the person explicit rights at both venues.
  await homeOwner.page.reload();await homeOwner.page.locator('.app-main[aria-busy=false]').waitFor();await homeOwner.page.getByRole('link',{name:'Settings',exact:true}).click();await group(homeOwner.page).evaluate(el=>el.open=true)
  assert.match(await group(homeOwner.page).innerText(),/Connected venues[\s\S]*Tap Room/)
  const grant=group(homeOwner.page).locator('form[data-group-form=grant]');await grant.locator('[name=operatorId]').selectOption({label:'Host reader'})
  const boxes=grant.locator('input[type=checkbox]');assert.equal(await boxes.count(),3,'Home offers both rights and the member venue only its ceiling');for(const box of await boxes.all())await box.check()
  await submit(homeOwner.page,'grant','Grant group access','/api/group/admin');await group(homeOwner.page).evaluate(el=>el.open=true);const granted=await group(homeOwner.page).innerText();assert.match(granted,/Group admins/);assert.match(granted,/This venue: Reservation report, Pre-shift sheet/);assert.match(granted,/Tap Room: Reservation report\n/);await shot(homeOwner.page,'grants',group(homeOwner.page))
  // The group admin creates a token in their own settings and reads both venues until the owner revokes access.
  const admin=await open(home,homeTransport,ga);await group(admin.page).evaluate(el=>el.open=true);await group(admin.page).locator('form[data-group-form=token]').getByRole('button',{name:'Create group token',exact:true}).click();await admin.page.locator('#group-token pre').waitFor()
  const token=await admin.page.locator('#group-token pre').innerText();assert.match(token,/^gt_[a-f0-9]{64}$/);await shot(admin.page,'token',group(admin.page))
  const bearer={as:'',headers:{authorization:'Bearer '+token}}
  assert.equal((await tap.api('/api/group/reports/reservations',undefined,bearer)).venue,'Tap Room');assert.equal((await home.api('/api/group/preshift',undefined,bearer)).venue,'Home Bistro')
  await group(homeOwner.page).evaluate(el=>el.open=true);await submit(homeOwner.page,'revoke','Revoke group access','/api/group/admin/revoke');await group(homeOwner.page).evaluate(el=>el.open=true);assert.ok(!(await group(homeOwner.page).innerText()).includes('Revoke group access'));await shot(homeOwner.page,'revoked',group(homeOwner.page))
  await tap.api('/api/group/reports/reservations',undefined,{...bearer,status:403});await home.api('/api/group/preshift',undefined,{...bearer,status:403})
  assert.deepEqual(errors,[])
  console.log(`ROLE-001 invitation, join with ceiling, scoped grant, group token reads and revocation passed at ${width}`)
  for(const o of [homeOwner,tapOwner,admin])await o.context.close()
 }finally{await browser.close();await homeTransport.close();await tapTransport.close();await home.close();await tap.close()}
}

// REPORT-005 uses the same Settings components, two native venue Workers and authenticated downloads.
for(const width of [1440,390]){
 const {reportGroup,reportDay,firstDue,publishReportService}=await import('./api/report-schedule-fixture.mjs'),f=await reportGroup(),transport=await browserServer(f.home)
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
 try{
  const errors=[]
  const open=async(cookie,setup=false)=>{
   const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   if(setup){await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}else await page.goto(transport.origin+'/app')
   await page.locator('.app-main[aria-busy=false]').waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click();return {page,context}
  }
  const historical=await publishReportService(f.home,'Historical visit','2020-11-03T01:00:00Z'),table=(await f.home.api('/api/state')).state.tables[0]
  const visit=await f.home.command('booking.walkin',{serviceId:historical.id,startAt:historical.startAt,tableIds:[table.id],name:'Synthetic visit',email:'synthetic-placemat-visit@example.test',partySize:2})
  await f.home.command('booking.status',{bookingId:visit.id,status:'completed'});await f.home.command('booking.stage',{bookingId:visit.id,stage:'ready'})
  const owner=await open(f.home.cookie,true),settings=()=>owner.page.locator('#report-schedule-settings')
  await settings().evaluate(el=>el.open=true)
  const form=owner.page.locator('#report-schedule-create')
  await form.locator('[name=recipientId]').selectOption(f.recipientId);await form.locator('[name=nextAt]').fill(firstDue.slice(0,16))
  for(const box of await form.locator('[name=venueId]').all())await box.check()
  await form.locator('[name=acknowledged]').check();await form.getByRole('button',{name:'Approve weekly report'}).click()
  await settings().getByText('Report schedule saved.',{exact:true}).waitFor()
  const shot=async(page,name,locator)=>{const iconOnly=await (locator||page.locator('body')).locator('button,a,[role=button]').evaluateAll(items=>items.filter(el=>el.querySelector('svg')&&!el.textContent.trim()).map(el=>el.getAttribute('aria-label')));assert.deepEqual(iconOnly,[],'Touched report controls keep visible text labels');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'REPORT-005 fits viewport');if(shots)await (locator||page).screenshot({path:resolve(shots,`REPORT-005-${name}-${width}.png`)})}
  await shot(owner.page,'approved',settings())
  f.mail.uncertain=true;await f.tick();await owner.page.reload();await owner.page.locator('.app-main[aria-busy=false]').waitFor();await owner.page.getByRole('link',{name:'Settings',exact:true}).click();await settings().evaluate(el=>el.open=true)
  await settings().getByText('delivery unconfirmed',{exact:true}).waitFor();const resend=settings().locator('form[data-resend-report]');await resend.locator('[name=acknowledged]').check();await shot(owner.page,'unconfirmed',settings())
  f.mail.uncertain=false;await resend.getByRole('button',{name:'Resend report manually'}).click();await settings().getByText('provider accepted',{exact:true}).waitFor();await shot(owner.page,'resent',settings())
  const recipient=await open(f.recipient),group=recipient.page.locator('details:has(> summary:text-is("Group access"))');await group.evaluate(el=>el.open=true)
  const comparison=group.locator('form[data-group-form=comparison]');await comparison.locator('[name=dateFrom]').fill(reportDay);await comparison.locator('[name=dateTo]').fill(reportDay);await comparison.getByRole('button',{name:'Compare local cover totals'}).click()
  await group.locator('#group-comparison .card').first().waitFor();assert.equal(await group.locator('#group-comparison .card').count(),2);assert.match(await group.locator('#group-comparison').innerText(),/America\/Los_Angeles/);assert.match(await group.locator('#group-comparison').innerText(),/Australia\/Brisbane/)
  await shot(recipient.page,'comparison',group)
  const download=recipient.page.waitForEvent('download');await group.getByRole('link',{name:'Download group cover CSV'}).click();const file=await download,body=await(await import('node:fs/promises')).readFile(await file.path(),'utf8');assert.ok(body.includes('Home Bistro')&&body.includes('Tap Room')&&!body.includes('guest0@example.test'))
  const message=f.mail.messages.findLast(m=>m.subject==='Your weekly group cover report'),link=new URL(message.text.match(/https:\/\/[^\s]+/)[0])
  const delivered=await recipient.context.request.get(transport.origin+link.pathname);assert.equal(delivered.status(),200);assert.match(await delivered.text(),/Home Bistro/)
  const wrong=await owner.context.request.get(transport.origin+link.pathname);assert.equal(wrong.status(),403);assert.ok(!(await wrong.text()).includes('Home Bistro'))
  await f.home.api('/api/group/admin/revoke',{operatorId:f.recipientId});await f.tick('2031-11-10T18:00:00.000Z')
  await owner.page.reload();await owner.page.locator('.app-main[aria-busy=false]').waitFor();await owner.page.getByRole('link',{name:'Settings',exact:true}).click();await settings().evaluate(el=>el.open=true);await settings().getByText('blocked',{exact:true}).waitFor();await shot(owner.page,'revoked',settings())
  await settings().getByRole('button',{name:'Stop weekly report'}).click();await settings().getByText('Schedule stopped',{exact:false}).waitFor();await shot(owner.page,'stopped',settings())
  // Every control added here has a visible text label; the existing app navigation also keeps its visible labels at phone width.
  await owner.page.getByRole('link',{name:'Reservation reports',exact:true}).click()
  const filters=owner.page.locator('#reservation-filters');await filters.locator('[name=period]').selectOption('future');await filters.getByRole('button',{name:'Apply report filters'}).click()
  const matching=owner.page.getByRole('link',{name:'Download matching rows CSV'});await matching.waitFor();let fileEvent=owner.page.waitForEvent('download');await matching.click();let downloaded=await fileEvent;let contents=await(await import('node:fs/promises')).readFile(await downloaded.path(),'utf8');assert.ok(contents.includes(f.bookings[0].id)&&!contents.includes(visit.id));await shot(owner.page,'future-bookings',owner.page.locator('#reports-content'))
  await filters.locator('[name=period]').selectOption('past');await filters.getByRole('button',{name:'Apply report filters'}).click();const visits=owner.page.getByRole('link',{name:'Download attended visits CSV'});await visits.waitFor();fileEvent=owner.page.waitForEvent('download');await visits.click();downloaded=await fileEvent;contents=await(await import('node:fs/promises')).readFile(await downloaded.path(),'utf8');assert.ok(contents.includes(visit.id)&&!contents.includes('synthetic-placemat-visit@example.test'));await shot(owner.page,'historical-visits',owner.page.locator('#reports-content'))
  assert.deepEqual(errors,[]);await recipient.context.close();await owner.context.close();console.log(`REPORT-005 approval, uncertain delivery, manual resend, group comparison, download and revocation passed at ${width}`)
 }finally{await browser.close();await transport.close();await f.close()}
}

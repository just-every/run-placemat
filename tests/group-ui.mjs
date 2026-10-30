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
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${homeTransport.certificateSpki},${tapTransport.certificateSpki}`]})
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
  const boxes=grant.locator('input[type=checkbox]');assert.equal(await boxes.count(),4,'Home offers all three rights and the member venue only its ceiling');for(const box of await boxes.all())await box.check()
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
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
 try{
  const errors=[]
  const open=async(cookie,setup=false,financeOnly=false)=>{
   const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   if(financeOnly){await page.goto(transport.origin+'/finance');return {page,context}}
   if(setup){await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}else await page.goto(transport.origin+'/app')
   await page.locator('.app-main[aria-busy=false]').waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click();return {page,context}
  }
  const historical=await publishReportService(f.home,'Historical visit','2020-11-03T01:00:00Z'),table=(await f.home.api('/api/state')).state.tables[0]
  const visit=await f.home.command('booking.walkin',{serviceId:historical.id,startAt:historical.startAt,tableIds:[table.id],name:'Synthetic visit',email:'synthetic-placemat-visit@example.test',partySize:2})
  await f.home.command('booking.status',{bookingId:visit.id,status:'completed'});await f.home.command('booking.stage',{bookingId:visit.id,stage:'ready'})
  const financeEmail='synthetic-placemat-weekly-finance'+String.fromCharCode(64)+'example.test',financeCookie=await f.signIn(financeEmail,'member','Weekly finance reader')
  const people=await f.home.api('/auth/operators'),financeId=people.find(p=>p.email===financeEmail).id,ownerId=people.find(p=>p.role==='owner').id
  await f.home.command('team.finance',{operatorId:financeId,enabled:true})
  await f.home.command('payment.request',{bookingId:f.bookings[0].id,amountCents:2000,dueAt:'2031-11-03T00:00:00.000Z',followupOwnerId:ownerId,reason:'Reviewed booking deposit'})
  const owner=await open(f.home.cookie,true),settings=()=>owner.page.locator('#report-schedule-settings')
  await settings().evaluate(el=>el.open=true)
  const form=owner.page.locator('#report-schedule-create')
  await form.locator('[name=recipientId]').selectOption(f.recipientId);await form.locator('[name=nextAt]').fill(firstDue.slice(0,16))
  for(const box of await form.locator('[name=venueId]').all())await box.check()
  await form.locator('[name=acknowledged]').check();await form.getByRole('button',{name:'Approve weekly report'}).click()
  await settings().getByText('Report schedule saved.',{exact:true}).waitFor()
  const shot=async(page,name,locator)=>{const iconOnly=await (locator||page.locator('body')).locator('button,a,[role=button]').evaluateAll(items=>items.filter(el=>el.querySelector('svg')&&!el.textContent.trim()).map(el=>el.getAttribute('aria-label')));assert.deepEqual(iconOnly,[],'Touched report controls keep visible text labels');const smallText=await (locator||page.locator('body')).locator('p,label,legend,summary,button,select,input,h4').evaluateAll(items=>items.filter(el=>el.getClientRects().length&&parseFloat(getComputedStyle(el).fontSize)<13).map(el=>el.tagName));assert.deepEqual(smallText,[],'Report text stays at least 13px');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'REPORT-005 fits viewport');if(shots)await (locator||page).screenshot({path:resolve(shots,`REPORT-005-${name}-${width}.png`)})}
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
  // Local schedules use the same approval form and deliver only to the nominated native identity.
  const manager=await open(f.manager),finance=await open(financeCookie,false,true)
  const localState=(await f.home.api('/api/state')).state,homeService=localState.services.find(s=>s.id===localState.bookings.find(b=>b.id===f.bookings[0].id).serviceId)
  for(const local of [
   {kind:'reservations',label:'Local reservations',recipientId:f.managerId,session:manager,serviceId:homeService.id,subject:'Your weekly reservation report',header:/bookingId,serviceId,service,venue,serviceDate/,body:f.bookings[0].id},
   {kind:'guests',label:'Local guests',recipientId:ownerId,session:owner,serviceId:null,subject:'Your weekly guest report',header:/bookingId,serviceDate,guestId,name,email,phone,confirmationConsent,contactPreference,marketingPermission/,body:'guest0@example.test'},
   {kind:'finance',label:'Local finance',recipientId:financeId,session:finance,serviceId:null,subject:'Your weekly finance report',header:/kind,bookingId,recordId,amountCents,currency,state,pendingCents,succeededCents,remainingCents/,body:'2000'},
  ]){
   const localForm=owner.page.locator('#report-schedule-create')
   await localForm.locator('[name=reportKind]').selectOption(local.kind)
   assert.equal(await localForm.locator('[data-group-venues]').isVisible(),false)
   await localForm.locator('[name=serviceId]').selectOption(local.serviceId||'')
   await localForm.locator('[name=recipientId]').selectOption(local.recipientId);await localForm.locator('[name=nextAt]').fill(firstDue.slice(0,16));await localForm.locator('[name=acknowledged]').check()
   const created=owner.page.waitForResponse(r=>r.url().endsWith('/api/report-schedules')&&r.request().method()==='POST')
   await localForm.getByRole('button',{name:'Approve weekly report'}).click();const response=await created;assert.equal(response.status(),201)
   const scheduleId=(await response.json()).id;await settings().getByText('Report schedule saved.',{exact:true}).waitFor()
   const card=settings().locator('article').filter({has:owner.page.locator(`[data-stop-report="${scheduleId}"]`)})
   assert.ok((await card.innerText()).includes(local.label));if(local.serviceId)assert.ok((await card.innerText()).includes(homeService.name))
   const saved=(await f.home.api('/api/report-schedules')).schedules.find(s=>s.id===scheduleId)
   assert.equal(saved.report_kind,local.kind);assert.equal(saved.service_id,local.serviceId);assert.deepEqual(saved.venues,['home'])
   await shot(owner.page,'local-'+local.kind,settings());const before=f.mail.messages.length;await f.tick()
   const sent=f.mail.messages.slice(before).find(m=>m.subject===local.subject);assert.ok(sent,local.kind+' sends its own report type')
   const localLink=new URL(sent.text.match(/https:\/\/[^\s]+/)[0]),opened=await local.session.context.request.get(transport.origin+localLink.pathname)
   assert.equal(opened.status(),200);assert.match(opened.headers()['content-type'],/text\/csv/);const csv=await opened.text();assert.match(csv.split('\n')[0].replaceAll('"',''),local.header);if(local.body)assert.ok(csv.includes(local.body))
   const denied=await recipient.context.request.get(transport.origin+localLink.pathname);assert.equal(denied.status(),403);assert.ok(!(await denied.text()).includes(csv.split('\n')[0]))
   await card.getByRole('button',{name:'Stop weekly report'}).click()
   await owner.page.locator(`[data-stop-report="${scheduleId}"]`).waitFor({state:'detached'})
   assert.equal((await f.home.api('/api/report-schedules')).schedules.find(s=>s.id===scheduleId).enabled,0)
   assert.equal((await local.session.context.request.get(transport.origin+localLink.pathname)).status(),403,'Stopped local schedule closes its link')
  }
  await manager.context.close();await finance.context.close()
  // Every control added here has a visible text label; the existing app navigation also keeps its visible labels at phone width.
  await owner.page.getByRole('link',{name:'Reservation reports',exact:true}).click()
  const filters=owner.page.locator('#reservation-filters');await filters.locator('[name=period]').selectOption('future');await filters.getByRole('button',{name:'Apply report filters'}).click()
  const matching=owner.page.getByRole('link',{name:'Download matching rows CSV'});await matching.waitFor();let fileEvent=owner.page.waitForEvent('download');await matching.click();let downloaded=await fileEvent;let contents=await(await import('node:fs/promises')).readFile(await downloaded.path(),'utf8');assert.ok(contents.includes(f.bookings[0].id)&&!contents.includes(visit.id));await shot(owner.page,'future-bookings',owner.page.locator('#reports-content'))
  await filters.locator('[name=period]').selectOption('past');await filters.getByRole('button',{name:'Apply report filters'}).click();const visits=owner.page.getByRole('link',{name:'Download attended visits CSV'});await visits.waitFor();fileEvent=owner.page.waitForEvent('download');await visits.click();downloaded=await fileEvent;contents=await(await import('node:fs/promises')).readFile(await downloaded.path(),'utf8');assert.ok(contents.includes(visit.id)&&!contents.includes('synthetic-placemat-visit@example.test'));await shot(owner.page,'historical-visits',owner.page.locator('#reports-content'))
  assert.deepEqual(errors,[]);await recipient.context.close();await owner.context.close();console.log(`REPORT-005 approval, uncertain delivery, manual resend, group comparison, download, revocation and local reservation, guest and finance delivery passed at ${width}`)
 }finally{await browser.close();await transport.close();await f.close()}
}

// Group guest sharing uses separate booking proofs and explicit consent on each native installation.
for(const width of [1440,390]){
 const {groupGuests}=await import('./api/group-guest-fixture.mjs'),f=await groupGuests()
 const transports=[await browserServer(f.home),await browserServer(f.tap)]
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transports.map(t=>t.certificateSpki).join(',')}`]})
 try{
  const contexts=[],pages=[],errors=[]
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width,height:1100},ignoreHTTPSErrors:true});contexts.push(context)
   await context.addInitScript(token=>sessionStorage.setItem('placemat-diner-session',token),f.records[i].session.token)
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message))
   await page.goto(transports[i].origin+'/diner');await page.locator('#diner-group').waitFor();await page.locator('#diner-group').evaluate(el=>el.open=true)
   if(width===1440)assert.equal(await page.locator('#diner-group form[data-diner=group-consent] input:checked').count(),0,'Every sharing purpose starts off')
  }
  const consent=pages[0].locator('[data-diner=group-consent]')
  for(const box of await consent.locator('input[type=checkbox]').all())await box.check()
  await consent.getByRole('button',{name:'Save group choices'}).click();await pages[0].getByRole('status').filter({hasText:'Group choices saved.'}).waitFor()
  await pages[0].locator('#diner-group').evaluate(el=>el.open=true)
  const codeForm=pages[0].locator('[data-diner=group-code]');await codeForm.locator('[name=acknowledged]').check();await codeForm.getByRole('button',{name:'Create group link code'}).click()
  await pages[0].locator('#diner-group-code').filter({hasText:'gg_'}).waitFor();const code=(await pages[0].locator('#diner-group-code').innerText()).match(/gg_[a-f0-9]{64}/)[0]
  const link=pages[1].locator('[data-diner=group-link]');await link.locator('[name=code]').fill(code)
  for(const name of ['preferences','visits','acknowledged'])await link.locator(`[name=${name}]`).check()
  await link.getByRole('button',{name:'Link verified restaurant'}).click();await pages[1].getByRole('status').filter({hasText:'Group choices saved.'}).waitFor()
  for(let i=0;i<2;i++){
   const {call}=await import('./api/diner-client.mjs');await call(f.records[i].h,'preferences',{token:f.records[i].session.token,acknowledged:true,favorite:true,preferences:'synthetic-placemat-quiet-'+i})
   await pages[i].getByRole('button',{name:'Refresh account'}).click();await pages[i].getByRole('status').filter({hasText:'Account refreshed.'}).waitFor()
   await pages[i].locator('#diner-group').evaluate(el=>el.open=true)
   if(shots)await pages[i].locator('#diner-group').screenshot({path:resolve(shots,`GUEST-006-consent-${i}-${width}.png`)})
  }
  const addCookies=(context,cookie)=>context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transports[0].origin,secure:true,sameSite:'Lax'}}))
  const owner=await browser.newContext({viewport:{width,height:1100},ignoreHTTPSErrors:true});contexts.push(owner);await addCookies(owner,f.home.cookie)
  const setup=await owner.newPage();await setup.goto(transports[0].origin+'/setup');await setup.getByRole('checkbox').check();await setup.getByRole('button',{name:'Finish setup',exact:true}).click();await setup.locator('.app-main[aria-busy=false]').waitFor()
  const admin=await browser.newContext({viewport:{width,height:1100},ignoreHTTPSErrors:true});contexts.push(admin);await addCookies(admin,f.reader)
  const page=await admin.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(transports[0].origin+'/app');await page.locator('.app-main[aria-busy=false]').waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click()
  const panel=page.locator('details:has(> summary:text-is("Group access"))');await panel.evaluate(el=>el.open=true);await panel.getByRole('button',{name:'Read consented guestbook'}).click()
  const output=page.locator('#group-guestbook');await output.getByText('Shared guest 1',{exact:true}).waitFor()
  if(width===1440){
   assert.match(await output.innerText(),/Home Bistro[\s\S]*synthetic-placemat-quiet-0[\s\S]*Attended visits: 1[\s\S]*Tap Room[\s\S]*synthetic-placemat-quiet-1[\s\S]*Attended visits: 1/)
   assert.equal(await output.getByRole('link',{name:'Rebook at Home Bistro'}).count(),1);assert.equal(await output.getByRole('link',{name:'Rebook at Tap Room'}).count(),0)
   assert.equal(await output.getByRole('link').first().getAttribute('href'),'/book')
  }
  for(const touched of [pages[0],pages[1],page]){
   assert.ok(await touched.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sharing screens fit phone and desktop')
   const small=await touched.locator('#diner-group, #group-guestbook').locator('p,label,summary,button,a').evaluateAll(els=>els.filter(el=>el.getClientRects().length&&parseFloat(getComputedStyle(el).fontSize)<13).map(el=>el.tagName));assert.deepEqual(small,[])
   const icons=await touched.locator('#diner-group, #group-guestbook').locator('button,a').evaluateAll(els=>els.filter(el=>!el.textContent.trim()).length);assert.equal(icons,0,'Sharing controls have visible labels')
  }
  if(shots)await output.screenshot({path:resolve(shots,`GUEST-006-reader-${width}.png`)})
  // The next read clears the previous projection before an opt-out refusal.
  const revoke=pages[1].locator('[data-diner=group-consent]');for(const box of await revoke.locator('input[type=checkbox]').all())await box.uncheck();await revoke.locator('[name=acknowledged]').check();await revoke.getByRole('button',{name:'Save group choices'}).click();await pages[1].getByRole('status').filter({hasText:'Group choices saved.'}).waitFor()
  await panel.getByRole('button',{name:'Read consented guestbook'}).click();await page.getByRole('alert').filter({hasText:'Group guest access is not active.'}).waitFor()
  if(width===1440)assert.equal(await output.innerText(),'','Refused refresh leaves no stale guest projection')
  assert.deepEqual(errors,[]);for(const context of contexts)await context.close()
  console.log(`PROBE GUEST-006 browser: default-off consent, two verified venues, purpose-scoped history and rebooking, opt-out and cleared projection passed at ${width}`)
 }finally{await browser.close();for(const t of transports)await t.close();await f.close()}
}

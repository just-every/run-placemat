// FLOOR-012: use the shipped navigation, date form, native PDF download and print controls.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {preshiftFixture} from './api/preshift-fixture.mjs'
import {paymentEdge} from './api/payment-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const payments=paymentEdge(),h=await installation({stripeEdge:payments.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true})
 try{
  const f=await preshiftFixture(h),errors=[]
  const owner=(await h.api('/auth/operators')).find(p=>p.role==='owner'),dueAt=new Date(Math.floor((Date.now()+2*3600000)/1000)*1000).toISOString()
  const payment=await h.command('payment.request',{bookingId:f.booking.id,amountCents:5000,dueAt,followupOwnerId:owner.id,reason:'synthetic-placemat-1'})
  const deadline=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}).format(new Date(dueAt))
  const cookies=cookie=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  await context.addCookies(cookies(h.cookie));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'FLOOR-012 fits viewport');if(shots)await page.screenshot({path:resolve(shots,`FLOOR-012-${name}-${width}.png`),fullPage:name!=='operations-link'})}
  const entry=page.getByRole('link',{name:'Pre-shift sheet',exact:true});await entry.scrollIntoViewIfNeeded();await shot('operations-link');await entry.click()
  await page.getByLabel('Service date').fill(f.date);await page.getByRole('button',{name:'Open sheet',exact:true}).click()
  const article=page.getByRole('article',{name:'Pre-shift sheet'}),body=await article.innerText()
  for(const value of ['Elena Torres','Anniversary','Shellfish','No dairy','Wheelchair','regular','1 recorded visits','Window','Ana','10 expected covers','Private anniversary planning','Private celebration','elena@example.test','Deposit: unpaid','Protection pending','Deposit deadline: '+deadline])assert.ok(body.includes(value),value)
  await shot('manager')
  const download=async()=>{const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();const file=await pending;assert.equal(await file.failure(),null);return readFile(await file.path(),'utf8')}
  const pdf=await download();assert.match(pdf,/^%PDF-1.4/);assert.ok(pdf.includes('Shellfish'));assert.ok(pdf.includes('Private anniversary planning'));assert.ok(pdf.includes('Deposit: unpaid'));assert.ok(pdf.includes('Protection pending'));assert.ok(pdf.includes('Deposit deadline: '+deadline))
  await page.evaluate(()=>{window.printed=0;window.print=()=>window.printed++});await page.getByRole('button',{name:'Print sheet',exact:true}).click();assert.equal(await page.evaluate(()=>window.printed),1)
  await page.emulateMedia({media:'print'});assert.equal(await page.getByRole('navigation',{name:'Sheet actions',includeHidden:true}).evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await article.evaluate(e=>getComputedStyle(e).visibility),'visible','FLOOR-012: the sheet stays visible in print media');assert.ok((await article.innerText()).includes('Deposit deadline: '+deadline));assert.ok((await article.innerText()).includes('Protection pending'));await shot('print');await page.emulateMedia({media:'screen'})
  const generated=(await article.innerText()).match(/Generated ([^\n]+)/)[1]
  await h.command('booking.status',{bookingId:f.large.id,status:'cancelled'});await h.command('guest.profile',{guestId:f.guest.id,vipLevel:'vip'})
  await h.command('payment.link',{requestId:payment.requestId});const session=[...payments.sessions.values()][0];session.payment_status='paid';session.status='complete';await h.command('payment.sync',{requestId:payment.requestId})
  await page.getByRole('button',{name:'Open sheet',exact:true}).click();assert.ok(!(await article.innerText()).includes('Marcus Chen'));assert.ok((await article.innerText()).includes('2 expected covers'));assert.ok((await article.innerText()).includes('vip'));assert.ok((await article.innerText()).includes('Deposit: paid'));assert.ok((await article.innerText()).includes('Protected (provider verified)'));assert.ok((await article.innerText()).includes('Deposit deadline: '+deadline));assert.notEqual((await article.innerText()).match(/Generated ([^\n]+)/)[1],generated);await shot('updated')
  const host=await h.signIn('preshift-host@example.test'),hostId=(await h.api('/auth/operators')).find(p=>p.email==='preshift-host@example.test').id;await h.command('team.host',{operatorId:hostId,enabled:true})
  await context.clearCookies();await context.addCookies(cookies(host));await page.reload()
  assert.ok((await article.innerText()).includes('Host view'));assert.ok((await article.innerText()).includes('Shellfish'))
  const hostPdf=await download()
  for(const value of ['Deposit: paid','Protected','Deposit deadline: '+deadline]){assert.ok((await article.innerText()).includes(value));assert.ok(hostPdf.includes(value))}
  for(const value of ['Private anniversary planning','Private celebration','elena@example.test','+1 415 555 0191']){assert.ok(!(await page.content()).includes(value));assert.ok(!hostPdf.includes(value))}
  await shot('host')
  await h.command('guest.erase',{guestId:f.guest.id,confirm:'ERASE'});await page.reload();assert.ok((await article.innerText()).includes('Erased guest'))
  const erasedPdf=await download();for(const value of ['Elena Torres','Shellfish','Anniversary','Wheelchair','elena@example.test']){assert.ok(!(await page.content()).includes(value));assert.ok(!erasedPdf.includes(value))}
  await shot('erased');assert.deepEqual(errors,[])
  console.log(`FLOOR-012 navigation, date selection, manager/host filtering, PDF download, print, live reopen and erased end state passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}


// FLOOR-010 inherits the chef-counter sheet acceptance and reuses this committed journey.
for(const width of [1440,390]){
 const {seatFixture}=await import('./api/seat-fixture.mjs');
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true});
 try{
  const f=await seatFixture(h,{inventory:false}),errors=[];
  const cookies=cookie=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}});
  await context.addCookies(cookies(h.cookie));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Counter & Lounge',exact:true}).waitFor();
  const shot=async(name,locator)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Inventory fits viewport');if(shots)await (locator||page).screenshot({path:resolve(shots,`FLOOR-010-${name}-${width}.png`),...(locator?{}:{fullPage:true})})};
  await page.getByRole('link',{name:'Services & tables',exact:true}).click();
  for(const [name,kind,capacity] of [['Chef counter','counter','10'],['Lounge','pool','20']]){
   await page.getByText('Define counter or pool',{exact:true}).click();const form=page.locator('[data-command="inventory.create"]');
   await form.getByLabel('Inventory name',{exact:true}).fill(name);await form.locator('[name=kind]').selectOption(kind);await form.getByLabel('Inventory capacity',{exact:true}).fill(capacity);await form.getByLabel('Inventory arrival covers',{exact:true}).fill(capacity);await form.getByRole('button',{name:'Create inventory',exact:true}).click();await page.getByRole('heading',{name,exact:true}).waitFor();
  }
  await shot('definitions',page.getByRole('region',{name:'Counters and pools'}));
  await context.clearCookies();await page.goto(transport.origin+'/book');await page.locator('[name=area] option[value="Chef counter"]').waitFor({state:'attached'});await page.locator('#public-content[aria-busy]').waitFor({state:'detached'});
  const search=page.locator('[data-public-command=search]');await search.getByLabel('Arrival date',{exact:true}).fill(f.date);await search.locator('[name=area]').selectOption('Chef counter');await search.getByRole('button',{name:'Find available times',exact:true}).click();await page.getByRole('status').filter({hasText:'Availability updated'}).waitFor();
  const choices=page.locator('[name=public-result]');await choices.selectOption('0');await page.getByRole('heading',{name:'Your selected visit'}).waitFor();
  const counter=await f.units('Chef counter');await page.locator('[name=counterSeats]').selectOption(counter.slice(0,2).map(t=>t.id).join(','));
  await page.getByLabel('Your name',{exact:true}).fill('synthetic-placemat-counter-ui');await page.getByLabel('Email',{exact:true}).fill('synthetic-placemat-counter-ui@example.test');assert.match(await page.locator('[data-public-command=book]').innerText(),/host may transfer us to physical seats or a table/);await page.locator('[name=requestsAcknowledged]').check();await shot('selected');
  await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByRole('heading',{name:'Booking confirmed'}).waitFor();assert.match(await page.locator('.booking-confirmation').innerText(),/Chef counter seat 1, Chef counter seat 2/);await shot('confirmed');
  const lounge=await f.book('Lounge');await context.addCookies(cookies(h.cookie));await page.goto(transport.origin+'/app#floor');await page.locator('#bookings-list .bookings-table > tbody > tr').filter({hasText:'synthetic-placemat-1'}).waitFor();assert.match(await page.locator('#bookings-list').innerText(),/Lounge unassigned cover 1, Lounge unassigned cover 2/);assert.match(await page.getByRole('region',{name:'Inventory occupancy'}).innerText(),/Lounge: 2 \/ 20 unassigned covers held/);await shot('occupancy',page.getByRole('region',{name:'Inventory occupancy'}));await shot('pool-booking',page.locator('#bookings-list'));
  const move=async ids=>{
   const row=page.locator('#bookings-list .bookings-table > tbody > tr').filter({hasText:'synthetic-placemat-1'});await row.getByRole('button',{name:'Change assignment',exact:true}).click();
   const form=page.locator('[data-command="booking.move"]');await form.locator('[name=tableIds]').selectOption(ids);await form.getByRole('button',{name:'Move party',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();
  };
  await move(counter.slice(2,4).map(t=>t.id));const seatedRow=page.locator('#bookings-list .bookings-table > tbody > tr').filter({hasText:'synthetic-placemat-1'});await seatedRow.getByRole('button',{name:'Update service',exact:true}).click();const statusForm=page.locator('#service-status-editor [data-command="booking.stage"]');await statusForm.locator('[name=stage]').selectOption('seated');await statusForm.getByRole('button',{name:'Record service step',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();assert.equal((await f.state()).bookings.find(b=>b.id===lounge.id).status,'seated');assert.deepEqual((await f.state()).bookings.find(b=>b.id===lounge.id).tableIds,counter.slice(2,4).map(t=>t.id));assert.match(await page.getByRole('region',{name:'Inventory occupancy'}).innerText(),/Lounge: 0 \/ 20/);await shot('assigned-seats',page.locator('#bookings-list'));
  await move([f.table.id]);assert.deepEqual((await f.state()).bookings.find(b=>b.id===lounge.id).tableIds,[f.table.id]);await shot('transferred-table',page.locator('#bookings-list'));
  await page.goto(transport.origin+'/preshift?date='+f.date);const article=page.getByRole('article',{name:'Pre-shift sheet'});assert.match(await article.innerText(),/Chef counter seat 1, Chef counter seat 2/);await shot('sheet');
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();const file=await pending;assert.equal(await file.failure(),null);const downloadedPdf=await readFile(await file.path(),'utf8'),visiblePdf=[...downloadedPdf.matchAll(/\((.*)\) Tj ET/g)].map(m=>m[1]).join(' ');assert.match(visiblePdf,/Chef counter seat 1, Chef counter seat 2/);
  await page.emulateMedia({media:'print'});assert.equal(await article.evaluate(e=>getComputedStyle(e).visibility),'visible');await shot('print');await page.emulateMedia({media:'screen'});
  await page.goto(transport.origin+'/app#reports');await page.locator('#performance-utilization').waitFor();await page.locator('#performance-utilization summary').click();assert.match(await page.locator('#performance-utilization').innerText(),/7200.00 available cover-minutes/);await shot('performance',page.locator('#performance-utilization'));assert.deepEqual(errors,[]);
  console.log(`Counter inventory definition, guest seat choice, pool transfers and chef-counter screen/print/PDF passed at ${width}`);
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

// FLOOR-009 / FLOOR-005: real native sessions, Worker + D1, and shipped browser modules.
// Only outbound mail is faked by the installation harness; route fulfillment is
// the transport adapter between Chromium and the same Worker used by HTTP tests.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
const add=(value,minutes)=>new Date(Date.parse(value)+minutes*60000).toISOString()
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of process.env.PLACEMAT_FLOOR_ONLY==='hoststand'?[]:[1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   const tables=[];for(let i=0;i<4;i++)tables.push(await h.command('table.save',{label:['Window 4','Dining 4','Garden 4','Booth 4'][i],seats:4,area:'Dining',x:20+i%2*50,y:20+Math.floor(i/2)*50}))
   for(const pair of [[0,1],[2,3]])await h.command('combination.save',{tableIds:pair.map(i=>tables[i].id),capacity:8,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
   const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10)
   const publish=async(name,startAt,turnMinutes=90)=>{const service=await h.command('service.save',{name,startAt,endAt:add(startAt,300),turnMinutes,coverLimit:80});const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Host stand ready'});await h.command('proposal.approve',{proposalId:plan.id});return service}
   const dinner=await publish('Friday dinner',tomorrow+'T21:00:00Z'),book=async(service,i,extra={})=>(await h.api('/api/public/book',publicGuest(service,i,{partySize:4,...extra}),{as:'',status:201})).result
   const a=await book(dinner,0),b=await book(dinner,1),c=await book(dinner,2)
   const cookie=await h.signIn('real-host@example.test'),operator=(await h.api('/auth/operators')).find(p=>p.email==='real-host@example.test')
   await h.command('team.host',{operatorId:operator.id,enabled:true})
   await h.command('booking.stage',{bookingId:a.id,stage:'seated'},{as:cookie})
   await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.origin!==h.origin){await route.abort();return}
    const file=resolve('public','.'+url.pathname)
    if(file.startsWith(resolve('public')+'/')&&extname(file)){
     try{const body=await readFile(file),contentType={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';await route.fulfill({status:200,contentType,body});return}catch{}
    }
    const response=await h.mf.dispatchFetch(request.url(),{method:request.method(),headers:{...request.headers(),host:url.host},...(request.postDataBuffer()?{body:request.postDataBuffer()}:{})})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
   await page.goto(h.origin+'/app');await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   assert.equal((await h.api('/api/state',undefined,{as:cookie})).actor.role,'host')
   const open=async id=>{await page.locator(`#bookings-list [data-action="reassign"][data-id="${id}"]`).click();await page.locator('#reassignment h3').waitFor()}
   const save=async command=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===command);await page.locator(`#reassignment form[data-command="${command}"] button[type=submit]`).click();assert.ok((await response).ok());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()}
   await open(a.id);await page.locator('#reassignment select[name=tableIds]').selectOption([tables[3].id]);await save('booking.move')
   assert.deepEqual((await h.api('/api/state')).state.bookings.find(v=>v.id===a.id).tableIds,[tables[3].id])
   await page.locator('#reassignment summary').filter({hasText:'Assignment and turn history'}).click();assert.match(await page.locator('#reassignment').innerText(),/Before[\s\S]*Window 4[\s\S]*After[\s\S]*Booth 4/)
   if(shots)await page.locator('#reassignment').screenshot({path:resolve(shots,`FLOOR-009-move-${width}.png`)})
   await open(b.id);await page.locator('#reassignment summary').filter({hasText:'Swap with another party'}).click();await page.locator('#reassignment select[name=otherBookingId]').selectOption(c.id);await save('booking.swap')
   await open(c.id);await save('booking.lock')
   const final=await h.api('/api/state'),rows=final.state.audit.filter(e=>['booking.move','booking.swap','booking.lock'].includes(e.action))
   assert.equal(rows.length,3);assert.ok(rows.every(e=>e.actor===operator.id&&e.before.length&&e.after.length))
   await page.locator('#reassignment summary').filter({hasText:'Assignment and turn history'}).click();assert.match(await page.locator('#reassignment').innerText(),/locked/)
   if(shots)await page.locator('#reassignment').screenshot({path:resolve(shots,`FLOOR-009-lock-history-${width}.png`)})
   const startAt=new Date(Date.now()+3000).toISOString(),lunch=await publish('Host service now',startAt,15)
   const six=await book(lunch,10,{name:'Late six-top',partySize:6}),next=await book(lunch,11,{name:'Next arrival',partySize:6,startAt:add(startAt,30)})
   const wait=Date.parse(startAt)-Date.now()+30;if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait))
   await h.command('booking.stage',{bookingId:six.id,stage:'late'},{as:cookie});await h.command('booking.stage',{bookingId:six.id,stage:'seated'},{as:cookie})
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
   await page.locator('[name=floor-service]').selectOption(lunch.id);await page.locator('.timeline-table').waitFor()
   const sixRow=page.locator('.timeline-table tbody tr').filter({hasText:'Late six-top'});await sixRow.getByText('Extend turn',{exact:true}).click()
   const local=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(add(startAt,45))).map(p=>[p.type,p.value]))
   await sixRow.locator('[name=expectedEndAt]').fill(`${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}`);await sixRow.locator('[name=reason]').fill('Still enjoying mains; review next arrival')
   await sixRow.getByRole('button',{name:'Extend expected turn'}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   await page.locator('.timeline-table').waitFor();await page.locator('.timeline-table').getByText(/Collision with/).first().waitFor()
   if(shots)await page.locator('#floor-timeline').screenshot({path:resolve(shots,`FLOOR-005-overrun-${width}.png`)})
   await open(next.id);await page.locator('#reassignment select[name=tableIds]').selectOption([tables[2].id,tables[3].id]);await save('booking.move')
   await page.locator('.timeline-table').waitFor();assert.equal(await page.locator('.timeline-table').getByText(/Collision with/).count(),0)
   await open(next.id);await page.locator('#reassignment summary').filter({hasText:'Assignment and turn history'}).click();assert.match(await page.locator('#reassignment').innerText(),/Before[\s\S]*Window 4[\s\S]*After[\s\S]*Garden 4/)
   if(shots)await page.locator('#reassignment').screenshot({path:resolve(shots,`FLOOR-005-next-history-${width}.png`)})
   await open(six.id);await page.locator('#reassignment summary').filter({hasText:'Assignment and turn history'}).click();assert.match(await page.locator('#reassignment').innerText(),/Still enjoying mains/)
   if(shots)await page.locator('#reassignment').screenshot({path:resolve(shots,`FLOOR-005-six-history-${width}.png`)})
   await page.locator('[data-timeline-drill=seatedCovers]').click();assert.match(await page.locator('#timeline-drilldown').innerText(),/Late six-top/)
   await page.locator('[data-timeline-drill=dueCovers]').click();assert.match(await page.locator('#timeline-drilldown').innerText(),/Next arrival/)
   await h.command('booking.stage',{bookingId:six.id,stage:'completed'},{as:cookie})
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();await page.locator('[data-timeline-drill=averageActualTurn]').click();assert.match(await page.locator('#timeline-drilldown').innerText(),/Late six-top/)
   await page.locator('[data-timeline-filter] [name=search]').fill('Next arrival');await page.getByRole('button',{name:'Apply timeline filters'}).click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-table tbody tr').length===1)
   const oldScale=await page.locator('.timeline-axis').evaluate(el=>parseFloat(el.style.width))
   await page.locator('[data-timeline-filter] [name=zoom]').selectOption('15');await page.getByRole('button',{name:'Apply timeline filters'}).click()
   await page.waitForFunction(old=>parseFloat(document.querySelector('.timeline-axis').style.width)>old,oldScale)
   if(shots)await page.locator('#floor-timeline').screenshot({path:resolve(shots,`FLOOR-005-resolved-${width}.png`)})

   await context.clearCookies();await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.locator('#table-editor summary').click();assert.ok(await page.locator('#table-editor [name=accessTags]').isVisible())
   if(shots)await page.locator('#table-editor').screenshot({path:resolve(shots,`FLOOR-009-table-access-${width}.png`)})
   await page.locator('#settings-content summary').filter({hasText:'People & invitations'}).click()
   const grantForm=()=>page.locator('#settings-content form[data-command="team.host"]').filter({has:page.locator(`input[name=operatorId][value="${operator.id}"]`)})
   await grantForm().getByRole('button',{name:'Remove host access'}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   assert.ok(!(await h.api('/api/state')).state.hostIds.includes(operator.id))
   await page.locator('#settings-content summary').filter({hasText:'People & invitations'}).click()
   await grantForm().getByRole('button',{name:'Grant host access'}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   assert.ok((await h.api('/api/state')).state.hostIds.includes(operator.id))
   await page.locator('#settings-content summary').filter({hasText:'People & invitations'}).click()
   if(shots)await page.locator('#settings-content details').filter({hasText:'People & invitations'}).screenshot({path:resolve(shots,`FLOOR-009-host-grant-${width}.png`)})
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The page fits the viewport; timeline scroll is contained')
   assert.deepEqual(errors,[]);console.log(`FLOOR-009 / FLOOR-005 browser journeys passed at ${width}`)
  }finally{await context.close();await h.close()}
 }
}finally{await browser.close()}


// The same real Worker, native sessions and shipped controls cover venue devices.
if(process.env.PLACEMAT_FLOOR_ONLY!=='existing')for(const width of [1440,390]){
 const {sharedDeviceFixture}=await import('./api/shared-device-fixture.mjs'),{browserServer}=await import('./browser-server.mjs');
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),personal=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),stand=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});
 try{
  const f=await sharedDeviceFixture(h,{enroll:false,pins:false}),errors=[],cookies=token=>token.split('; ').map(value=>{const i=value.indexOf('=');return {name:value.slice(0,i),value:value.slice(i+1),url:transport.origin,secure:true,sameSite:'Lax'}});
  const page=await personal.newPage(),device=await stand.newPage();for(const p of [page,device])p.on('pageerror',e=>errors.push(e.message));
  const shot=async(name,p=device,locator)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Shared stand fits viewport');if(shots)await (locator||p).screenshot({path:resolve(shots,`SEC-002-${name}-${width}.png`),...(locator?{}:{fullPage:true})})};
  await personal.addCookies(cookies(h.cookie));await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.getByText('Shared host stands',{exact:true}).click();const enrollment=page.locator('[data-command="hoststand.register"]');await shot('registration',page,enrollment);await enrollment.getByLabel('Host stand name',{exact:true}).fill('Host iPad');await enrollment.getByRole('button',{name:'Create device registration',exact:true}).click();await page.locator('#device-registration pre').waitFor();const claimCode=await page.locator('#device-registration pre').innerText();assert.match(claimCode,/^[a-f0-9]{64}$/);await page.getByRole('button',{name:'Clear registration code',exact:true}).click();
  for(const staff of f.staff){await personal.clearCookies();await personal.addCookies(cookies(staff.cookie));await page.goto(transport.origin+'/app#settings');await page.getByText('Personal host-stand PIN',{exact:true}).click();const form=page.locator('[data-command="hoststand.pin"]');await shot('personal-pin',page,form);await form.getByLabel('New personal PIN',{exact:true}).fill(staff.pin);await form.getByRole('button',{name:'Save personal PIN',exact:true}).click();await page.getByRole('status').filter({hasText:'Personal PIN saved'}).waitFor();assert.equal(await form.getByLabel('New personal PIN',{exact:true}).inputValue(),'');}
  await device.goto(transport.origin+'/hoststand');await device.getByLabel('Owner-issued code',{exact:true}).fill(claimCode);await device.getByRole('button',{name:'Register host stand',exact:true}).click();await device.getByRole('heading',{name:'Host stand locked',exact:true}).waitFor();await shot('locked');
  const unlock=async(staff,success=true)=>{await device.getByLabel('Staff email',{exact:true}).fill(staff.email);await device.getByLabel('Personal PIN',{exact:true}).fill(staff.pin);const started=performance.now();await device.getByRole('button',{name:'Unlock host stand',exact:true}).click();if(success){await device.getByRole('heading',{name:'synthetic-placemat-device-guest',exact:true}).waitFor();const seconds=(performance.now()-started)/1000;assert.ok(seconds<5,`Staff switch completed in ${seconds.toFixed(3)} seconds`);console.log(`SEC-002 PIN switch at ${width}: ${seconds.toFixed(3)} seconds`);}else await device.getByRole('alert').waitFor();};
  await unlock(f.staff[0]);const party=device.locator(`[data-device-booking="${f.booking.id}"]`);await party.locator('[name=stage]').selectOption('seated');await party.getByRole('button',{name:'Record seating step',exact:true}).click();await device.getByRole('status').filter({hasText:'Seating operation recorded'}).waitFor();await shot('first-host');
  await device.getByRole('button',{name:'Switch staff',exact:true}).click();await device.getByRole('heading',{name:'Host stand locked',exact:true}).waitFor();assert.ok(!(await device.locator('#host-stand').innerText()).includes('synthetic-placemat-device-guest'));await unlock(f.staff[1]);
  await party.getByText('Change seats',{exact:true}).click();const move=party.locator('[data-host-action="move"]');await move.locator('[name=tableIds]').selectOption([f.tables[1].id]);await move.getByRole('button',{name:'Move party',exact:true}).click();await device.getByRole('status').filter({hasText:'Seating operation recorded'}).waitFor();const movedAt=Date.now();await shot('second-host');
  const audited=(await h.api('/api/state')).state.audit.filter(e=>e.subject===f.booking.id&&['booking.stage','booking.move'].includes(e.action));assert.deepEqual(audited.map(e=>e.actor),f.staff.map(s=>s.id));assert.ok(audited.every(e=>e.deviceId));assert.equal((await stand.request.get(transport.origin+'/api/backup')).status(),401);
  const content=await device.content();for(const value of ['synthetic-placemat-private-note','synthetic-placemat-private-tag','synthetic-placemat-private-allergy',f.guest.email])assert.ok(!content.includes(value));
  await device.waitForTimeout(Math.max(0,121500-(Date.now()-movedAt)));await device.getByRole('heading',{name:'Host stand locked',exact:true}).waitFor();assert.ok(!(await device.locator('#host-stand').innerText()).includes('synthetic-placemat-device-guest'));await shot('idle-locked');
  for(let i=0;i<5;i++)await unlock({...f.staff[0],pin:'999999999999'},false);assert.match(await device.getByRole('alert').innerText(),/temporarily throttled/);await shot('throttled');await unlock(f.staff[1]);
  await h.api('/auth/operator/status',{operatorId:f.staff[1].id,status:'inactive'});await device.reload();await device.getByRole('heading',{name:'Host stand locked',exact:true}).waitFor();await unlock(f.staff[1],false);assert.match(await device.getByRole('alert').innerText(),/could not be verified/);await shot('suspended');
  await personal.clearCookies();await personal.addCookies(cookies(h.cookie));await page.goto(transport.origin+'/app#settings');await page.getByText('Shared host stands',{exact:true}).click();await page.getByRole('button',{name:'Revoke device',exact:true}).click();await page.getByRole('status').filter({hasText:'Host stand revoked'}).waitFor();await device.reload();await device.getByRole('alert').filter({hasText:'revoked or expired'}).waitFor();await shot('revoked');assert.deepEqual(errors,[]);
  console.log(`SEC-002 enrollment, personal PINs, two-host attribution, restricted reads, actual idle lock, throttle, suspension and revocation passed at ${width}`);
 }finally{await personal.close();await stand.close();await browser.close();await transport.close();await h.close()}
}

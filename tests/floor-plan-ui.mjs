// FLOOR-002 / FLOOR-008: reviewed floor changes and live guest bookings preserve a second host’s edits.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of (process.env.PLACEMAT_WIDTH?[Number(process.env.PLACEMAT_WIDTH)]:[1440,390])){
  const h=await installation(),contexts=[]
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   const context=async cookie=>{
    const c=await browser.newContext({viewport:{width,height:1000}});contexts.push(c)
    if(cookie)await c.addCookies(cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
    await c.route('**/*',async route=>{
     const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
     const file=resolve('public','.'+url.pathname)
     if(file.startsWith(resolve('public')+'/')&&extname(file)){try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}}
     const r=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())})
    });return c
   }
   const page=await(await context(h.cookie)).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install()
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   const save=async command=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===command);await page.locator(`form[data-command="${command}"]`).getByRole('button',{name:command==='room.save'?'Save room':'Save table',exact:true}).click();assert.ok((await pending).ok());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()}
   for(const [name,kind] of [['Dining room','indoor'],['Patio','outdoor']]){
    const form=page.locator('form[data-command="room.save"]');await form.locator('xpath=..').evaluate(el=>el.open=true);await form.locator('[name=name]').fill(name);await form.locator('[name=kind]').selectOption(kind);await save('room.save')
   }
   const tables=[]
   for(const [label,area,shape,x,y] of [['12','Dining room','round',15,20],['14','Dining room','rectangle',65,60],['21','Patio','square',35,40]]){
    const form=page.locator('form[data-command="table.save"]');await form.locator('xpath=..').evaluate(el=>el.open=true)
    for(const [name,value] of Object.entries({label,seats:'4',accessTags:'step-free',x:String(x),y:String(y)}))await form.locator(`[name=${name}]`).fill(value)
    await form.locator('[name=area]').selectOption(area);await form.locator('[name=shape]').selectOption(shape);await save('table.save');tables.push((await h.api('/api/state')).state.tables.find(t=>t.label===label))
   }
   if(shots)await page.locator('#services-content').screenshot({path:resolve(shots,`FLOOR-002-rooms-tables-${width}.png`)})
   const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),service=await h.command('service.save',{name:'Friday dinner',startAt:day+'T21:00:00Z',endAt:day+'T23:59:00Z',turnMinutes:60,coverLimit:30})
   const published=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Dining room and patio ready'});await h.command('proposal.approve',{proposalId:published.id})
   const earlier=(await h.api('/api/public/book',publicGuest(service,9,{name:'Earlier canceled guest',partySize:2}),{as:'',status:201})).result
   await h.command('booking.status',{bookingId:earlier.id,status:'cancelled'})
   const host=await h.signIn('live-host@example.test'),op=(await h.api('/auth/operators')).find(p=>p.email==='live-host@example.test');await h.command('team.host',{operatorId:op.id,enabled:true})
   const second=await(await context(host)).newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(h.origin+'/app');await second.locator('.floor-table').first().waitFor()
   // FLOOR-008: an actual signed-out booking page changes the second host without a reload or Refresh gesture.
   assert.match(await second.locator('[data-new-booking-count]').innerText(),/^0 new since this view opened/)
   assert.equal(await second.locator('#bookings-list [data-new-booking]').count(),0,'Existing canceled bookings are part of the opening snapshot')
   const guestPage=await(await context('')).newPage();guestPage.on('pageerror',e=>errors.push(e.message));await guestPage.goto(h.origin+'/book')
   await guestPage.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   const search=guestPage.locator('[data-public-command=search]')
   await search.getByLabel('Arrival date',{exact:true}).fill(day);await search.getByLabel('Party size',{exact:true}).fill('4')
   await search.locator('[name=area]').selectOption('Dining room')
   await search.locator('[name=requiredAccessTags][value="step-free"]').check()
   await search.getByRole('button',{name:'Find available times',exact:true}).click()
   await guestPage.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   await guestPage.locator('[name=public-result]').selectOption('0')
   await guestPage.getByLabel('Your name',{exact:true}).fill('Priya Shah');await guestPage.getByLabel('Email',{exact:true}).fill('priya@example.test')
   await guestPage.locator('[name=requestsAcknowledged]').check();await guestPage.getByRole('button',{name:'Confirm booking',exact:true}).click()
   await guestPage.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor()
   const reference=await guestPage.locator('.booking-confirmation code').innerText(),booked=(await h.api('/api/state')).state.bookings.find(b=>b.id===reference)
   assert.ok(booked,'Guest confirmation references a real booking')
   await second.locator('.floor-table').filter({hasText:'Priya Shah'}).waitFor({timeout:15000})
   await second.waitForFunction(()=>document.querySelector('[data-new-booking-count]')?.textContent.startsWith('1 new since this view opened'),null,{timeout:15000})
   assert.equal(await second.locator('.floor-table').filter({hasText:'Priya Shah'}).locator('[data-new-booking]').count(),1)
   assert.equal(await second.locator('#bookings-list tr').filter({hasText:'Priya Shah'}).locator('[data-new-booking]').count(),1)
   await h.api('/api/public/book',publicGuest(service,1,{name:'Marco Rivera',partySize:2,area:'Patio'}),{as:'',status:201})
   await second.locator('.floor-table').filter({hasText:'Marco Rivera'}).waitFor({timeout:15000})
   await second.waitForFunction(()=>document.querySelector('[data-new-booking-count]')?.textContent.startsWith('2 new since this view opened'),null,{timeout:15000})
   assert.match(await second.locator('#floor-sync').innerText(),/Floor synced.*Checking every 3 seconds/,'FLOOR-008 names the last successful sync')
   assert.equal(await second.locator('#bookings-list [data-new-booking]').count(),2)
   assert.equal(await second.locator('.floor-table[data-shape=round]').count(),1);assert.equal(await second.locator('.floor-table[data-area=Patio]').count(),1)
   const capture=async(name,p=page,locator=p.locator('#floor-content'))=>{if(shots)await locator.screenshot({path:resolve(shots,`FLOOR-002-${name}-${width}.png`)});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='absolute').filter(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(['auto','scroll','hidden'].includes(getComputedStyle(p).overflowX))return false;return true}).map(e=>({tag:e.tagName,class:e.className,id:e.id,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,50)})).slice(0,24))))}
   await capture('live-second-device',second)
   await capture('new-booking-register',second,second.locator('#bookings-list'))
   if(shots)await guestPage.locator('.booking-confirmation').screenshot({path:resolve(shots,`FLOOR-008-guest-confirmation-${width}.png`)})
   await second.locator('[name=floor-area]').selectOption('Patio');await second.locator('[name=floor-area]').blur();assert.equal(await second.locator('.floor-table').count(),1);assert.match(await second.locator('#floor-room').innerText(),/Marco Rivera/);await capture('patio',second)
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
   await page.locator(`[data-action=edit-table][data-id="${tables[0].id}"]`).click()
   const editor=page.locator('form[data-command="floor.change"]');await editor.locator('[name=retire]').check();await editor.locator(`[name="replacement:${booked.id}"]`).selectOption(tables[1].id);await editor.locator('[name=reason]').fill('Replace the worn table while retaining Priya’s accessible dining reservation')
   await h.command('room.save',{name:'Bar',kind:'bar'});await page.locator('#floor-sync[data-state=stale]').waitFor({timeout:15000});assert.match(await editor.locator('[name=reason]').inputValue(),/Replace the worn table/);assert.ok(await editor.locator('[name=retire]').isChecked())
   await capture('retirement-editor',page,page.locator('#table-editor'))
   await editor.getByRole('button',{name:'Prepare floor change',exact:true}).click();await page.getByRole('status').filter({hasText:'Plan prepared'}).waitFor()
   const preview=page.locator('#approvals-content article.card').filter({has:page.locator('.floor-change-preview')}).first();assert.match(await preview.innerText(),/Priya Shah/);assert.match(await preview.innerText(),/12/);assert.match(await preview.innerText(),/14/);await capture('review-replacement',page,preview)
   await preview.getByRole('button',{name:'Approve plan',exact:true}).click();await page.getByRole('status').filter({hasText:'Plan approved and applied'}).waitFor()
   await second.locator('[name=floor-area]').selectOption('Dining room');await second.locator('[name=floor-area]').blur()
   await second.waitForFunction(()=>document.querySelectorAll('.floor-table').length===1&&document.querySelector('.floor-table')?.textContent.includes('14')&&document.querySelector('.floor-table')?.textContent.includes('Priya Shah'),null,{timeout:15000})
   await capture('retired-live',second)
   assert.match(await second.locator('[data-new-booking-count]').innerText(),/^2 new since this view opened/,'Unrelated changes and reassignment do not recount new bookings')
   await second.reload();await second.locator('.floor-table').filter({hasText:'Priya Shah'}).waitFor()
   assert.match(await second.locator('[data-new-booking-count]').innerText(),/^0 new since this view opened/,'Reopening establishes the new baseline')
   assert.equal(await second.locator('#bookings-list [data-new-booking]').count(),0)
   assert.match(await page.locator('#services-content').innerText(),/Retired/)
   await page.locator(`#bookings-list [data-action=reassign][data-id="${booked.id}"]`).click();await page.locator('#reassignment summary').filter({hasText:'Assignment and turn history'}).click();assert.match(await page.locator('#reassignment').innerText(),/Before[\s\S]*12[\s\S]*After[\s\S]*14/);await capture('retained-history',page,page.locator('#reassignment'))
   // FLOOR-008 outage slice: the disconnected owner's anonymous draft never holds inventory.
   const outageTables=[]
   for(const label of ['Outage A','Outage B'])outageTables.push(await h.command('table.save',{label,seats:4,area:'Dining room',accessTags:['step-free'],x:20+outageTables.length*50,y:60}))
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
   const outage=page.locator('#outage-preparation'),captureOutage=async name=>{await capture('outage-'+name,page,outage)}
   await outage.locator('summary').click()
   await outage.getByLabel('Outage service',{exact:true}).selectOption(service.id)
   await outage.getByLabel('New outage passphrase',{exact:true}).fill('synthetic-placemat-204')
   await outage.locator('[name=consent]').check();await outage.getByRole('button',{name:'Prepare encrypted sheet',exact:true}).click()
   await outage.getByText('Encrypted anonymous snapshot saved. No inventory changed.',{exact:true}).waitFor()
   assert.match(await outage.locator('[data-outage-timestamp]').innerText(),/Saved.*expires.*America\/New_York/)
   assert.ok(!(await outage.innerText()).includes('Priya Shah'));assert.ok(!(await outage.innerText()).includes('Marco Rivera'))
   const encrypted=await page.evaluate(()=>localStorage.getItem('placemat.outage.v1'));for(const value of ['Priya','Marco','Outage A','Friday dinner','synthetic-placemat-204'])assert.ok(!encrypted.includes(value))
   assert.deepEqual(Object.keys(JSON.parse(encrypted)).sort(),['data','expiresAt','format','iv','salt'])
   await captureOutage('snapshot')
   await page.route('**/api/**',route=>route.abort('internetdisconnected'))
   await page.locator('#floor-sync[data-state=error]').waitFor({timeout:15000});assert.match(await page.locator('#floor-sync').innerText(),/unavailable/)
   const beforePending=(await h.api('/api/state')).state.bookings.length
   const pendingForm=outage.locator('[data-outage-form=capture]')
   await pendingForm.getByLabel('Pending party size',{exact:true}).fill('4')
   const localParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(service.startAt)).map(p=>[p.type,p.value]))
   await pendingForm.getByLabel('Pending arrival (venue local)',{exact:true}).fill(`${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}:${localParts.minute}`)
   const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(new Date(service.startAt)).find(p=>p.type==='timeZoneName').value.replace('GMT','')
   await pendingForm.getByLabel('UTC offset for arrival',{exact:true}).fill(offset)
   await pendingForm.getByLabel('Proposed table',{exact:true}).selectOption(outageTables[0].id)
   await pendingForm.getByRole('button',{name:'Save pending walk-in on this device',exact:true}).click()
   await outage.getByText('Pending walk-in saved on this device only. No table or booking is confirmed.',{exact:true}).waitFor()
   assert.equal((await h.api('/api/state')).state.bookings.length,beforePending)
   await captureOutage('disconnected-pending')
   const persistedPending=await page.evaluate(()=>localStorage.getItem('placemat.outage.v1'))
   await outage.getByRole('button',{name:'Lock outage sheet',exact:true}).click();assert.equal(await outage.locator('[data-pending-id]').count(),0)
   await outage.locator('summary').click();await outage.getByLabel('Outage passphrase',{exact:true}).fill('synthetic-placemat-wrong');await outage.getByRole('button',{name:'Unlock saved outage sheet',exact:true}).click()
   await outage.getByRole('alert').filter({hasText:'Passphrase incorrect or saved sheet damaged'}).waitFor();assert.equal(await outage.locator('[data-pending-id]').count(),0)
   await page.evaluate(()=>{const stored=JSON.parse(localStorage.getItem('placemat.outage.v1'));stored.data=(stored.data[0]==='A'?'B':'A')+stored.data.slice(1);localStorage.setItem('placemat.outage.v1',JSON.stringify(stored))})
   await outage.getByLabel('Outage passphrase',{exact:true}).fill('synthetic-placemat-204');await outage.getByRole('button',{name:'Unlock saved outage sheet',exact:true}).click()
   await outage.getByRole('alert').filter({hasText:'Passphrase incorrect or saved sheet damaged'}).waitFor();assert.equal(await outage.locator('[data-pending-id]').count(),0,'Authenticated encryption refuses altered ciphertext')
   await page.evaluate(value=>localStorage.setItem('placemat.outage.v1',value),persistedPending)
   await outage.getByLabel('Outage passphrase',{exact:true}).fill('synthetic-placemat-204');await outage.getByRole('button',{name:'Unlock saved outage sheet',exact:true}).click()
   await outage.locator('[data-pending-id]').waitFor();assert.match(await outage.innerText(),/Unconfirmed; no table held/)
   const otherSeat=await h.command('booking.walkin',{serviceId:service.id,startAt:service.startAt,partySize:4,name:'synthetic-placemat-205',tableIds:[outageTables[0].id]})
   await page.unroute('**/api/**');assert.equal((await h.api('/api/state')).state.bookings.length,beforePending+1,'Reconnection alone never submits a draft')
   await outage.getByRole('button',{name:'Review current floor',exact:true}).click()
   const reconnect=outage.getByRole('region',{name:'Outage reconciliation'})
   await reconnect.getByText('Original table refused:',{exact:false}).waitFor();assert.equal((await h.api('/api/state')).state.bookings.length,beforePending+1)
   await captureOutage('conflict-review')
   const alternative=await reconnect.locator('[name=choice] option').evaluateAll(options=>options.find(o=>o.textContent.includes('Outage B'))?.value);assert.notEqual(alternative,undefined)
   await reconnect.getByLabel('Reviewed replacement',{exact:true}).selectOption(alternative);await reconnect.locator('[name=confirm]').check()
   // A second tablet changes the floor after review. The current draft and the sold table survive.
   await h.command('room.save',{name:'Outage changed floor',kind:'bar'})
   await reconnect.getByRole('button',{name:'Seat reviewed walk-in',exact:true}).click();await outage.getByRole('alert').filter({hasText:'floor changed'}).waitFor();assert.equal(await outage.locator('[data-pending-id]').count(),1)
   await captureOutage('stale-review-refused')
   await outage.getByRole('button',{name:'Review current floor',exact:true}).click();await reconnect.locator('[name=choice]').waitFor()
   const freshAlternative=await reconnect.locator('[name=choice] option').evaluateAll(options=>options.find(o=>o.textContent.includes('Outage B'))?.value)
   await reconnect.getByLabel('Reviewed replacement',{exact:true}).selectOption(freshAlternative);await reconnect.locator('[name=confirm]').check()
   // The Worker commits, but its response is lost on the network. The draft remains until explicit recovery.
   await page.route('**/api/commands',async route=>{
    const req=route.request();if(req.postDataJSON()?.command!=='booking.outage'){await route.fallback();return;}
    const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:new URL(req.url()).host},body:req.postDataBuffer()});assert.equal(response.status,200);await response.arrayBuffer();await route.abort('connectionreset');
   })
   await reconnect.getByRole('button',{name:'Seat reviewed walk-in',exact:true}).click();await outage.getByRole('alert').filter({hasText:/fetch|network|request/i}).waitFor();assert.equal(await outage.locator('[data-pending-id]').count(),1)
   await page.unroute('**/api/commands');await outage.getByRole('button',{name:'Review current floor',exact:true}).click();await outage.getByText('was already reconciled. No additional seating was created.',{exact:false}).waitFor()
   const reconciled=(await h.api('/api/state')).state
   assert.equal(reconciled.bookings.length,beforePending+2);assert.deepEqual(reconciled.bookings.find(b=>b.id===otherSeat.id).tableIds,[outageTables[0].id]);assert.ok(reconciled.bookings.some(b=>b.status==='seated'&&b.tableIds.includes(outageTables[1].id)))
   assert.equal(await outage.locator('[data-pending-id]').count(),0);await captureOutage('reconciled')
   // All custom controls on the changed screen have visible word labels; no icon-only controls need tooltips.
   assert.deepEqual(await page.locator('#floor button, #floor a, #bookings button, #bookings a').evaluateAll(controls=>controls.filter(c=>!c.textContent.trim()).map(c=>c.outerHTML)),[])
   await page.clock.fastForward(5*60000+15000)
   assert.equal(await outage.locator('[data-outage-timestamp]').count(),0,'An idle unlocked sheet removes its plaintext view');assert.ok(await page.evaluate(()=>localStorage.getItem('placemat.outage.v1')))
   await outage.locator('summary').click();await outage.getByLabel('Outage passphrase',{exact:true}).fill('synthetic-placemat-204');await outage.getByRole('button',{name:'Unlock saved outage sheet',exact:true}).click();await outage.locator('[data-outage-timestamp]').waitFor()
   const expires=await page.evaluate(()=>JSON.parse(localStorage.getItem('placemat.outage.v1')).expiresAt)
   await page.clock.setSystemTime(new Date(Date.parse(expires)+1));await page.clock.fastForward(15000)
   assert.equal(await page.evaluate(()=>localStorage.getItem('placemat.outage.v1')),null,'A running page deletes the expired ciphertext');assert.equal(await outage.locator('[data-outage-timestamp]').count(),0)
   await page.clock.setSystemTime(new Date());await outage.locator('summary').click()
   await outage.getByLabel('New outage passphrase',{exact:true}).fill('synthetic-placemat-204');await outage.locator('[name=consent]').check();await outage.getByRole('button',{name:'Prepare encrypted sheet',exact:true}).click();await outage.locator('[data-outage-timestamp]').waitFor()
   page.once('dialog',dialog=>dialog.accept());await outage.getByRole('button',{name:'Delete saved outage sheet',exact:true}).click()
   assert.equal(await page.evaluate(()=>localStorage.getItem('placemat.outage.v1')),null)
   await contexts[1].clearCookies();await second.locator('#floor-sync[data-state=error]').waitFor({timeout:15000});assert.match(await second.locator('#floor-sync').innerText(),/Sign in again/)
   assert.deepEqual(errors,[]);console.log(`FLOOR-002 / FLOOR-008 rooms, live guest booking markers, stale edits, encrypted outage capture and reviewed reconnect passed at ${width}`)
  }finally{for(const c of contexts){await c.unrouteAll({behavior:'wait'});await c.close()}await h.close()}
 }
}finally{await browser.close()}

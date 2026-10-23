// BOOK-003: public guest journey through the real Worker/D1 and shipped browser modules.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of process.env.PLACEMAT_BOOK_ONLY==='management'?[]:[1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   await h.command('table.save',{label:'Accessible window four',seats:4,area:'Dining',accessTags:['wheelchair'],x:30,y:30})
   await h.command('table.save',{label:'Patio four',seats:4,area:'Patio',x:70,y:30})
   const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7))
   const services=[]
   for(let i=0;i<4;i++){
    const day=new Date(date.getTime()+i*86400000).toISOString().slice(0,10)
    const service=await h.command('service.save',{name:['Friday dinner','Saturday dinner','Sunday dinner','Monday dinner'][i],startAt:day+'T23:00:00Z',endAt:new Date(Date.parse(day+'T23:00:00Z')+90*60000).toISOString(),turnMinutes:90,coverLimit:40})
    const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Review dining room service'});await h.command('proposal.approve',{proposalId:p.id});services.push(service)
   }
   await h.api('/api/public/book',publicGuest(services[0],0,{partySize:4,area:'Dining',requiredAccessTags:['wheelchair']}),{as:'',status:201})
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
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
   const screenshot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Booking content fits viewport');if(shots)await page.screenshot({path:resolve(shots,`BOOK-003-${name}-${width}.png`),fullPage:true})}
   const search=async()=>{
    const form=page.locator('[data-public-command=search]');await form.locator('[name=date]').fill(date.toISOString().slice(0,10));await form.locator('[name=partySize]').fill('4');await form.locator('[name=area]').selectOption('Dining');await form.locator('[name=requiredAccessTags][value=wheelchair]').check();await form.getByRole('button',{name:'Find available times'}).click();await page.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   }
   const choose=async name=>{
    const select=page.locator('[name=public-result]'),option=select.locator('option').filter({hasText:name}).first();await select.selectOption(await option.getAttribute('value'));await page.getByRole('heading',{name:'Your selected visit'}).waitFor()
   }
   await page.goto(h.origin+'/book');await page.locator('[name=requiredAccessTags][value=wheelchair]').waitFor();await page.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   await search()
   const options=await page.locator('[name=public-result]').innerText();assert.ok(!options.includes('Friday dinner'));assert.match(options,/Nearby date alternative.*Saturday dinner/)
   assert.equal(await page.locator('[data-public-command=book]').count(),0,'Guest must explicitly select an arrival')
   await screenshot('alternatives')
   await choose('Saturday dinner')
   await page.getByLabel('Your name',{exact:true}).fill('Priya Shah');await page.getByLabel('Email',{exact:true}).fill('priya@example.test');await page.getByLabel('Phone (optional)').fill('+1 212 555 0123')
   await screenshot('selected')
   await page.locator('[name=requestsAcknowledged]').check();await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByRole('heading',{name:'Booking confirmed'}).waitFor()
   assert.match(await page.locator('.booking-confirmation').innerText(),/Area guaranteed: Dining.*Required access guaranteed: wheelchair/)
   let state=(await h.api('/api/state')).state;assert.equal(state.bookings.filter(b=>b.serviceId===services[1].id).length,1)
   await screenshot('confirmed')
   await page.getByRole('button',{name:'Make another booking'}).click();await page.getByRole('status').filter({hasText:'Choose your next visit'}).waitFor();await search();await choose('Sunday dinner')
   await page.getByLabel('Your name',{exact:true}).fill('Morgan Lee');await page.getByLabel('Email',{exact:true}).fill('morgan@example.test');await page.getByLabel('Phone (optional)').fill('+1 212 555 0188')
   await h.api('/api/public/book',publicGuest(services[2],8,{partySize:4,area:'Dining',requiredAccessTags:['wheelchair']}),{as:'',status:201})
   await page.locator('[name=requestsAcknowledged]').check();await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByRole('alert').filter({hasText:'No booking has been made'}).waitFor()
   assert.equal(await page.locator('[data-public-command=book]').count(),0);assert.ok(!(await page.locator('[name=public-result]').innerText()).includes('Sunday dinner'))
   await screenshot('stale-reselect')
   await choose('Monday dinner');assert.equal(await page.getByLabel('Your name',{exact:true}).inputValue(),'Morgan Lee');assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(),'morgan@example.test');assert.equal(await page.getByLabel('Phone (optional)').inputValue(),'+1 212 555 0188')
   await page.locator('[name=requestsAcknowledged]').check();await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByRole('heading',{name:'Booking confirmed'}).waitFor()
   state=(await h.api('/api/state')).state;assert.equal(state.bookings.length,4);assert.equal(state.bookings.filter(b=>b.serviceId===services[2].id).length,1)
   await page.getByRole('button',{name:'Make another booking'}).click();await page.getByRole('status').filter({hasText:'Choose your next visit'}).waitFor();await search()
   assert.equal(await page.locator('[name=public-result]').count(),0);assert.equal(await page.locator('[data-public-command=book]').count(),0);assert.match(await page.locator('#public-search-results').innerText(),/Change.*contact.*No booking/s)
   await screenshot('empty');assert.deepEqual(errors,[])
   console.log(`BOOK-003 guest search, Saturday booking, stale reselect and empty end states passed at ${width}`)
  }finally{await context.close();await h.close()}
 }
}finally{await browser.close()}

// Private management uses the same real guest shell, with explicit consequence review.
for(const width of [1440,390]){
 const {service}=await import('./api/harness.mjs'),{browserServer}=await import('./browser-server.mjs')
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await service(h,{tables:1,seats:4,covers:8}),booking=(await h.api('/api/public/book',publicGuest(f.service,1,{name:'Amelia Chen',email:'amelia@example.test',phone:'+1 212 555 0191'}),{as:'',status:201})).result
  const cookies=h.cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  await context.addCookies(cookies);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
  const manager=await h.signIn('synthetic-placemat-manager@example.test','admin','Riley Brooks'),managerCookies=manager.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  await context.clearCookies();await context.addCookies(managerCookies);await page.goto(transport.origin+'/app');await page.locator('.app-main[aria-busy=false]').waitFor()
  const send=page.locator('[data-command="booking.management.send"]');await send.locator('xpath=..').evaluate(el=>el.open=true);await send.locator('[name=bookingId]').selectOption(booking.id);await send.locator('[name=acknowledged]').check()
  const shot=async(name,locator=page.locator('.booking-shell'))=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await locator.screenshot({path:resolve(shots,`BOOK-004-${name}-${width}.png`)})}
  await shot('manager-send',send);await send.getByRole('button',{name:'Send private reservation link',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
  const link=new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]),privateUrl=transport.origin+link.pathname+link.hash
  await context.clearCookies();await page.goto(privateUrl);await page.getByRole('status').filter({hasText:'Reservation opened'}).waitFor();assert.equal(new URL(page.url()).hash,'');await shot('opened')
  const change=page.locator('[data-management=change]');await change.locator('[name=partySize]').fill('4');await change.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('heading',{name:'Review reservation changes',exact:true}).waitFor();await shot('change-review')
  await page.locator('[data-management=commit] [name=acknowledged]').check();await page.getByRole('button',{name:'Confirm changes',exact:true}).click();await page.getByRole('status').filter({hasText:'reservation has been updated'}).waitFor();await shot('changed-four')
  await page.locator('[data-management=change] [name=partySize]').fill('5');await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).partySize,4);await shot('unavailable-keeps-four')
  await page.getByRole('button',{name:'Review cancellation',exact:true}).click();await page.getByRole('heading',{name:'Review cancellation',exact:true}).waitFor();await shot('cancel-review');assert.match(await page.locator('#management-preview').innerText(),/Fee: \$0.00 USD · Refund: \$0.00 USD/)
  await page.locator('[data-management=commit] [name=acknowledged]').check();await page.getByRole('button',{name:'Confirm cancellation',exact:true}).click();await page.getByRole('status').filter({hasText:'reservation is cancelled'}).waitFor();await shot('cancelled')
  await page.goto('about:blank');await page.goto(privateUrl);await page.getByRole('alert').waitFor();assert.equal(await page.locator('[data-management]').count(),0);assert.ok(!(await page.locator('#management-content').innerText()).includes('Amelia'));await shot('replay-refused')
  // Changing the recorded email ends the capability; the manager explicitly sends to the new address.
  const emailBooking=(await h.api('/api/public/book',publicGuest(f.service,3,{name:'Jordan Rivera',email:'jordan@example.test'}),{as:'',status:201})).result
  const linkFromMail=()=>{const link=new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]);return transport.origin+link.pathname+link.hash}
  await h.command('booking.management.send',{bookingId:emailBooking.id,acknowledged:true},{as:manager});const emailUrl=linkFromMail()
  await page.goto(emailUrl);await page.getByRole('status').filter({hasText:'Reservation opened'}).waitFor()
  await page.locator('[data-management=change] [name=email]').fill('jordan.updated@example.test');await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('heading',{name:'Review reservation changes',exact:true}).waitFor();await shot('email-review')
  const sent=h.messages.length;await page.locator('[data-management=commit] [name=acknowledged]').check();await page.getByRole('button',{name:'Confirm changes',exact:true}).click();await page.getByRole('status').filter({hasText:'Ask the venue for a new link'}).waitFor();assert.equal(h.messages.length,sent);assert.equal(await page.locator('[data-management]').count(),0);await shot('email-closed')
  await page.goto(emailUrl);await page.getByRole('alert').waitFor();await shot('email-old-link-refused')
  await context.addCookies(managerCookies);await page.goto(transport.origin+'/app')
  const resend=page.locator('[data-command="booking.management.send"]')
  for(let i=0;i<4;i++){
   await resend.locator('xpath=..').evaluate(el=>el.open=true);await resend.locator('[name=bookingId]').selectOption(emailBooking.id);assert.match(await resend.locator('[name=bookingId] option:checked').innerText(),/jordan.updated@example.test/);await resend.locator('[name=acknowledged]').check();await resend.getByRole('button',{name:'Send private reservation link',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
  }
  assert.deepEqual(h.messages.at(-1).to,['jordan.updated@example.test']);const freshUrl=linkFromMail()
  await resend.locator('xpath=..').evaluate(el=>el.open=true);await resend.locator('[name=bookingId]').selectOption(emailBooking.id);await resend.locator('[name=acknowledged]').check();await resend.getByRole('button',{name:'Send private reservation link',exact:true}).click();await page.getByRole('alert').filter({hasText:'Five management links'}).waitFor();await shot('manager-daily-limit',page.getByRole('alert'))
  await context.clearCookies();await page.goto(freshUrl);await page.getByRole('status').filter({hasText:'Reservation opened'}).waitFor();assert.equal(await page.locator('[data-management=change] [name=email]').inputValue(),'jordan.updated@example.test');await shot('explicit-new-email-link')
  const paid=(await h.api('/api/public/book',publicGuest(f.service,4,{name:'Casey Morgan',startAt:new Date(Date.parse(f.startAt)+2*3600000).toISOString()}),{as:'',status:201})).result,owner=(await h.api('/api/state')).actor.id
  await h.command('payment.request',{bookingId:paid.id,amountCents:1000,dueAt:new Date(Date.now()+3600000).toISOString(),followupOwnerId:owner,reason:'Agreed reservation deposit'})
  await h.command('booking.management.send',{bookingId:paid.id,acknowledged:true},{as:manager});await page.goto(linkFromMail());await page.getByRole('heading',{name:'Manager review required',exact:true}).waitFor();assert.equal(await page.locator('[data-management]').count(),0);assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===paid.id).status,'booked');await shot('paid-manager-review')
  assert.deepEqual(errors,[]);console.log(`BOOK-004 private email link, reviewed two-to-four change, unavailable preservation, explicit cancellation and replay refusal passed at ${width}`)
 }finally{await context.close();await browser.close();await transport.close();await h.close()}
}

await import("./checkout-ui.mjs");

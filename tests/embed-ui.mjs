// BOOK-002: a restaurant website embeds the booking widget; real Worker/D1 and shipped browser modules.
// GA4 and Meta are faked only at the Worker's network edge (tests/api/harness.mjs); the browser may reach no provider host.
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {browserClock} from './browser-clock.mjs'
const fixtureNow=Date.parse('2026-10-20T12:00:00Z')
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const host='https://bistro.example',other='https://other.example',title='Book a table at Cedar & Salt'
const ga4Secret=randomBytes(16).toString('hex'),metaToken=randomBytes(32).toString('hex')
const quiet=()=>new Promise(r=>setTimeout(r,600))
const site=placemat=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bistro on Main</title></head><body style="margin:0;font-family:sans-serif"><header style="padding:16px"><h1>Bistro on Main</h1><a href="#menu">Menu</a></header><div data-placemat-book data-title="${title}"></div><script src="${placemat}/placemat-embed.js" async></script></body></html>`
const frames=placemat=>`<!doctype html><html lang="en"><body>${['/app','/book','/queue','/inquiry'].map(path=>`<iframe name="${path.slice(1)}" src="${placemat}${path}"></iframe>`).join('')}</body></html>`
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of [1440,390]){
  const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>fixtureNow}),context=await browser.newContext({viewport:{width,height:1000},locale:'en-US'})
  try{
   await browserClock(context,fixtureNow)
   // Restrictive browsers deny storage in third-party frames; booking must still complete.
   await context.addInitScript(()=>{if(window.top!==window)Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Embedded storage denied','SecurityError')}})})
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   await h.command('table.save',{label:'Window two',seats:2,area:'Dining',x:30,y:30})
   const date=new Date(fixtureNow);date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7));const day=date.toISOString().slice(0,10),startAt=day+'T23:00:00.000Z'
   const dinner=await h.command('service.save',{name:'Friday dinner',startAt,endAt:new Date(Date.parse(startAt)+90*60000).toISOString(),turnMinutes:90,coverLimit:8,bookingRules:{online:{minParty:1,maxParty:6,horizonDays:60,leadMinutes:30,sameDayCutoff:'16:00',slotMinutes:15,inquiryAbove:6,blockedStarts:[]}}})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:dinner.id},reason:'Publish Friday dinner'});await h.command('proposal.approve',{proposalId:p.id})
   // A second dinner three weeks out lets a declined visit book on the standalone page after the widget takes the first.
   const laterDay=new Date(Date.parse(startAt)+21*86400000).toISOString().slice(0,10),laterStart=laterDay+'T23:00:00.000Z'
   const later=await h.command('service.save',{name:'Anniversary dinner',startAt:laterStart,endAt:new Date(Date.parse(laterStart)+90*60000).toISOString(),turnMinutes:90,coverLimit:8,bookingRules:{online:{minParty:1,maxParty:6,horizonDays:60,leadMinutes:30,sameDayCutoff:'16:00',slotMinutes:15,inquiryAbove:6,blockedStarts:[]}}})
   const q=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:later.id},reason:'Publish anniversary dinner'});await h.command('proposal.approve',{proposalId:q.id})
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   const thirdParty=[]
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.origin!==h.origin&&![host,other].includes(url.origin))thirdParty.push(url.host)
    if([host,other].includes(url.origin)){await route.fulfill({status:200,contentType:'text/html',body:url.pathname==='/frames'?frames(h.origin):site(h.origin)});return}
    if(url.origin!==h.origin){await route.abort();return}
    const file=resolve('public','.'+url.pathname)
    if(file.startsWith(resolve('public')+'/')&&extname(file)){
     try{const body=await readFile(file),contentType={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';await route.fulfill({status:200,contentType,body});return}catch{}
    }
    const response=await h.mf.dispatchFetch(request.url(),{method:request.method(),headers:{...request.headers(),host:url.host},...(request.postDataBuffer()?{body:request.postDataBuffer()}:{})})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
   const screenshot=async name=>{if(shots)await page.screenshot({path:resolve(shots,`BOOK-002-${name}-${width}.png`),fullPage:true})}
   // The owner allows the restaurant's website from Settings; the change is audited with the owner and time.
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.goto(h.origin+'/app#settings');await page.getByText('Website booking widget').click()
   await page.getByLabel('Allowed website origins (one per line)').fill(host);await page.getByRole('button',{name:'Save allowed websites'}).click()
   await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   const settings=page.locator('#widget-settings');await page.getByText('Website booking widget').click();await settings.getByText('Allowed now:').waitFor()
   assert.match(await settings.innerText(),/placemat-embed\.js/);assert.match(await settings.innerText(),/Venue owner/)
   assert.ok(await settings.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'widget settings fit the staff screen')
   if(shots)await settings.screenshot({path:resolve(shots,`BOOK-002-owner-settings-${width}.png`)})
   // The owner switches on GA4 and Meta in their test modes; keys are write-only.
   const analytics=page.locator('#analytics-settings');await page.getByText('Booking analytics (GA4 and Meta)').click()
   await analytics.getByLabel('Send GA4 events',{exact:true}).check();await analytics.getByLabel('GA4 measurement ID').fill('G-PLACEMAT1');await analytics.getByLabel('GA4 API secret').fill(ga4Secret);await analytics.getByLabel(/Test mode: send GA4 events with debug_mode/).check()
   await analytics.getByLabel('Send Meta events',{exact:true}).check();await analytics.getByLabel('Meta dataset (Pixel) ID').fill('123456789012');await analytics.getByLabel('Meta access token').fill(metaToken);await analytics.getByLabel(/Meta test event code/).fill('TEST4242')
   await analytics.getByRole('button',{name:'Save analytics settings'}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   await page.getByText('Booking analytics (GA4 and Meta)').click();await analytics.getByText('GA4 events are on; the API secret is saved.').waitFor()
   assert.match(await analytics.innerText(),/Meta events are on; the access token is saved\./);assert.match(await analytics.innerText(),/Venue owner · on: GA4 and Meta/)
   assert.deepEqual([await analytics.getByLabel('GA4 API secret').inputValue(),await analytics.getByLabel('Meta access token').inputValue()],['',''],'saved keys are never shown again')
   assert.ok(!(await page.content()).includes(ga4Secret)&&!(await page.content()).includes(metaToken))
   assert.ok(await analytics.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'analytics settings fit the staff screen')
   if(shots)await analytics.screenshot({path:resolve(shots,`BOOK-002-analytics-settings-${width}.png`)})
   // The guest uses only the keyboard inside the widget on the allowed website.
   await page.goto(host+'/');const frame=page.frameLocator(`iframe[title="${title}"]`)
   await frame.locator('[name=date]').waitFor();await frame.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   const consent=frame.locator('#analytics-consent')
   assert.match(await consent.innerText(),/Cedar & Salt uses Google Analytics 4 \(GA4\) and Meta\. If you accept, Placemat’s server sends them three events from this visit: search, checkout start and completed booking\. Each carries only your party size, where you are booking .* and a random visit ID, plus your browser’s user agent for Meta\. Your name, email, phone, IP address, cookies, booking reference and reservation date and time are never sent\. Nothing is sent if you decline or do not answer, and your choice lasts only for this visit\./s)
   assert.ok(await page.frame({url:/\/book\?embed=1/}).evaluate(()=>[...document.scripts].every(s=>new URL(s.src,location.href).origin===location.origin)),'no provider script loads in the widget')
   await screenshot('widget-consent')
   await page.getByRole('link',{name:'Menu'}).focus()
   const focused=()=>page.frame({url:/\/book\?embed=1/}).evaluate(()=>document.activeElement?.getAttribute('name')||document.activeElement?.textContent)
   const tabTo=async name=>{for(let i=0;i<12;i++){await page.keyboard.press('Tab');if(await focused()===name)return}assert.fail(`Keyboard focus never reached ${name}`)}
   await tabTo('Accept analytics');await page.keyboard.press('Enter');await consent.getByText('Accepted for this visit').waitFor()
   assert.equal(h.analytics.length,0,'accepting alone sends nothing')
   await tabTo('date')
   // Native date controls retain the host's segment order on macOS even with a US page locale.
   // Use their actual keyboard spinboxes, preserving the all-keyboard guest journey.
   const dateInput=frame.locator('[name=date]'),wanted=day.split('-').map(Number)
   for(let segment=0;segment<3;segment++){
    const before=(await dateInput.inputValue()).split('-').map(Number);await page.keyboard.press('ArrowUp')
    const after=(await dateInput.inputValue()).split('-').map(Number),index=after.findIndex((n,i)=>n!==before[i]);assert.ok(index>=0,'keyboard changes the focused date segment')
    for(let step=0;step<366;step++){const current=(await dateInput.inputValue()).split('-').map(Number)[index];if(current===wanted[index])break;await page.keyboard.press(current<wanted[index]?'ArrowUp':'ArrowDown')}
    assert.equal(Number((await dateInput.inputValue()).split('-')[index]),wanted[index]);await page.keyboard.press('ArrowRight')
   }
   assert.equal(await dateInput.inputValue(),day)
   await tabTo('partySize');await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('2')
   await tabTo('Find available times');await page.keyboard.press('Enter')
   await frame.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   assert.match(await frame.locator('.booking-policy').innerText(),/Friday dinner.*online parties of 1–6; parties over 6 send a group inquiry; bookings open 60 days ahead; same-day bookings until 4:00 PM; book at least 30 minutes ahead; arrivals every 15 minutes/s,'the widget discloses the online booking policy')
   await tabTo('public-result');const nativeChoice=frame.locator('[name=public-result] option').nth(1);await page.keyboard.type((await nativeChoice.innerText()).slice(0,1).toLowerCase());await page.keyboard.press('Enter');await frame.getByRole('heading',{name:'Your selected visit'}).waitFor()
   await tabTo('name');await page.keyboard.type('Priya Shah');await tabTo('email');await page.keyboard.type('priya@example.test')
   await tabTo('requestsAcknowledged');await page.keyboard.press('Space');await tabTo('Confirm booking')
   await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'placemat:book',confirm:true},'*'))
   assert.equal((await h.api('/api/state')).state.bookings.length,0,'the widget never books before the guest confirms')
   await screenshot('widget-selected')
   await page.keyboard.press('Enter');await frame.getByRole('heading',{name:'Booking confirmed'}).waitFor()
   const booking=(await h.api('/api/state')).state.bookings
   assert.deepEqual(booking.map(b=>[b.startAt,b.source,b.attribution]),[[startAt,'online',{door:'widget',origin:host}]])
   const embedded=page.locator(`iframe[title="${title}"]`);assert.ok(parseFloat(await embedded.evaluate(el=>el.style.height))>0,'the widget reports its height to the allowed website')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'host page fits the viewport')
   assert.ok(await page.frame({url:/\/book\?embed=1/}).evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'widget fits its frame')
   assert.doesNotMatch(await frame.locator('body').innerText(),/Staff sign in/)
   await screenshot('widget-confirmed')
   // The consented visit's three events reach GA4 (debug_mode) and Meta (test_event_code) from the server, with no guest contact data.
   for(let i=0;i<120&&h.analytics.length<6;i++)await new Promise(r=>setTimeout(r,50))
   const events=h.analytics.map(r=>r.body.events?.[0].name??r.body.data[0].event_name).sort()
   assert.deepEqual(events,['InitiateCheckout','Schedule','Search','begin_checkout','placemat_booking','search'])
   assert.ok(h.analytics.every(r=>r.body.events?r.body.events[0].params.debug_mode===true&&r.body.events[0].params.booking_source==='widget':r.body.test_event_code==='TEST4242'&&r.body.data[0].custom_data.widget_origin===host))
   const wire=JSON.stringify(h.analytics);for(const value of ['Priya Shah','priya@example.test',booking[0].id,startAt])assert.ok(!wire.includes(value),`no ${value} reaches a provider`)
   assert.equal(new Set(h.analytics.map(r=>r.body.client_id??r.body.data[0].user_data.external_id[0])).size,2,'one random visit ID per visit (Meta receives its SHA-256)')
   // The standalone page reads the same ledger: the booked slot is gone.
   const standalone=await context.newPage();await standalone.goto(h.origin+'/book');await standalone.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   // A new visit asks again; this guest declines, so nothing reaches a provider for the search or the booking.
   await standalone.getByRole('button',{name:'Decline'}).click();await standalone.locator('#analytics-consent').getByText('Declined for this visit. Nothing is sent.').waitFor()
   const form=standalone.locator('[data-public-command=search]');await form.locator('[name=date]').fill(day);await form.locator('[name=partySize]').fill('2');await form.getByRole('button',{name:'Find available times'}).click()
   await standalone.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   assert.equal(await standalone.locator('[name=public-result]').count(),0,'the widget booking removed the only slot from the standalone page')
   if(shots)await standalone.screenshot({path:resolve(shots,`BOOK-002-standalone-${width}.png`),fullPage:true})
   await form.locator('[name=date]').fill(laterDay);await form.getByRole('button',{name:'Find available times'}).click();await standalone.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   await standalone.locator('[name=public-result]').selectOption({index:1});await standalone.locator('[name=name]').fill('Dana Cole');await standalone.locator('[name=email]').fill('dana@example.test')
   await standalone.locator('[name=requestsAcknowledged]').check();await standalone.getByRole('button',{name:'Confirm booking'}).click();await standalone.getByRole('heading',{name:'Booking confirmed'}).waitFor()
   await quiet();assert.equal(h.analytics.length,6,'a declined visit sends nothing, not even for its completed booking')
   assert.deepEqual((await h.api('/api/state')).state.bookings.map(b=>b.attribution.door),['widget','booking-page'])
   assert.deepEqual(thirdParty,[],'the browser never contacts GA4, Meta or any other third party')
   await standalone.close()
   // The owner removes the saved GA4 API secret (ct 21 Oct 00:03Z): GA4 stays on, the settings say a key is needed and the removal is listed with the owner and time.
   await page.goto(h.origin+'/app#settings');await page.getByText('Booking analytics (GA4 and Meta)').click()
   await analytics.getByRole('button',{name:'Remove saved GA4 API secret'}).click();await page.getByRole('status').filter({hasText:'Saved key removed'}).waitFor()
   if(!await analytics.evaluate(el=>el.open))await page.getByText('Booking analytics (GA4 and Meta)').click()
   await analytics.getByText('GA4 events are switched on but need an API secret: nothing is sent until you enter one.').waitFor()
   assert.match(await analytics.innerText(),/Meta events are on; the access token is saved\./);assert.match(await analytics.innerText(),/Venue owner · removed the saved GA4 API secret/)
   assert.equal(await analytics.getByRole('button',{name:'Remove saved GA4 API secret'}).count(),0);assert.ok(await analytics.getByLabel('Send GA4 events',{exact:true}).isChecked())
   assert.ok(await analytics.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'analytics settings still fit the staff screen')
   if(shots)await analytics.screenshot({path:resolve(shots,`BOOK-002-key-removed-${width}.png`)})
   // The next visit is asked about Meta only, and its accepted search reaches Meta alone.
   h.analytics.length=0;const next=await context.newPage();await next.goto(h.origin+'/book');await next.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   assert.match(await next.locator('#analytics-consent').innerText(),/Cedar & Salt uses Meta\. If you accept/)
   await next.getByRole('button',{name:'Accept analytics'}).click();const nextForm=next.locator('[data-public-command=search]')
   await nextForm.locator('[name=date]').fill(laterDay);await nextForm.locator('[name=partySize]').fill('2');await nextForm.getByRole('button',{name:'Find available times'}).click();await next.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   for(let i=0;i<120&&!h.analytics.length;i++)await new Promise(r=>setTimeout(r,50))
   await quiet();assert.deepEqual(h.analytics.map(r=>new URL(r.url).hostname),['graph.facebook.com'],'GA4 receives nothing without its key')
   await next.close()
   if(width===1440){
    // Staff and guest pages other than the widget refuse every frame, and an unlisted website gets no widget.
    const forbidden=['app','book','queue','inquiry']
    const deniedLoads=forbidden.map(name=>page.waitForEvent('requestfailed',{predicate:request=>request.url()===h.origin+'/'+name}))
    await page.goto(host+'/frames');await page.waitForLoadState('load')
    const refused=await Promise.all(deniedLoads)
    for(const [index,name] of forbidden.entries()){
     const response=await h.request('/'+name)
     assert.equal(response.headers.get('x-frame-options'),'DENY',`${name} denies frames`)
     assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/,`${name} denies every ancestor`)
     assert.match(refused[index].failure().errorText,/ERR_BLOCKED_BY_(RESPONSE|CSP)/,`${name} is unframeable`)
    }
    const unlisted=page.waitForEvent('requestfailed',{predicate:request=>request.url()===h.origin+'/book?embed=1&origin='+encodeURIComponent(other)})
    await page.goto(other+'/');await page.locator(`iframe[title="${title}"]`).waitFor();await page.waitForLoadState('load')
    await assert.rejects(()=>page.frameLocator(`iframe[title="${title}"]`).locator('[name=date]').waitFor({timeout:3000}))
    assert.match((await unlisted).failure().errorText,/ERR_BLOCKED_BY_(RESPONSE|CSP)/,'an unlisted website cannot frame the widget')
   }
   assert.deepEqual(errors,[])
   console.log(`BOOK-002 owner allowlist and analytics, keyboard widget booking with accepted GA4/Meta test events, declined standalone booking, shared ledger, owner key removal and frame refusals passed at ${width}`)
  }finally{await context.close();await h.close()}
 }
}finally{await browser.close()}

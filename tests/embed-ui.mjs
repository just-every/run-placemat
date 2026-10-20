// BOOK-002: a restaurant website embeds the booking widget; real Worker/D1 and shipped browser modules.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const host='https://bistro.example',other='https://other.example',title='Book a table at Cedar & Salt'
const site=placemat=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bistro on Main</title></head><body style="margin:0;font-family:sans-serif"><header style="padding:16px"><h1>Bistro on Main</h1><a href="#menu">Menu</a></header><div data-placemat-book data-title="${title}"></div><script src="${placemat}/placemat-embed.js" async></script></body></html>`
const frames=placemat=>`<!doctype html><html lang="en"><body>${['/app','/book','/queue','/inquiry'].map(path=>`<iframe name="${path.slice(1)}" src="${placemat}${path}"></iframe>`).join('')}</body></html>`
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   await h.command('table.save',{label:'Window two',seats:2,area:'Dining',x:30,y:30})
   const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7));const day=date.toISOString().slice(0,10),startAt=day+'T23:00:00.000Z'
   const dinner=await h.command('service.save',{name:'Friday dinner',startAt,endAt:new Date(Date.parse(startAt)+90*60000).toISOString(),turnMinutes:90,coverLimit:8,bookingRules:{online:{minParty:1,maxParty:6,horizonDays:60,leadMinutes:30,sameDayCutoff:'16:00',slotMinutes:15,inquiryAbove:6,blockedStarts:[]}}})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:dinner.id},reason:'Publish Friday dinner'});await h.command('proposal.approve',{proposalId:p.id})
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
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
   // The guest uses only the keyboard inside the widget on the allowed website.
   await page.goto(host+'/');const frame=page.frameLocator(`iframe[title="${title}"]`)
   await frame.locator('[name=date]').waitFor();await frame.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   await page.getByRole('link',{name:'Menu'}).focus()
   const focused=()=>page.frame({url:/\/book\?embed=1/}).evaluate(()=>document.activeElement?.getAttribute('name')||document.activeElement?.textContent)
   const tabTo=async name=>{for(let i=0;i<12;i++){await page.keyboard.press('Tab');if(await focused()===name)return}assert.fail(`Keyboard focus never reached ${name}`)}
   await tabTo('date');await page.keyboard.type(day.slice(5,7)+day.slice(8,10)+day.slice(0,4))
   await tabTo('partySize');await page.keyboard.press('Control+A');await page.keyboard.type('2')
   await tabTo('Find available times');await page.keyboard.press('Enter')
   await frame.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   assert.match(await frame.locator('.booking-policy').innerText(),/Friday dinner.*online parties of 1–6; parties over 6 send a group inquiry; bookings open 60 days ahead; same-day bookings until 4:00 PM; book at least 30 minutes ahead; arrivals every 15 minutes/s,'the widget discloses the online booking policy')
   await tabTo('public-result');await page.keyboard.press('ArrowDown');await frame.getByRole('heading',{name:'Your selected visit'}).waitFor()
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
   // The standalone page reads the same ledger: the booked slot is gone.
   const standalone=await context.newPage();await standalone.goto(h.origin+'/book');await standalone.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   const form=standalone.locator('[data-public-command=search]');await form.locator('[name=date]').fill(day);await form.locator('[name=partySize]').fill('2');await form.getByRole('button',{name:'Find available times'}).click()
   await standalone.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   assert.equal(await standalone.locator('[name=public-result]').count(),0,'the widget booking removed the only slot from the standalone page')
   if(shots)await standalone.screenshot({path:resolve(shots,`BOOK-002-standalone-${width}.png`),fullPage:true})
   await standalone.close()
   if(width===1440){
    // Staff and guest pages other than the widget refuse every frame, and an unlisted website gets no widget.
    await page.goto(host+'/frames');await page.waitForLoadState('load')
    for(const name of ['app','book','queue','inquiry'])assert.match(page.frame({name}).url(),/^chrome-error:/,`${name} is unframeable`)
    await page.goto(other+'/');await page.locator(`iframe[title="${title}"]`).waitFor();await page.waitForLoadState('load')
    await assert.rejects(()=>page.frameLocator(`iframe[title="${title}"]`).locator('[name=date]').waitFor({timeout:3000}))
    assert.match(page.frames().find(f=>f!==page.mainFrame()).url(),/^chrome-error:/,'an unlisted website cannot frame the widget')
   }
   assert.deepEqual(errors,[])
   console.log(`BOOK-002 owner allowlist, keyboard widget booking, shared standalone ledger and frame refusals passed at ${width}`)
  }finally{await context.close();await h.close()}
 }
}finally{await browser.close()}

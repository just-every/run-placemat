// FLOOR-013: use actual staff forms, a second host device, guest booking and kitchen navigation.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {notesFixture} from './api/service-notes-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 const h=await installation(),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),owner=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),hostContext=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),publicContext=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  const f=await notesFixture(h,{bookings:false}),errors=[]
  const cookies=cookie=>cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}})
  const hostCookie=await h.signIn('notes-host@example.test'),hostId=(await h.api('/auth/operators')).find(p=>p.email==='notes-host@example.test').id;await h.command('team.host',{operatorId:hostId,enabled:true})
  await owner.addCookies(cookies(h.cookie));await hostContext.addCookies(cookies(hostCookie))
  const page=await owner.newPage(),host=await hostContext.newPage(),guest=await publicContext.newPage()
  for(const p of [page,host,guest])p.on('pageerror',e=>errors.push(e.message))
  const shot=async(p,name)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'FLOOR-013 fits viewport');if(shots)await p.screenshot({path:resolve(shots,`FLOOR-013-${name}-${width}.png`),fullPage:true})}
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await host.goto(transport.origin+'/app');const hostNotes=host.getByRole('article',{name:'Service notes'});await hostNotes.waitFor()
  const notes=page.getByRole('article',{name:'Service notes'});await notes.getByText('Add or edit notes',{exact:true}).click()
  const form=notes.locator('form[data-command="service.note"]')
  const note=async(kind,text)=>{await form.getByLabel('Note type').selectOption(kind);await form.getByLabel('Note text').fill(text);await form.getByRole('button',{name:'Save service note',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();await notes.getByText('Add or edit notes',{exact:true}).click()}
  await note('kitchen','Halibut: 12 portions');await note('shift','Regular booked Thursday; seat in Ana’s section')
  await hostNotes.getByText('Halibut: 12 portions',{exact:true}).first().waitFor();await hostNotes.getByText('Regular booked Thursday; seat in Ana’s section',{exact:true}).first().waitFor();await hostNotes.scrollIntoViewIfNeeded();await shot(host,'host-live-notes')
  await note('kitchen','Halibut: 10 portions');await notes.getByText('Author, time and history',{exact:true}).first().click();await notes.getByText('Halibut: 12 portions',{exact:true}).waitFor();assert.ok((await notes.innerText()).includes('Venue owner'));await notes.scrollIntoViewIfNeeded();await shot(page,'manager-history')
  await notes.getByText('Unpaid pre-order dishes',{exact:true}).click();const managerCount=notes.locator('form[data-command="service.preorder-count"]');await managerCount.getByLabel('Manager-entered quantity').fill('12');await managerCount.getByRole('button',{name:'Save manager count',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor()
  // A manager publishes another item through the shipped form.
  await notes.getByText('Unpaid pre-order dishes',{exact:true}).click();const publish=notes.locator('form[data-command="service.preorder-item"]');await publish.getByLabel('Dish name',{exact:true}).fill('Seasonal vegetables');await publish.getByRole('button',{name:'Publish dish',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor()
  for(let i=0;i<3;i++){
   await guest.goto(transport.origin+'/book');await guest.getByLabel('Arrival date',{exact:true}).fill(f.date);await guest.getByLabel('Party size',{exact:true}).fill(i===1?'8':'2');await guest.getByRole('button',{name:'Find available times',exact:true}).click();await guest.getByLabel('Choose an available time').selectOption('0')
   await guest.getByLabel('Your name',{exact:true}).fill(['Elena Torres','Marcus Chen','Jules Rivers'][i]);await guest.getByLabel('Email',{exact:true}).fill(`kitchen${i}@example.test`);await guest.getByLabel('Halibut quantity (optional)',{exact:true}).fill(String(i+1))
   if(i===0){await guest.getByText('Occasion and special requests',{exact:true}).click();await guest.getByLabel('Allergy notes (guest supplied)',{exact:true}).fill('Shellfish');await guest.getByLabel('Wheelchair accommodation requested; select required table access separately',{exact:true}).check();await shot(guest,'guest-preorder')}
   await guest.getByRole('checkbox',{name:/I understand selected required area/}).check();await guest.getByRole('button',{name:'Confirm booking',exact:true}).click();await guest.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();assert.ok((await guest.locator('#public-content').innerText()).includes('Halibut'));if(i===0)await shot(guest,'guest-confirmed')
  }
  await notes.getByRole('link',{name:'Open kitchen view',exact:true}).click();const kitchen=page.getByRole('article',{name:'Kitchen view'});await kitchen.waitFor();const content=await kitchen.innerText()
  for(const value of ['6 guest-supplied; 12 manager-entered','Shellfish','Wheelchair','16 covers / 30 minutes','12 expected covers','Table 12','8 guests'])assert.ok(content.includes(value),value)
  for(const value of ['Elena Torres','Marcus Chen','kitchen0@example.test','Regular booked Thursday'])assert.ok(!(await page.content()).includes(value),value)
  await shot(page,'kitchen')
  await hostNotes.getByRole('link',{name:'Open kitchen view',exact:true}).click();await host.getByRole('article',{name:'Kitchen view'}).waitFor()
  await h.command('service.note',{date:f.date,kind:'kitchen',text:'Halibut: 8 portions'})
  // Explicit refresh is the recovery door as well as the ordinary live update.
  await host.getByRole('button',{name:'Refresh kitchen',exact:true}).click();await host.getByText('Current: Halibut: 8 portions',{exact:false}).waitFor()
  await page.goto(transport.origin+'/preshift?date='+f.date);const sheet=page.getByRole('article',{name:'Pre-shift sheet'});await sheet.waitFor();assert.ok((await sheet.innerText()).includes('Halibut: 8 portions'));assert.ok((await sheet.innerText()).includes('Regular booked Thursday'));await shot(page,'preshift-notes')
  const person=(await h.api('/api/guests?search=kitchen0@example.test')).guests[0];await h.command('guest.erase',{guestId:person.id,confirm:'ERASE'})
  await page.goto(transport.origin+'/kitchen?serviceId='+f.service.id);const erased=await page.getByRole('article',{name:'Kitchen view'}).innerText();assert.ok(erased.includes('5 guest-supplied; 12 manager-entered'));for(const value of ['Shellfish','Wheelchair','Regular booked Thursday','Halibut: 8 portions'])assert.ok(!erased.includes(value),value);await shot(page,'kitchen-erased');assert.deepEqual(errors,[])
  console.log(`FLOOR-013 staff note/history, second-device live notes, manager publication/count, three guest bookings, kitchen, pre-shift and erasure passed at ${width}`)
 }finally{await owner.close();await hostContext.close();await publicContext.close();await browser.close();await transport.close();await h.close()}
}

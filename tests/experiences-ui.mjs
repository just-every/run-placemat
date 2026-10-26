import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
import {experienceFixture} from './api/experience-fixture.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{for(const width of [1440,390]){
 const h=await installation(),f=await experienceFixture(h),transport=await browserServer(h),owner=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),guest=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
 try{
  for(const table of f.floor.slice(0,2))await h.command('table.save',{...table,seats:4})
  const errors=[],page=await owner.newPage();page.on('pageerror',error=>errors.push(error.message))
  const shot=async(name,p=page)=>{
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Experience screen fits the viewport')
   if(p!==page)assert.ok(await p.locator('[data-public-command=book] input:not([type=checkbox])').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().right<=node.closest('article').getBoundingClientRect().right-8)),'Guest contact controls fit their booking card')
   assert.deepEqual(await p.locator('button,a[href]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!n.textContent.trim()&&!n.getAttribute('data-tooltip')&&!n.getAttribute('title')).map(n=>n.outerHTML)),[],'Every visible icon-only control has a tooltip')
   if(shots){const target=p===page?p.locator(new URL(p.url()).pathname==='/kitchen'?'main':new URL(p.url()).pathname==='/preshift'?'article[aria-label="Pre-shift sheet"]':'#experiences-content'):p.locator('.booking-shell');await target.screenshot({path:resolve(shots,`EXP-001-${name}-${width}.png`)})}
  }
  await owner.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
  await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await page.getByRole('link',{name:'Services & tables',exact:true}).click()
  const root=page.locator('#experiences-content'),command=name=>page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===name)
  async function publish(name,area,turn,cleanup){
   const editor=root.locator('[data-experience-editor] details');if(!await editor.getAttribute('open').then(value=>value!==null))await editor.locator('summary').click()
   const form=root.locator('[data-experience-command="experience.save"]')
   await form.locator('[name=name]').fill(name);await form.locator('[name=imageFile]').setInputFiles('public/site/hero-phone-760.webp');await form.locator('[name=menu]').fill(name.includes('tasting')?'Three courses: roasted pumpkin, handmade ricotta pasta, and poached pears.':'A free sunset patio gathering with seasonal small plates available from the venue.')
   await form.locator('[name=turnMinutes]').fill(String(turn));await form.locator('[name=cleanupMinutes]').fill(String(cleanup))
   await form.locator(`[name=serviceIds][value="${f.service.id}"]`).check();await form.locator(`[name=areas][value="${area}"]`).check()
   if(name.includes('tasting')){
    for(const [label,limit] of [['Wine pairing',8],['Limited mushroom supplement',1]]){await form.getByRole('button',{name:'Add included add-on',exact:true}).click();const row=form.locator('[data-experience-option=addon]').last();await row.locator('[name=optionName]').fill(label);await row.locator('[name=optionLimit]').fill(String(limit));}
    for(const label of ['Plant-based menu','Standard tasting menu']){await form.getByRole('button',{name:'Add dietary choice',exact:true}).click();await form.locator('[data-experience-option=dietary]').last().locator('[name=optionName]').fill(label);}
   }
   await form.locator('[name=className]').fill('Dinner seating');await form.locator('[name=quantityLimit]').fill('8');await form.locator('[name=cancellationRules]').fill('Cancel with the venue before service. This free booking takes no payment.')
   let pending=command('experience.save');await form.getByRole('button',{name:'Save draft',exact:true}).click();let response=await pending;assert.ok(response.ok(),await response.text());const entry=(await response.json()).result
   const review=root.locator('details.card').filter({has:page.locator('summary').filter({hasText:name+' · Draft'})});await review.locator('summary').click();await review.locator('.experience-image').evaluate(img=>img.decode());await shot('review-'+(area==='Patio'?'patio':'tasting'))
   const publish=review.locator('[data-experience-command="experience.publish"]');await publish.getByRole('checkbox').check();pending=command('experience.publish');await publish.getByRole('button',{name:'Publish catalog entry',exact:true}).click();response=await pending;assert.ok(response.ok(),await response.text())
   await root.locator('summary').filter({hasText:name+' · Published'}).waitFor();return (await h.api('/api/state')).state.experiences.find(e=>e.id===entry.id)
  }
  const tasting=await publish('Chef tasting dinner','Dining room',120,15),patio=await publish('Free patio evening','Patio',60,15)
  await shot('published-catalog')
  await h.api('/api/public/book',publicGuest(f.service,0,{tableIds:[f.floor[1].id]}),{as:'',status:201})
  const diner=await guest.newPage();diner.on('pageerror',error=>errors.push(error.message));await diner.goto(transport.origin+'/book');await diner.locator('[name=experienceId]').waitFor();await diner.locator('#public-content[aria-busy]').waitFor({state:'detached'})
  async function search(entry,area,tags=false){
   const form=diner.locator('[data-public-command=search]');await form.locator('[name=date]').fill(f.service.startAt.slice(0,10));await form.locator('[name=partySize]').fill(entry.id===tasting.id?'4':'2');await form.locator('[name=area]').selectOption(area);await form.locator('[name=experienceId]').selectOption(entry.id);await form.locator('[name=ticketClassId]').selectOption(entry.ticketClasses[0].id)
   const access=form.locator('[name=requiredAccessTags][value=wheelchair]');if(tags)await access.check();else await access.uncheck()
   await form.getByRole('button',{name:'Find available times',exact:true}).click();await diner.getByRole('status').filter({hasText:'Availability updated'}).waitFor()
   const select=diner.locator('[name=public-result]'),option=select.locator('option').nth(1);await select.selectOption(await option.getAttribute('value'));await diner.getByRole('heading',{name:'Your selected visit',exact:true}).waitFor()
  }
  async function contact(name,email){await diner.getByLabel('Your name',{exact:true}).fill(name);await diner.getByLabel('Email',{exact:true}).fill(email);await diner.locator('[name=requestsAcknowledged]').check();await diner.locator('[name=acknowledgedExperienceTerms]').check()}
  await search(tasting,'Dining room',true);await contact('Amelia Chen','amelia@example.test');await diner.locator('[data-experience-cart-item]').nth(0).fill('2');await diner.locator('[data-experience-cart-item]').nth(1).fill('1');await diner.locator('[data-experience-guest-number="1"]').selectOption(tasting.dietaryChoices[0].id);await diner.locator('[data-experience-guest-number="2"]').selectOption(tasting.dietaryChoices[1].id);await shot('guest-tasting-terms',diner)
  await diner.getByRole('button',{name:'Hold and review',exact:true}).click();await diner.getByRole('heading',{name:'Table held for you',exact:true}).waitFor();await shot('ticket-hold',diner);await diner.getByRole('button',{name:'Finish reservation',exact:true}).click();await diner.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();assert.match(await diner.locator('.booking-confirmation').innerText(),/Chef tasting dinner.*Dinner seating/s);await shot('tasting-confirmed',diner)
  await diner.getByRole('button',{name:'Make another booking',exact:true}).click();await diner.getByRole('status').filter({hasText:'Choose your next visit'}).waitFor();await search(patio,'Patio');await contact('Mia Brooks','mia@example.test')
  await diner.getByRole('button',{name:'Confirm booking',exact:true}).click();await diner.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();assert.match(await diner.locator('.booking-confirmation').innerText(),/Free patio evening/);await shot('patio-confirmed',diner)
  await diner.getByRole('button',{name:'Make another booking',exact:true}).click();await diner.getByRole('status').filter({hasText:'Choose your next visit'}).waitFor();await search(patio,'Patio');await contact('Noah Rivera','noah@example.test')
  await h.api('/api/public/book',publicGuest(f.service,4,{area:'Patio',startAt:f.at(75)}),{as:'',status:201})
  await diner.getByRole('button',{name:'Confirm booking',exact:true}).click();await diner.getByRole('alert').filter({hasText:'No booking has been made'}).waitFor();assert.equal(await diner.locator('[data-public-command=book]').count(),0);await shot('stale-experience-reselect',diner)
  const select=diner.locator('[name=public-result]');await select.selectOption(await select.locator('option').nth(1).getAttribute('value'));assert.equal(await diner.getByLabel('Email',{exact:true}).inputValue(),'noah@example.test');await diner.locator('[name=requestsAcknowledged]').check();await diner.locator('[name=acknowledgedExperienceTerms]').check()
  await diner.getByRole('button',{name:'Confirm booking',exact:true}).click();await diner.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();await shot('reselected-last-seating-confirmed',diner)
  const state=(await h.api('/api/state')).state,experienceBookings=state.bookings.filter(b=>b.experience)
  assert.equal(experienceBookings.length,3);assert.equal(experienceBookings[0].endAt,f.at(120));assert.equal(experienceBookings[0].cleanupEndAt,f.at(135));assert.equal(experienceBookings[2].startAt,f.at(165));assert.equal(experienceBookings[2].cleanupEndAt,f.at(240));assert.equal(experienceBookings[0].experienceCart.ticketQuantity,4);assert.equal(experienceBookings[0].experienceCart.items.find(item=>item.name==='Wine pairing').quantity,2);assert.equal(experienceBookings[0].experienceCart.items.find(item=>item.name==='Limited mushroom supplement').quantity,1)
  await page.goto(transport.origin+'/kitchen?serviceId='+f.service.id);await page.getByRole('heading',{name:'Experience options',exact:true}).waitFor();await shot('kitchen-options')
  await page.goto(transport.origin+'/preshift?date='+f.service.startAt.slice(0,10));await page.getByText(/Unverified dietary choice: Guest 1/).waitFor();await shot('sheet-options');assert.deepEqual(errors,[])
  console.log(`EXP-001 manager publication, guest tasting and patio bookings, shared tables, full turns, stale reselection and last seating passed at ${width}`)
 }finally{await guest.close();await owner.close();await transport.close();await h.close()}
}}finally{await browser.close()}

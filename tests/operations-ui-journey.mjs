import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {installation,service,publicGuest} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
async function transport(context,h,cookie=''){
 if(cookie)await context.addCookies(cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:h.origin,secure:true,sameSite:'Lax'}}))
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==h.origin){await route.abort();return}
  const file=resolve('public','.'+url.pathname)
  if(file.startsWith(resolve('public')+'/')&&extname(file))try{await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body:await readFile(file)});return}catch{}
  const response=await h.mf.dispatchFetch(request.url(),{method:request.method(),headers:{...request.headers(),host:url.host},...(request.postDataBuffer()?{body:request.postDataBuffer()}:{})})
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
 })
}
export async function operationsBrowserJourney(browser){
 if(shots)await mkdir(shots,{recursive:true})
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}}),guestContext=await browser.newContext({viewport:{width,height:1000}}),deviceContext=await browser.newContext({viewport:{width,height:1000}})
  try{
   console.log('Operations journey start',width);
   const {service:s,floor}=await service(h,{tables:2,seats:4,covers:40})
   const b=(await h.api('/api/public/book',publicGuest(s,98,{name:'Synthetic Needs Guest',requests:{allergyNotes:'Nuts',wheelchair:true},requestsAcknowledged:true}),{as:'',status:201})).result
   const host=await h.signIn('operations-host@example.test','member','Operations Host'),op=(await h.api('/auth/operators')).find(p=>p.email==='operations-host@example.test');await h.command('team.host',{operatorId:op.id,enabled:true})
   const six=await h.command('waitlist.add',publicGuest(s,96,{partySize:6,entryKind:'reservation-request'})),two=await h.command('waitlist.add',publicGuest(s,97,{entryKind:'walk-in'}))
   await h.command('waitlist.priority',{waitlistId:six.id,priority:5,reason:'Retain the larger party promise'})
   await transport(context,h,h.cookie);await transport(guestContext,h)
   const page=await context.newPage(),guest=await guestContext.newPage(),errors=[];for(const p of [page,guest])p.on('pageerror',e=>errors.push(e.message))
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   const saved=async()=>{await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.locator('main[aria-busy=true]').waitFor({state:'hidden'})}
   const shot=async(name,target=page)=>{console.log('Operations screen',name,width);if(shots)await target.screenshot({path:resolve(shots,`operations-${name}-${width}.png`),...(typeof target.viewportSize==='function'?{fullPage:true}:{})})}
   const open=async()=>{await page.getByRole('button',{name:'Update service',exact:true}).first().click();await page.locator('form[data-command="booking.needs"]').waitFor()}
   await open()
   let review=page.locator('form[data-command="booking.needs"]');await review.locator('[name=reason]').fill('Reviewed with the guest at check-in');await review.getByRole('button',{name:'Save needs review'}).click();await saved()
   await open();review=page.locator('form[data-command="booking.needs"]');await review.locator('[name=action]').selectOption('clarify');await review.locator('[name=reason]').fill('The older allergy declaration needs clarification');await review.getByRole('button',{name:'Save needs review'}).click();await saved()
   await open();assert.match(await page.locator('[aria-label="Declared needs"]').innerText(),/Clarification required/);await shot('clarification',page.locator('#service-status-editor'))
   review=page.locator('form[data-command="booking.needs"]');await review.locator('[name=action]').selectOption('correct');await review.locator('[name=value]').fill('Peanuts only, declared by guest');await review.locator('[name=guestConfirmed]').check();await review.locator('[name=reason]').fill('Guest clarified the outdated note');await review.getByRole('button',{name:'Save needs review'}).click();await saved()
   await open();review=page.locator('form[data-command="booking.needs"]');await review.locator('[name=reason]').fill('Read the corrected fact back to the guest');await review.getByRole('button',{name:'Save needs review'}).click();await saved()
   await open();review=page.locator('form[data-command="booking.needs"]');await review.locator('[name=field]').selectOption('access');await review.locator('[name=reason]').fill('Confirmed the access declaration with the guest');await review.getByRole('button',{name:'Save needs review'}).click();await saved();
   await open();assert.match(await page.locator('[aria-label="Declared needs"]').innerText(),/Staff acknowledged/);await page.getByText('Per-fact history',{exact:true}).click();assert.match(await page.locator('[aria-label="Declared needs"]').innerText(),/Guest clarified the outdated note/)
   const grace=page.locator('#service-status-editor form[data-command="booking.late"]').filter({has:page.locator('[name=action][value=grace]')});await page.getByText('Grace and contact attempts',{exact:true}).first().click();await grace.locator('[name=reason]').fill('Fifteen minute grace agreed');await grace.getByRole('button',{name:'Record grace time'}).click();await saved()
   await open();await page.getByText('Grace and contact attempts',{exact:true}).first().click()
   const contact=page.locator('#service-status-editor form[data-command="booking.late"]').filter({has:page.locator('[name=action][value=contact]')});await contact.locator('[name=outcome]').fill('Unanswered phone call');await contact.locator('[name=reason]').fill('Checking arrival');await contact.getByRole('button',{name:'Log contact attempt'}).click();await saved()
   await open();await page.getByText('Grace and contact attempts',{exact:true}).first().click()
   const hold=page.locator('#service-status-editor form[data-command="booking.late"]').filter({has:page.locator('[name=action][value=hold]')});await hold.locator('[name=until]').fill(new Date(Date.parse(s.startAt)+15*60000).toISOString());await hold.locator('[name=reason]').fill('Guest phoned to report running fifteen minutes late');await hold.getByRole('button',{name:'Hold for late arrival'}).click();await saved()
   await open();await page.locator('#service-status-editor').getByText('Late-arrival history',{exact:true}).click();assert.match(await page.locator('#service-status-editor').innerText(),/Unanswered phone call/);await shot('floor-needs-late',page.locator('#service-status-editor'))
   // Every operations control in the touched surfaces has a visible text label.
   for(const control of await page.locator('button:visible').all())assert.ok((await control.innerText()).trim(),await control.evaluate(el=>el.outerHTML))
   await page.locator('#floor-timeline [data-timeline-filter]').waitFor()
   await page.locator('#floor-timeline .table-scroll').evaluate(el=>{el.scrollLeft=el.scrollWidth});await page.locator('#floor-timeline').getByText('Late-arrival history',{exact:true}).click();assert.match(await page.locator('#floor-timeline').innerText(),/Unanswered phone call/);await shot('timeline',page.locator('#floor-timeline'))
   await page.locator('#waitlist-content').scrollIntoViewIfNeeded();assert.match(await page.locator('#waitlist-content').innerText(),/earlier party retains priority/)
   const card=page.locator('#waitlist-content article.card').filter({hasText:'Guest 96'}).first();await card.getByText('Record queue update',{exact:true}).click()
   let quote=card.locator('form[data-command="waitlist.quote"]');await quote.locator('[name=quoteMin]').fill('20');await quote.locator('[name=quoteMax]').fill('30');await quote.locator('[name=basis]').fill('Waiting for the larger table');await quote.locator('[name=guestVisible]').check();await quote.getByRole('button',{name:'Record wait quote'}).click();await saved()
   await guest.goto(h.origin+'/queue#'+six.token);await guest.locator('[data-guest-quote]').waitFor();assert.match(await guest.locator('[data-guest-quote]').innerText(),/20–30/)
   await card.getByText('Record queue update',{exact:true}).click();quote=card.locator('form[data-command="waitlist.quote"]');await quote.locator('[name=quoteMin]').fill('35');await quote.locator('[name=quoteMax]').fill('45');await quote.locator('[name=basis]').fill('Previous turn delayed');await quote.locator('[name=guestVisible]').check();await quote.getByRole('button',{name:'Record wait quote'}).click();await saved()
   await guest.getByRole('button',{name:'Refresh status'}).click();await guest.getByText('Previous turn delayed',{exact:false}).waitFor();assert.match(await guest.locator('.booking-confirmation').innerText(),/Reservation request \(unconfirmed\)/);await shot('guest-quote',guest);await shot('waitlist',page.locator('#waitlist-content'))
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane'}).format(new Date(s.startAt))
   await page.goto(h.origin+'/preshift?date='+date);assert.match(await page.locator('article').innerText(),/Peanuts only, declared by guest.*Staff acknowledged/);await shot('preshift',page)
   await page.goto(h.origin+'/kitchen?serviceId='+s.id);assert.match(await page.locator('article').innerText(),/Peanuts only, declared by guest.*Staff acknowledged/);await shot('kitchen',page)
   await h.api('/api/hoststand/pin',{pin:'314159265358'},{as:host});const registration=await h.api('/api/hoststand/devices',{label:'Operations stand'},{status:201}),claimed=await h.request('/api/hoststand/claim',{method:'POST',body:{claimCode:registration.claimCode},as:''}),deviceCookie=claimed.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('__Host-pm-device='));await h.api('/api/hoststand/unlock',{operatorId:op.id,pin:'314159265358'},{as:deviceCookie});await transport(deviceContext,h,deviceCookie)
   const stand=await deviceContext.newPage();await stand.goto(h.origin+'/hoststand');await stand.getByRole('heading',{name:'Operations stand',exact:true}).waitFor();assert.ok(!(await stand.locator('body').innerText()).includes('Peanuts only'));assert.match(await stand.locator('body').innerText(),/Held until/);await shot('hoststand',stand)
   for(const p of [guest,page,stand])assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow')
   assert.deepEqual(errors,[]);console.log(`Declared needs, late-arrival operations and quoted waits passed at ${width}`)
  }catch(error){console.error('Operations journey failed',error);throw error}finally{for(const current of [context,guestContext,deviceContext])await current.unrouteAll({behavior:'wait'});await context.close();await guestContext.close();await deviceContext.close();await h.close()}
 }
}

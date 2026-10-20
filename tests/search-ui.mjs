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
 for(const width of [1440,390]){
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

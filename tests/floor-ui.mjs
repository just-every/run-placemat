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
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   const tables=[];for(let i=0;i<4;i++)tables.push(await h.command('table.save',{label:['Window 4','Dining 4','Garden 4','Booth 4'][i],seats:4,area:'Dining',x:20+i%2*50,y:20+Math.floor(i/2)*50}))
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
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The page fits the viewport')
   assert.deepEqual(errors,[]);console.log(`FLOOR-009 browser journey passed at ${width}`)
  }finally{await context.close();await h.close()}
 }
}finally{await browser.close()}

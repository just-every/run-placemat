// FLOOR-003: a manager approves physical joins; guests and native hosts share that inventory.
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
   const tables=[];for(const label of ['T1','T2','T8'])tables.push(await h.command('table.save',{label,seats:4,area:'Dining',accessTags:['step-free'],x:20+tables.length*25,y:30}))
   const cookie=await h.signIn('joins-host@example.test'),operator=(await h.api('/auth/operators')).find(p=>p.email==='joins-host@example.test');await h.command('team.host',{operatorId:operator.id,enabled:true})
   const cookies=value=>value.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}})
   await context.addCookies(cookies(h.cookie))
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
   const screenshot=async(name,locator)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await locator.screenshot({path:resolve(shots,`FLOOR-003-${name}-${width}.png`)})}
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
   const form=page.locator('form[data-command="combination.save"]')
   await form.locator('[name=tableIds]').selectOption([tables[0].id,tables[1].id]);await form.locator('[name=capacity]').fill('6');await form.locator('[name=accessTags]').fill('step-free');await form.locator('[name=setupMinutes]').fill('15');await form.locator('[name=adjacent]').check()
   await screenshot('approve',page.locator('[aria-label="Approved table combinations"]'))
   await form.getByRole('button',{name:'Approve table combination',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   const state=await h.api('/api/state'),join=state.state.combinations[0];assert.equal(join.capacity,6);assert.equal(join.setupMinutes,15)
   const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
   const service=await h.command('service.save',{name:'Friday dinner',startAt:day+'T16:00:00Z',endAt:day+'T20:00:00Z',turnMinutes:90,coverLimit:30})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Approved adjacent join ready'});await h.command('proposal.approve',{proposalId:p.id})
   const booked=(await h.api('/api/public/book',publicGuest(service,1,{name:'Priya Shah',partySize:6,startAt:day+'T16:15:00Z',requiredAccessTags:['step-free']}),{as:'',status:201})).result
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
   assert.deepEqual((await h.api('/api/state')).state.bookings[0].tableIds.sort(),[tables[0].id,tables[1].id].sort())
   assert.equal(await page.getByText('Setup before arrival',{exact:true}).count(),2)
   assert.equal(await page.getByText(/Setup reserved until/).count(),2)
   await screenshot('setup-floor',page.locator('#floor-content'))
   await context.clearCookies();await context.addCookies(cookies(cookie));await page.goto(h.origin+'/app');await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
   await page.locator(`#bookings-list [data-action=reassign][data-id="${booked.id}"]`).click()
   await page.locator('#reassignment [name=tableIds]').selectOption([tables[0].id,tables[2].id]);await page.locator('#reassignment form[data-command="booking.move"]').getByRole('button',{name:'Move party',exact:true}).click()
   await page.getByRole('alert').filter({hasText:/manager-approved|approved.*combination/}).waitFor()
   assert.deepEqual((await h.api('/api/state')).state.bookings[0].tableIds.sort(),[tables[0].id,tables[1].id].sort())
   await screenshot('prohibited-host-move',page.locator('#reassignment'))
   const list=page.locator('[aria-label="Approved table combinations"]');assert.equal(await list.locator('[data-action=edit-combination]').count(),0)
   await context.clearCookies();await context.addCookies(cookies(h.cookie));await page.goto(h.origin+'/app');await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor();await page.locator('.app-main[aria-busy=false]').waitFor()
   await page.locator(`[data-action=disable-combination][data-id="${join.id}"]`).click();const editor=page.locator('#combination-editor form');await editor.locator('[name=adjacent]').check();await editor.getByRole('button',{name:'Save table combination'}).click();await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   assert.equal((await h.api('/api/state')).state.combinations[0].enabled,false);assert.equal((await h.api('/api/state')).state.bookings[0].combination.id,join.id)
   await screenshot('disabled-retained',page.locator('[aria-label="Approved table combinations"]'));assert.deepEqual(errors,[])
   console.log(`FLOOR-003 manager approval, setup floor, prohibited host move and disabled commitment passed at ${width}`)
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
 }
}finally{await browser.close()}

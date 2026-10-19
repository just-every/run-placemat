// FLOOR-004: managers staff a shift; native hosts seat uneven parties, follow rotation and retain serving history.
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
   const tables=[];for(const [i,label] of ['12','14','21','22'].entries())tables.push(await h.command('table.save',{label,seats:4,shape:i%2?'rectangle':'round',area:'Dining room',accessTags:['step-free'],x:20+i%2*45,y:20+Math.floor(i/2)*45}))
   const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),service=await h.command('service.save',{name:'Friday dinner',startAt:day+'T21:00:00Z',endAt:day+'T23:59:00Z',turnMinutes:60,coverLimit:30})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Host stand ready'});await h.command('proposal.approve',{proposalId:p.id})
   const cookies=value=>value.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}})
   await context.addCookies(cookies(h.cookie))
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
    const file=resolve('public','.'+url.pathname)
    if(file.startsWith(resolve('public')+'/')&&extname(file)){try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}}
    const r=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())})
   })
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   const submit=async(command,button)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===command);await page.locator(`form[data-command="${command}"]`).getByRole('button',{name:button,exact:true}).click();const result=await response;assert.ok(result.ok(),await result.text());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()}
   const screenshot=async(name,locator=page.locator('#floor-staffing'))=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await locator.screenshot({path:resolve(shots,`FLOOR-004-${name}-${width}.png`)})}
   for(const [name,coverCap] of [['Ana Torres',4],['Ben Carter',6]]){
    const form=page.locator('form[data-command="server.save"]');await form.locator('xpath=..').evaluate(el=>el.open=true);await form.locator('[name=name]').fill(name);await form.locator('[name=coverCap]').fill(String(coverCap));await screenshot('server-form-'+name.split(' ')[0],page.locator('#server-editor'));await submit('server.save','Save server')
   }
   const servers=(await h.api('/api/state')).state.services.find(s=>s.id===service.id).staffing.servers
   for(const [i,name] of ['Window','Garden'].entries()){
    const form=page.locator('form[data-command="section.save"]');await form.locator('xpath=..').evaluate(el=>el.open=true);await form.locator('[name=name]').fill(name);await form.locator('[name=serverId]').selectOption(servers[i].id);await form.locator('[name=tableIds]').selectOption(tables.slice(i*2,i*2+2).map(t=>t.id));await screenshot('section-form-'+name,page.locator('#section-editor'));await submit('section.save','Save section')
   }
   const kitchen=page.locator('form[data-command="kitchen.save"]');await kitchen.locator('xpath=..').evaluate(el=>el.open=true);await kitchen.locator('[name=area]').selectOption('Dining room');await kitchen.locator('[name=coverCap]').fill('10');await screenshot('kitchen-form',kitchen);await submit('kitchen.save','Save kitchen limit')
   await screenshot('shift-setup')
   const first=(await h.api('/api/public/book',publicGuest(service,0,{name:'Priya Shah',partySize:4}),{as:'',status:201})).result,second=(await h.api('/api/public/book',publicGuest(service,1,{name:'Marco Rivera',partySize:2}),{as:'',status:201})).result
   const host=await h.signIn('section-host@example.test'),operator=(await h.api('/auth/operators')).find(p=>p.email==='section-host@example.test');await h.command('team.host',{operatorId:operator.id,enabled:true})
   await context.clearCookies();await context.addCookies(cookies(host));await page.goto(h.origin+'/app');await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   const move=async(id,table)=>{await page.locator(`#bookings-list [data-action=reassign][data-id="${id}"]`).click();await page.locator('#reassignment [name=tableIds]').selectOption(table.id);const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='booking.move');await page.locator('#reassignment form[data-command="booking.move"]').getByRole('button',{name:'Move party',exact:true}).click();return response}
   // Choose Ben's section explicitly; automatic allocation can already have rotated there.
   if(!(await h.api('/api/state')).state.bookings.find(b=>b.id===second.id).tableIds.includes(tables[2].id)){assert.ok((await move(second.id,tables[2])).ok());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()}
   await h.command('booking.stage',{bookingId:first.id,stage:'seated'},{as:host});await h.command('booking.stage',{bookingId:second.id,stage:'seated'},{as:host});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor()
   assert.match(await page.locator('#floor-staffing').innerText(),/Ana Torres/);assert.match(await page.locator('#floor-staffing').innerText(),/Ben Carter/);await screenshot('uneven-covers-rotation')
   await page.locator(`[data-staffing-drill="seated"][data-server-id="${servers[0].id}"]`).click();assert.match(await page.locator('#staffing-parties').innerText(),/Priya Shah/)
   await page.locator('[name=floor-server]').selectOption(servers[0].id);assert.equal(await page.locator('.floor-table').count(),2);await page.locator('[name=floor-server]').blur();await screenshot('server-floor',page.locator('#floor-room'))
   // A manager records a break; host direct moves must use the remaining eligible section.
   await context.clearCookies();await context.addCookies(cookies(h.cookie));await page.goto(h.origin+'/app');await page.locator(`form[data-command="server.break"] input[name=serverId][value="${servers[0].id}"]`).waitFor({state:'attached'});const breakForm=page.locator('form[data-command="server.break"]').filter({has:page.locator(`input[name=serverId][value="${servers[0].id}"]`)});await breakForm.locator('xpath=..').evaluate(el=>el.open=true);await breakForm.locator('[name=reason]').fill('Scheduled rest break');await screenshot('manager-break');const breakResponse=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='server.break');await breakForm.getByRole('button',{name:'Start break',exact:true}).click();assert.ok((await breakResponse).ok());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await context.clearCookies();await context.addCookies(cookies(host));await page.goto(h.origin+'/app');await page.locator('#staffing-rotation').waitFor()
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Venue refreshed'}).waitFor();assert.match(await page.locator('#staffing-rotation').innerText(),/Ben Carter/);await screenshot('break-rotation')
   assert.ok((await move(first.id,tables[3])).ok());await page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   await page.locator('#reassignment summary').filter({hasText:'Assignment and turn history'}).click();assert.match(await page.locator('#reassignment').innerText(),/Ana Torres/);assert.match(await page.locator('#reassignment').innerText(),/Ben Carter/);await screenshot('serving-history',page.locator('#reassignment'))
   assert.equal((await move(second.id,tables[1])).status(),409);await page.getByRole('alert').filter({hasText:/break/}).waitFor()
   const filter=page.locator('form[data-timeline-filter]');await filter.locator('[name=serverId]').selectOption(servers[1].id);await filter.getByRole('button',{name:'Apply timeline filters'}).click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-table tbody tr').length===2);assert.match(await page.locator('.timeline-table').innerText(),/Priya Shah/);await screenshot('server-timeline',page.locator('#floor-timeline'))
   assert.deepEqual(errors,[]);console.log(`FLOOR-004 shift sections, uneven covers, breaks, direct serving history and timeline passed at ${width}`)
  }finally{await context.close();await h.close()}
 }
}finally{await browser.close()}

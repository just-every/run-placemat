// AGENT-004: the shipped approval screen changes real D1 assignments at both viewport widths.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {allocationService} from './api/allocation-fixture.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   const {service,tables,reservation,waiting,before}=await allocationService(h),errors=[]
   const hostCookie=await h.signIn('other-host@example.test'),host=(await h.api('/auth/operators')).find(p=>p.email==='other-host@example.test')
   await h.command('team.host',{operatorId:host.id,enabled:true});await h.command('team.pacing',{operatorId:host.id,enabled:true})
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
    const file=resolve('public','.'+url.pathname)
    if(file.startsWith(resolve('public')+'/')&&extname(file)){try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}}
    const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Approvals & reminders',exact:true}).click()
   const root=page.locator('#allocation-content')
   await root.locator('[data-allocation-prepare][data-kind="allocation.improve"]').nth(1).waitFor()
   const shot=async(name,locator=root)=>{await page.locator('#allocation-content[aria-busy="false"]').waitFor();if(shots)await locator.screenshot({path:resolve(shots,`AGENT-004-${name}-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Allocation screen fits the viewport')}
   assert.match(await root.innerText(),/0 → 4/);assert.match(await root.innerText(),/step-free/);assert.match(await root.innerText(),/not confirmed seats/)
   await shot('alternatives')
   const prepare=async index=>{
    const form=root.locator('[data-allocation-prepare][data-kind="allocation.improve"]').nth(index)
    await form.locator('[name=reason]').fill('Keep step-free access and free Window 4 for the waiting four-top')
    const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='proposal.prepare')
    await form.getByRole('button',{name:'Prepare allocation',exact:true}).click()
    const result=await response;assert.ok(result.ok(),await result.text());const proposal=(await result.json()).result
    await root.locator(`[data-allocation-proposal="${proposal.id}"]`).waitFor();return proposal
   }
   const first=await prepare(0),second=await prepare(1)
   assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===reservation.id),before)
   const card=id=>root.locator(`[data-allocation-proposal="${id}"]`)
   const decision=async(id,name,command)=>{
    const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===command)
    await card(id).getByRole('button',{name,exact:true}).click();return response
   }
   let response=await decision(first.id,'Approve allocation','proposal.approve');assert.ok(response.ok(),await response.text())
   await card(first.id).getByRole('heading',{name:'Allocation approved',exact:true}).waitFor();await shot('approved',card(first.id))
   const booked=(await h.api('/api/state')).state.bookings.find(b=>b.id===reservation.id)
   for(const key of ['startAt','endAt','cleanupEndAt','partySize','requiredArea','requiredAccessTags'])assert.deepEqual(booked[key],before[key])
   const spare=tables.slice(1,3).find(t=>!booked.tableIds.includes(t.id))
   await h.command('booking.walkin',{serviceId:service.id,startAt:service.startAt,name:'Riley Brooks',email:'riley@example.test',partySize:2,tableIds:[spare.id]},{as:hostCookie})
   response=await decision(second.id,'Approve allocation','proposal.approve');assert.equal(response.status(),409)
   await card(second.id).getByRole('alert').waitFor();assert.match(await card(second.id).innerText(),/Prepare and review fresh advice/);await shot('stale',card(second.id))
   const seated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:service.startAt,tableIds:[tables[0].id]},{as:hostCookie})
   assert.deepEqual(seated.requiredAccessTags,['step-free'])
   await root.getByRole('button',{name:'Refresh alternatives',exact:true}).click()
   await root.getByText('No actionable allocation changes improve the recorded queue demand while preserving constraints.',{exact:true}).waitFor()
   const utilization=root.locator('[data-allocation-report] > section').first();assert.match(await utilization.innerText(),/Seated covers: 6/);await shot('actual',root.locator('[data-allocation-report]'))
   response=await decision(second.id,'Decline allocation','proposal.decline');assert.ok(response.ok(),await response.text())
   await card(second.id).getByRole('heading',{name:'Allocation declined',exact:true}).waitFor();await shot('declined',card(second.id))
   assert.deepEqual(errors,[]);console.log(`AGENT-004 alternatives, exact approval, stale host conflict, declined plan and observed utilization passed at ${width}`)
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
 }
 for(const width of [1440,390])await servicePolicyJourney(browser,width)
}finally{await browser.close()}

async function servicePolicyJourney(browser,width){
 const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
 try{
  const {service,reservation,before}=await allocationService(h),errors=[]
  await h.command('waitlist.add',{serviceId:service.id,name:'Maya Thompson late four',email:'maya@example.test',partySize:4,preferredAt:new Date(Date.parse(service.endAt)-30*60000).toISOString(),preferredArea:'Dining room',requiredAccessTags:['step-free'],contactConsent:false})
  await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
   const file=resolve('public','.'+url.pathname)
   if(file.startsWith(resolve('public')+'/')&&extname(file)){try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}}
   const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})})
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
  })
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await page.getByRole('link',{name:'Approvals & reminders',exact:true}).click()
  const root=page.locator('#allocation-content'),card=id=>root.locator(`[data-allocation-proposal="${id}"]`)
  const shot=async(name,locator=root)=>{await page.locator('#allocation-content[aria-busy="false"]').waitFor();if(shots)await locator.screenshot({path:resolve(shots,`AGENT-004-policy-${name}-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Service policy screen fits the viewport')}
  const prepare=async(kind,release=false)=>{
   const forms=root.locator(`[data-allocation-prepare][data-kind="${kind}"]`),form=release?forms.locator('[data-release-id]').first():forms.first()
   await form.locator('[name=reason]').fill('Confirmed Ana and kitchen availability; preserve step-free guest commitments')
   const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='proposal.prepare')
   await form.getByRole('button',{name:'Prepare allocation',exact:true}).click();const result=await response;assert.ok(result.ok(),await result.text());return (await result.json()).result
  }
  const approve=async p=>{
   const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command==='proposal.approve')
   await card(p.id).getByRole('button',{name:'Approve allocation',exact:true}).click();const result=await response;assert.ok(result.ok(),await result.text());await card(p.id).getByRole('heading',{name:'Allocation approved',exact:true}).waitFor()
  }
  await root.locator('[data-kind="inventory.protect"]').first().waitFor()
  const inventory=await prepare('inventory.protect');await shot('inventory-review',card(inventory.id));await approve(inventory)
  const protection=(await h.api('/api/state')).state.services.find(s=>s.id===service.id).directInventory[0]
  assert.deepEqual(protection.tableIds,inventory.plan.protection.tableIds)
  await root.getByRole('heading',{name:'Protected interval',exact:true}).waitFor();await shot('inventory-applied',root.locator('[data-allocation-report]'))
  // The first inventory form now releases the retained exact interval.
  const release=await prepare('inventory.protect');assert.equal(release.plan.action,'release');await approve(release)
  assert.deepEqual((await h.api('/api/state')).state.services.find(s=>s.id===service.id).directInventory,[])
  await shot('inventory-released',card(release.id))
  await root.locator('[data-kind="service.adjust"]').first().waitFor()
  const shift=await prepare('service.adjust');assert.match(await card(shift.id).innerText(),/Service end:/);assert.match(await card(shift.id).innerText(),/Preserved bookings: 1/);await shot('shift-review',card(shift.id));await approve(shift)
  const state=(await h.api('/api/state')).state
  assert.equal(state.services.find(s=>s.id===service.id).endAt,shift.plan.endAt);assert.deepEqual(state.bookings.find(b=>b.id===reservation.id),before)
  await shot('shift-applied',card(shift.id));assert.deepEqual(errors,[])
  console.log(`AGENT-004 protected direct inventory/release and person-approved shift extension preserve commitments at ${width}`)
 }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
}

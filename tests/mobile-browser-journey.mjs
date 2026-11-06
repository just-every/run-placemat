// Personal online sessions only. These browser semantics do not qualify native devices.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {installation,service,publicGuest} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'

export async function mobileBrowserJourney(){
 const shots=process.env.PLACEMAT_SCREENSHOTS
 if(shots)await mkdir(shots,{recursive:true})
 for(const width of [1440,390]){
  const h=await installation(),transport=await browserServer(h)
  const browser=await chromium.launch({headless:true,args:[`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]})
  const contexts=[]
  try{
   const f=await service(h,{tables:5,seats:4,covers:40}),longName='Alexandra Montgomery-Worthington and the evening theatre party'
   const bookings=[]
   for(let i=0;i<8;i++)bookings.push((await h.api('/api/public/book',publicGuest(f.service,i,{name:i===0?longName:`Evening theatre party ${i}`,email:[`synthetic-placemat-guest-${i}`,'example.test'].join('@'),partySize:2,startAt:new Date(Date.parse(f.startAt)+(i<5?0:5400000)).toISOString()}),{as:'',status:201})).result)
   const staff=[]
   for(const [i,role,name] of [[1,'member','Jordan Morning Host'],[2,'member','Morgan Evening Host'],[3,'admin','Robin Floor Manager']]){
    const email=[`synthetic-placemat-${i}`,'example.test'].join('@'),cookie=await h.signIn(email,role,name),person=(await h.api('/auth/operators')).find(p=>p.email===email)
    if(role==='member')await h.command('team.host',{operatorId:person.id,enabled:true})
    staff.push({...person,cookie})
   }
   const [first,next,manager]=staff,errors=[]
   const pageFor=async person=>{
    const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});contexts.push(context)
    await context.addCookies(person.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(transport.origin+'/app');await page.locator('.timeline-table').waitFor();return page
   }
   const host=await pageFor(first)
   const tabTo=async(page,target)=>{
    await expect(target).toBeVisible()
    for(let i=0;i<600;i++){
     if(await target.evaluate(el=>el===document.activeElement)){
      assert.ok(await target.evaluate(el=>{const s=getComputedStyle(el);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2}),'Keyboard focus is visible')
      return
     }
     await page.keyboard.press('Tab')
    }
    throw Error('Keyboard could not reach '+await target.evaluate(el=>el.outerHTML))
   }
   const activate=async(page,target)=>{await tabTo(page,target);await page.keyboard.press('Enter')}
   const type=async(page,target,value)=>{await tabTo(page,target);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(value)}
   const choose=async(page,target,value)=>{
    await tabTo(page,target);await page.keyboard.press('Home')
    const options=await target.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),index=options.indexOf(value)
    assert.ok(index>=0,`Available keyboard choice: ${value}`)
    for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Tab');await expect(target).toHaveValue(value)
   }
   const shot=async(page,name,locator)=>{
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Busy shift fits the viewport')
    if(shots){await (locator||page).screenshot({path:resolve(shots,`MOBILE-001-${name}-${width}.png`)})}
   }
   const snapshot=async(page,name,locator)=>{
    const tree=await locator.ariaSnapshot()
    if(shots)await writeFile(resolve(shots,`MOBILE-001-${name}-${width}.aria.txt`),tree)
    return tree
   }
   await host.evaluate(()=>{
    window.shiftAnnouncements=[]
    new MutationObserver(()=>{const el=document.querySelector('#notice');window.shiftAnnouncements.push({text:el.textContent,role:el.getAttribute('role'),live:el.getAttribute('aria-live'),busy:!!document.querySelector('section[aria-busy=true]')})}).observe(document.querySelector('#notice'),{childList:true,attributes:true})
   })
   await activate(host,host.getByRole('link',{name:'Skip to operations',exact:true}))
   await expect(host.locator('#operations-main')).toBeFocused()
   // Existing booking search, submitted and read through the shipped timeline.
   const search=host.locator('[data-timeline-filter] [name=search]')
   await type(host,search,'Montgomery-Worthington')
   await activate(host,host.getByRole('button',{name:'Apply timeline filters',exact:true}))
   await expect(host.locator('.timeline-table tbody tr')).toHaveCount(1)
   await expect(host.getByRole('button',{name:'Apply timeline filters',exact:true})).toBeFocused()
   await expect(host.getByRole('columnheader',{name:'Guest',exact:true})).toHaveCount(1)
   assert.match(await snapshot(host,'lookup',host.locator('#floor-timeline')),new RegExp(longName))
   await host.locator('#floor-timeline').scrollIntoViewIfNeeded();await shot(host,'lookup')
   const update=host.locator(`#bookings-list [data-action=service-status][data-id="${bookings[0].id}"]`)
   await activate(host,update)
   const editor=host.locator('#service-status-editor'),step=editor.getByRole('combobox',{name:'Next service step',exact:true})
   await expect(step).toBeFocused()
   assert.match(await snapshot(host,'arrival',editor),/combobox "Next service step"/)
   for(const stage of ['arrived','seated']){
    await choose(host,step,stage)
    await type(host,editor.getByRole('textbox',{name:'Observation note (optional)',exact:true}),stage==='arrived'?'Party checked in at the host desk':'Party seated by the window')
    await activate(host,editor.getByRole('button',{name:'Record service step',exact:true}))
    await expect(host.locator('#notice')).toHaveText('Saved successfully.')
    await expect(editor.getByRole('button',{name:'Record service step',exact:true})).toBeFocused()
    const state=await h.api('/api/state',undefined,{as:first.cookie}),event=state.state.serviceEvents.at(-1)
    assert.equal(state.serviceStages[bookings[0].id].serviceStatus,stage);assert.equal(event.actor,first.id);assert.equal(event.source,'staff-recorded')
   }
   assert.match(await snapshot(host,'seated',editor),/Party seated by the window/)
   await shot(host,'seated',editor)
   await activate(host,host.getByRole('button',{name:'Refresh',exact:true}));await expect(host.locator('#notice')).toHaveText('Venue refreshed.')
   await expect(host.getByRole('button',{name:'Refresh',exact:true})).toBeFocused()
   assert.match(await editor.innerText(),/Party checked in at the host desk/)
   await host.reload();await host.locator('.timeline-table').waitFor();await activate(host,update);await expect(editor).toContainText('Party seated by the window')
   // Announcements are checked again below after installing the observer on the refreshed document.
   await host.evaluate(()=>{window.shiftAnnouncements=[];new MutationObserver(()=>{const el=document.querySelector('#notice');window.shiftAnnouncements.push({text:el.textContent,role:el.getAttribute('role'),live:el.getAttribute('aria-live'),busy:!!document.querySelector('section[aria-busy=true]')})}).observe(document.querySelector('#notice'),{childList:true,attributes:true})})
   const callback=await h.command('booking.handover',{bookingId:bookings[0].id,kind:'callback',text:'Call the guest about their later arrival',ownerId:first.id,dueAt:new Date(Date.parse(f.startAt)-3600000).toISOString()},{as:first.cookie})
   await activate(host,host.getByRole('button',{name:'Refresh',exact:true}));await expect(host.locator('#notice')).toHaveText('Venue refreshed.')
   const task=host.locator(`[data-handover-task="${callback.task.id}"]`)
   await activate(host,task.getByText('Hand over this follow-up',{exact:true}))
   await choose(host,task.getByRole('combobox',{name:'Next follow-up owner',exact:true}),next.id)
   await activate(host,task.getByRole('button',{name:'Hand over follow-up',exact:true}))
   await expect(host.locator('#notice')).toHaveText('Saved successfully.')
   await expect(task.getByRole('heading')).toBeFocused()
   await expect(task).not.toContainText('Call the guest about their later arrival')
   const assigned=(await h.api('/api/state')).state.bookings.find(b=>b.id===bookings[0].id).handover[0]
   assert.equal(assigned.ownerId,next.id);assert.equal(assigned.history.at(-1).actor,first.id)
   await h.command('booking.handover.complete',{bookingId:bookings[0].id,taskId:assigned.id,outcome:'Not authorized'},{as:first.cookie,status:403})
   await shot(host,'handover',task)
   const recipient=await pageFor(next),received=recipient.locator(`[data-handover-task="${assigned.id}"]`)
   await expect(received).toContainText('Call the guest about their later arrival')
   await type(recipient,received.getByRole('textbox',{name:'Recorded outcome',exact:true}),'Guest confirmed the agreed arrival time')
   await activate(recipient,received.getByRole('button',{name:'Complete guest follow-up',exact:true}));await expect(recipient.locator('#notice')).toHaveText('Saved successfully.')
   await expect(received.getByRole('heading')).toBeFocused();await expect(received).toContainText('Completed')
   await recipient.reload();await recipient.locator('.timeline-table').waitFor();await expect(received).toContainText('Guest confirmed the agreed arrival time')
   const completed=(await h.api('/api/state')).state.bookings.find(b=>b.id===bookings[0].id).handover[0]
   assert.equal(completed.history.at(-1).actor,next.id);assert.equal(completed.history.at(-1).action,'completed')
   assert.match(await snapshot(recipient,'completed',received),/Guest confirmed the agreed arrival time/);await shot(recipient,'completed',received)
   // Two proposals make the manager's selected decision distinguishable.
   const proposals=[]
   for(const name of ['Later dinner for the theatre party','Sunday dinner remains unapproved']){
    const s=await h.command('service.save',{name,startAt:new Date(Date.parse(f.startAt)+86400000).toISOString(),endAt:new Date(Date.parse(f.startAt)+100800000).toISOString(),turnMinutes:90,coverLimit:40})
    proposals.push(await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Review this exact later service'}))
   }
   await h.command('proposal.approve',{proposalId:proposals[0].id},{as:first.cookie,status:403})
   const admin=await pageFor(manager),card=admin.locator(`[data-proposal-id="${proposals[0].id}"]`)
   await activate(admin,card.getByText('Exact plan',{exact:true}));await expect(card.locator('pre')).toContainText('Later dinner for the theatre party')
   assert.match(await snapshot(admin,'approval',card),/button "Approve plan"/);await shot(admin,'approval',card)
   await activate(admin,card.getByRole('button',{name:'Approve plan',exact:true}));await expect(admin.locator('#notice')).toHaveText('Plan approved and applied.')
   await expect(card.getByRole('heading')).toBeFocused();await expect(card.locator('details')).toHaveAttribute('open','')
   const decided=(await h.api('/api/state')).state
   assert.equal(decided.proposals.find(p=>p.id===proposals[0].id).approvedBy,manager.id)
   assert.equal(decided.proposals.find(p=>p.id===proposals[1].id).status,'pending')
   await admin.reload();await admin.locator('.timeline-table').waitFor();await expect(card).toContainText('Approved by Robin Floor Manager')
   await shot(admin,'approved',card)
   // A real stale decision is announced as an error and never changes the other plan.
   const stale=admin.locator(`[data-proposal-id="${proposals[1].id}"]`)
   await h.command('proposal.decline',{proposalId:proposals[1].id})
   await activate(admin,stale.getByRole('button',{name:'Approve plan',exact:true}));await expect(admin.locator('#notice')).toHaveAttribute('role','alert');await expect(admin.locator('#notice')).toHaveAttribute('aria-live','assertive')
   await expect(stale.getByRole('button',{name:'Approve plan',exact:true})).toBeFocused()
   assert.equal((await h.api('/api/state')).state.proposals.find(p=>p.id===proposals[1].id).status,'declined')
   await shot(admin,'decision-error',stale)
   const controls=await host.locator('#floor button,#bookings button,#approvals button').all()
   for(const control of controls)if(await control.isVisible())await expect(control).toHaveAccessibleName(/.+/)
   const announcements=await host.evaluate(()=>window.shiftAnnouncements)
   assert.ok(announcements.some(a=>a.text==='Saving…'&&a.role==='status'&&a.live==='polite'&&a.busy),'Busy work is announced')
   assert.ok(announcements.some(a=>a.text==='Saved successfully.'&&a.role==='status'&&a.live==='polite'),'Saved work is announced')
   assert.deepEqual(errors,[])
   console.log(`PROBE MOBILE-001 online keyboard and semantics ${width}: booking lookup -> arrival and seating -> exact manager decision -> callback handover and completion; HTTP history and permissions confirmed`)
  }finally{
   await Promise.all(contexts.map(c=>c.close()));await browser.close();await transport.close();await h.close()
  }
 }
}
if(process.argv[1]===new URL(import.meta.url).pathname)await mobileBrowserJourney()

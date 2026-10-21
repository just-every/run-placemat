// SERVICE-002: the shipped manager screen creates a recurring schedule with a repeated-hour holiday exception
// (its own UTC offset), previews exact physical seats without retired tables, and keeps the offset when edited.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {browserServer} from './browser-server.mjs'
import {installation} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try {
 for(const width of [1440,390]) {
  const h=await installation(),transport=await browserServer(h),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true})
  try {
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   await h.command('table.save',{label:'Dining 4',seats:4,x:20,y:20})
   const old=await h.command('table.save',{label:'Old 10',seats:10,x:60,y:20})
   await h.command('proposal.approve',{proposalId:(await h.command('proposal.prepare',{kind:'floor.change',plan:{tableId:old.id,retire:true},reason:'Retire the old table'})).id})
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
   const saved=()=>page.getByRole('status').filter({hasText:'Saved successfully'}).waitFor()
   const submit=async(command,label)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===command);await page.locator(`form[data-command="${command}"]`).getByRole('button',{name:label,exact:true}).click();const r=await response;assert.ok(r.ok(),await r.text());return r}
   await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Services & tables',exact:true}).click()
   const editor=page.locator('#schedule-editor');await editor.getByText('Create recurring schedule',{exact:true}).click()
   const form=page.locator('form[data-command="schedule.save"]')
   await form.locator('[name=name]').fill('Fall breakfast');await form.locator('[name=shift]').selectOption('breakfast')
   await form.locator('[name=seasonStart]').fill('2027-11-06');await form.locator('[name=seasonEnd]').fill('2027-11-08')
   await form.locator('[name=weekdays][value="0"]').check()
   await form.locator('[name=startTime]').fill('08:00');await form.locator('[name=endTime]').fill('11:00')
   // 1:30 happens twice on 7 November; the exception carries its own standard-time offsets.
   await form.locator('[name=exceptions]').fill('2027-11-07 01:30 04:00 90 30 startOffset=-05:00 endOffset=-05:00')
   await submit('schedule.save','Save recurring schedule');await saved()
   const schedule=(await h.api('/api/state')).state.schedules[0]
   assert.deepEqual(schedule.exceptions.map(e=>[e.date,e.startOffset,e.endOffset]),[['2027-11-07','-05:00','-05:00']])
   // The saved offsets are shown again and survive an unchanged save without a new version.
   await page.getByRole('button',{name:'Edit schedule',exact:true}).click()
   const edit=page.locator('form[data-command="schedule.save"]').last()
   assert.match(await edit.locator('[name=exceptions]').inputValue(),/startOffset=-05:00 endOffset=-05:00/)
   await submit('schedule.save','Save schedule changes');await saved()
   assert.equal((await h.api('/api/state')).state.schedules[0].version,schedule.version)
   assert.deepEqual((await h.api('/api/state')).state.schedules[0].exceptions,schedule.exceptions)
   const preview=page.locator('form[data-command="schedule.preview"]').first()
   await preview.locator('[name=fromDate]').fill('2027-11-06');await preview.locator('[name=toDate]').fill('2027-11-08');await preview.locator('[name=reason]').fill('Review the clock-change weekend')
   await submit('schedule.preview','Preview generated services')
   await page.getByText('Generated services ready for review.',{exact:false}).waitFor()
   const plan=page.locator('#approvals-content').getByRole('article').filter({hasText:'2027-11-07'})
   await plan.getByText('4 physical seats · 30 service covers').waitFor()
   const proposal=(await h.api('/api/state')).state.proposals.find(p=>p.kind==='schedule.publish')
   assert.ok(proposal.plan.candidates.every(c=>c.capacity.seats===4),'retired tables are not physical seats')
   assert.equal(proposal.plan.candidates.find(c=>c.localDate==='2027-11-07').service.startAt,'2027-11-07T06:30:00.000Z')
   if(shots)await page.locator('#approvals-content').screenshot({path:resolve(shots,`SERVICE-002-repeated-hour-${width}.png`)})
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Schedule screen fits viewport')
   await page.locator('[data-action=approve]').first().click();await page.getByRole('status').filter({hasText:'Plan approved'}).waitFor()
   assert.equal((await h.api('/api/public/services',undefined,{as:''})).services.filter(s=>s.startAt==='2027-11-07T06:30:00.000Z').length,1)
   assert.deepEqual(errors,[])
   console.log(`SERVICE-002 repeated-hour holiday offset, editor round trip and physical-seat preview passed at ${width}`)
  }finally{await context.close();await transport.close();await h.close()}
 }
}finally{await browser.close()}

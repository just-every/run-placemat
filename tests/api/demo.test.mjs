import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'

test('Demo: a lived-in Fern & Fig opens for the owner; pending plans approve and an invitation sends nothing',async()=>{
 const h=await installation({entry:'tests/api/demo-worker.ts',bindings:{RER_DEMO:'1'}});try{
  let {state,guests,names}=await h.api('/api/state')
  assert.equal(state.venue.name,'Fern & Fig');assert.equal(state.tables.length,16);assert.ok(guests.length>=70)
  const statuses=new Set(state.bookings.map(b=>b.status))
  for(const status of ['booked','completed','cancelled','no-show'])assert.ok(statuses.has(status),status)
  assert.ok(state.bookings.some(b=>b.source==='walk-in'));assert.equal(state.waitlist.filter(w=>w.status==='waiting').length,4)
  assert.ok(guests.find(g=>g.name==='Priya Raman').notes.includes('shellfish'))
  const pending=state.proposals.filter(p=>p.status==='pending')
  assert.deepEqual(pending.map(p=>p.kind).sort(),['reminders','service.publish','table.assign']);assert.equal(names[pending[0].preparedBy],'Dinner planning assistant (preparation key)')
  for(const p of pending)await h.command('proposal.approve',{proposalId:p.id})
  ;({state}=await h.api('/api/state'))
  assert.equal(state.services.find(s=>s.name==='Harvest supper club').status,'published');assert.ok(state.reminders.some(r=>r.status==='approved'))
  await h.command('waitlist.seat',{waitlistId:state.waitlist.find(w=>w.status==='waiting').id,startAt:new Date(Date.parse(state.services[0].endAt)-state.services[0].turnMinutes*60000).toISOString()})
  await h.api('/auth/invite',{email:'host@example.test',displayName:'New host',role:'member',returnTo:'/app'},{status:202})
  assert.equal(h.messages.length,0)
  const page=await h.request('/app');assert.equal(page.status,200,page.headers.get('location'));const html=await page.text()
  assert.equal(html.match(/<[a-z]+[^>]*\sdata-rer-name[\s>=]/g)?.length,1);assert.ok(!html.includes('Demo Demo'))
 }finally{await h.close()}
})

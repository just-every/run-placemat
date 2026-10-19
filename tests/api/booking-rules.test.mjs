import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

test('SERVICE-004: lunch/dinner channel rules refuse early, late, oversized and blocked guests; manager overrides remain physical and audited',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
  const table=await h.command('table.save',{label:'Dining 1',seats:6,x:30,y:30})
  const manager=await h.signIn('rules-manager@example.test','admin'),reader=await h.signIn('rules-reader@example.test')
  const base={minParty:2,maxParty:4,horizonDays:60,leadMinutes:30,sameDayCutoff:'23:59',slotMinutes:30,inquiryAbove:12,blockedStarts:[]}
  const date=new Date();date.setUTCDate(date.getUTCDate()+7);const day=date.toISOString().slice(0,10)
  async function publish(name,startAt,endAt,online,staff={...base,leadMinutes:20000,maxParty:6}){
   const s=await h.command('service.save',{name,startAt,endAt,turnMinutes:60,coverLimit:100,bookingRules:{online,'walk-in':staff,waitlist:{...staff,leadMinutes:0}}})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Review exact channel rules'})
   await h.command('proposal.approve',{proposalId:p.id});return s
  }
  const lunch=await publish('Lunch',day+'T16:00:00Z',day+'T20:00:00Z',{...base,blockedStarts:[day+'T17:00:00Z']})
  const dinner=await publish('Dinner',day+'T22:00:00Z',new Date(Date.parse(day+'T22:00:00Z')+4*3600000).toISOString(),{...base,minParty:1,maxParty:6,slotMinutes:15})
  const availability=(await h.api('/api/public/services?partySize=4',undefined,{as:''})).services
  const starts=availability.find(s=>s.id===lunch.id).slots.map(s=>s.startAt)
  assert.ok(starts.includes(day+'T16:00:00.000Z'));assert.ok(!starts.includes(day+'T17:00:00.000Z'))
  assert.ok(!starts.includes(day+'T16:15:00.000Z'));assert.ok(availability.find(s=>s.id===dinner.id).slots.some(s=>s.startAt.endsWith('22:15:00.000Z')))
  async function refuse(s,extra,status=409,pattern){const r=await h.api('/api/public/book',publicGuest(s,10,extra),{as:'',status});if(pattern)assert.match(r.error,pattern);return r}
  await refuse(lunch,{partySize:1},409,/Party size/)
  await refuse(lunch,{partySize:5},409,/Party size/)
  await refuse(lunch,{partySize:16},409,/inquiry.*no booking/i)
  await refuse(lunch,{startAt:day+'T17:00:00Z'},409,/blocked/)
  await refuse(lunch,{startAt:day+'T16:15:00Z'},400,/30-minute/)
  await refuse(lunch,{startAt:day+'T19:30:00Z'},400,/full turn/)
  const beyond=await publish('Too far',day+'T10:00:00Z',day+'T13:00:00Z',{...base,horizonDays:1},{...base,horizonDays:1,minParty:1,maxParty:1,leadMinutes:0})
  await refuse(beyond,{},409,/open 1/)
  const lead=await publish('Too early',day+'T06:00:00Z',day+'T09:00:00Z',{...base,leadMinutes:20000})
  await refuse(lead,{},409,/lead time/)
  assert.equal((await h.api('/api/public/services?partySize=2')).services.find(s=>s.id===lead.id).slots.length,0)
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const dayStart=Date.parse(today+'T00:00:00-04:00'),cutoff=await publish('Same-day cutoff',new Date(dayStart).toISOString(),new Date(dayStart+86340000).toISOString(),{...base,sameDayCutoff:'00:00'})
  const futureSlot=new Date(dayStart+Math.ceil((Date.now()+3600000-dayStart)/1800000)*1800000).toISOString()
  await refuse(cutoff,{startAt:futureSlot},409,/cutoff/)
  await h.command('booking.walkin',publicGuest(lunch,3,{tableIds:[table.id]}),{as:manager,status:409})
  await h.command('booking.walkin',publicGuest(lunch,3,{tableIds:[table.id],overrideReason:'Caller already at the host stand'}),{as:reader,status:403})
  const before=(await h.api('/api/state')).state.bookings.length
  await h.api('/api/public/book',publicGuest(lead,1,{overrideReason:'public cannot override'}),{as:'',status:409})
  assert.equal((await h.api('/api/state')).state.bookings.length,before)
  const seated=await h.command('booking.walkin',publicGuest(lunch,3,{tableIds:[table.id],overrideReason:'Caller already at the host stand'}),{as:manager})
  assert.match(seated.ruleOverride.violations.join(' '),/lead time/);assert.equal(seated.ruleOverride.reason,'Caller already at the host stand')
  const state=(await h.api('/api/state')).state
  assert.ok(state.audit.some(a=>a.action==='booking.rule-override'&&a.subject===seated.id&&a.actor===seated.ruleOverride.actor))
  await h.command('booking.walkin',publicGuest(lunch,4,{partySize:6,tableIds:[table.id],overrideReason:'Cannot create seats'}),{as:manager,status:409})
  const exception=await h.command('booking.walkin',publicGuest(beyond,5,{overrideReason:'Manager accepted advance two-top'}),{as:manager})
  assert.equal(exception.ruleOverride.violations.length,2)
  assert.match(exception.ruleOverride.violations.join(' '),/Party size.*open 1/)
  const waiting=await h.command('waitlist.add',publicGuest(dinner,2))
  const waitSeated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:dinner.startAt})
  assert.equal(waitSeated.ruleOverride,undefined,'separate waitlist lead rule applies')
  await h.command('service.save',{name:'Invalid rules',startAt:day+'T06:00:00Z',endAt:day+'T09:00:00Z',turnMinutes:60,coverLimit:10,bookingRules:{online:{...base,minParty:5,maxParty:2}}},{status:400})
  await h.command('guest.erase',{guestId:seated.guestId,confirm:'ERASE'})
  assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===seated.id).ruleOverride.reason,'')
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes('Caller already at the host stand'))
 }finally{await h.close()}
})

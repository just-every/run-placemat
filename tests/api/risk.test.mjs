import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {riskService} from './risk-fixture.mjs'

test('AGENT-005: fact-cited uncertain review, manager decisions, unchanged commitments and false-positive monitoring',async()=>{
 const h=await installation();try{
  const {service,missed,risky,unknown,confirmed}=await riskService(h),path='/api/reports/no-show?serviceId='+service.id
  const original=(await h.api('/api/state')).state.bookings.find(b=>b.id===risky.id)
  let report=await h.api(path),risk=report.rows.find(r=>r.bookingId===risky.id),empty=report.rows.find(r=>r.bookingId===unknown.id)
  assert.equal(risk.flagged,true);assert.ok(risk.flags.length>=2)
  assert.deepEqual(risk.facts.attendance.map(a=>[a.bookingId,a.status]),[[missed.id,'no-show']])
  assert.equal(risk.facts.reconfirmations[0].bookingId,missed.id);assert.equal(risk.facts.reconfirmations[0].outcome,'no-show');assert.ok(risk.facts.reconfirmations[0].eventId)
  assert.ok(risk.facts.leadMinutes>0);assert.equal(risk.facts.reconfirmed,false)
  assert.equal(empty.facts.attendance.length,0);assert.ok(empty.caveats.some(c=>c.includes('unknown')));assert.ok(empty.caveats.some(c=>c.includes('failed to reply')))
  assert.equal(report.rows.find(r=>r.bookingId===confirmed.id).flagged,false)
  assert.ok(risk.caveats.some(c=>c.includes('not a predicted probability')))
  const manager=await h.signIn('manager@example.test','admin'),member=await h.signIn('reader@example.test')
  const key=(await h.api('/api/agent-keys',{name:'Preparation assistant'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  for(const [as,status] of [['',401],[member,403]])await h.api(path,undefined,{as,status})
  await h.api(path,undefined,{...agent,status:403})
  const decision={bookingId:risky.id,kind:'contact',decision:'accepted',reason:'Ask whether plans are unchanged; preserve the booking',dueAt:new Date(Date.now()+3600000).toISOString()}
  await h.command('risk.decide',decision,{as:member,status:403});await h.command('risk.decide',decision,{...agent,status:403})
  await h.command('risk.decide',decision,{headers:{origin:'https://other.example'},status:403})
  await h.command('risk.decide',{...decision,dueAt:'not-a-time'},{status:400})
  const contact=await h.command('risk.decide',decision,{as:manager})
  await h.command('risk.decide',decision,{as:manager,status:409})
  const decline=await h.command('risk.decide',{bookingId:risky.id,kind:'policy-review',decision:'declined',reason:'Keep all original terms; no fee change'},{as:manager})
  assert.equal(contact.actor,decline.actor);assert.ok(contact.snapshot.flags.length)
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===risky.id),original)
  assert.equal(h.messages.length,2,'Only the two explicit staff invitations crossed the network edge')
  await h.command('risk.complete',{decisionId:decline.id,outcome:'Cannot complete a declined review'},{as:manager,status:409})
  await h.command('risk.complete',{decisionId:contact.id,outcome:'Guest confirmed by venue phone; staff-recorded only'},{as:manager})
  await h.command('risk.complete',{decisionId:contact.id,outcome:'Duplicate completion'},{as:manager,status:409})
  await h.command('booking.stage',{bookingId:risky.id,stage:'seated'})
  report=await h.api(path);assert.equal(report.monitoring.flagged,1);assert.equal(report.monitoring.attended,1);assert.equal(report.monitoring.noShow,0);assert.equal(report.monitoring.pending,0)
  assert.equal(report.decisions.find(d=>d.id===contact.id).completedBy,contact.actor)
  assert.equal(report.decisions.find(d=>d.id===decline.id).decision,'declined')
  assert.ok(report.definitions.monitoring.includes('not proof'))
  const current=(await h.api('/api/state')).state.bookings.find(b=>b.id===risky.id)
  for(const key of ['tableIds','startAt','endAt','cleanupEndAt','requiredAccessTags','requiredArea','partySize'])assert.deepEqual(current[key],original[key])
  const archive=await h.api('/api/backup'),restored=await installation()
  try{await restored.api('/api/restore',{archive,confirm:'RESTORE'});const copy=await restored.api(path);assert.deepEqual(copy.decisions,report.decisions);assert.deepEqual(copy.monitoring,report.monitoring)}finally{await restored.close()}
  await h.command('guest.erase',{guestId:original.guestId,confirm:'ERASE'})
  report=await h.api(path);assert.ok(!report.rows.some(r=>r.bookingId===risky.id));assert.ok(!report.decisions.some(d=>d.bookingId===risky.id))
  const state=(await h.api('/api/state')).state
  assert.ok(state.riskDecisions.filter(d=>d.bookingId===risky.id).every(d=>d.reason===''&&!d.outcome))
 }finally{await h.close()}
})

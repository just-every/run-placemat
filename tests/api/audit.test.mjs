import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'
import {csvRecords} from './business-fixture.mjs'

test('AUDIT-001: committed bookings, consent and policy changes have actor-filtered before/after history and erasure-safe owner CSVs',async()=>{
 const h=await installation()
 try {
  const {service:s,floor}=await service(h,{tables:3,covers:30})
  const manager=await h.signIn('audit-manager@example.test','admin'),reader=await h.signIn('audit-reader@example.test')
  const managerId=(await h.api('/api/state',undefined,{as:manager})).actor.id
  const b=(await h.api('/api/public/book',publicGuest(s,0,{name:'Priya Auditable',email:'priya-audit@example.test',requestsAcknowledged:true,requests:{occasion:'Anniversary',allergyNotes:'Shellfish'}}),{as:''})).result
  let current=await h.api('/api/state'),booking=current.state.bookings.find(row=>row.id===b.id)
  const originalTable=booking.tableIds[0],replacement=floor.find(t=>!booking.tableIds.includes(t.id))
  const guestId=booking.guestId
  await h.command('booking.move',{bookingId:b.id,tableIds:[replacement.id],version:current.version,reason:'Priya asked for a window'},{as:manager})
  await h.command('booking.status',{bookingId:b.id,status:'cancelled'},{as:manager})
  await h.command('guest.update',{guestId,notes:'Priya prefers the quiet window'},{as:manager})
  await h.command('service.pacing',{serviceId:s.id,pacing:{intervalMinutes:30,arrivalCovers:12,arrivalParties:6,concurrentCovers:24,areaArrivalCaps:{}}},{as:manager})
  const queue=await h.api('/api/public/queue/join',{serviceId:s.id,name:'Priya Auditable',email:'priya-audit@example.test',partySize:2,contactConsent:false,requiredAccessTags:['Step-free entry']},{as:''})
  await h.api('/api/public/queue/update',{token:queue.token,action:'update',contactConsent:true},{as:''})
  await h.command('waitlist.party',{waitlistId:queue.entry.id,contactConsent:false},{as:manager})
  const all=(await h.api('/api/audit')).rows
  const moved=all.find(row=>row.action==='booking.move'),cancel=all.find(row=>row.action==='booking.status'),policy=all.find(row=>row.action==='service.pacing')
  const change=(event,kind,id)=>event.changes.find(row=>row.kind===kind&&(!id||row.id===id))
  assert.deepEqual(change(moved,'bookings',b.id).before.tableIds,[originalTable]);assert.deepEqual(change(moved,'bookings',b.id).after.tableIds,[replacement.id])
  assert.equal(change(cancel,'bookings',b.id).before.status,'booked');assert.equal(change(cancel,'bookings',b.id).after.status,'cancelled')
  assert.equal(change(policy,'services',s.id).after.pacing.arrivalCovers,12)
  assert.equal(change(all.find(row=>row.action==='guest.update'),'guests').after.notes,'Priya prefers the quiet window')
  const consent=all.find(row=>row.action==='waitlist.public-update'),staffConsent=all.find(row=>row.action==='waitlist.party')
  assert.equal(change(consent,'waitlist').before.contactConsent,false);assert.equal(change(consent,'waitlist').after.contactConsent,true)
  assert.equal(change(staffConsent,'waitlist').before.contactConsent,true);assert.equal(change(staffConsent,'waitlist').after.contactConsent,false)
  for(const row of [moved,cancel,policy,staffConsent]){assert.equal(row.actor,managerId);assert.ok(Number.isFinite(Date.parse(row.at)))}
  assert.equal(consent.actor,'guest');assert.equal(consent.source,'guest-supplied');assert.equal(moved.source,'person')
  const query=new URLSearchParams({actor:managerId,subject:b.id,from:moved.at,to:cancel.at})
  const filtered=await h.api('/api/audit?'+query)
  assert.deepEqual(filtered.rows.map(row=>row.id),[cancel.id,moved.id]);assert.equal(filtered.names[managerId],'Floor manager')
  const csv=await h.request('/api/audit.csv?'+query),csvRows=csvRecords(await csv.text())
  assert.deepEqual(csvRows.map(row=>row.id),filtered.rows.map(row=>row.id));assert.deepEqual(JSON.parse(csvRows[1].changes_json),moved.changes)
  for(const as of ['',reader,manager])assert.equal((await h.request('/api/audit.csv',{as})).status,as?403:401)
  assert.equal((await h.request('/api/audit',{as:''})).status,401)
  await h.api('/api/audit?from=2026-10-21',{},{status:405})
  await h.api('/api/audit?from=2026-10-21',undefined,{status:400})
  // Refused commands do not create apparent commits in the history.
  const before=(await h.api('/api/audit')).rows.length
  await h.command('booking.status',{bookingId:b.id,status:'completed'},{as:manager,status:409})
  assert.equal((await h.api('/api/audit')).rows.length,before)
  const stateText=JSON.stringify((await h.api('/api/state')).state.audit)
  assert.doesNotMatch(stateText,/managementTokenHash|tokenHash/)
  assert.ok(!stateText.includes(queue.token),'private management bearer never enters snapshots')
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  const erased=await h.api('/api/audit'),text=JSON.stringify(erased)
  for(const personal of ['Priya','priya-audit@example.test','Shellfish','Step-free entry','quiet window'])assert.ok(!text.includes(personal),personal+' erased from history')
  for(const row of [moved,cancel,policy,consent,staffConsent]){const retained=erased.rows.find(v=>v.id===row.id);assert.equal(retained.actor,row.actor);assert.equal(retained.at,row.at);assert.equal(retained.action,row.action)}
  assert.deepEqual(change(erased.rows.find(row=>row.id===moved.id),'bookings').after,{redacted:true})
  const erasedCsv=await (await h.request('/api/audit.csv')).text();assert.ok(!erasedCsv.includes('Priya'))
  const archive=JSON.stringify(await h.api('/api/backup'));assert.ok(!archive.includes('Priya'));assert.ok(!archive.includes(queue.token))
 }finally{await h.close()}
})

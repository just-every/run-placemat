import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {businessService,csvRecords} from './business-fixture.mjs'

test('DATA-003: owner CSVs reconcile all current business records and versioned archives; restore preserves references, exclusions and erased values',async()=>{
 const h=await installation(),restored=await installation(),erased=await installation()
 try{
  const fixture=await businessService(h)
  const member=await h.signIn('host@example.test'),manager=await h.signIn('manager@example.test','admin')
  const key=(await h.api('/api/agent-keys',{name:'Preparation assistant'})).result
  const exportPath=kind=>'/api/business-export/'+kind+'.csv'
  for(const as of ['',member,manager])assert.equal((await h.request(exportPath('guests'),{as})).status,as?403:401)
  assert.equal((await h.request(exportPath('guests'),{as:'',headers:{authorization:'Bearer '+key.key}})).status,403)
  assert.equal((await h.request(exportPath('guests'),{method:'POST',body:{}})).status,405)
  assert.equal((await h.request(exportPath('credentials'))).status,404)
  const before=await h.api('/api/state'),downloads={}
  for(const kind of before.businessExportKinds){
   const response=await h.request(exportPath(kind));assert.equal(response.status,200)
   assert.match(response.headers.get('content-type'),/text\/csv/);assert.match(response.headers.get('content-disposition'),/attachment/)
   const csv=await response.text();assert.ok(!csv.includes(key.key),'DATA-003: preparation credential excluded')
   assert.doesNotMatch(csv,/managementTokenHash|tokenHash/,'DATA-003: private link verifiers excluded from CSV')
   downloads[kind]=csvRecords(csv)
  }
  const data=kind=>downloads[kind].map(row=>JSON.parse(row.data_json))
  for(const kind of ['rooms','tables','combinations','services','schedules','bookings','waitlist','inquiries','audit','proposals','reminders']){
   const actual=data(kind),expected=before.state[kind]??[]
   assert.equal(actual.length,expected.length,`DATA-003: ${kind} count reconciles`)
   assert.deepEqual(actual.map(row=>row.id).sort(),expected.map(row=>row.id).sort(),`DATA-003: ${kind} references reconcile`)
  }
  assert.deepEqual(data('bookings'),before.state.bookings,'DATA-003: booking policies, requests, timestamps and references retained')
  assert.deepEqual(data('guests'),before.guests,'DATA-003: current profile, note history, consent provenance and contacts retained')
  assert.deepEqual(data('risk-tasks'),before.state.riskDecisions)
  assert.equal(data('performance-reports')[0].id,fixture.publication.publication.id)
  assert.equal(data('waitlist')[0].contactConsent,true)
  assert.ok(data('inquiries')[0].messages.some(m=>m.message==='Can we discuss a private dinner?'))
  assert.match(downloads.guests.find(row=>row.id===fixture.guest).notes,/^'=SUM/,'DATA-003: spreadsheet formulas neutralized')
  assert.equal(JSON.parse(downloads.guests.find(row=>row.id===fixture.guest).data_json).notes,before.guests.find(g=>g.id===fixture.guest).notes,'DATA-003: original multiline notes remain lossless JSON')
  assert.deepEqual((await h.api('/api/state')).state,before.state,'DATA-003: exporting never changes delivery or business state')
  const archive=await h.api('/api/backup')
  assert.ok(archive[0].format&&archive[0].version,'DATA-003: structured archive declares its version')
  const archiveText=JSON.stringify(archive)
  assert.ok(!archiveText.includes(key.key));assert.ok(archive[0].excludedTables.includes('pm_agent_keys'),'DATA-003: exclusions are declared')
  const exportedRows=archive.filter(line=>line.kind==='part').flatMap(line=>line.items)
  assert.ok(exportedRows.every(item=>item.table!=='pm_agent_keys'&&!item.table.startsWith('oa_')),'DATA-003: credential and sign-in rows are excluded')
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  const after=await restored.api('/api/state')
  assert.deepEqual(after.state,before.state,'DATA-003: all current state records restore exactly');assert.deepEqual(after.guests,before.guests)
  for(const [kind,records] of Object.entries(downloads))assert.deepEqual(csvRecords(await (await restored.request(exportPath(kind))).text()),records,`DATA-003: restored ${kind} CSV reconciles`)
  const guest=before.guests.find(g=>g.id===fixture.guest)
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  const later=await h.api('/api/backup');await erased.api('/api/restore',{archive:later,confirm:'RESTORE'})
  for(const source of [h,erased])for(const kind of before.businessExportKinds){
   const csv=await (await source.request(exportPath(kind))).text()
   for(const personal of [guest.name,guest.email,guest.notes])assert.ok(!csv.includes(personal),`DATA-003: erased value absent from ${kind}`)
  }
  await restored.api('/api/restore',{archive,confirm:'RESTORE'},{status:409})
 }finally{await h.close();await restored.close();await erased.close()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {notesFixture} from './service-notes-fixture.mjs'
import {csvRecords} from './business-fixture.mjs'

test('FLOOR-013: dated note history, three guest preorders, source totals, identity-free kitchen, sheet, CSV, restore and erasure',async()=>{
 const h=await installation(),restored=await installation(),erased=await installation()
 try{
  const f=await notesFixture(h),manager=await h.signIn('kitchen-manager@example.test','admin'),member=await h.signIn('kitchen-member@example.test'),host=await h.signIn('kitchen-host@example.test')
  const hostId=(await h.api('/auth/operators')).find(p=>p.email==='kitchen-host@example.test').id;await h.command('team.host',{operatorId:hostId,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Kitchen preparation'})).result.key
  const kitchen='/api/kitchen?serviceId='+f.service.id
  await h.command('service.note',{date:f.date,kind:'kitchen',text:'Halibut: 12 portions'},{as:manager})
  const first=await h.command('service.note',{date:f.date,kind:'shift',text:'Regular booked Thursday; seat in Ana’s section'},{as:manager})
  const edited=await h.command('service.note',{date:f.date,kind:'kitchen',text:'Halibut: 10 portions'},{as:manager})
  assert.equal(edited.history.length,2);assert.ok(edited.history.every(e=>e.actor&&Number.isFinite(Date.parse(e.at))));assert.equal(edited.history[0].text,'Halibut: 12 portions')
  await h.command('service.preorder-count',{serviceId:f.service.id,itemId:f.item.id,quantity:12},{as:manager})
  for(const as of [member,host])await h.command('service.note',{date:f.date,kind:'shift',text:'Unauthorized'},{as,status:403})
  for(const path of [kitchen,'/kitchen?serviceId='+f.service.id]){
   assert.equal((await h.request(path,{as:''})).status,401)
   assert.equal((await h.request(path,{as:'',headers:{authorization:'Bearer '+key}})).status,403)
   for(const as of [h.cookie,manager,host,member]){
    const response=await h.request(path,{as});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
    const body=await response.text();for(const privateValue of ['Elena Torres','Marcus Chen','Jules Rivers','guest0@example.test',first.history[0].text])assert.ok(!body.includes(privateValue),privateValue)
    assert.ok(body.includes('Shellfish'));assert.ok(body.includes('Wheelchair'));assert.ok(body.includes('12'))
   }
  }
  const view=await h.api(kitchen)
  assert.deepEqual(view.items,[{name:'Halibut',guestQuantity:6,managerQuantity:12}]);assert.equal(view.intervals[0].covers,12);assert.equal(view.policy.arrivalCovers,16);assert.equal(view.largeParties[0].partySize,8);assert.deepEqual(view.needs[0].tables,['12']);assert.equal(view.needs[0].allergy,'Shellfish')
  assert.equal(view.notes[0].history.length,2)
  for(const as of [member,'']){
   const opts=as?{as}:{as:'',headers:{authorization:'Bearer '+key}}
   const state=await h.api('/api/state',undefined,opts),audit=await h.api('/api/audit',undefined,opts)
   assert.ok(!JSON.stringify([state,audit]).includes(first.history[0].text),'FLOOR-013 shift notes absent from restricted snapshots')
  }
  const hostState=await h.api('/api/state',undefined,{as:host});assert.ok(JSON.stringify(hostState).includes(first.history[0].text))
  for(const path of ['/api/preshift?date=','/preshift?date=','/api/preshift.pdf?date=']){
   const body=await (await h.request(path+f.date,{as:host})).text();assert.ok(body.includes(first.history[0].text));assert.ok(body.includes('Halibut: 10 portions'))
  }
  const before=(await h.api('/api/state')).state
  await h.api('/api/public/book',publicGuest(f.service,4,{preorders:[{itemId:'unknown',quantity:1}]}),{as:'',status:409})
  await h.api('/api/public/book',publicGuest(f.service,4,{preorders:[{itemId:f.item.id,quantity:-1}]}),{as:'',status:400})
  assert.deepEqual((await h.api('/api/state')).state,before,'FLOOR-013 invalid preorders write nothing')
  await h.command('service.preorder-active',{serviceId:f.service.id,itemId:f.item.id,active:false})
  await h.api('/api/public/book',publicGuest(f.service,4,{preorders:[{itemId:f.item.id,quantity:1}]}),{as:'',status:409})
  assert.equal((await h.api(kitchen)).items[0].guestQuantity,6,'FLOOR-013 withdrawal preserves recorded orders')
  const saved=(await h.api('/api/state')).state,archive=await h.api('/api/backup')
  await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await restored.api('/api/state')).state,saved)
  for(const kind of ['service-notes','services','bookings']){
   const rows=csvRecords(await (await h.request('/api/business-export/'+kind+'.csv')).text())
   const expected=kind==='service-notes'?saved.serviceNotes:saved[kind]
   assert.deepEqual(rows.map(r=>JSON.parse(r.data_json)),expected)
  }
  await h.command('booking.status',{bookingId:f.rows[1].id,status:'cancelled'});assert.equal((await h.api(kitchen)).items[0].guestQuantity,4)
  const guest=(await h.api('/api/guests?search=guest0@example.test')).guests[0]
  await h.command('guest.erase',{guestId:guest.id,confirm:'ERASE'})
  const later=await h.api('/api/backup');await erased.api('/api/restore',{archive:later,confirm:'RESTORE'})
  for(const source of [h,erased]){
   const output=JSON.stringify([await source.api('/api/state'),await source.api(kitchen),await source.api('/api/preshift?date='+f.date)])
   for(const value of ['Elena Torres','guest0@example.test','Shellfish',first.history[0].text,'Halibut: 12 portions'])assert.ok(!output.includes(value),value)
   assert.equal((await source.api(kitchen)).items[0].guestQuantity,3)
   for(const kind of ['service-notes','bookings','audit'])assert.ok(!(await (await source.request('/api/business-export/'+kind+'.csv')).text()).includes(first.history[0].text))
  }
  const fenced=await installation();try{await fenced.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:409})}finally{await fenced.close()}
 }finally{await h.close();await restored.close();await erased.close()}
})

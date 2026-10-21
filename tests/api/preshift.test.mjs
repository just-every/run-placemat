import test from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {preshiftFixture} from './preshift-fixture.mjs'

test('FLOOR-012: live service-date sheet shares server-filtered manager/host HTML and PDF, sections, pacing, flags and erasure',async()=>{
 const h=await installation();try{
  const f=await preshiftFixture(h),url='/api/preshift?date='+f.date
  const manager=await h.signIn('sheet-manager@example.test','admin'),member=await h.signIn('sheet-reader@example.test'),host=await h.signIn('sheet-host@example.test')
  const hostId=(await h.api('/auth/operators')).find(p=>p.email==='sheet-host@example.test').id
  await h.command('team.host',{operatorId:hostId,enabled:true})
  const key=(await h.api('/api/agent-keys',{name:'Sheet preparation'})).result.key
  for(const door of [url,'/preshift?date='+f.date,'/api/preshift.pdf?date='+f.date]){
   await h.request(door,{as:''}).then(r=>assert.equal(r.status,401))
   for(const opts of [{as:member},{as:'',headers:{authorization:'Bearer '+key}}])assert.equal((await h.request(door,opts)).status,403)
  }
  const sheet=await h.api(url,undefined,{as:manager}),s=sheet.services[0],b=s.bookings.find(b=>b.name==='Elena Torres')
  assert.equal(sheet.date,f.date);assert.equal(sheet.audience,'Manager');assert.ok(Number.isFinite(Date.parse(sheet.generatedAt)));assert.equal(sheet.timezone,'America/Los_Angeles')
  assert.equal(b.vipLevel,'regular');assert.equal(b.visitCount,1);assert.equal(b.occasion,'Anniversary');assert.equal(b.requests.allergy,'Shellfish');assert.equal(b.requests.dietary,'No dairy');assert.deepEqual(b.requests.access,['Wheelchair']);assert.deepEqual(b.requiredAccessTags,['step-free']);assert.equal(b.seatingPreference,'Window');assert.equal(b.notes,'Private anniversary planning');assert.deepEqual(b.tags,['Private celebration']);assert.equal(b.email,'elena@example.test');assert.equal(b.phone,'+1 415 555 0191');assert.equal(b.section,'Window');assert.equal(b.server,'Ana')
  assert.equal(s.sections[0].expectedCovers,10);assert.deepEqual(s.sections[0].tables,['12','14','16']);assert.equal(s.pacing.policy.arrivalCovers,16);assert.equal(s.pacing.intervals[0].covers,10);assert.equal(s.coverLimit,32)
  const hostSheet=await h.api(url,undefined,{as:host});assert.equal(hostSheet.audience,'Host')
  for(const privateValue of ['Private anniversary planning','Private celebration','elena@example.test','+1 415 555 0191']){
   for(const door of [url,'/preshift?date='+f.date,'/api/preshift.pdf?date='+f.date])assert.ok(!(await (await h.request(door,{as:host})).text()).includes(privateValue),privateValue)
  }
  for(const door of ['/preshift?date='+f.date,'/api/preshift.pdf?date='+f.date]){
   const r=await h.request(door,{as:manager});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const text=await r.text()
   for(const value of ['Elena Torres','Anniversary','Shellfish','Window','Ana','Private anniversary planning','unverified'])assert.ok(text.includes(value),value)
   if(door.includes('.pdf')){assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(text,/^%PDF-1.4/)}
  }
  await h.command('guest.profile',{guestId:f.guest.id,vipLevel:'vip',seatingPreference:'Quiet corner'})
  await h.command('booking.status',{bookingId:f.large.id,status:'cancelled'})
  const changed=await h.api(url);assert.ok(Date.parse(changed.generatedAt)>Date.parse(sheet.generatedAt));assert.equal(changed.services[0].bookings.length,1);assert.equal(changed.services[0].sections[0].expectedCovers,2);assert.equal(changed.services[0].bookings[0].vipLevel,'vip')
  // A second service on the same venue-local date is included even when UTC date differs.
  const late=await h.command('service.save',{name:'Late supper',startAt:f.date+'T23:00:00-07:00',endAt:new Date(Date.parse(f.date+'T23:00:00-07:00')+3600000).toISOString(),turnMinutes:30,coverLimit:8});assert.ok((await h.api(url)).services.some(v=>v.name===late.name))
  const otherDate=new Date(Date.parse(f.date+'T12:00:00Z')+86400000).toISOString().slice(0,10);assert.equal((await h.api('/api/preshift?date='+otherDate)).services.length,0)
  await h.api('/api/preshift?date=2026-02-30',undefined,{status:400})
  await h.command('guest.erase',{guestId:f.guest.id,confirm:'ERASE'})
  const erased=await h.api(url),row=erased.services[0].bookings[0];assert.deepEqual(Object.keys(row).sort(),['name','partySize','startAt','tables']);assert.equal(row.name,'Erased guest');assert.equal(row.partySize,2)
  for(const door of [url,'/preshift?date='+f.date,'/api/preshift.pdf?date='+f.date]){
   const text=await (await h.request(door)).text();for(const value of ['Elena Torres','Shellfish','Anniversary','Private celebration','elena@example.test','Wheelchair'])assert.ok(!text.includes(value),value)
  }
  await h.command('team.host',{operatorId:hostId,enabled:false});await h.api(url,undefined,{as:host,status:403})
 }finally{await h.close()}
})

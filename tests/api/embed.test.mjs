import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,service} from './harness.mjs'
const online={minParty:1,maxParty:6,horizonDays:60,leadMinutes:30,sameDayCutoff:'16:00',slotMinutes:15,inquiryAbove:6,blockedStarts:[]}
const host='https://bistro.example',widget=origin=>`/book?embed=1&origin=${encodeURIComponent(origin)}`
const ancestors=r=>r.headers.get('content-security-policy').match(/frame-ancestors ([^;,]+)/)[1].trim()
const unframeable=(r,label)=>{assert.equal(r.headers.get('x-frame-options'),'DENY',label);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/,label)}

test('BOOK-002: the owner alone keeps an exact audited https allowlist that only the /book widget names in frame-ancestors; staff pages stay unframeable',async()=>{
 const h=await installation();try{
  await service(h)
  for(const bad of ['http://bistro.example','https://*.bistro.example','https://localhost','https://app.localhost:8443','https://127.0.0.1:8443','https://[::1]','https://bistro.example/book','https://bistro.example?from=menu','https://user:pw@bistro.example','bistro.example'])
   await h.command('embed.origins',{origins:[bad]},{status:400})
  const manager=await h.signIn('manager@example.test','admin'),member=await h.signIn('reader@example.test')
  assert.match((await h.api('/api/commands',{command:'embed.origins',payload:{origins:[host]}},{as:manager,status:403})).error,/owner/)
  await h.api('/api/commands',{command:'embed.origins',payload:{origins:[host]}},{as:member,status:403})
  const key=(await h.api('/api/agent-keys',{name:'Website helper'},{status:201})).result.key
  await h.api('/api/commands',{command:'embed.origins',payload:{origins:[host]}},{as:'',headers:{authorization:`Bearer ${key}`},status:403})
  let r=await h.request(widget(host),{as:''});unframeable(r,'no website may frame booking before the owner allows one')
  const {state:before,actor}=await h.api('/api/state');assert.equal(before.embed,undefined)
  assert.deepEqual((await h.command('embed.origins',{origins:['https://Bistro.example/','https://www.bistro.example:8443',host]})).origins,[host,'https://www.bistro.example:8443'])
  await h.command('embed.origins',{origins:[host,'https://www.bistro.example:8443']},{status:409})
  r=await h.request(widget(host),{as:''});const page=await r.text()
  assert.equal(r.status,200);assert.equal(ancestors(r),`${host} https://www.bistro.example:8443`);assert.equal(r.headers.get('x-frame-options'),null)
  assert.match(page,/data-embed-origin="https:\/\/bistro.example"/);assert.match(page,/Booking happens only when you press Confirm booking/)
  assert.doesNotMatch(page,/Staff sign in|href="\/app"|data-editor/,'the widget carries no staff link or data')
  r=await h.request(widget('https://other.example'),{as:''});const refused=await r.text()
  assert.match(refused,/Booking is not available here/);assert.doesNotMatch(refused,/placemat\.js|data-embed-origin/)
  unframeable(await h.request('/book',{as:''}),'the standalone page is not the widget')
  unframeable(await h.request('/app'),'staff app');unframeable(await h.request('/app',{as:''}),'signed-out staff redirect')
  for(const path of ['/queue','/inquiry','/api/state','/api/public/services','/auth/session'])unframeable(await h.request(path),path)
  let audit=(await h.api('/api/state')).state.audit.filter(a=>a.action==='embed.origins')
  assert.equal(audit.length,1);assert.equal(audit[0].actor,actor.id);assert.ok(Date.parse(audit[0].at)<=Date.now())
  assert.deepEqual([audit[0].subject,audit[0].before,audit[0].after],['book',{origins:[]},{origins:[host,'https://www.bistro.example:8443']}])
  await h.command('embed.origins',{origins:[]})
  unframeable(await h.request(widget(host),{as:''}),'removing every origin closes the widget to frames')
  audit=(await h.api('/api/state')).state.audit.filter(a=>a.action==='embed.origins');assert.deepEqual(audit.map(a=>a.after.origins.length),[2,0])
 }finally{await h.close()}
})

test('BOOK-002 / SERVICE-005: widget and standalone bookings share one ledger with source attribution and disclosed policy; public widget bookings never override pacing',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
  for(const label of ['T1','T2'])await h.command('table.save',{label,seats:2,area:'Dining',x:20,y:30})
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),startAt=day+'T23:00:00.000Z'
  const dinner=await h.command('service.save',{name:'Dinner',startAt,endAt:new Date(Date.parse(startAt)+90*60000).toISOString(),turnMinutes:90,coverLimit:8,bookingRules:{online},pacing:{intervalMinutes:15,arrivalCovers:2,arrivalParties:3,concurrentCovers:48,areaArrivalCaps:{}}})
  const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:dinner.id},reason:'Publish dinner for the website widget'});await h.command('proposal.approve',{proposalId:p.id})
  await h.command('embed.origins',{origins:[host]})
  const slots=async()=>(await h.api(`/api/public/search?date=${day}&partySize=2`,undefined,{as:''})).results.filter(s=>s.startAt===startAt&&!s.alternative).length
  assert.equal(await slots(),1)
  const {blockedStarts,...disclosed}=online
  assert.deepEqual((await h.api(`/api/public/search?date=${day}&partySize=2`,undefined,{as:''})).policies,[{serviceId:dinner.id,serviceName:'Dinner',date:day,...disclosed}],'the widget and page disclose the online channel rules before booking')
  const other=await h.api('/api/public/book',publicGuest(dinner,0,{embedOrigin:'https://other.example'}),{as:'',status:400});assert.match(other.error,/not allowed to embed/)
  const booked=(await h.api('/api/public/book',publicGuest(dinner,1,{embedOrigin:host}),{as:'',status:201})).result
  assert.equal(await slots(),0,'the widget booking fills the arrival interval for every public door')
  const refused=await h.api('/api/public/book',publicGuest(dinner,2),{as:'',status:409});assert.match(refused.error,/Arrival interval covers/)
  const override=await h.api('/api/public/book',publicGuest(dinner,3,{embedOrigin:host,pacingReason:'Guest insists',pacingConfirm:'yes',pacingReview:'forged',override:true}),{as:'',status:409})
  assert.match(override.error,/Arrival interval covers/,'a free physical table never lets a public widget booking pass the pacing limit')
  const {state}=await h.api('/api/state')
  assert.deepEqual(state.bookings.map(b=>[b.id,b.source,b.attribution,b.pacingOverride]),[[booked.id,'online',{door:'widget',origin:host},undefined]])
  await h.command('service.pacing',{serviceId:dinner.id,pacing:{intervalMinutes:15,arrivalCovers:12,arrivalParties:3,concurrentCovers:48,areaArrivalCaps:{}}})
  const standalone=(await h.api('/api/public/book',publicGuest(dinner,4),{as:'',status:201})).result
  assert.equal(await slots(),0,'both physical tables are now taken');await h.api('/api/public/book',publicGuest(dinner,5,{embedOrigin:host}),{as:'',status:409})
  assert.deepEqual((await h.api('/api/state')).state.bookings.find(b=>b.id===standalone.id).attribution,{door:'booking-page'})
  const venue=await (await h.request('/api/business-export/venue.csv')).text(),bookings=await (await h.request('/api/business-export/bookings.csv')).text()
  assert.match(venue,/embedOrigins_json/);assert.ok(venue.includes(`[""${host}""]`));assert.match(bookings,/attribution_json/);assert.ok(bookings.includes(`""door"":""widget"",""origin"":""${host}""`))
 }finally{await h.close()}
})

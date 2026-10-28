import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
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

// Fresh random keys each run: what must never reappear in any response, archive or CSV.
const ga4Secret=randomBytes(16).toString('hex'),metaToken=randomBytes(32).toString('hex')
const settings=(ga4={},meta={})=>({ga4:{enabled:true,measurementId:'G-PLACEMAT1',debugMode:true,apiSecret:ga4Secret,...ga4},meta:{enabled:true,datasetId:'123456789012',testEventCode:'TEST4242',accessToken:metaToken,...meta}})
const until=async(check,label)=>{for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,25))}assert.fail(label)}
const quiet=()=>new Promise(r=>setTimeout(r,400))
const guestHeaders={'cf-connecting-ip':'203.0.113.77','user-agent':'Mozilla/5.0 (Placemat analytics guest)'}
// What GA4 and Meta receive for one consented event, field for field (BOOK-008, ct ruling 20 Oct 22:48Z).
function expected(event,visitId,source,{debug=true,test='TEST4242',bookingPage}={}){
 const params={party_size:2,booking_source:source.door,...(source.door==='widget'?{widget_origin:source.origin}:{})}
 const ga4={url:`https://www.google-analytics.com/mp/collect?measurement_id=G-PLACEMAT1&api_secret=${ga4Secret}`,body:{client_id:visitId,events:[{name:{search:'search','checkout-start':'begin_checkout',booking:'placemat_booking'}[event],params:{...params,...(debug?{debug_mode:true,engagement_time_msec:1}:{})}}]}}
 const meta={url:`https://graph.facebook.com/v26.0/123456789012/events?access_token=${metaToken}`,body:{data:[{event_name:{search:'Search','checkout-start':'InitiateCheckout',booking:'Schedule'}[event],event_time:'now',action_source:'website',event_source_url:source.door==='widget'?source.origin:bookingPage,user_data:{client_user_agent:guestHeaders['user-agent'],external_id:[createHash('sha256').update(visitId).digest('hex')]},custom_data:params}],...(test?{test_event_code:test}:{})}}
 return [ga4,meta]
}
const received=rows=>rows.map(({url,method,body})=>{assert.equal(method,'POST');const copy=structuredClone(body);for(const e of copy.data??[]){assert.ok(Math.abs(e.event_time-Date.now()/1000)<120,'event_time is the send time in Unix seconds');e.event_time='now'}return {url,body:copy}})
const byWire=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))

test('BOOK-008 / BOOK-009 / PRIVACY-001 / AUDIT-001: owner-only write-only analytics keys; consented search, checkout start and booking reach GA4 and Meta test mode with exactly the listed fields; no answer sends nothing; a failing provider never blocks or delays a booking',async()=>{
 const h=await installation();try{
  const {service:dinner}=await service(h);await h.command('embed.origins',{origins:[host]})
  const manager=await h.signIn('manager@example.test','admin'),member=await h.signIn('reader@example.test')
  assert.match((await h.api('/api/commands',{command:'analytics.settings',payload:settings()},{as:manager,status:403})).error,/owner/)
  await h.api('/api/commands',{command:'analytics.settings',payload:settings()},{as:member,status:403})
  const key=(await h.api('/api/agent-keys',{name:'Analytics helper'},{status:201})).result.key
  await h.api('/api/commands',{command:'analytics.settings',payload:settings()},{as:'',headers:{authorization:`Bearer ${key}`},status:403})
  await h.command('analytics.settings',settings({apiSecret:''}),{status:400})
  await h.command('analytics.settings',settings({measurementId:'UA-12345-1'}),{status:400})
  await h.command('analytics.settings',settings({},{datasetId:'pixel'}),{status:400})
  assert.deepEqual((await h.api('/api/public/services',undefined,{as:''})).analytics,[],'nothing is offered before the owner switches a provider on')
  await h.api('/api/public/analytics',{event:'search',visitId:randomUUID(),partySize:2},{as:'',status:202})
  const {actor}=await h.api('/api/state')
  assert.deepEqual((await h.command('analytics.settings',settings())).keys,['ga4','meta'])
  await h.command('analytics.settings',settings({apiSecret:''},{accessToken:''}),{status:409})
  for(const as of [h.cookie,manager,member]){const body=await (await h.request('/api/state',{as})).text();assert.ok(!body.includes(ga4Secret)&&!body.includes(metaToken),'no state response returns a saved key')}
  let owner=await h.api('/api/state')
  assert.deepEqual(owner.analytics.keys,['ga4','meta']);assert.equal((await h.api('/api/state',undefined,{as:manager})).analytics,undefined)
  assert.deepEqual(owner.state.analytics,{ga4:{enabled:true,measurementId:'G-PLACEMAT1',debugMode:true},meta:{enabled:true,datasetId:'123456789012',testEventCode:'TEST4242'}})
  let audit=owner.state.audit.filter(a=>a.action==='analytics.settings')
  assert.equal(audit.length,1);assert.equal(audit[0].actor,actor.id);assert.ok(Date.parse(audit[0].at)<=Date.now())
  assert.deepEqual([audit[0].before.ga4.enabled,audit[0].before.meta.enabled,audit[0].after.ga4,audit[0].after.meta],[false,false,{enabled:true,measurementId:'G-PLACEMAT1',debugMode:true,keySaved:true,keyEntered:true},{enabled:true,datasetId:'123456789012',testEventCode:'TEST4242',keySaved:true,keyEntered:true}])
  assert.deepEqual((await h.api('/api/public/services',undefined,{as:''})).analytics,['ga4','meta'],'the public page learns which providers to name, nothing else')
  // No answer (or Decline): the page never creates a visit ID, so a booking sends nothing.
  await h.api('/api/public/book',publicGuest(dinner,0),{as:'',headers:guestHeaders,status:201});await quiet()
  assert.equal(h.analytics.length,0,'no consent, no provider request')
  for(const bad of [{event:'purchase',visitId:randomUUID(),partySize:2},{event:'search',visitId:'visit-1',partySize:2},{event:'search',visitId:randomUUID(),partySize:2,embedOrigin:'https://other.example'}])await h.api('/api/public/analytics',bad,{as:'',status:400})
  assert.equal((await h.request('/api/public/analytics',{as:''})).status,405)
  // Accept in the widget: search, checkout start and the completed booking, each to both providers in their test modes.
  const visitId=randomUUID(),widget={door:'widget',origin:host},bookingPage=h.origin+'/book'
  for(const event of ['search','checkout-start'])assert.deepEqual(await h.api('/api/public/analytics',{event,visitId,partySize:2,embedOrigin:host},{as:'',headers:guestHeaders,status:202}),{providers:['ga4','meta']})
  const guest=publicGuest(dinner,1,{embedOrigin:host,analytics:{visitId}}),booked=(await h.api('/api/public/book',guest,{as:'',headers:guestHeaders,status:201})).result
  await until(()=>h.analytics.length===6,'three events reach two providers')
  assert.deepEqual(received(h.analytics).sort(byWire),['search','checkout-start','booking'].flatMap(e=>expected(e,visitId,widget)).sort(byWire),'exactly the listed fields, with GA4 debug_mode and the Meta test_event_code')
  const wire=JSON.stringify(h.analytics)
  for(const value of [guest.name,guest.email,booked.id,booked.startAt,booked.startAt.slice(0,16),'203.0.113.77',h.cookie.split('=')[1]])assert.ok(!wire.includes(value),`no ${value} in any provider request`)
  assert.ok(h.analytics.every(r=>!('cookie' in r.headers)&&Object.values(r.headers).every(v=>!v.includes('203.0.113.77'))))
  await until(async()=>(await h.api('/api/state')).analytics.results.length===2,'provider answers recorded')
  assert.deepEqual((await h.api('/api/state')).analytics.results.map(r=>[r.provider,r.event,r.status,r.detail]),[['ga4','placemat_booking',204,'Sent. GA4 does not confirm events; check DebugView.'],['meta','Schedule',200,'Meta received 1 event.']])
  // The standalone page attributes the booking page; switching test modes off removes debug_mode and test_event_code.
  await h.command('analytics.settings',settings({debugMode:false,apiSecret:''},{testEventCode:'',accessToken:''}))
  const pageVisit=randomUUID();h.analytics.length=0
  await h.api('/api/public/book',publicGuest(dinner,2,{analytics:{visitId:pageVisit}}),{as:'',headers:guestHeaders,status:201})
  await until(()=>h.analytics.length===2,'booking-page event reaches both providers')
  assert.deepEqual(received(h.analytics).sort(byWire),expected('booking',pageVisit,{door:'booking-page'},{debug:false,test:'',bookingPage}).sort(byWire))
  // The visit ID never lands on the booking, in state, guests, the backup or any CSV; keys never leave either.
  owner=await h.api('/api/state');let stored=JSON.stringify(owner)+JSON.stringify(await h.api('/api/backup'))
  for(const kind of owner.businessExportKinds)stored+=await (await h.request(`/api/business-export/${kind}.csv`)).text()
  for(const value of [visitId,pageVisit,ga4Secret,metaToken])assert.ok(!stored.includes(value),'nothing stored or exported carries a visit ID or key')
  // A provider that hangs and then fails never blocks or delays the guest's booking.
  let release;const held=new Promise(r=>release=r);h.analytics.length=0
  h.answerAnalytics(async()=>{await held;return new Response('provider down',{status:503})})
  const late=await Promise.race([h.api('/api/public/book',publicGuest(dinner,3,{analytics:{visitId:randomUUID()}}),{as:'',headers:guestHeaders,status:201}),new Promise((_,reject)=>setTimeout(()=>reject(Error('the booking waited for a provider')),8000))])
  assert.ok(late.result.id);await until(()=>h.analytics.length===2,'provider requests are still held after the booking answered')
  release();await until(async()=>(await h.api('/api/state')).analytics.results.every(r=>r.status===503),'failures recorded for the owner')
  assert.deepEqual((await h.api('/api/state')).analytics.results.map(r=>r.detail),['GA4 refused the request.','Meta refused the request.'])
  // Switching off is audited and stops every event; the saved keys stay write-only until the owner replaces them.
  h.analytics.length=0;await h.command('analytics.settings',{ga4:{enabled:false,measurementId:'G-PLACEMAT1',debugMode:false},meta:{enabled:false,datasetId:'123456789012',testEventCode:''}})
  owner=await h.api('/api/state');assert.deepEqual(owner.analytics.keys,['ga4','meta'])
  audit=owner.state.audit.filter(a=>a.action==='analytics.settings');assert.deepEqual(audit.map(a=>[a.actor,a.after.ga4.enabled,a.after.meta.enabled,a.after.ga4.keySaved]),[[actor.id,true,true,true],[actor.id,true,true,true],[actor.id,false,false,true]])
  assert.deepEqual((await h.api('/api/public/services',undefined,{as:''})).analytics,[])
  assert.deepEqual(await h.api('/api/public/analytics',{event:'search',visitId:randomUUID(),partySize:2},{as:'',status:202}),{providers:[]});await quiet();assert.equal(h.analytics.length,0)
  assert.ok(!JSON.stringify(audit).includes(ga4Secret)&&!JSON.stringify(audit).includes(metaToken),'the audit never holds a key')
 }finally{await h.close()}
})

test('BOOK-009 / AUDIT-001: only the owner removes a saved GA4 or Meta key; the removal is audited with actor and time and never the key; a provider left on without a key sends nothing until a new key is entered (ct 21 Oct 00:03Z)',async()=>{
 const h=await installation();try{
  const {service:dinner}=await service(h);await h.command('analytics.settings',settings())
  const manager=await h.signIn('manager@example.test','admin'),member=await h.signIn('reader@example.test')
  const key=(await h.api('/api/agent-keys',{name:'Analytics helper'},{status:201})).result.key
  const remove=provider=>({command:'analytics.remove-key',payload:{provider}})
  assert.match((await h.api('/api/commands',remove('ga4'),{as:manager,status:403})).error,/owner/,'a manager cannot remove a key')
  await h.api('/api/commands',remove('ga4'),{as:member,status:403})
  await h.api('/api/commands',remove('ga4'),{as:'',headers:{authorization:`Bearer ${key}`},status:403})
  await h.command('analytics.remove-key',{provider:'ga5'},{status:400})
  assert.deepEqual((await h.api('/api/state')).analytics.keys,['ga4','meta'],'refused removals leave both keys saved')
  const {actor}=await h.api('/api/state'),removed=await h.command('analytics.remove-key',{provider:'ga4'})
  assert.deepEqual([removed.provider,removed.keys],['ga4',['meta']])
  assert.match((await h.api('/api/commands',remove('ga4'),{status:409})).error,/No GA4 API secret is saved/)
  let owner=await h.api('/api/state')
  assert.deepEqual(owner.analytics.keys,['meta'],'the GA4 API secret is deleted')
  assert.deepEqual(owner.state.analytics.ga4,{enabled:true,measurementId:'G-PLACEMAT1',debugMode:true},'GA4 stays switched on with its settings')
  let audit=owner.state.audit.filter(a=>a.action==='analytics.remove-key')
  assert.equal(audit.length,1);assert.equal(audit[0].actor,actor.id);assert.ok(Math.abs(Date.parse(audit[0].at)-Date.now())<60000,'removal time recorded')
  assert.deepEqual([audit[0].subject,audit[0].before.ga4.keySaved,audit[0].after.ga4,audit[0].after.meta.keySaved],['ga4',true,{enabled:true,measurementId:'G-PLACEMAT1',debugMode:true,keySaved:false,keyRemoved:true},true])
  // On without a key: the guest is asked only about Meta, and GA4 receives nothing from search or a completed booking.
  assert.deepEqual((await h.api('/api/public/services',undefined,{as:''})).analytics,['meta'])
  const visitId=randomUUID()
  assert.deepEqual(await h.api('/api/public/analytics',{event:'search',visitId,partySize:2},{as:'',headers:guestHeaders,status:202}),{providers:['meta']})
  await h.api('/api/public/book',publicGuest(dinner,0,{analytics:{visitId}}),{as:'',headers:guestHeaders,status:201})
  await until(()=>h.analytics.length===2,'search and booking reach Meta');await quiet()
  assert.deepEqual(h.analytics.map(r=>new URL(r.url).hostname),['graph.facebook.com','graph.facebook.com'],'nothing reaches GA4 without its key')
  // Settings saves never bring a key back: switching GA4 on again (or keeping it on) needs a newly entered key.
  assert.match((await h.api('/api/commands',{command:'analytics.settings',payload:settings({apiSecret:''},{accessToken:''})},{status:400})).error,/Enter the GA4 API secret/)
  await h.command('analytics.remove-key',{provider:'meta'});h.analytics.length=0
  assert.deepEqual((await h.api('/api/public/services',undefined,{as:''})).analytics,[],'no consent question while no provider holds a key')
  assert.deepEqual(await h.api('/api/public/analytics',{event:'search',visitId:randomUUID(),partySize:2},{as:'',status:202}),{providers:[]})
  await h.api('/api/public/book',publicGuest(dinner,1,{analytics:{visitId:randomUUID()}}),{as:'',headers:guestHeaders,status:201});await quiet();assert.equal(h.analytics.length,0)
  owner=await h.api('/api/state');audit=owner.state.audit.filter(a=>a.action==='analytics.remove-key')
  assert.deepEqual(audit.map(a=>[a.actor,a.subject,a.after.ga4.keySaved,a.after.meta.keySaved]),[[actor.id,'ga4',false,true],[actor.id,'meta',false,false]])
  let stored=JSON.stringify(owner)+JSON.stringify(await h.api('/api/backup'))
  for(const kind of owner.businessExportKinds)stored+=await (await h.request(`/api/business-export/${kind}.csv`)).text()
  assert.ok(stored.includes('analytics.remove-key'),'the removals are in the exported history')
  assert.ok(!stored.includes(ga4Secret)&&!stored.includes(metaToken),'no state, audit, backup or CSV holds a removed key')
  // A newly entered key resumes that provider and is audited as entered.
  const fresh=randomBytes(16).toString('hex')
  await h.command('analytics.settings',settings({apiSecret:fresh},{enabled:false,accessToken:''}))
  owner=await h.api('/api/state');assert.deepEqual(owner.analytics.keys,['ga4']);assert.deepEqual((await h.api('/api/public/services',undefined,{as:''})).analytics,['ga4'])
  assert.deepEqual(owner.state.audit.at(-1).after.ga4,{enabled:true,measurementId:'G-PLACEMAT1',debugMode:true,keySaved:true,keyEntered:true});assert.ok(!JSON.stringify(owner).includes(fresh))
 }finally{await h.close()}
})

test('BOOK-009 / DATA-001 / DATA-003: backups and CSVs leave the analytics keys out by name; a restored installation sends nothing until the owner enters them again',async()=>{
 const h=await installation(),restored=await installation();try{
  await service(h);await h.command('analytics.settings',settings())
  const archive=await h.api('/api/backup'),wire=JSON.stringify(archive)
  assert.ok(!wire.includes(ga4Secret)&&!wire.includes(metaToken),'the archive carries neither key');assert.ok(archive[0].excludedTables.includes('pm_analytics_keys'),'the archive manifest names the excluded key table')
  const venue=await (await h.request('/api/business-export/venue.csv')).text()
  assert.match(venue,/analytics_json/);assert.ok(venue.includes('""measurementId"":""G-PLACEMAT1""')&&!venue.includes(ga4Secret)&&!venue.includes(metaToken))
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  const copy=await restored.api('/api/state')
  assert.deepEqual(copy.state.analytics,(await h.api('/api/state')).state.analytics,'settings and test modes come back');assert.deepEqual(copy.analytics.keys,[],'keys do not')
  assert.deepEqual((await restored.api('/api/public/services',undefined,{as:''})).analytics,[],'no consent question until the keys are entered again')
  assert.deepEqual(await restored.api('/api/public/analytics',{event:'search',visitId:randomUUID(),partySize:2},{as:'',status:202}),{providers:[]})
  await quiet();assert.equal(restored.analytics.length,0)
  await restored.command('analytics.settings',settings())
  assert.deepEqual((await restored.api('/api/public/services',undefined,{as:''})).analytics,['ga4','meta'],'re-entering the keys resumes analytics')
 }finally{await h.close();await restored.close()}
})

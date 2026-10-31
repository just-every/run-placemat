import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac,randomUUID} from 'node:crypto'
import {installation,service,publicGuest} from './harness.mjs'

test('Stored event incompatibility is visible to the owner, refuses reads and sends, and supported recovery preserves signed history',async()=>{
 const delivered=[];let h
 h=await installation({mailEdge:async request=>{
  if(new URL(request.url).hostname==='api.resend.com'){
   h.messages.push(await request.json())
   return Response.json({id:'synthetic-placemat-schema-mail'})
  }
  assert.equal(new URL(request.url).origin,'https://subscriber.example.test')
  delivered.push({body:await request.text(),signature:request.headers.get('x-placemat-signature')})
  return new Response(null,{status:204})
 }})
 try{
  const key=await h.api('/api/integration-keys',{name:'Synthetic schema subscriber',scopes:['events:read'],expiresAt:new Date(Date.now()+86400000).toISOString(),acknowledged:true},{status:201})
  const opts={as:'',headers:{authorization:'Bearer '+key.key}}
  const sub=await h.api('/api/integration-subscriptions',{keyId:key.id,url:'https://subscriber.example.test/events',types:['reservation.created'],acknowledged:true})
  const {service:s}=await service(h)
  await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})
  const original=(await h.api('/api/v1/events',undefined,opts)).items[0]
  const stored=await h.db.prepare('SELECT id,schema_version,payload FROM pm_integration_events WHERE id=?').bind(original.id).first()
  const endpoint='/api/integration-subscriptions/'+sub.id+'/deliver'
  const send=(requestId,extra={})=>h.api(endpoint,{eventId:original.id,requestId,acknowledged:true},extra)
  await send('synthetic-schema-delivery-1')
  assert.equal(delivered[0].body,stored.payload)
  const manager=await h.signIn('schema-manager@example.test','admin')
  const report='/api/integration-subscriptions/schema'
  await h.api(report,undefined,{as:'',status:401})
  await h.api(report,undefined,{as:manager,status:403})
  await h.api(report,undefined,{...opts,status:401})
  assert.equal((await h.api(report)).events.find(event=>event.id===original.id).status,'compatible')

  const cases=[
   {schema:3,payload:JSON.stringify({...original,schemaVersion:3}),status:'unsupported'},
   {schema:1,payload:JSON.stringify({...original,schemaVersion:2}),status:'invalid'},
   {schema:1,payload:JSON.stringify({...original,reservation:{...original.reservation,email:'private-schema@example.test'}}),status:'invalid'},
   {schema:1,payload:JSON.stringify({...original,reservation:{id:original.reservation.id}}),status:'invalid'},
   {schema:1,payload:'{"reservation":{"email":"private-schema@example.test"},'+stored.payload.slice(1),status:'invalid'},
   {schema:1,payload:'{',status:'invalid'},
  ]
  for(const fixture of cases){
   // Fixtures represent incompatible storage from a different application release or damaged storage.
   await h.db.prepare('UPDATE pm_integration_events SET schema_version=?,payload=? WHERE id=?').bind(fixture.schema,fixture.payload,original.id).run()
   const visible=await h.api(report),event=visible.events.find(event=>event.id===original.id)
   assert.equal(event.status,fixture.status)
   assert.ok(event.reason.length>0)
   assert.ok(!JSON.stringify(visible).includes('private-schema@example.test'))
   const refused=await h.api('/api/v1/events',undefined,{...opts,status:409})
   assert.ok(refused.error.includes(original.id))
   await send('synthetic-schema-blocked-attempt',{status:409})
   assert.equal(delivered.length,1)
   const history=await h.api('/api/integration-subscriptions')
   assert.equal(history.attempts.length,1,'Invalid envelopes cannot create a pending delivery')
   const replay=await send('synthetic-schema-delivery-1')
   assert.equal(replay.replayed,true,'Historical attempts remain inspectable without rewriting or resending')
  }

  // Returning the exact original stored envelope models recovery from the trusted original,
  // rather than fabricating a new event shape or filling missing reservation facts.
  await h.db.prepare('UPDATE pm_integration_events SET schema_version=?,payload=? WHERE id=?').bind(stored.schema_version,stored.payload,original.id).run()
  assert.equal((await h.api(report)).events.find(event=>event.id===original.id).status,'compatible')
  assert.deepEqual((await h.api('/api/v1/events',undefined,opts)).items,[original])
  assert.equal(delivered.length,1,'Supported storage recovery alone never sends')
  await send('synthetic-schema-delivery-2')
  assert.equal(delivered.length,2)
  for(const message of delivered){
   assert.equal(message.body,stored.payload)
   const parts=Object.fromEntries(message.signature.split(',').map(pair=>pair.split('=')))
   assert.equal(parts.v1,createHmac('sha256',sub.signingSecret).update(parts.t+'.'+message.body).digest('hex'))
  }
 }finally{await h.close()}
})


test('A persisted v1 installation upgrades additively with pinned schemas, original signed bytes and inert delivery history',async()=>{
 const delivered=[];let failing=true
 const h=await installation({legacyIntegration:true,mailEdge:async request=>{
  assert.equal(new URL(request.url).origin,'https://subscriber.example.test')
  delivered.push({body:await request.text(),signature:request.headers.get('x-placemat-signature'),schema:request.headers.get('x-placemat-schema-version'),eventId:request.headers.get('x-placemat-event-id')})
  return new Response(null,{status:failing?503:204})
 }})
 try{
  const key=await h.api('/api/integration-keys',{name:'Synthetic upgrade subscriber',scopes:['events:read'],expiresAt:new Date(Date.now()+86400000).toISOString(),acknowledged:true},{status:201})
  const opts={as:'',headers:{authorization:'Bearer '+key.key}}
  const input={keyId:key.id,url:'https://subscriber.example.test/events',types:['reservation.created','reservation.changed','reservation.cancelled'],acknowledged:true}
  const legacy=await h.api('/api/integration-subscriptions',input)
  const endpoint=sub=>'/api/integration-subscriptions/'+sub.id+'/deliver'
  const send=(sub,eventId,requestId,extra={})=>h.api(endpoint(sub),{eventId,requestId,acknowledged:true,...extra})
  const {service:s}=await service(h),ownerDoor='/api/v1/owner-reservations'
  const created=await h.api(ownerDoor,{requestId:randomUUID(),action:'create',payload:{serviceId:s.id,startAt:s.startAt,partySize:2,name:'Synthetic upgrade guest'}})
  const state=await h.api('/api/state')
  await h.api(ownerDoor,{requestId:randomUUID(),action:'change',payload:{bookingId:created.result.id,startAt:new Date(Date.parse(s.startAt)+15*60000).toISOString(),partySize:2,version:state.version}})
  const oldPage=await h.api('/api/v1/events?limit=1',undefined,opts)
  const before=(await h.db.prepare('SELECT * FROM pm_integration_events ORDER BY sequence').all()).results
  assert.equal(before.length,2)
  await send(legacy,before[0].id,'synthetic-placemat-old-failed')
  failing=false
  await send(legacy,before[1].id,'synthetic-placemat-old-success')
  const attempts=(await h.db.prepare('SELECT * FROM pm_integration_deliveries ORDER BY id').all()).results
  assert.deepEqual(attempts.map(attempt=>attempt.status),['failed','succeeded'])
  const oldSubscriptions=(await h.db.prepare('SELECT * FROM pm_integration_subscriptions').all()).results
  assert.equal(delivered.length,2)

  // Dispose workerd and reopen the same persisted D1 with the upgraded application.
  // The harness applies the appended migration; it does not replace any payload.
  await h.upgrade()
  assert.equal(delivered.length,2,'Installing a schema cannot send or retry')
  assert.deepEqual((await h.db.prepare('SELECT * FROM pm_integration_events ORDER BY sequence').all()).results,before)
  assert.deepEqual((await h.db.prepare('SELECT * FROM pm_integration_deliveries ORDER BY id').all()).results,attempts.map(attempt=>({...attempt,schema_version:1})))
  assert.deepEqual((await h.db.prepare('SELECT * FROM pm_integration_subscriptions').all()).results,oldSubscriptions.map(sub=>({...sub,schema_version:1})))
  const continuation=await h.api('/api/v1/events?limit=1&cursor='+encodeURIComponent(oldPage.nextCursor),undefined,opts)
  assert.equal(continuation.items[0].id,before[1].id,'Existing v1 cursors survive the upgrade')
  assert.equal(continuation.nextCursor,null)
  assert.deepEqual((await h.api('/api/v1/events',undefined,opts)).items,before.map(row=>JSON.parse(row.payload)))
  const v2first=await h.api('/api/v2/events?limit=1',undefined,opts)
  assert.equal(v2first.version,'2')
  assert.equal((await h.request('/api/v2/events',{as:'',headers:opts.headers})).headers.get('x-placemat-api-version'),'2')
  const v2last=await h.api('/api/v2/events?limit=1&cursor='+encodeURIComponent(v2first.nextCursor),undefined,opts)
  assert.equal(v2last.nextCursor,null)
  assert.deepEqual([...v2first.items,...v2last.items].map(event=>event.id),before.map(row=>row.id))
  for(const [i,event] of [...v2first.items,...v2last.items].entries()){
   assert.deepEqual(event,{id:before[i].id,type:before[i].type,schemaVersion:2,createdAt:before[i].created_at,data:{reservation:JSON.parse(before[i].payload).reservation}})
  }
  await h.api('/api/v1/events?cursor='+encodeURIComponent(v2first.nextCursor),undefined,{...opts,status:400})
  await h.api('/api/v2/events?cursor='+encodeURIComponent(oldPage.nextCursor),undefined,{...opts,status:400})
  await h.api('/api/v3/events',undefined,{...opts,status:404})
  for(const schemaVersion of [0,3,'2',null,{}])await h.api('/api/integration-subscriptions',{...input,schemaVersion},{status:400})
  const sub=await h.api('/api/integration-subscriptions',{...input,schemaVersion:2})
  assert.equal(sub.schemaVersion,2)
  assert.equal((await h.api('/api/integration-subscriptions')).subscriptions.find(s=>s.id===legacy.id).schemaVersion,1)
  assert.equal(delivered.length,2,'Adding a pinned subscriber does not deliver existing events')
  const saved=await send(legacy,before[0].id,'synthetic-placemat-old-failed')
  assert.equal(saved.replayed,true);assert.equal(saved.status,'failed');assert.equal(saved.httpStatus,503)
  assert.equal(delivered.length,2,'An old failed request remains failed without retry')
  await h.api(endpoint(sub),{eventId:before[0].id,requestId:'synthetic-placemat-conflict',schemaVersion:1,acknowledged:true},{status:409})
  await h.api(endpoint(sub),{eventId:before[0].id,requestId:'synthetic-placemat-unknown',schemaVersion:3,acknowledged:true},{status:400})
  assert.equal((await h.api('/api/integration-subscriptions')).attempts.length,2)

  failing=true
  const failed=await send(sub,before[0].id,'synthetic-placemat-v2-failed')
  assert.equal(failed.status,'failed');assert.equal(failed.schemaVersion,2)
  failing=false
  const recovered=await send(sub,before[0].id,'synthetic-placemat-v2-replay')
  assert.equal(recovered.status,'succeeded')
  assert.equal((await send(sub,before[0].id,'synthetic-placemat-v2-replay')).replayed,true)
  await h.api(endpoint(sub),{eventId:before[1].id,requestId:'synthetic-placemat-v2-replay',acknowledged:true},{status:409})
  await h.api(endpoint(sub),{eventId:before[0].id,requestId:'synthetic-placemat-v2-replay',schemaVersion:1,acknowledged:true},{status:409})
  await send(legacy,before[0].id,'synthetic-placemat-v1-replay')
  assert.equal(delivered.length,5)
  for(const message of delivered){
   const stored=message.schema==='1'?before.find(row=>row.id===message.eventId).payload:(await h.db.prepare('SELECT payload FROM pm_integration_event_versions WHERE event_id=?').bind(message.eventId).first()).payload
   assert.equal(message.body,stored,'HMAC covers the stored bytes, not a reconstructed read response')
   const secret=message.schema==='1'?legacy.signingSecret:sub.signingSecret
   const parts=Object.fromEntries(message.signature.split(',').map(pair=>pair.split('=')))
   assert.equal(parts.v1,createHmac('sha256',secret).update(parts.t+'.'+stored).digest('hex'))
  }

  const create={requestId:randomUUID(),action:'create',payload:{serviceId:s.id,startAt:s.startAt,partySize:2,name:'Synthetic upgraded guest'}}
  const concurrent=await Promise.all([h.api(ownerDoor,create),h.api(ownerDoor,create)])
  assert.equal(concurrent.filter(result=>result.replayed).length,1)
  const booking=concurrent[0].result,latest=await h.api('/api/state')
  const change={requestId:randomUUID(),action:'change',payload:{bookingId:booking.id,startAt:new Date(Date.parse(s.startAt)+30*60000).toISOString(),partySize:2,version:latest.version}}
  await h.api(ownerDoor,change);assert.equal((await h.api(ownerDoor,change)).replayed,true)
  const cancel={requestId:randomUUID(),action:'cancel',payload:{bookingId:booking.id,status:'cancelled',reason:'Synthetic reviewed cancellation'}}
  await h.api(ownerDoor,cancel);assert.equal((await h.api(ownerDoor,cancel)).replayed,true)
  for(const version of [1,2]){
   const events=(await h.api('/api/v'+version+'/events',undefined,opts)).items
   assert.equal(events.length,5,'One logical event per committed mutation in each schema')
   assert.deepEqual(events.slice(2).map(event=>event.type),['reservation.created','reservation.changed','reservation.cancelled'])
   assert.ok(events.every(event=>event.schemaVersion===version))
  }
  assert.equal(delivered.length,5,'Neither mutations nor stable-request replay deliver automatically')
  assert.deepEqual((await h.db.prepare('SELECT * FROM pm_integration_events WHERE sequence<=2 ORDER BY sequence').all()).results,before)

  const v2row=await h.db.prepare('SELECT payload FROM pm_integration_event_versions WHERE event_id=?').bind(before[0].id).first()
  const valid=JSON.parse(v2row.payload)
  for(const damaged of [
   {...valid,schemaVersion:3},
   {...valid,data:{reservation:{...valid.data.reservation,partySize:9}}},
   {...valid,data:{reservation:{...valid.data.reservation,privateNote:'synthetic-placemat-private'}}},
   {...valid,id:before[1].id},
  ]){
   await h.db.prepare('UPDATE pm_integration_event_versions SET payload=? WHERE event_id=?').bind(JSON.stringify(damaged),before[0].id).run()
   const refusal=await h.api('/api/v2/events',undefined,{...opts,status:409})
   assert.equal(refusal.items,undefined);assert.equal(refusal.nextCursor,undefined)
   await h.api(endpoint(sub),{eventId:before[0].id,requestId:'synthetic-placemat-damaged',acknowledged:true},{status:409})
   const report=await h.api('/api/integration-subscriptions/schema')
   assert.equal(report.events[0].representations.find(item=>item.schemaVersion===2).status,'invalid')
   assert.ok(!JSON.stringify(report).includes('synthetic-placemat-private'))
   assert.equal(delivered.length,5)
  }
  await h.db.prepare('UPDATE pm_integration_event_versions SET payload=? WHERE event_id=?').bind(v2row.payload,before[0].id).run()

  const archive=await h.api('/api/backup')
  const serialized=JSON.stringify(archive)
  for(const secret of [key.key,legacy.signingSecret,sub.signingSecret,sub.id,before[0].id])assert.ok(!serialized.includes(secret))
  const target=await installation()
  try{
   await target.api('/api/restore',{archive,confirm:'RESTORE'})
   assert.equal((await target.api('/api/integration-subscriptions')).subscriptions.length,0)
   assert.equal((await target.api('/api/integration-subscriptions')).attempts.length,0)
   await target.api('/api/v2/events',undefined,{...opts,status:401})
   const restoredKey=await target.api('/api/integration-keys',{name:'Synthetic restored reader',scopes:['events:read'],expiresAt:new Date(Date.now()+86400000).toISOString(),acknowledged:true},{status:201})
   assert.deepEqual((await target.api('/api/v2/events',undefined,{as:'',headers:{authorization:'Bearer '+restoredKey.key}})).items,[])
  }finally{await target.close()}
  await h.api('/api/integration-subscriptions/'+sub.id+'/revoke',{acknowledged:true})
  await h.api(endpoint(sub),{eventId:before[0].id,requestId:'synthetic-placemat-v2-replay',acknowledged:true},{status:403})
  assert.equal((await h.api('/api/v2/events',undefined,opts)).items.length,5,'Subscription revocation does not revoke separate polling authority')
  await h.api('/api/integration-keys/'+key.id+'/revoke',{})
  await h.api('/api/v1/events?cursor='+encodeURIComponent(oldPage.nextCursor),undefined,{...opts,status:401})
  await h.api('/api/v2/events?cursor='+encodeURIComponent(v2first.nextCursor),undefined,{...opts,status:401})
  await h.api(endpoint(legacy),{eventId:before[0].id,requestId:'synthetic-placemat-old-failed',acknowledged:true},{status:403})
  assert.equal(delivered.length,5)
 }finally{await h.close()}
})

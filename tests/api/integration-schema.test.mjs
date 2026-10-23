import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
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
   {schema:2,payload:JSON.stringify({...original,schemaVersion:2}),status:'unsupported'},
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

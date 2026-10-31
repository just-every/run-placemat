import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation,service} from './harness.mjs'

test('Native owner reservation mutations commit one anonymous receipt per request through creation, change and cancellation',async()=>{
 const h=await installation()
 try{
  const endpoint='/api/v1/owner-reservations',{service:s}=await service(h)
  const payload={serviceId:s.id,startAt:s.startAt,partySize:2,name:'Synthetic Owner API Guest',email:'owner-reservation@example.test'}
  const create={requestId:randomUUID(),action:'create',payload}
  const manager=await h.signIn('reservation-api-manager@example.test','admin')
  const reader=await h.signIn('reservation-api-reader@example.test')
  const key=await h.api('/api/integration-keys',{name:'Synthetic reservation read key',scopes:['events:read'],expiresAt:new Date(Date.now()+86400000).toISOString(),acknowledged:true},{status:201})
  const opts={as:'',headers:{authorization:'Bearer '+key.key}}
  for(const [as,status] of [['',401],[manager,403],[reader,403]])await h.api(endpoint,create,{as,status})
  await h.api(endpoint,create,{...opts,status:401})
  await h.api(endpoint,create,{headers:{origin:'https://other.example.test'},status:403})
  await h.api(endpoint,undefined,{status:405})
  await h.api(endpoint,{...create,requestId:'invalid-request'},{status:400})
  await h.api(endpoint,{...create,payload:{...payload,pacingConfirm:'yes'}},{status:400})
  assert.equal((await h.api('/api/state')).state.bookings.length,0)

  const results=await Promise.all([h.api(endpoint,create),h.api(endpoint,create)])
  assert.equal(results.filter(result=>result.replayed===false).length,1)
  assert.equal(results.filter(result=>result.replayed===true).length,1)
  const created=results[0].result
  assert.deepEqual(results[1].result,created)
  assert.equal(created.status,'booked')
  assert.ok(!JSON.stringify(results).includes(payload.email)&&!JSON.stringify(results).includes(payload.name))
  assert.equal(created.guestId,undefined)
  const equivalent=await h.api(endpoint,{action:'create',payload:{email:' OWNER-RESERVATION@EXAMPLE.TEST ',name:' Synthetic Owner API Guest ',partySize:'2',startAt:new Date(s.startAt).toISOString(),serviceId:s.id},requestId:create.requestId.toUpperCase()})
  assert.equal(equivalent.replayed,true)
  await h.api(endpoint,{...create,payload:{...payload,partySize:1}},{status:409})

  let state=await h.api('/api/state')
  assert.equal(state.state.bookings.length,1)
  const change={requestId:randomUUID(),action:'change',payload:{bookingId:created.id,startAt:new Date(Date.parse(s.startAt)+15*60000).toISOString(),partySize:2,version:state.version}}
  const changed=await h.api(endpoint,change)
  assert.equal(changed.result.id,created.id)
  assert.equal(changed.result.startAt,change.payload.startAt)
  const changedReplay=await h.api(endpoint,change)
  assert.equal(changedReplay.replayed,true,'A lost response can replay even after the floor version advances')
  assert.deepEqual(changedReplay.result,changed.result)
  const stale={...change,requestId:randomUUID()}
  await h.api(endpoint,stale,{status:409})
  state=await h.api('/api/state')
  const revised={...stale,payload:{...stale.payload,version:state.version,startAt:new Date(Date.parse(s.startAt)+30*60000).toISOString()}}
  await h.api(endpoint,revised)

  const cancel={requestId:randomUUID(),action:'cancel',payload:{bookingId:created.id,status:'cancelled',reason:'Owner recorded cancellation'}}
  await h.api(endpoint,{...cancel,payload:{...cancel.payload,status:'seated'}},{status:400})
  await h.api(endpoint,{...cancel,payload:{...cancel.payload,correctsEventId:randomUUID()}},{status:400})
  const cancelled=await h.api(endpoint,cancel)
  assert.equal(cancelled.result.status,'cancelled')
  assert.deepEqual((await h.api(endpoint,cancel)).result,cancelled.result)
  await h.api(endpoint,cancel,{as:manager,status:403})
  await h.api(endpoint,cancel,{...opts,status:401})
  await h.api(endpoint,cancel,{headers:{origin:'https://other.example.test'},status:403})
  await h.api(endpoint,{...cancel,action:'create',payload},{status:409})
  assert.deepEqual((await h.api(endpoint,create)).result,created,'Creation replays its original snapshot after later changes and cancellation')
  const events=(await h.api('/api/v1/events?limit=100',undefined,opts)).items
  assert.deepEqual(events.map(event=>event.type),['reservation.created','reservation.changed','reservation.changed','reservation.cancelled'])
  assert.ok(events.every(event=>event.reservation.id===created.id))
  const successor=(await h.api('/api/v2/events?limit=100',undefined,opts)).items
  assert.deepEqual(successor.map(event=>event.id),events.map(event=>event.id))
  assert.deepEqual(successor.map(event=>event.data.reservation),events.map(event=>event.reservation))
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS count FROM pm_integration_events').first()).count,events.length,'Schema projections do not append extra logical events')
  assert.equal((await h.api('/api/state')).state.bookings.length,1)
  const receipts=(await h.db.prepare('SELECT * FROM pm_reservation_requests').all()).results
  assert.equal(receipts.length,4,'Failed actions leave no receipt; each committed action retains one')
  assert.ok(!JSON.stringify(receipts).includes(payload.email)&&!JSON.stringify(receipts).includes(payload.name))
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes(create.requestId),'Installation replay custody is not restored as business data')
 }finally{await h.close()}
})
